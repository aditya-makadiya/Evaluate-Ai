'use client';

import { useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { getSupabaseBrowser } from '@/lib/supabase-browser';

interface GoogleSignInButtonProps {
  /**
   * Where to land after Supabase hands control back to our /auth/callback.
   * For signup this is typically /onboarding; for login it's /dashboard.
   * The callback route forwards this via ?redirect=... in the OAuth flow
   * and enforces its own "no team → /onboarding" override so brand-new
   * Google users don't crash into an empty dashboard.
   */
  redirectTo?: string;
  /** Human-readable verb — "Sign in" for login, "Sign up" for signup. */
  verb?: 'Sign in' | 'Sign up' | 'Continue';
  className?: string;
}

/**
 * Shared "Continue with Google" button.
 *
 * Uses Supabase's OAuth flow:
 *   1. Click → supabase.auth.signInWithOAuth({ provider: 'google' })
 *   2. Supabase redirects to Google's consent screen
 *   3. Google redirects back to <SUPABASE_URL>/auth/v1/callback?code=...
 *   4. Supabase exchanges the code, then redirects to options.redirectTo
 *      which is our `/auth/callback` — that route exchanges the session
 *      cookie and lands the user on the right page (onboarding if new,
 *      dashboard if returning).
 *
 * Nothing provider-specific has to be configured in *this* codebase. The
 * Google client ID / secret live in the Supabase dashboard under
 * Authentication → Providers → Google. Only the redirect URL is relevant
 * here, and it must be whitelisted in Supabase's "Redirect URLs" list.
 */
export function GoogleSignInButton({
  redirectTo,
  verb = 'Continue',
  className = '',
}: GoogleSignInButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setError(null);
    setLoading(true);
    try {
      const supabase = getSupabaseBrowser();
      // Resolve origin at click-time rather than render-time — avoids SSR
      // mismatches and respects the actual browser origin (useful when the
      // app is served under multiple hosts, e.g. preview deployments).
      const origin = window.location.origin;
      const qs = new URLSearchParams();
      if (redirectTo) qs.set('redirect', redirectTo);
      const callback = `${origin}/auth/callback${qs.toString() ? `?${qs}` : ''}`;

      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: callback,
          // `online` is the default; we keep it explicit. We don't need
          // offline refresh tokens from Google itself — Supabase manages
          // its own session refresh independently.
          queryParams: { prompt: 'select_account' },
        },
      });

      if (oauthError) {
        setError(oauthError.message);
        setLoading(false);
      }
      // On success, the browser is redirecting; keep loading=true until
      // navigation finishes.
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start Google sign-in');
      setLoading(false);
    }
  }

  return (
    <div className={className}>
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className="flex w-full items-center justify-center gap-3 rounded-lg border border-border-primary bg-bg-input hover:bg-bg-elevated disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2.5 text-sm font-medium text-text-primary transition-colors"
      >
        {loading ? (
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-text-muted/40 border-t-text-primary" />
        ) : (
          <GoogleIcon className="h-4 w-4" />
        )}
        {loading ? 'Redirecting…' : `${verb} with Google`}
      </button>
      {error && (
        <div className="mt-2 flex items-center gap-2 text-xs text-red-300">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}

/**
 * Official Google "G" mark. Inline SVG so we don't need to ship an image
 * or depend on a font-icon set. Colors are the Google brand palette —
 * deliberately NOT themed to the app's purple, per Google's branding
 * guidelines for third-party sign-in buttons.
 */
function GoogleIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path
        fill="#FFC107"
        d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"
      />
      <path
        fill="#FF3D00"
        d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0124 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 01-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"
      />
    </svg>
  );
}
