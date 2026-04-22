/**
 * Single entry point for "give me a valid access token I can call the
 * provider's API with."
 *
 * Routes should never reach into `integrations` or `user_integrations`
 * directly to pull a token. They use these helpers, which:
 *
 *   1. Branch on `teams.settings.multi_user_integrations_enabled`
 *   2. Pull the right row from the right table
 *   3. Decrypt (v2 only — legacy tokens are plaintext for back-compat)
 *   4. Refresh if expired + the provider adapter knows how
 *   5. Persist the new token (so the next call avoids the round-trip)
 *
 * Two scopes:
 *
 *   - resolveCurrentUserToken(): for interactive flows where the current
 *     authenticated user's own token is what we want (e.g., "Manage Repos"
 *     showing that user's accessible repo list).
 *
 *   - resolveAnyTeamToken(): for read-only enrichment where any working
 *     team token will do (e.g., fetching live metadata for the team's
 *     tracked-repo list). Picks the requester's token first, falls back to
 *     the member with the most rate-limit budget.
 *
 * Errors are structured: callers can `instanceof TokenUnavailableError` to
 * map to a 404 vs. a 500. The message is safe to surface to end-users.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { isMultiUserEnabled } from './feature-flag';
import {
  decryptAccessToken,
  decryptRefreshToken,
  getActiveUserIntegration,
  getActiveUserIntegrations,
  upsertUserIntegration,
  type UserIntegrationRow,
} from './user-integrations';
import { getProvider } from './registry';
import type { ProviderSlug } from './types';
import { getValidToken as getLegacyValidToken } from '../github-oauth';
import { logIntegration } from './logger';

/**
 * Thrown when the relevant table has no usable token for the request. The
 * `userFacingMessage` is safe to forward to the browser; it intentionally
 * doesn't leak which flow or which table was consulted.
 */
export class TokenUnavailableError extends Error {
  readonly code: 'not_connected' | 'expired_no_refresh';
  readonly userFacingMessage: string;

  constructor(
    code: 'not_connected' | 'expired_no_refresh',
    provider: ProviderSlug,
    scope: 'current_user' | 'any_team_member'
  ) {
    const label = provider === 'github' ? 'GitHub' : 'Fireflies';
    const msg =
      code === 'not_connected'
        ? scope === 'current_user'
          ? `You haven't connected ${label}. Connect your account to continue.`
          : `No ${label} account on your team has access. Ask a teammate to connect.`
        : `${label} session expired. Please reconnect to continue.`;
    super(msg);
    this.name = 'TokenUnavailableError';
    this.code = code;
    this.userFacingMessage = msg;
  }
}

interface ResolveOpts {
  admin: SupabaseClient;
  teamId: string;
  provider: ProviderSlug;
}

export interface ResolvedToken {
  accessToken: string;
  /** id of the user_integrations row (v2) or null for legacy. */
  userIntegrationId: string | null;
  /** handle of the external account the token belongs to, when known. */
  externalAccountHandle: string | null;
  /** 'v2' if sourced from user_integrations, 'legacy' if from `integrations`. */
  flow: 'v2' | 'legacy';
}

const EXPIRY_BUFFER_MS = 5 * 60 * 1000; // 5 minutes

function isExpired(row: UserIntegrationRow): boolean {
  if (!row.token_expires_at) return false;
  return new Date(row.token_expires_at).getTime() <= Date.now() + EXPIRY_BUFFER_MS;
}

/**
 * Refresh a v2 user_integrations token in-place and return the new access
 * token. Throws TokenUnavailableError when refresh isn't possible — the
 * caller should prompt the user to reconnect.
 */
async function refreshV2Token(
  admin: SupabaseClient,
  row: UserIntegrationRow,
  provider: ProviderSlug
): Promise<string> {
  const refresh = decryptRefreshToken(row);
  const adapter = getProvider(provider);
  if (!refresh || !adapter.refreshToken) {
    throw new TokenUnavailableError('expired_no_refresh', provider, 'current_user');
  }

  const refreshed = await adapter.refreshToken(refresh);

  // Persist the rotated tokens. upsertUserIntegration re-encrypts under the
  // current EVALUATEAI_ENCRYPTION_KEY and preserves config.
  await upsertUserIntegration(admin, {
    teamId: row.team_id,
    userId: row.user_id,
    provider,
    tokens: {
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken ?? refresh,
      expiresAt: refreshed.expiresAt ?? null,
      scopes: refreshed.scopes ?? row.scopes ?? undefined,
    },
    externalAccountId: row.external_account_id,
    externalAccountHandle: row.external_account_handle,
    config: row.config ?? {},
  });

  logIntegration({
    team_id: row.team_id,
    user_id: row.user_id,
    provider,
    action: 'refresh_token',
    outcome: 'ok',
    user_integration_id: row.id,
  });

  return refreshed.accessToken;
}

/**
 * Return a valid access token for the authenticated user. This is the right
 * choice for interactive operations — e.g., "show me repos *I* can see so I
 * can pick which to track."
 *
 * For legacy teams (v2 disabled), falls through to the team-scoped token.
 * This preserves the pre-rework UX where owner/manager-scoped team tokens
 * backed these flows.
 */
export async function resolveCurrentUserToken({
  admin,
  teamId,
  userId,
  provider,
}: ResolveOpts & { userId: string }): Promise<ResolvedToken> {
  const multiUser = await isMultiUserEnabled(admin, teamId);

  if (!multiUser) {
    // Legacy: only GitHub has a team-level OAuth token to return. Fireflies
    // uses API keys stored plaintext in `integrations.access_token`.
    return resolveLegacyTeamToken({ admin, teamId, provider });
  }

  const row = await getActiveUserIntegration(admin, teamId, userId, provider);
  if (!row) {
    throw new TokenUnavailableError('not_connected', provider, 'current_user');
  }

  if (isExpired(row)) {
    const newAccess = await refreshV2Token(admin, row, provider);
    return {
      accessToken: newAccess,
      userIntegrationId: row.id,
      externalAccountHandle: row.external_account_handle,
      flow: 'v2',
    };
  }

  return {
    accessToken: decryptAccessToken(row),
    userIntegrationId: row.id,
    externalAccountHandle: row.external_account_handle,
    flow: 'v2',
  };
}

/**
 * Return a valid access token from *any* team member for the given provider.
 * Used for read-only enrichment where identity doesn't matter — e.g.,
 * fetching live metadata for the team's tracked-repo list.
 *
 * Preference order:
 *   1. The requester's own token (most honest for rate-limit attribution)
 *   2. The active integration with the most rate-limit budget
 *
 * Skips expired rows unless we can refresh them; if the winner is expired
 * and refresh succeeds, the refreshed token is persisted and returned.
 */
export async function resolveAnyTeamToken({
  admin,
  teamId,
  provider,
  preferUserId,
}: ResolveOpts & { preferUserId?: string }): Promise<ResolvedToken> {
  const multiUser = await isMultiUserEnabled(admin, teamId);

  if (!multiUser) {
    return resolveLegacyTeamToken({ admin, teamId, provider });
  }

  const rows = await getActiveUserIntegrations(admin, teamId, provider);
  if (rows.length === 0) {
    throw new TokenUnavailableError('not_connected', provider, 'any_team_member');
  }

  // Sort: preferred user first, then by remaining rate-limit (descending,
  // nulls treated as infinity — OAuth apps without a budget field shouldn't
  // lose to one with a measured but depleted budget).
  const ranked = [...rows].sort((a, b) => {
    if (preferUserId) {
      if (a.user_id === preferUserId && b.user_id !== preferUserId) return -1;
      if (b.user_id === preferUserId && a.user_id !== preferUserId) return 1;
    }
    const ra = a.rate_limit_remaining ?? Number.POSITIVE_INFINITY;
    const rb = b.rate_limit_remaining ?? Number.POSITIVE_INFINITY;
    return rb - ra;
  });

  // Walk the ranked list — the first one that's valid (or successfully
  // refreshable) wins. Swallow refresh failures and keep going so a single
  // stuck token doesn't block a team-wide read.
  for (const row of ranked) {
    try {
      if (!isExpired(row)) {
        return {
          accessToken: decryptAccessToken(row),
          userIntegrationId: row.id,
          externalAccountHandle: row.external_account_handle,
          flow: 'v2',
        };
      }
      const newAccess = await refreshV2Token(admin, row, provider);
      return {
        accessToken: newAccess,
        userIntegrationId: row.id,
        externalAccountHandle: row.external_account_handle,
        flow: 'v2',
      };
    } catch (err) {
      logIntegration({
        team_id: teamId,
        user_id: row.user_id,
        provider,
        action: 'resolve_any_team_token',
        outcome: 'skip',
        user_integration_id: row.id,
        error_message: err instanceof Error ? err.message : String(err),
      });
      continue;
    }
  }

  throw new TokenUnavailableError('not_connected', provider, 'any_team_member');
}

/**
 * Legacy team-scoped lookup. Preserves the pre-rework behavior exactly.
 * Only GitHub has a team-scoped refresh flow; Fireflies stores an API key
 * in `integrations.access_token` with no refresh concept.
 */
async function resolveLegacyTeamToken({
  admin,
  teamId,
  provider,
}: ResolveOpts): Promise<ResolvedToken> {
  if (provider === 'github') {
    try {
      const accessToken = await getLegacyValidToken(teamId);
      // Pull the handle for symmetry with v2. Not load-bearing.
      const { data } = await admin
        .from('integrations')
        .select('config')
        .eq('team_id', teamId)
        .eq('provider', 'github')
        .eq('status', 'active')
        .maybeSingle();
      const cfg = (data?.config ?? {}) as Record<string, unknown>;
      return {
        accessToken,
        userIntegrationId: null,
        externalAccountHandle: (cfg.oauth_user as string) ?? null,
        flow: 'legacy',
      };
    } catch {
      throw new TokenUnavailableError('not_connected', provider, 'current_user');
    }
  }

  // Fireflies legacy: plaintext API key on the team row.
  const { data, error } = await admin
    .from('integrations')
    .select('access_token, config')
    .eq('team_id', teamId)
    .eq('provider', 'fireflies')
    .eq('status', 'active')
    .maybeSingle();
  if (error || !data?.access_token) {
    throw new TokenUnavailableError('not_connected', provider, 'current_user');
  }
  const cfg = (data.config ?? {}) as Record<string, unknown>;
  return {
    accessToken: data.access_token as string,
    userIntegrationId: null,
    externalAccountHandle: (cfg.account_name as string) ?? null,
    flow: 'legacy',
  };
}
