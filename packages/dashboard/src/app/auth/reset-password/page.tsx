'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Lock, AlertCircle, CheckCircle2, Eye, EyeOff } from 'lucide-react';
import { getSupabaseBrowser } from '@/lib/supabase-browser';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [sessionError, setSessionError] = useState(false);

  // Supabase handles the token exchange automatically when user clicks the email link.
  // The link redirects to /auth/callback with a recovery code, which sets the session.
  // We just need to wait for the session to be established.
  useEffect(() => {
    const supabase = getSupabaseBrowser();

    // Check if we already have a session (user clicked recovery link)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setSessionReady(true);
      }
    });

    // Listen for auth state changes (recovery flow)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || (event === 'SIGNED_IN' && session)) {
        setSessionReady(true);
      }
    });

    // If no session after 5 seconds, show error
    const timeout = setTimeout(() => {
      if (!sessionReady) setSessionError(true);
    }, 5000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, [sessionReady]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);

    try {
      const supabase = getSupabaseBrowser();
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      });

      if (updateError) {
        setError(updateError.message);
        return;
      }

      setSuccess(true);
      setTimeout(() => {
        router.push('/dashboard');
      }, 2000);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const inputClasses = [
    'w-full rounded-lg border border-border-primary bg-bg-input',
    'px-4 py-2.5 pl-10 text-sm text-text-primary',
    'placeholder:text-text-muted',
    'focus:border-border-focus focus:outline-none',
    'transition-colors',
  ].join(' ');

  return (
    <div className="animate-section">
      {/* Logo */}
      <div className="flex flex-col items-center mb-8">
        <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-[#8b5cf6] to-[#6d28d9] flex items-center justify-center shadow-[0_0_24px_rgba(139,92,246,0.3)] mb-4">
          <svg width="24" height="24" viewBox="0 0 16 16" fill="none" className="text-white">
            <path d="M8 1L14.5 5v6L8 15 1.5 11V5L8 1z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" fill="rgba(255,255,255,0.15)" />
            <path d="M8 5.5L11.5 7.5v3L8 12.5 4.5 10.5v-3L8 5.5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" fill="rgba(255,255,255,0.25)" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-text-primary">
          Set new password
        </h1>
        <p className="text-sm text-text-secondary mt-1">
          Choose a strong password for your account
        </p>
      </div>

      {/* Card */}
      <div className="bg-bg-card border border-border-primary rounded-lg p-6">
        {success ? (
          <div className="flex flex-col items-center py-4 text-center">
            <CheckCircle2 className="h-10 w-10 text-emerald-400 mb-3" />
            <p className="text-sm text-text-primary font-medium">Password updated</p>
            <p className="text-xs text-text-muted mt-1.5">
              Redirecting to dashboard...
            </p>
          </div>
        ) : sessionError && !sessionReady ? (
          <div className="flex flex-col items-center py-4 text-center">
            <AlertCircle className="h-10 w-10 text-red-400 mb-3" />
            <p className="text-sm text-text-primary font-medium">Invalid or expired link</p>
            <p className="text-xs text-text-muted mt-1.5">
              This password reset link may have expired.
            </p>
            <Link
              href="/auth/forgot-password"
              className="mt-4 text-sm text-[#8b5cf6] hover:text-[#a78bfa] transition-colors"
            >
              Request a new reset link
            </Link>
          </div>
        ) : !sessionReady ? (
          <div className="flex flex-col items-center py-8">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-purple-500 border-t-transparent mb-3" />
            <p className="text-xs text-text-muted">Verifying reset link...</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="flex items-center gap-2 bg-red-900/20 border border-red-800/50 rounded-lg px-4 py-3 text-red-300 text-sm">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}

            <div>
              <label htmlFor="password" className="block text-xs font-medium text-text-secondary mb-1.5">
                New password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  required
                  minLength={6}
                  autoFocus
                  className={`${inputClasses} pr-10`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-xs font-medium text-text-secondary mb-1.5">
                Confirm new password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
                <input
                  id="confirmPassword"
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter your password"
                  required
                  minLength={6}
                  className={inputClasses}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2.5 text-sm font-medium text-white transition-colors"
            >
              {loading ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              ) : (
                <Lock className="h-4 w-4" />
              )}
              {loading ? 'Updating...' : 'Update password'}
            </button>
          </form>
        )}
      </div>

      {/* Footer */}
      <p className="text-center text-sm text-text-muted mt-6">
        <Link href="/auth/login" className="text-[#8b5cf6] hover:text-[#a78bfa] transition-colors">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
