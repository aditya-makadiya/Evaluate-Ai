'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/components/auth-provider';
import { Terminal, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';

function CliAuthContent() {
  const searchParams = useSearchParams();
  const { user: authUser, loading: authLoading } = useAuth();
  const [status, setStatus] = useState<'loading' | 'confirming' | 'success' | 'error'>('loading');
  const [error, setError] = useState('');

  const port = searchParams.get('port');
  const state = searchParams.get('state');

  useEffect(() => {
    if (authLoading) return;

    if (!authUser) {
      // Not logged in — redirect to login with return URL
      const returnUrl = `/cli/auth?port=${port}&state=${state}`;
      window.location.href = `/auth/login?redirect=${encodeURIComponent(returnUrl)}`;
      return;
    }

    setStatus('confirming');
  }, [authUser, authLoading, port, state]);

  const handleAuthorize = async () => {
    if (!authUser || !port || !state) return;

    setStatus('loading');

    try {
      // Generate a CLI token
      const res = await fetch('/api/cli/tokens', { method: 'POST' });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to generate token');
        setStatus('error');
        return;
      }

      const data = await res.json();

      // Redirect back to CLI's localhost server with the token
      const params = new URLSearchParams({
        token: data.token,
        state,
        user_id: data.userId || '',
        email: data.email || '',
        team_id: data.teamId || '',
        team_name: encodeURIComponent(data.teamName || ''),
      });

      window.location.href = `http://localhost:${port}/callback?${params.toString()}`;
      setStatus('success');
    } catch {
      setError('Failed to connect. Is the CLI still running?');
      setStatus('error');
    }
  };

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center">
      <div className="w-full max-w-md px-4">
        <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-2xl p-8 text-center">
          {status === 'loading' && (
            <div className="py-8">
              <Loader2 className="h-10 w-10 text-purple-400 animate-spin mx-auto mb-4" />
              <p className="text-sm text-[var(--text-secondary)]">Preparing authorization...</p>
            </div>
          )}

          {status === 'confirming' && authUser && (
            <div className="animate-[slideUp_0.4s_ease-out]">
              <div className="h-14 w-14 rounded-full bg-purple-600/20 border border-purple-500/30 flex items-center justify-center mx-auto mb-6">
                <Terminal className="h-7 w-7 text-purple-400" />
              </div>

              <h1 className="text-xl font-bold tracking-tight mb-2">Authorize CLI</h1>
              <p className="text-sm text-[var(--text-secondary)] mb-6">
                Grant the EvaluateAI CLI access to your account.
              </p>

              <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl p-4 mb-6 text-left space-y-2">
                <div className="flex justify-between">
                  <span className="text-xs text-[var(--text-muted)]">Account</span>
                  <span className="text-sm text-[var(--text-primary)]">{authUser.email}</span>
                </div>
                <div className="h-px bg-[var(--border-primary)]" />
                <div className="flex justify-between">
                  <span className="text-xs text-[var(--text-muted)]">Team</span>
                  <span className="text-sm text-[var(--text-primary)]">{authUser.teamName}</span>
                </div>
                <div className="h-px bg-[var(--border-primary)]" />
                <div className="flex justify-between">
                  <span className="text-xs text-[var(--text-muted)]">Role</span>
                  <span className="text-sm text-[var(--text-primary)] capitalize">{authUser.role}</span>
                </div>
              </div>

              <button
                onClick={handleAuthorize}
                className="w-full flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl px-6 py-3 text-sm font-semibold transition-all"
              >
                Authorize CLI
              </button>

              <p className="text-xs text-[var(--text-muted)] mt-4">
                This will generate an API token for CLI access.
              </p>
            </div>
          )}

          {status === 'success' && (
            <div className="py-8 animate-[slideUp_0.4s_ease-out]">
              <CheckCircle2 className="h-12 w-12 text-green-400 mx-auto mb-4" />
              <h2 className="text-xl font-bold mb-2">Authorized!</h2>
              <p className="text-sm text-[var(--text-secondary)]">
                You can close this tab and return to the terminal.
              </p>
            </div>
          )}

          {status === 'error' && (
            <div className="py-8 animate-[slideUp_0.4s_ease-out]">
              <AlertCircle className="h-12 w-12 text-red-400 mx-auto mb-4" />
              <h2 className="text-xl font-bold mb-2">Authorization Failed</h2>
              <p className="text-sm text-red-300">{error}</p>
              <button
                onClick={() => setStatus('confirming')}
                className="mt-4 text-sm text-purple-400 hover:text-purple-300 transition-colors"
              >
                Try again
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function CliAuthPage() {
  return (
    <Suspense>
      <CliAuthContent />
    </Suspense>
  );
}
