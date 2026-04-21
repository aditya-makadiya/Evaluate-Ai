import { NextResponse } from 'next/server';
import { NextRequest } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-server';
import { guardApi } from '@/lib/auth';
import { isMultiUserEnabled } from '@/lib/integrations/feature-flag';
import {
  listTeamTrackedRepos,
  removeTrackedRepo,
} from '@/lib/integrations/tracked-repos';

/**
 * GET /api/integrations/github/tracked-repos?team_id=xxx
 *
 * Returns the team's tracked-repo list with per-repo ETag + last_sync + coverage
 * metadata. Any team member can read.
 *
 * Triggers lazy one-shot migration from integrations.config.tracked_repos on
 * first call for a team that flipped the per-user flag on.
 */
export async function GET(request: NextRequest) {
  try {
    const teamId = request.nextUrl.searchParams.get('team_id');
    if (!teamId) {
      return NextResponse.json({ error: 'team_id is required' }, { status: 400 });
    }

    const guard = await guardApi({ teamId });
    if (guard.response) return guard.response;

    const admin = getSupabaseAdmin();
    if (!(await isMultiUserEnabled(admin, teamId))) {
      return NextResponse.json(
        { error: 'Per-user integrations are not enabled for this team' },
        { status: 409 }
      );
    }

    const rows = await listTeamTrackedRepos(admin, teamId, 'github');
    return NextResponse.json({
      repos: rows.map((r) => ({
        id: r.id,
        repoFullName: r.repo_full_name,
        addedByUserId: r.added_by_user_id,
        addedAt: r.added_at,
        lastSyncAt: r.last_sync_at,
        lastCommitShaSeen: r.last_commit_sha_seen,
        coverageStatus: r.coverage_status,
      })),
    });
  } catch (err) {
    console.error('List tracked-repos error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to list tracked repos' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/integrations/github/tracked-repos?team_id=xxx&repo_full_name=owner/repo
 *
 * Remove a single repo from the team's tracked list. Manager/owner only.
 */
export async function DELETE(request: NextRequest) {
  try {
    const teamId = request.nextUrl.searchParams.get('team_id');
    const repoFullName = request.nextUrl.searchParams.get('repo_full_name');

    if (!teamId || !repoFullName) {
      return NextResponse.json(
        { error: 'team_id and repo_full_name are required' },
        { status: 400 }
      );
    }

    const guard = await guardApi({ teamId, roles: ['owner', 'manager'] });
    if (guard.response) return guard.response;

    const admin = getSupabaseAdmin();
    if (!(await isMultiUserEnabled(admin, teamId))) {
      return NextResponse.json(
        { error: 'Per-user integrations are not enabled for this team' },
        { status: 409 }
      );
    }

    const removed = await removeTrackedRepo(admin, teamId, 'github', repoFullName);
    if (!removed) {
      return NextResponse.json({ error: 'Not tracked' }, { status: 404 });
    }
    return NextResponse.json({ success: true, repoFullName });
  } catch (err) {
    console.error('Delete tracked-repo error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to remove tracked repo' },
      { status: 500 }
    );
  }
}
