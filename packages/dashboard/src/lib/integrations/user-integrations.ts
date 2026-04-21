/**
 * CRUD + planning helpers for the per-user integrations subsystem.
 *
 * All functions use the service-role client (RLS is bypassed). Any caller
 * that wants RLS enforcement must query user_integrations_public through
 * the SSR client instead of using these helpers.
 *
 * The interesting function here is planTokenAssignments() — it implements
 * the "one repo, one token" assignment from §4.3 of the plan:
 *
 *   1. Sort repos by rarity ASC (users_with_access, then last_sync_at)
 *   2. For each repo, pick the active user_integration with access AND
 *      the most remaining rate-limit budget
 *
 * Rare repos are assigned first so their only-possible token isn't
 * accidentally burned on a public repo that any teammate could have
 * fetched.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { decryptToken, encryptToken } from './crypto';
import { logIntegration } from './logger';
import type {
  CoverageStatus,
  IntegrationStatus,
  ProviderSlug,
  RateLimitSnapshot,
  RepoRef,
  TokenBundle,
} from './types';

// ---------------------------------------------------------------------------
// Row shapes — kept narrow on purpose. Callers read only what they need.
// ---------------------------------------------------------------------------

export interface UserIntegrationRow {
  id: string;
  team_id: string;
  user_id: string;
  provider: ProviderSlug;
  access_token_encrypted: Buffer | string;
  refresh_token_encrypted: Buffer | string | null;
  token_expires_at: string | null;
  external_account_id: string | null;
  external_account_handle: string | null;
  scopes: string[] | null;
  config: Record<string, unknown>;
  status: IntegrationStatus;
  rate_limit_remaining: number | null;
  rate_limit_reset_at: string | null;
  last_sync_at: string | null;
  last_error: string | null;
  last_error_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface UpsertUserIntegrationInput {
  teamId: string;
  userId: string;
  provider: ProviderSlug;
  tokens: TokenBundle;
  externalAccountId?: string | null;
  externalAccountHandle?: string | null;
  scopes?: string[] | null;
  config?: Record<string, unknown>;
}

export interface TokenAssignment {
  repoFullName: string;
  userIntegrationId: string;
  userId: string;
}

export interface TokenAssignmentPlan {
  assignments: TokenAssignment[];
  /** Repos in team_tracked_repos that have no token with access. */
  uncovered: string[];
}

// ---------------------------------------------------------------------------
// Basic CRUD
// ---------------------------------------------------------------------------

/**
 * Insert or update a user_integrations row. Handles re-consent (same user
 * re-clicks Connect to upgrade scopes) via ON CONFLICT DO UPDATE on
 * (team_id, user_id, provider).
 */
export async function upsertUserIntegration(
  admin: SupabaseClient,
  input: UpsertUserIntegrationInput
): Promise<UserIntegrationRow> {
  const accessBlob = encryptToken(input.tokens.accessToken);
  const refreshBlob = input.tokens.refreshToken ? encryptToken(input.tokens.refreshToken) : null;

  const payload = {
    team_id: input.teamId,
    user_id: input.userId,
    provider: input.provider,
    access_token_encrypted: accessBlob,
    refresh_token_encrypted: refreshBlob,
    token_expires_at: input.tokens.expiresAt?.toISOString() ?? null,
    external_account_id: input.externalAccountId ?? null,
    external_account_handle: input.externalAccountHandle ?? null,
    scopes: input.scopes ?? input.tokens.scopes ?? null,
    config: input.config ?? {},
    status: 'active' satisfies IntegrationStatus,
    last_error: null,
    last_error_at: null,
  };

  const { data, error } = await admin
    .from('user_integrations')
    .upsert(payload, { onConflict: 'team_id,user_id,provider' })
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(`upsertUserIntegration failed: ${error?.message ?? 'unknown'}`);
  }

  logIntegration({
    team_id: input.teamId,
    user_id: input.userId,
    provider: input.provider,
    action: 'upsert_integration',
    outcome: 'ok',
    external_account_handle: input.externalAccountHandle ?? null,
  });

  return data as UserIntegrationRow;
}

export async function getActiveUserIntegrations(
  admin: SupabaseClient,
  teamId: string,
  provider: ProviderSlug
): Promise<UserIntegrationRow[]> {
  const { data, error } = await admin
    .from('user_integrations')
    .select('*')
    .eq('team_id', teamId)
    .eq('provider', provider)
    .eq('status', 'active');
  if (error) throw new Error(`getActiveUserIntegrations: ${error.message}`);
  return (data ?? []) as UserIntegrationRow[];
}

export async function markIntegrationStatus(
  admin: SupabaseClient,
  id: string,
  status: IntegrationStatus,
  lastError?: string
): Promise<void> {
  const update: Record<string, unknown> = { status };
  if (lastError) {
    update.last_error = lastError;
    update.last_error_at = new Date().toISOString();
  }
  const { error } = await admin.from('user_integrations').update(update).eq('id', id);
  if (error) throw new Error(`markIntegrationStatus: ${error.message}`);
}

export async function updateRateLimitSnapshot(
  admin: SupabaseClient,
  id: string,
  snap: RateLimitSnapshot
): Promise<void> {
  const { error } = await admin
    .from('user_integrations')
    .update({
      rate_limit_remaining: snap.remaining,
      rate_limit_reset_at: snap.resetAt?.toISOString() ?? null,
    })
    .eq('id', id);
  if (error) throw new Error(`updateRateLimitSnapshot: ${error.message}`);
}

export function decryptAccessToken(row: Pick<UserIntegrationRow, 'access_token_encrypted'>): string {
  return decryptToken(row.access_token_encrypted);
}

export function decryptRefreshToken(
  row: Pick<UserIntegrationRow, 'refresh_token_encrypted'>
): string | null {
  if (!row.refresh_token_encrypted) return null;
  return decryptToken(row.refresh_token_encrypted);
}

// ---------------------------------------------------------------------------
// Accessible repos — the who-can-see-what index
// ---------------------------------------------------------------------------

export async function replaceAccessibleRepos(
  admin: SupabaseClient,
  userIntegrationId: string,
  repos: RepoRef[]
): Promise<void> {
  // Replace semantics: a refresh fully supersedes the previous snapshot.
  const { error: delErr } = await admin
    .from('user_integration_repos')
    .delete()
    .eq('user_integration_id', userIntegrationId);
  if (delErr) throw new Error(`replaceAccessibleRepos(delete): ${delErr.message}`);

  if (repos.length === 0) return;

  const rows = repos.map((r) => ({
    user_integration_id: userIntegrationId,
    repo_full_name: r.fullName,
    repo_external_id: r.externalId,
    last_verified_at: new Date().toISOString(),
  }));

  const { error: insErr } = await admin.from('user_integration_repos').insert(rows);
  if (insErr) throw new Error(`replaceAccessibleRepos(insert): ${insErr.message}`);
}

export async function dropAccessibleRepo(
  admin: SupabaseClient,
  userIntegrationId: string,
  repoFullName: string
): Promise<void> {
  const { error } = await admin
    .from('user_integration_repos')
    .delete()
    .eq('user_integration_id', userIntegrationId)
    .eq('repo_full_name', repoFullName);
  if (error) throw new Error(`dropAccessibleRepo: ${error.message}`);
}

// ---------------------------------------------------------------------------
// Token assignment planner — the heart of one-repo-one-token
// ---------------------------------------------------------------------------

interface InternalCandidate {
  userIntegrationId: string;
  userId: string;
  remaining: number;        // Infinity when null (never called — assume full)
}

/**
 * Build the per-repo assignment map for a given (team, provider).
 *
 * Algorithm:
 *   1. Fetch tracked repos for the team + accessibility matrix + active
 *      integrations with budget info — three simple queries, no joins that
 *      depend on RLS.
 *   2. For each repo, collect candidate integrations (those with an access
 *      row for that repo AND status='active').
 *   3. Sort repos by access rarity ASC, then by last_sync_at ASC (oldest
 *      first for freshness).
 *   4. Walk the sorted list, assigning each repo to the candidate with the
 *      highest remaining budget. Decrement that candidate's budget
 *      in-memory by a conservative estimate (we don't know the real cost
 *      until after the fetch, so use a placeholder — 100 — that's high
 *      enough to spread load across tokens even when all have similar
 *      budgets).
 *
 * Budget is decremented in-memory only. The real budget update happens
 * after each fetch via updateRateLimitSnapshot().
 */
export async function planTokenAssignments(
  admin: SupabaseClient,
  teamId: string,
  provider: ProviderSlug
): Promise<TokenAssignmentPlan> {
  const [trackedRes, integrationsRes, accessRes] = await Promise.all([
    admin
      .from('team_tracked_repos')
      .select('repo_full_name, last_sync_at')
      .eq('team_id', teamId)
      .eq('provider', provider),
    admin
      .from('user_integrations')
      .select('id, user_id, rate_limit_remaining')
      .eq('team_id', teamId)
      .eq('provider', provider)
      .eq('status', 'active'),
    admin
      .from('user_integration_repos')
      .select('user_integration_id, repo_full_name, user_integrations!inner(team_id, provider, status)')
      .eq('user_integrations.team_id', teamId)
      .eq('user_integrations.provider', provider)
      .eq('user_integrations.status', 'active'),
  ]);

  if (trackedRes.error) throw new Error(`planTokenAssignments(tracked): ${trackedRes.error.message}`);
  if (integrationsRes.error) throw new Error(`planTokenAssignments(ints): ${integrationsRes.error.message}`);
  if (accessRes.error) throw new Error(`planTokenAssignments(access): ${accessRes.error.message}`);

  const tracked = (trackedRes.data ?? []) as { repo_full_name: string; last_sync_at: string | null }[];
  const integrations = (integrationsRes.data ?? []) as {
    id: string;
    user_id: string;
    rate_limit_remaining: number | null;
  }[];
  const access = (accessRes.data ?? []) as {
    user_integration_id: string;
    repo_full_name: string;
  }[];

  // repo_full_name → [candidate integration ids]
  const accessByRepo = new Map<string, string[]>();
  for (const row of access) {
    const list = accessByRepo.get(row.repo_full_name) ?? [];
    list.push(row.user_integration_id);
    accessByRepo.set(row.repo_full_name, list);
  }

  // integration id → mutable budget
  const budget = new Map<string, InternalCandidate>();
  for (const i of integrations) {
    budget.set(i.id, {
      userIntegrationId: i.id,
      userId: i.user_id,
      remaining: i.rate_limit_remaining == null ? Number.POSITIVE_INFINITY : i.rate_limit_remaining,
    });
  }

  const sortedRepos = [...tracked].sort((a, b) => {
    const ca = accessByRepo.get(a.repo_full_name)?.length ?? 0;
    const cb = accessByRepo.get(b.repo_full_name)?.length ?? 0;
    if (ca !== cb) return ca - cb;
    const ta = a.last_sync_at ? Date.parse(a.last_sync_at) : 0;
    const tb = b.last_sync_at ? Date.parse(b.last_sync_at) : 0;
    return ta - tb;
  });

  const assignments: TokenAssignment[] = [];
  const uncovered: string[] = [];
  const ESTIMATED_COST_PER_REPO = 100;

  for (const repo of sortedRepos) {
    const candidateIds = accessByRepo.get(repo.repo_full_name) ?? [];
    if (candidateIds.length === 0) {
      uncovered.push(repo.repo_full_name);
      continue;
    }
    let best: InternalCandidate | undefined;
    for (const id of candidateIds) {
      const c = budget.get(id);
      if (!c) continue;
      if (!best || c.remaining > best.remaining) best = c;
    }
    if (!best) {
      uncovered.push(repo.repo_full_name);
      continue;
    }
    assignments.push({
      repoFullName: repo.repo_full_name,
      userIntegrationId: best.userIntegrationId,
      userId: best.userId,
    });
    best.remaining = Math.max(0, best.remaining - ESTIMATED_COST_PER_REPO);
  }

  return { assignments, uncovered };
}

// ---------------------------------------------------------------------------
// Tracked-repo coverage status
// ---------------------------------------------------------------------------

export async function setRepoCoverageStatus(
  admin: SupabaseClient,
  teamId: string,
  provider: ProviderSlug,
  repoFullName: string,
  coverage: CoverageStatus
): Promise<void> {
  const { error } = await admin
    .from('team_tracked_repos')
    .update({ coverage_status: coverage })
    .eq('team_id', teamId)
    .eq('provider', provider)
    .eq('repo_full_name', repoFullName);
  if (error) throw new Error(`setRepoCoverageStatus: ${error.message}`);
}
