import { NextResponse } from 'next/server';
import { NextRequest } from 'next/server';
import { getValidToken, discoverAllRepos, getTrackedRepos } from '@/lib/github-oauth';
import { guardApi } from '@/lib/auth';

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
 */
export async function GET(request: NextRequest) {
  try {
    const teamId = request.nextUrl.searchParams.get('team_id');
    if (!teamId) {
      return NextResponse.json({ error: 'team_id is required' }, { status: 400 });
    }

    const guard = await guardApi({ teamId, roles: ['owner', 'manager'] });
    if (guard.response) return guard.response;

    const token = await getValidToken(teamId);
    const [allRepos, trackedRepos] = await Promise.all([
      discoverAllRepos(token),
      getTrackedRepos(teamId),
    ]);

    const trackedSet = new Set(trackedRepos);

    // Group repos by affiliation
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
        // User owns this repo
        owned.push(mapped);
      } else {
        // User is a collaborator
        collaborator.push(mapped);
      }
    }

    // Build grouped response
    const groups: RepoGroup[] = [];

    if (owned.length > 0) {
      groups.push({ label: 'Your Repositories', repos: owned });
    }

    // Sort org groups alphabetically
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
