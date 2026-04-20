'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { UserPlus, Mail, Lock, User, AlertCircle, Eye, EyeOff, MailCheck } from 'lucide-react';
import { getSupabaseBrowser } from '@/lib/supabase-browser';

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [awaitingConfirm, setAwaitingConfirm] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const supabase = getSupabaseBrowser();

      const { data, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { name } },
      });

      if (authError) {
        setError(authError.message);
        return;
      }

      // If Supabase email-confirmation is enabled, signUp returns no session.
      // Show a confirmation screen instead of sending the user to onboarding,
      // where authenticated API calls would fail.
      if (!data.session) {
        setAwaitingConfirm(true);
        return;
      }

      // Session is active (email confirmation disabled) — continue to onboarding.
      router.push('/onboarding');
      router.refresh();
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

  if (awaitingConfirm) {
    return (
      <div className="animate-section">
        <div className="flex flex-col items-center mb-8">
          <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-[#8b5cf6] to-[#6d28d9] flex items-center justify-center shadow-[0_0_24px_rgba(139,92,246,0.3)] mb-4">
            <MailCheck className="h-6 w-6 text-white" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-text-primary">
            Check your email
          </h1>
          <p className="text-sm text-text-secondary mt-1 text-center">
            We sent a confirmation link to
          </p>
          <p className="text-sm font-medium text-text-primary mt-0.5">{email}</p>
        </div>

        <div className="bg-bg-card border border-border-primary rounded-lg p-6 space-y-4">
          <p className="text-sm text-text-secondary">
            Click the link in the email to verify your account, then come back and sign in to continue setting up your team.
          </p>
          <div className="bg-bg-elevated border border-border-primary rounded-lg px-4 py-3 text-xs text-text-muted">
            Didn&apos;t get it? Check your spam folder, or wait a minute and try signing up again with the same email.
          </div>
          <Link
            href="/auth/login"
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-purple-600 hover:bg-purple-500 px-4 py-2.5 text-sm font-medium text-white transition-colors"
          >
            Go to sign in
          </Link>
        </div>

        <p className="text-center text-sm text-text-muted mt-6">
          Wrong email?{' '}
          <button
            onClick={() => setAwaitingConfirm(false)}
            className="text-[#8b5cf6] hover:text-[#a78bfa] transition-colors"
          >
            Start over
          </button>
        </p>
      </div>
    );
  }

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
          Create your account
        </h1>
        <p className="text-sm text-text-secondary mt-1">
          Get started with EvaluateAI
        </p>
      </div>

      {/* Card */}
      <div className="bg-bg-card border border-border-primary rounded-lg p-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="flex items-center gap-2 bg-red-900/20 border border-red-800/50 rounded-lg px-4 py-3 text-red-300 text-sm">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          <div>
            <label htmlFor="name" className="block text-xs font-medium text-text-secondary mb-1.5">
              Your name
            </label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Jane Smith"
                required
                className={inputClasses}
              />
            </div>
          </div>

          <div>
            <label htmlFor="email" className="block text-xs font-medium text-text-secondary mb-1.5">
              Email
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
                className={inputClasses}
              />
            </div>
          </div>

          <div>
            <label htmlFor="password" className="block text-xs font-medium text-text-secondary mb-1.5">
              Password
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

          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2.5 text-sm font-medium text-white transition-colors"
          >
            {loading ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            ) : (
              <UserPlus className="h-4 w-4" />
            )}
            {loading ? 'Creating account...' : 'Create account'}
          </button>
        </form>
      </div>

      {/* Footer link */}
      <p className="text-center text-sm text-text-muted mt-6">
        Already have an account?{' '}
        <Link href="/auth/login" className="text-[#8b5cf6] hover:text-[#a78bfa] transition-colors">
          Sign in
        </Link>
      </p>
    </div>
  );
}
