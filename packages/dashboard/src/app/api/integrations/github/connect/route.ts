import { NextResponse } from 'next/server';
import { NextRequest } from 'next/server';
import { buildAuthorizationUrl, isGitHubOAuthConfigured } from '@/lib/github-oauth';
import { guardApi } from '@/lib/auth';

/**
 * GET /api/integrations/github/connect?team_id=xxx
 *
 * Redirects the user to GitHub's OAuth authorization page.
 * After authorization, GitHub redirects to /api/integrations/github/callback.
 *
 * RBAC: owner and manager only.
 */
export async function GET(request: NextRequest) {
  try {
    const teamId = request.nextUrl.searchParams.get('team_id');
    if (!teamId) {
      return NextResponse.json({ error: 'team_id is required' }, { status: 400 });
    }

    const guard = await guardApi({ teamId, roles: ['owner', 'manager'] });
    if (guard.response) return guard.response;

    if (!isGitHubOAuthConfigured()) {
      return NextResponse.json(
        { error: 'GitHub OAuth not configured. Set GITHUB_OAUTH_CLIENT_ID and GITHUB_OAUTH_CLIENT_SECRET.' },
        { status: 500 }
      );
    }

    const state = Buffer.from(JSON.stringify({ team_id: teamId })).toString('base64url');
    const authUrl = buildAuthorizationUrl(state);

    return NextResponse.redirect(authUrl);
  } catch (err) {
    console.error('GitHub connect error:', err);
    return NextResponse.json(
      { error: 'Failed to initiate GitHub connection' },
      { status: 500 }
    );
  }
}
