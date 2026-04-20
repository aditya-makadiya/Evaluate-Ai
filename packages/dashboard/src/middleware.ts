import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const PUBLIC_ROUTES = ['/auth/login', '/auth/signup', '/auth/callback', '/auth/forgot-password', '/auth/reset-password', '/onboarding'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip auth check for public routes, API routes with Bearer tokens, and static assets
  const hasBearerToken = request.headers.get('authorization')?.startsWith('Bearer ');

  const isPublic =
    pathname === '/' ||
    PUBLIC_ROUTES.some(route => pathname.startsWith(route)) ||
    pathname.startsWith('/api/cli/') ||
    pathname.startsWith('/api/auth/signup') ||
    pathname.startsWith('/api/teams/join') ||
    pathname.startsWith('/api/integrations/github/webhook') ||
    pathname.startsWith('/api/integrations/github/callback') ||
    pathname.startsWith('/api/integrations/fireflies/webhook') ||
    pathname.startsWith('/api/integrations/fireflies/callback') ||
    (pathname.startsWith('/api/') && hasBearerToken);

  // Admin routes require authentication (role check happens in API routes / layout)
  const isAdminRoute = pathname.startsWith('/admin') || pathname.startsWith('/api/admin');

  const response = NextResponse.next({
    request: { headers: request.headers },
  });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY;

  if (!url || !key) {
    // Supabase not configured — let request through without auth check
    return response;
  }

  const supabase = createServerClient(
    url,
    key,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  // Refresh session — important to call this before checking user
  const { data: { user } } = await supabase.auth.getUser();

  if (!user && !isPublic) {
    const loginUrl = new URL('/auth/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // If user is authenticated and visiting login/signup, redirect to dashboard
  if (user && (pathname === '/auth/login' || pathname === '/auth/signup')) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
