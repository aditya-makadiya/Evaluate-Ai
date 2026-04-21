import { NextResponse } from 'next/server';
import { NextRequest } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-server';
import { guardApi } from '@/lib/auth';
import { isMultiUserEnabled } from '@/lib/integrations/feature-flag';
import { getProvider } from '@/lib/integrations/registry';
import {
  decryptAccessToken,
  replaceAccessibleRepos,
} from '@/lib/integrations/user-integrations';
import { logIntegration } from '@/lib/integrations/logger';

/**
 * POST /api/integrations/github/refresh-repos
 * Body: { team_id: string }
 *
 * Re-populates the caller's user_integration_repos from GitHub's
 * /user/repos endpoint. Any team member can refresh their OWN access
 * list — used when a user is granted access to a new repo and wants it
 * to show up in the coverage view without waiting for the next sync.
 *
 * Requires the per-user flow (feature flag on).
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { team_id: teamId } = body ?? {};

    if (!teamId) {
      return NextResponse.json({ error: 'team_id is required' }, { status: 400 });
    }

    const admin = getSupabaseAdmin();
    if (!(await isMultiUserEnabled(admin, teamId))) {
      return NextResponse.json(
        { error: 'Per-user integrations are not enabled for this team' },
        { status: 409 }
      );
    }

    const guard = await guardApi({ teamId });
    if (guard.response) return guard.response;
    const ctx = guard.ctx;

    const { data: integration, error: fetchErr } = await admin
      .from('user_integrations')
      .select('id, access_token_encrypted, status')
      .eq('team_id', teamId)
      .eq('user_id', ctx.userId)
      .eq('provider', 'github')
      .single();

    if (fetchErr || !integration) {
      return NextResponse.json(
        { error: 'GitHub is not connected for this user' },
        { status: 404 }
      );
    }
    if (integration.status !== 'active') {
      return NextResponse.json(
        { error: `Integration status is ${integration.status}; reconnect first` },
        { status: 409 }
      );
    }

    const adapter = getProvider('github');
    const token = decryptAccessToken(integration);
    const repos = await adapter.fetchAccessibleRepos!(token);
    await replaceAccessibleRepos(admin, integration.id, repos);

    logIntegration({
      team_id: teamId,
      user_id: ctx.userId,
      provider: 'github',
      action: 'refresh_repos',
      outcome: 'ok',
      accessible_repo_count: repos.length,
    });

    return NextResponse.json({ success: true, repoCount: repos.length });
  } catch (err) {
    console.error('Refresh repos error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to refresh repos' },
      { status: 500 }
    );
  }
}
