import { NextResponse } from 'next/server';
import { NextRequest } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-server';
import { guardApi } from '@/lib/auth';

/**
 * POST /api/integrations/github/track
 *
 * Save the user's selected repositories to track.
 * Body: { team_id: string, repos: string[] }
 * Where repos is an array of full_name strings (e.g. ["org/repo-a", "user/repo-b"]).
 * RBAC: owner and manager only.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { team_id: teamId, repos } = body;

    if (!teamId) {
      return NextResponse.json({ error: 'team_id is required' }, { status: 400 });
    }

    if (!Array.isArray(repos)) {
      return NextResponse.json({ error: 'repos must be an array of repository full names' }, { status: 400 });
    }

    const guard = await guardApi({ teamId, roles: ['owner', 'manager'] });
    if (guard.response) return guard.response;

    const supabase = getSupabaseAdmin();

    const { data: integration } = await supabase
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

    const { error: updateError } = await supabase
      .from('integrations')
      .update({
        config: { ...config, tracked_repos: repos },
      })
      .eq('id', integration.id);

    if (updateError) {
      console.error('Failed to update tracked repos:', updateError);
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
