import { NextResponse } from 'next/server';
import { NextRequest } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-server';
import { guardApi } from '@/lib/auth';
import { isMultiUserEnabled } from '@/lib/integrations/feature-flag';
import { replaceTeamTrackedRepos } from '@/lib/integrations/tracked-repos';

/**
 * POST /api/integrations/github/track
 *
 * Body: { team_id: string, repos: string[] }
 *
 * Bulk-replace the team's tracked-repo list. Owner/manager only in both
 * flows — this endpoint's semantic is a full replace, which means a caller
 * can remove repos the team was previously tracking. Allowing developers
 * to call this (as an earlier v2 iteration did) opens a governance hole
 * where any team member could wipe the manager's picks. Developers can
 * still *propose* additions by asking a manager; future work may add a
 * dedicated propose-repo endpoint that inserts pending rows.
 *
 *   - Legacy (flag off): writes integrations.config.tracked_repos
 *   - Per-user (flag on): writes team_tracked_repos
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { team_id: teamId, repos } = body ?? {};

    if (!teamId) {
      return NextResponse.json({ error: 'team_id is required' }, { status: 400 });
    }
    if (!Array.isArray(repos)) {
      return NextResponse.json(
        { error: 'repos must be an array of repository full names' },
        { status: 400 }
      );
    }

    const admin = getSupabaseAdmin();
    const multiUser = await isMultiUserEnabled(admin, teamId);

    // Owner/manager-only in both flows. The v2 side used to be open to any
    // team member; the bulk-replace semantics made that unsafe.
    const guard = await guardApi({ teamId, roles: ['owner', 'manager'] });
    if (guard.response) return guard.response;
    const ctx = guard.ctx;

    if (multiUser) {
      const result = await replaceTeamTrackedRepos(admin, teamId, 'github', repos, ctx.userId);
      return NextResponse.json({
        success: true,
        flow: 'v2',
        trackedCount: result.kept + result.added,
        added: result.added,
        removed: result.removed,
      });
    }

    // Legacy path — unchanged
    const { data: integration } = await admin
      .from('integrations')
      .select('id, config')
      .eq('team_id', teamId)
      .eq('provider', 'github')
      .eq('status', 'active')
      .single();

    if (!integration) {
      return NextResponse.json({ error: 'GitHub not connected' }, { status: 404 });
    }

    const config = (integration.config as Record<string, unknown>) ?? {};
    const { error: updateError } = await admin
      .from('integrations')
      .update({ config: { ...config, tracked_repos: repos } })
      .eq('id', integration.id);

    if (updateError) {
      return NextResponse.json({ error: 'Failed to save repo selection' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      trackedCount: repos.length,
      trackedRepos: repos,
    });
  } catch (err) {
    console.error('GitHub track error:', err);
    return NextResponse.json({ error: 'Failed to save repo selection' }, { status: 500 });
  }
}
