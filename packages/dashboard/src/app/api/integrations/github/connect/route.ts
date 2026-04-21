import { NextResponse } from 'next/server';
import { NextRequest } from 'next/server';
import { buildAuthorizationUrl, isGitHubOAuthConfigured } from '@/lib/github-oauth';
import { guardApi } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase-server';
import { isMultiUserEnabled } from '@/lib/integrations/feature-flag';
import { encodeState } from '@/lib/integrations/oauth-state';
import { logIntegration } from '@/lib/integrations/logger';

/**
 * GET /api/integrations/github/connect?team_id=xxx
 *
 * Redirects the user to GitHub's OAuth authorization page.
 * After authorization, GitHub redirects to /api/integrations/github/callback.
 *
 * Two flows branch on teams.settings.multi_user_integrations_enabled:
 *   - Legacy (flag off): owner/manager only; state = base64 { team_id }
 *   - Per-user (flag on): any team member; state = signed v2 envelope with
 *     { flow: 'v2', provider, userId, teamId }
 */
export async function GET(request: NextRequest) {
  try {
    const teamId = request.nextUrl.searchParams.get('team_id');
    if (!teamId) {
      return NextResponse.json({ error: 'team_id is required' }, { status: 400 });
    }

    if (!isGitHubOAuthConfigured()) {
      return NextResponse.json(
        { error: 'GitHub OAuth not configured. Set GITHUB_OAUTH_CLIENT_ID and GITHUB_OAUTH_CLIENT_SECRET.' },
        { status: 500 }
      );
    }

    const admin = getSupabaseAdmin();
    const multiUser = await isMultiUserEnabled(admin, teamId);

    // Per-user path: any team member can connect their own GitHub.
    // Legacy path: owner/manager only (existing behavior).
    const guard = await guardApi(
      multiUser ? { teamId } : { teamId, roles: ['owner', 'manager'] }
    );
    if (guard.response) return guard.response;
    const ctx = guard.ctx;

    const state = multiUser
      ? encodeState({ flow: 'v2', provider: 'github', userId: ctx.userId, teamId })
      : Buffer.from(JSON.stringify({ team_id: teamId })).toString('base64url');

    logIntegration({
      team_id: teamId,
      user_id: ctx.userId,
      provider: 'github',
      action: 'oauth_initiate',
      outcome: 'ok',
      flow: multiUser ? 'v2' : 'legacy',
    });

    return NextResponse.redirect(buildAuthorizationUrl(state));
  } catch (err) {
    console.error('GitHub connect error:', err);
    return NextResponse.json(
      { error: 'Failed to initiate GitHub connection' },
      { status: 500 }
    );
  }
}
