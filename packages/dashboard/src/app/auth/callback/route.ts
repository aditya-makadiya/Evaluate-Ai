import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * OAuth + email-confirmation callback.
 *
 * Shared by:
 *   - Email confirmation (signUp with email + password, user clicks the
 *     verification link)
 *   - Password reset (exchange is done elsewhere, but this route still
 *     works if the link lands here)
 *   - Google OAuth (the GoogleSignInButton routes here after Supabase
 *     exchanges the provider code)
 *
 * Post-auth routing:
 *   - If the caller passed `?redirect=` we honor it (returning user on login)
 *   - If the authenticated user has no team_members row, we force
 *     /onboarding regardless of `redirect` — otherwise a brand-new Google
 *     signup would land on /dashboard with no team and see an empty state
 *   - Failure modes redirect back to /auth/login?error=…
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const requestedRedirect = searchParams.get('redirect') || '/dashboard';

  if (!code) {
    return NextResponse.redirect(new URL('/auth/login?error=missing_code', origin));
  }

  const cookieStore = await cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY;
  if (!url || !key) {
    return NextResponse.redirect(new URL('/auth/login?error=config', origin));
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) =>
          cookieStore.set(name, value, options)
        );
      },
    },
  });

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.session) {
    return NextResponse.redirect(new URL('/auth/login?error=callback_failed', origin));
  }

  // Team-check: new users (Google signup in particular, but also any email
  // signup that reached this route without going through the onboarding
  // screen) land on /onboarding so the team-setup wizard can kick in. We
  // use the service role for this lookup because the just-issued session
  // cookies may not yet be readable on this request.
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (serviceKey) {
    try {
      const check = await fetch(
        `${url}/rest/v1/team_members?user_id=eq.${data.session.user.id}&is_active=eq.true&select=team_id&limit=1`,
        {
          headers: {
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`,
          },
        }
      );
      if (check.ok) {
        const rows = (await check.json()) as Array<{ team_id: string }>;
        if (rows.length === 0) {
          return NextResponse.redirect(new URL('/onboarding', origin));
        }
      }
    } catch {
      // If the team lookup itself fails, fall through to the requested
      // redirect rather than trapping the user on /auth/login. The app's
      // own guards (middleware + page-level) will handle the no-team case
      // on the next request.
    }
  }

  return NextResponse.redirect(new URL(requestedRedirect, origin));
}
