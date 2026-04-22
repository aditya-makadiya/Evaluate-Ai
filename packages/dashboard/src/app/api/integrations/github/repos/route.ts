import { NextResponse } from 'next/server';
import { NextRequest } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-server';
import { discoverAllRepos } from '@/lib/github-oauth';
import { guardApi } from '@/lib/auth';
import { isMultiUserEnabled } from '@/lib/integrations/feature-flag';
import { resolveCurrentUserToken, TokenUnavailableError } from '@/lib/integrations/token-resolver';
import { listTeamTrackedRepos, migrateLegacyTrackedReposIfNeeded } from '@/lib/integrations/tracked-repos';

interface RepoMetadata {
  name: string;
  fullName: string;
  defaultBranch: string;
  language: string | null;
  private: boolean;
  updatedAt: string | null;
}

/**
 * GET /api/integrations/github/repos?team_id=xxx
 *
 * Returns the tracked repositories for a team, enriched with live metadata
 * when a usable token is available. Two flows:
 *
 *   - v2 (default): tracked list comes from `team_tracked_repos`; live
 *     enrichment uses the requester's own user_integrations token. If the
 *     requester hasn't personally connected, we still return the tracked
 *     list with minimal metadata — useful for devs who can see what the
 *     team is tracking without themselves having connected.
 *
 *   - Legacy: unchanged — reads integrations.config.tracked_repos, enriches
 *     via the team-scoped token.
 *
 * RBAC: any authenticated team member (read-only), tenant-scoped.
 */
export async function GET(request: NextRequest) {
  try {
    const teamId = request.nextUrl.searchParams.get('team_id');
    if (!teamId) {
      return NextResponse.json({ error: 'team_id is required' }, { status: 400 });
    }

    const guard = await guardApi({ teamId });
    if (guard.response) return guard.response;
    const ctx = guard.ctx;

    const supabase = getSupabaseAdmin();
    const multiUser = await isMultiUserEnabled(supabase, teamId);

    if (multiUser) {
      return await handleV2(teamId, ctx.userId);
    }
    return await handleLegacy(teamId);
  } catch (err) {
    console.error('GitHub repos error:', err);
    return NextResponse.json({ error: 'Failed to fetch repos', repos: [] }, { status: 500 });
  }
}

async function handleV2(teamId: string, userId: string): Promise<NextResponse> {
  const admin = getSupabaseAdmin();

  await migrateLegacyTrackedReposIfNeeded(admin, teamId, 'github');
  const trackedRows = await listTeamTrackedRepos(admin, teamId, 'github');
  const trackedSet = new Set(trackedRows.map((r) => r.repo_full_name));

  // Best-effort enrichment with the requester's own token. A dev who hasn't
  // connected personally still sees the tracked list — just without live
  // metadata. That's a better UX than a 404 on the viewer page.
  let token: string | null = null;
  let oauthUser: string | null = null;
  try {
    const resolved = await resolveCurrentUserToken({
      admin,
      teamId,
      userId,
      provider: 'github',
    });
    token = resolved.accessToken;
    oauthUser = resolved.externalAccountHandle;
  } catch (err) {
    if (!(err instanceof TokenUnavailableError)) {
      throw err;
    }
  }

  if (!token || trackedSet.size === 0) {
    const fallback = fallbackRepos([...trackedSet]);
    return NextResponse.json({
      repos: fallback,
      cached: true,
      oauthUser,
      flow: 'v2',
    });
  }

  try {
    const allRepos = await discoverAllRepos(token);
    const enriched: RepoMetadata[] = allRepos
      .filter((r) => trackedSet.has(r.full_name))
      .map((r) => ({
        name: r.name,
        fullName: r.full_name,
        defaultBranch: r.default_branch,
        language: r.language,
        private: r.private,
        updatedAt: r.updated_at,
      }));

    // Repos the requester's token can't see — surface them with minimal
    // metadata so the UI can still render them (another team member's
    // token will fetch live data on the next sync).
    const covered = new Set(enriched.map((r) => r.fullName));
    const uncovered = [...trackedSet].filter((n) => !covered.has(n));
    const combined = [...enriched, ...fallbackRepos(uncovered)];

    return NextResponse.json({
      repos: combined,
      cached: false,
      oauthUser,
      flow: 'v2',
    });
  } catch (err) {
    console.error('Failed to fetch live repos (v2):', err);
    return NextResponse.json({
      repos: fallbackRepos([...trackedSet]),
      cached: true,
      oauthUser,
      flow: 'v2',
    });
  }
}

async function handleLegacy(teamId: string): Promise<NextResponse> {
  const supabase = getSupabaseAdmin();

  const { data: integration } = await supabase
    .from('integrations')
    .select('id, access_token, config')
    .eq('team_id', teamId)
    .eq('provider', 'github')
    .eq('status', 'active')
    .maybeSingle();

  if (!integration) {
    return NextResponse.json({ error: 'GitHub not connected', repos: [] }, { status: 404 });
  }

  const config = (integration.config as Record<string, unknown>) ?? {};
  const trackedRepos = (config.tracked_repos as string[]) ?? [];

  if (trackedRepos.length === 0) {
    return NextResponse.json({ repos: [], tracked: true, oauthUser: config.oauth_user ?? null });
  }

  const trackedSet = new Set(trackedRepos);
  try {
    // Legacy path keeps its own token query to preserve prior behavior
    // (no refresh, plaintext access_token column).
    if (!integration.access_token) {
      throw new Error('missing legacy token');
    }
    const allRepos = await discoverAllRepos(integration.access_token as string);

    const repoList: RepoMetadata[] = allRepos
      .filter((r) => trackedSet.has(r.full_name))
      .map((r) => ({
        name: r.name,
        fullName: r.full_name,
        defaultBranch: r.default_branch,
        language: r.language,
        private: r.private,
        updatedAt: r.updated_at,
      }));

    return NextResponse.json({
      repos: repoList,
      cached: false,
      oauthUser: config.oauth_user ?? null,
    });
  } catch (err) {
    console.error('Failed to fetch live repos (legacy):', err);
    return NextResponse.json({
      repos: fallbackRepos(trackedRepos),
      cached: true,
      oauthUser: config.oauth_user ?? null,
    });
  }
}

function fallbackRepos(names: string[]): RepoMetadata[] {
  return names.map((fullName) => ({
    name: fullName.split('/').pop() ?? fullName,
    fullName,
    defaultBranch: 'main',
    language: null,
    private: false,
    updatedAt: null,
  }));
}
