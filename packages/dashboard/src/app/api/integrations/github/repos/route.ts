import { NextResponse } from 'next/server';
import { NextRequest } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-server';
import { getValidToken, discoverAllRepos } from '@/lib/github-oauth';
import { guardApi } from '@/lib/auth';

/**
 * GET /api/integrations/github/repos?team_id=xxx
 *
 * Returns the tracked repositories for a team.
 * If live=true, fetches fresh data from GitHub to update cached repo metadata.
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

    const supabase = getSupabaseAdmin();

    const { data: integration } = await supabase
      .from('integrations')
      .select('id, access_token, config')
      .eq('team_id', teamId)
      .eq('provider', 'github')
      .eq('status', 'active')
      .single();

    if (!integration) {
      return NextResponse.json({ error: 'GitHub not connected', repos: [] }, { status: 404 });
    }

    const config = (integration.config as Record<string, unknown>) ?? {};
    const trackedRepos = (config.tracked_repos as string[]) ?? [];

    if (trackedRepos.length === 0) {
      return NextResponse.json({ repos: [], tracked: true, oauthUser: config.oauth_user ?? null });
    }

    // Fetch live repo data from GitHub to get up-to-date metadata
    const trackedSet = new Set(trackedRepos);
    try {
      const token = await getValidToken(teamId);
      const allRepos = await discoverAllRepos(token);

      const repoList = allRepos
        .filter((r) => trackedSet.has(r.full_name))
        .map((r) => ({
          name: r.name,
          fullName: r.full_name,
          defaultBranch: r.default_branch,
          language: r.language,
          private: r.private,
          updatedAt: r.updated_at,
        }));

      return NextResponse.json({ repos: repoList, cached: false, oauthUser: config.oauth_user ?? null });
    } catch (err) {
      console.error('Failed to fetch live repos:', err);

      // Fallback: return tracked repo names without metadata
      const fallbackRepos = trackedRepos.map((fullName) => ({
        name: fullName.split('/').pop() ?? fullName,
        fullName,
        defaultBranch: 'main',
        language: null,
        private: false,
        updatedAt: null,
      }));

      return NextResponse.json({ repos: fallbackRepos, cached: true, oauthUser: config.oauth_user ?? null });
    }
  } catch (err) {
    console.error('GitHub repos error:', err);
    return NextResponse.json({ error: 'Failed to fetch repos', repos: [] }, { status: 500 });
  }
}
