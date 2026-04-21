'use client';

import { useCallback, useEffect, useState } from 'react';
import type { UserIdentity } from '@supabase/supabase-js';
import {
  Mail,
  Link2,
  Link2Off,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Shield,
} from 'lucide-react';
import { getSupabaseBrowser } from '@/lib/supabase-browser';

/**
 * Per-provider metadata for the linked-accounts UI. Kept tiny on purpose —
 * providers we don't explicitly know about still render via a graceful
 * fallback that just shows the provider name.
 */
const knownProviders: Record<
  string,
  { label: string; Icon: React.ComponentType<{ className?: string }>; brandColor: string }
> = {
  email: { label: 'Email + password', Icon: Mail, brandColor: 'text-blue-400' },
  google: { label: 'Google', Icon: GoogleGlyph, brandColor: 'text-text-primary' },
};

/**
 * Section shown on the profile page. Pulls the current user's identities
 * via supabase.auth.getUserIdentities(), lists them, and offers:
 *
 *  - **Connect Google** when google isn't linked yet — uses
 *    supabase.auth.linkIdentity({ provider: 'google' }) which requires
 *    Supabase's "Allow manual linking" setting to be ON in the dashboard.
 *  - **Disconnect** per identity. Supabase prevents unlinking the last
 *    identity server-side (throws), so we don't need a client-side guard.
 *
 * Errors from linkIdentity (typically "Identity already exists" when the
 * Google account is already linked to a different user) are surfaced
 * inline rather than swallowed.
 */
export function LinkedIdentitiesSection() {
  const [identities, setIdentities] = useState<UserIdentity[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const flash = useCallback((type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 4000);
  }, []);

  const load = useCallback(async () => {
    try {
      const supabase = getSupabaseBrowser();
      const { data, error } = await supabase.auth.getUserIdentities();
      if (error) {
        flash('error', error.message);
        setIdentities([]);
      } else {
        setIdentities(data?.identities ?? []);
      }
    } catch {
      setIdentities([]);
    } finally {
      setLoading(false);
    }
  }, [flash]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleLinkGoogle() {
    setWorking('link:google');
    try {
      const supabase = getSupabaseBrowser();
      const origin = window.location.origin;
      const { error } = await supabase.auth.linkIdentity({
        provider: 'google',
        options: {
          redirectTo: `${origin}/auth/callback?redirect=/profile`,
          queryParams: { prompt: 'select_account' },
        },
      });
      if (error) {
        flash('error', error.message);
        setWorking(null);
      }
      // On success, browser is navigating to Google. Keep the button in its
      // loading state until that redirect fires.
    } catch (err) {
      flash('error', err instanceof Error ? err.message : 'Failed to link Google');
      setWorking(null);
    }
  }

  async function handleUnlink(identity: UserIdentity) {
    setWorking(`unlink:${identity.identity_id}`);
    try {
      const supabase = getSupabaseBrowser();
      const { error } = await supabase.auth.unlinkIdentity(identity);
      if (error) {
        // Supabase throws a descriptive error if the user tries to unlink
        // their only identity (would lock them out). We pass it through.
        flash('error', error.message);
      } else {
        flash('success', `Unlinked ${knownProviders[identity.provider]?.label ?? identity.provider}`);
        await load();
      }
    } catch (err) {
      flash('error', err instanceof Error ? err.message : 'Failed to unlink');
    } finally {
      setWorking(null);
    }
  }

  const hasGoogle = identities?.some((i) => i.provider === 'google') ?? false;

  return (
    <section className="rounded-xl border border-border-primary bg-bg-card p-6">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-text-primary">Connected accounts</h2>
          <p className="mt-0.5 text-xs text-text-muted">
            Add a second sign-in method so you don&apos;t get locked out if you forget your password.
          </p>
        </div>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-emerald-500/20 bg-emerald-900/20">
          <Shield className="h-4 w-4 text-emerald-400" />
        </div>
      </div>

      {message && (
        <div className="mb-3">
          <InlineMessage type={message.type} text={message.text} />
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-border-primary py-6 text-xs text-text-muted">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading…
        </div>
      ) : (
        <div className="space-y-2">
          {(identities ?? []).map((identity) => {
            const meta = knownProviders[identity.provider];
            const Icon = meta?.Icon ?? Link2;
            const label = meta?.label ?? identity.provider;
            const email = (identity.identity_data as { email?: string } | null)?.email;
            const isLast = (identities ?? []).length === 1;
            const unlinking = working === `unlink:${identity.identity_id}`;

            return (
              <div
                key={identity.identity_id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border-primary bg-bg-primary px-4 py-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-bg-elevated ${meta?.brandColor ?? 'text-text-muted'}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-sm font-medium text-text-primary">
                      {label}
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-400">
                        <CheckCircle2 className="h-3 w-3" />
                        Connected
                      </span>
                    </div>
                    {email && (
                      <div className="mt-0.5 truncate font-mono text-[11px] text-text-muted">
                        {email}
                      </div>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => handleUnlink(identity)}
                  disabled={unlinking || isLast}
                  title={isLast ? 'You need at least one sign-in method' : undefined}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border-primary px-2.5 py-1 text-[11px] text-text-muted transition-colors hover:border-red-800/60 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {unlinking ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Link2Off className="h-3 w-3" />
                  )}
                  {unlinking ? 'Unlinking' : 'Unlink'}
                </button>
              </div>
            );
          })}

          {!hasGoogle && (
            <button
              onClick={handleLinkGoogle}
              disabled={working === 'link:google'}
              className="flex w-full items-center justify-center gap-3 rounded-lg border border-dashed border-border-primary bg-bg-primary hover:bg-bg-elevated disabled:opacity-50 disabled:cursor-not-allowed px-4 py-3 text-sm font-medium text-text-primary transition-colors"
            >
              {working === 'link:google' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <GoogleGlyph className="h-4 w-4" />
              )}
              {working === 'link:google' ? 'Redirecting…' : 'Connect Google'}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function InlineMessage({ type, text }: { type: 'success' | 'error'; text: string }) {
  return (
    <div
      className={`flex items-center gap-2 rounded-lg px-3.5 py-2.5 text-xs ${
        type === 'success'
          ? 'bg-emerald-900/20 border border-emerald-800/50 text-emerald-300'
          : 'bg-red-900/20 border border-red-800/50 text-red-300'
      }`}
    >
      {type === 'success' ? (
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
      ) : (
        <AlertCircle className="h-3.5 w-3.5 shrink-0" />
      )}
      {text}
    </div>
  );
}

function GoogleGlyph({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z" />
      <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z" />
      <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0124 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z" />
      <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 01-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z" />
    </svg>
  );
}
