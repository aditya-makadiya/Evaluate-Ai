import { NextResponse } from 'next/server';
import { NextRequest } from 'next/server';
import { discoverAllRepos, getTrackedRepos as getLegacyTrackedRepos } from '@/lib/github-oauth';
import { guardApi } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase-server';
import { isMultiUserEnabled } from '@/lib/integrations/feature-flag';
import { resolveCurrentUserToken, TokenUnavailableError } from '@/lib/integrations/token-resolver';
import { listTeamTrackedRepos, migrateLegacyTrackedReposIfNeeded } from '@/lib/integrations/tracked-repos';

interface GroupedRepo {
  name: string;
  fullName: string;
  defaultBranch: string;
  language: string | null;
  private: boolean;
  updatedAt: string;
  ownerLogin: string;
  ownerType: string;
  tracked: boolean;
}

interface RepoGroup {
  label: string;
  repos: GroupedRepo[];
}

/**
 * GET /api/integrations/github/discover?team_id=xxx
 *
 * Discover ALL repositories accessible to the authenticated GitHub user.
 * Returns repos grouped by: owned, collaborator, organization.
 *
 * Token source branches on the per-team feature flag:
 *   - v2 (default): the requester's own user_integrations token. Each
 *     manager sees *their* repos, which is what "Manage Repos" expects.
 *   - Legacy (opt-out): the team-scoped `integrations` token — unchanged.
 */
export async function GET(request: NextRequest) {
  try {
    const teamId = request.nextUrl.searchParams.get('team_id');
    if (!teamId) {
      return NextResponse.json({ error: 'team_id is required' }, { status: 400 });
    }

    const guard = await guardApi({ teamId, roles: ['owner', 'manager'] });
    if (guard.response) return guard.response;
    const ctx = guard.ctx;

    const admin = getSupabaseAdmin();
    const multiUser = await isMultiUserEnabled(admin, teamId);

    let token: string;
    try {
      const resolved = await resolveCurrentUserToken({
        admin,
        teamId,
        userId: ctx.userId,
        provider: 'github',
      });
      token = resolved.accessToken;
    } catch (err) {
      if (err instanceof TokenUnavailableError) {
        return NextResponse.json({ error: err.userFacingMessage, groups: [] }, { status: 404 });
      }
      throw err;
    }

    // Tracked-repo set tells the UI which checkboxes should start ticked.
    // Source differs per flow: v2 uses team_tracked_repos (authoritative);
    // legacy reads from integrations.config.tracked_repos.
    let trackedRepos: string[];
    if (multiUser) {
      await migrateLegacyTrackedReposIfNeeded(admin, teamId, 'github');
      const rows = await listTeamTrackedRepos(admin, teamId, 'github');
      trackedRepos = rows.map((r) => r.repo_full_name);
    } else {
      trackedRepos = await getLegacyTrackedRepos(teamId);
    }

    const allRepos = await discoverAllRepos(token);
    const trackedSet = new Set(trackedRepos);

    const owned: GroupedRepo[] = [];
    const collaborator: GroupedRepo[] = [];
    const orgMap = new Map<string, GroupedRepo[]>();

    for (const repo of allRepos) {
      const mapped: GroupedRepo = {
        name: repo.name,
        fullName: repo.full_name,
        defaultBranch: repo.default_branch,
        language: repo.language,
        private: repo.private,
        updatedAt: repo.updated_at,
        ownerLogin: repo.owner.login,
        ownerType: repo.owner.type,
        tracked: trackedSet.has(repo.full_name),
      };

      if (repo.owner.type === 'Organization') {
        const orgName = repo.owner.login;
        if (!orgMap.has(orgName)) orgMap.set(orgName, []);
        orgMap.get(orgName)!.push(mapped);
      } else if (repo.permissions?.admin) {
        owned.push(mapped);
      } else {
        collaborator.push(mapped);
      }
    }

    const groups: RepoGroup[] = [];

    if (owned.length > 0) {
      groups.push({ label: 'Your Repositories', repos: owned });
    }

    const sortedOrgs = [...orgMap.entries()].sort(([a], [b]) => a.localeCompare(b));
    for (const [orgName, repos] of sortedOrgs) {
      groups.push({ label: orgName, repos });
    }

    if (collaborator.length > 0) {
      groups.push({ label: 'Collaborator Repositories', repos: collaborator });
    }

    return NextResponse.json({
      groups,
      totalRepos: allRepos.length,
      trackedCount: trackedRepos.length,
    });
  } catch (err) {
    console.error('GitHub discover error:', err);
    const message = err instanceof Error ? err.message : 'Failed to discover repos';
    return NextResponse.json({ error: message, groups: [] }, { status: 500 });
  }
}
