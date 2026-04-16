'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Mail, AlertCircle, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { getSupabaseBrowser } from '@/lib/supabase-browser';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const supabase = getSupabaseBrowser();
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/reset-password`,
      });

      if (resetError) {
        setError(resetError.message);
        return;
      }

      setSent(true);
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
          Reset your password
        </h1>
        <p className="text-sm text-text-secondary mt-1">
          {sent ? 'Check your email for a reset link' : 'Enter your email and we\'ll send you a reset link'}
        </p>
      </div>

      {/* Card */}
      <div className="bg-bg-card border border-border-primary rounded-lg p-6">
        {sent ? (
          <div className="space-y-4">
            <div className="flex flex-col items-center py-4 text-center">
              <CheckCircle2 className="h-10 w-10 text-emerald-400 mb-3" />
              <p className="text-sm text-text-primary font-medium">Reset email sent</p>
              <p className="text-xs text-text-muted mt-1.5">
                We sent a password reset link to <span className="text-text-secondary font-medium">{email}</span>.
                Check your inbox and click the link to set a new password.
              </p>
              <p className="text-xs text-text-muted mt-3">
                Didn&apos;t receive it? Check your spam folder or{' '}
                <button
                  onClick={() => { setSent(false); setError(''); }}
                  className="text-[#8b5cf6] hover:text-[#a78bfa] transition-colors"
                >
                  try again
                </button>
              </p>
            </div>
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
              <label htmlFor="email" className="block text-xs font-medium text-text-secondary mb-1.5">
                Email address
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  required
                  autoFocus
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
                <Mail className="h-4 w-4" />
              )}
              {loading ? 'Sending...' : 'Send reset link'}
            </button>
          </form>
        )}
      </div>

      {/* Footer */}
      <p className="text-center text-sm text-text-muted mt-6">
        <Link href="/auth/login" className="inline-flex items-center gap-1.5 text-[#8b5cf6] hover:text-[#a78bfa] transition-colors">
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
