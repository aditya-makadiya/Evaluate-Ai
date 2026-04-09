import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const redirect = searchParams.get('redirect') || '/dashboard';

  if (code) {
    const cookieStore = await cookies();

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY;
    if (!url || !key) {
      return NextResponse.redirect(new URL('/auth/login?error=config', origin));
    }

    const supabase = createServerClient(
      url,
      key,
      {
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
      }
    );

    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      return NextResponse.redirect(new URL(redirect, origin));
    }
  }

  return NextResponse.redirect(new URL('/auth/login?error=callback_failed', origin));
}
