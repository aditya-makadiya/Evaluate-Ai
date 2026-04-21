import { NextResponse } from 'next/server';
import { NextRequest } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-server';
import { exchangeCodeForTokens, fetchAuthenticatedUser } from '@/lib/github-oauth';
import { decodeState } from '@/lib/integrations/oauth-state';
import { getProvider } from '@/lib/integrations/registry';
import {
  upsertUserIntegration,
  replaceAccessibleRepos,
} from '@/lib/integrations/user-integrations';
import { writeGitHubUserId } from '@/lib/integrations/attribution';
import { logIntegration } from '@/lib/integrations/logger';

/**
 * GET /api/integrations/github/callback
 *
 * GitHub redirects here after the user authorizes the OAuth App. The `state`
 * param tells us which flow to run:
 *
 *   - v2 (signed envelope): write to user_integrations (new per-user flow),
 *     populate user_integration_repos with the user's accessible repos.
 *   - legacy (plain base64 { team_id }): write to the old `integrations`
 *     table, unchanged behavior.
 *   - invalid: redirect to integrations page with an error code.
 */
export async function GET(request: NextRequest) {
  const redirectUrl = (params: string) =>
    NextResponse.redirect(new URL(`/dashboard/integrations?${params}`, request.nextUrl.origin));

  try {
    const code = request.nextUrl.searchParams.get('code');
    const state = request.nextUrl.searchParams.get('state');
    const error = request.nextUrl.searchParams.get('error');

    if (error) return redirectUrl('error=oauth_denied');
    if (!code || !state) return redirectUrl('error=missing_params');

    const decoded = decodeState(state);
    if (decoded.kind === 'invalid') {
      logIntegration({
        provider: 'github',
        action: 'oauth_callback',
        outcome: 'error',
        reason: decoded.reason,
      });
      return redirectUrl(`error=invalid_state&reason=${encodeURIComponent(decoded.reason)}`);
    }

    if (decoded.kind === 'v2') {
      return await handleV2Callback(code, decoded.payload.userId, decoded.payload.teamId, request);
    }

    // Legacy path — unchanged from the pre-refactor flow.
    return await handleLegacyCallback(code, decoded.teamId, request);
  } catch (err) {
    console.error('GitHub callback error:', err);
    return redirectUrl('error=callback_failed');
  }
}

/**
 * Per-user flow: upsert into user_integrations + user_integration_repos.
 */
async function handleV2Callback(
  code: string,
  userId: string,
  teamId: string,
  request: NextRequest
): Promise<NextResponse> {
  const redirectUrl = (params: string) =>
    NextResponse.redirect(new URL(`/dashboard/integrations?${params}`, request.nextUrl.origin));

  const adapter = getProvider('github');
  const admin = getSupabaseAdmin();

  const tokens = await adapter.exchangeCodeForToken!(code);
  const identity = await adapter.fetchAccountIdentity(tokens.accessToken);

  const integration = await upsertUserIntegration(admin, {
    teamId,
    userId,
    provider: 'github',
    tokens,
    externalAccountId: identity.id,
    externalAccountHandle: identity.handle,
    scopes: tokens.scopes ?? null,
    config: { connected_at: new Date().toISOString() },
  });

  // Phase 4: write the numeric GitHub id back to team_members so the sync
  // handler can attribute commits deterministically without depending on
  // github_username being typed correctly at onboarding.
  // Best-effort — connection stays valid even if this write fails.
  const attrOk = await writeGitHubUserId(admin, teamId, userId, identity.id);
  logIntegration({
    team_id: teamId,
    user_id: userId,
    provider: 'github',
    action: 'writeback_github_user_id',
    outcome: attrOk ? 'ok' : 'error',
    github_user_id: identity.id,
  });

  // Best-effort: populate the accessible-repo index. A partial failure here
  // doesn't invalidate the connection — the user can hit "Refresh repos"
  // later. Log and continue.
  try {
    const repos = await adapter.fetchAccessibleRepos!(tokens.accessToken);
    await replaceAccessibleRepos(admin, integration.id, repos);
    logIntegration({
      team_id: teamId,
      user_id: userId,
      provider: 'github',
      action: 'oauth_callback',
      outcome: 'ok',
      flow: 'v2',
      accessible_repo_count: repos.length,
      external_account_handle: identity.handle,
    });
  } catch (err) {
    logIntegration({
      team_id: teamId,
      user_id: userId,
      provider: 'github',
      action: 'fetch_accessible_repos',
      outcome: 'error',
      error_message: err instanceof Error ? err.message : String(err),
    });
  }

  return redirectUrl(`success=github_connected&flow=v2&user=${encodeURIComponent(identity.handle)}`);
}

/**
 * Legacy flow: unchanged behavior, team-scoped write to `integrations`.
 */
async function handleLegacyCallback(
  code: string,
  teamId: string,
  request: NextRequest
): Promise<NextResponse> {
  const redirectUrl = (params: string) =>
    NextResponse.redirect(new URL(`/dashboard/integrations?${params}`, request.nextUrl.origin));

  const tokens = await exchangeCodeForTokens(code);

  let githubUser: { login: string } | null = null;
  try {
    githubUser = await fetchAuthenticatedUser(tokens.accessToken);
  } catch (err) {
    console.error('Failed to fetch GitHub user:', err);
  }

  const config: Record<string, unknown> = {
    oauth_user: githubUser?.login ?? null,
    connected_at: new Date().toISOString(),
    tracked_repos: [],
    token_expires_at: tokens.expiresIn
      ? new Date(Date.now() + tokens.expiresIn * 1000).toISOString()
      : null,
  };

  const supabase = getSupabaseAdmin();
  const integrationData = {
    team_id: teamId,
    provider: 'github',
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken ?? '',
    config,
    status: 'active',
    last_sync_at: new Date().toISOString(),
  };

  const { error: upsertError } = await supabase
    .from('integrations')
    .upsert(integrationData, { onConflict: 'team_id,provider' });

  if (upsertError) {
    const { data: existing } = await supabase
      .from('integrations')
      .select('id')
      .eq('team_id', teamId)
      .eq('provider', 'github')
      .single();

    if (existing) {
      await supabase
        .from('integrations')
        .update({
          access_token: tokens.accessToken,
          refresh_token: tokens.refreshToken ?? '',
          config,
          status: 'active',
          last_sync_at: new Date().toISOString(),
        })
        .eq('id', existing.id);
    } else {
      await supabase.from('integrations').insert(integrationData);
    }
  }

  return redirectUrl('success=github_connected');
}
