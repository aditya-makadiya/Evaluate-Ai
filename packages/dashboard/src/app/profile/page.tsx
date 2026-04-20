'use client';

import { useState, useEffect, useCallback } from 'react';
import type { ElementType } from 'react';
import {
  User, Shield, Users, Lock, Eye, EyeOff, AlertCircle, CheckCircle2,
  Github, Terminal, Calendar, Save,
  Key, Copy, Check, Plus, Loader2,
} from 'lucide-react';
import { useAuth } from '@/components/auth-provider';
import { getSupabaseBrowser } from '@/lib/supabase-browser';

interface CliToken {
  id: string;
  prefix: string;
  name: string;
  lastUsedAt: string | null;
  createdAt: string;
  isRevoked: boolean;
}

// --- small presentational helpers (local to this page) ---

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

function MetaCell({
  icon: Icon,
  label,
  value,
  valueClass = 'text-text-primary',
}: {
  icon: ElementType;
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="flex flex-col gap-1 min-w-0">
      <span className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-text-muted">
        <Icon className="h-3 w-3" />
        {label}
      </span>
      <span className={`text-xs truncate ${valueClass}`}>{value}</span>
    </div>
  );
}

function DetailRow({
  label,
  value,
  mono = false,
  muted = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-text-muted shrink-0">{label}</dt>
      <dd
        className={`truncate ${mono ? 'font-mono' : ''} ${
          muted ? 'text-text-muted' : 'text-text-primary'
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

const passwordInputClasses = [
  'w-full rounded-lg border border-border-primary bg-bg-primary',
  'px-4 py-2.5 pl-10 pr-10 text-sm text-text-primary',
  'placeholder:text-text-muted',
  'focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500/30',
  'transition-colors',
].join(' ');

function PasswordField({
  id,
  label,
  value,
  onChange,
  visible,
  onToggle,
  placeholder,
  minLength,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  visible: boolean;
  onToggle?: () => void;
  placeholder: string;
  minLength?: number;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-medium text-text-secondary mb-1.5">
        {label}
      </label>
      <div className="relative">
        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          required
          minLength={minLength}
          className={passwordInputClasses}
        />
        {onToggle && (
          <button
            type="button"
            onClick={onToggle}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary transition-colors"
            tabIndex={-1}
            aria-label={visible ? 'Hide password' : 'Show password'}
          >
            {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        )}
      </div>
    </div>
  );
}

export default function ProfilePage() {
  const { user, supabaseUser, refresh } = useAuth();

  // Edit name
  const [name, setName] = useState('');
  const [nameSaving, setNameSaving] = useState(false);
  const [nameMessage, setNameMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Change password
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);

  // Profile data from API
  const [profile, setProfile] = useState<{
    githubUsername: string | null;
    cliInstalled: boolean;
    joinedAt: string | null;
    totalSessions: number;
    totalCost: number;
  } | null>(null);

  // CLI & API keys — every role manages their own tokens here.
  const [cliTokens, setCliTokens] = useState<CliToken[]>([]);
  const [cliTokensLoading, setCliTokensLoading] = useState(true);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [copiedToken, setCopiedToken] = useState(false);
  const [generatingToken, setGeneratingToken] = useState(false);
  const [cliTokensMessage, setCliTokensMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const flashCliTokensMessage = useCallback((type: 'success' | 'error', text: string) => {
    setCliTokensMessage({ type, text });
    setTimeout(() => setCliTokensMessage(null), 3000);
  }, []);

  const loadCliTokens = useCallback(async () => {
    try {
      const res = await fetch('/api/cli/tokens');
      if (!res.ok) {
        setCliTokens([]);
        return;
      }
      const data = await res.json();
      setCliTokens(data.tokens ?? []);
    } catch {
      setCliTokens([]);
    } finally {
      setCliTokensLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) {
      setName(user.name);
      // Fetch additional profile data
      fetch(`/api/dashboard/developers/${user.memberId}`)
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          if (data) {
            setProfile({
              githubUsername: data.developer?.githubUsername ?? null,
              cliInstalled: data.developer?.evaluateaiInstalled ?? false,
              joinedAt: data.developer?.joinedAt ?? null,
              totalSessions: data.stats?.totalSessions ?? data.sessionTotal ?? 0,
              totalCost: data.stats?.allTimeCost ?? 0,
            });
          }
        })
        .catch(() => {});

      loadCliTokens();
    }
  }, [user, loadCliTokens]);

  async function handleGenerateToken() {
    setGeneratingToken(true);
    try {
      const res = await fetch('/api/cli/tokens', { method: 'POST' });
      if (!res.ok) throw new Error('Failed to generate token');
      const data = await res.json();
      setNewToken(data.token);
      await loadCliTokens();
      flashCliTokensMessage('success', 'API key generated');
    } catch {
      flashCliTokensMessage('error', 'Failed to generate API key');
    } finally {
      setGeneratingToken(false);
    }
  }

  async function handleRevokeToken(tokenId: string) {
    try {
      const res = await fetch('/api/cli/tokens', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tokenId }),
      });
      if (!res.ok) throw new Error('Failed to revoke token');
      setCliTokens(prev => prev.map(t => t.id === tokenId ? { ...t, isRevoked: true } : t));
      flashCliTokensMessage('success', 'API key revoked');
    } catch {
      flashCliTokensMessage('error', 'Failed to revoke API key');
    }
  }

  async function handleCopyToken() {
    if (!newToken) return;
    try {
      await navigator.clipboard.writeText(newToken);
      setCopiedToken(true);
      setTimeout(() => setCopiedToken(false), 2000);
    } catch {
      flashCliTokensMessage('error', 'Failed to copy token');
    }
  }

  const handleUpdateName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setNameSaving(true);
    setNameMessage(null);

    try {
      const supabase = getSupabaseBrowser();

      // Update Supabase auth metadata
      const { error: authError } = await supabase.auth.updateUser({
        data: { name: name.trim() },
      });

      if (authError) {
        setNameMessage({ type: 'error', text: authError.message });
        return;
      }

      // Update team_members name via API
      if (user) {
        await fetch(`/api/teams/${user.teamId}/members/${user.memberId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: name.trim() }),
        });
      }

      setNameMessage({ type: 'success', text: 'Name updated successfully' });
      refresh();

      setTimeout(() => setNameMessage(null), 3000);
    } catch {
      setNameMessage({ type: 'error', text: 'Failed to update name' });
    } finally {
      setNameSaving(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordMessage(null);

    if (newPassword.length < 6) {
      setPasswordMessage({ type: 'error', text: 'New password must be at least 6 characters' });
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordMessage({ type: 'error', text: 'New passwords do not match' });
      return;
    }

    setPasswordSaving(true);

    try {
      const supabase = getSupabaseBrowser();

      // Verify current password by re-signing in
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user?.email ?? '',
        password: currentPassword,
      });

      if (signInError) {
        setPasswordMessage({ type: 'error', text: 'Current password is incorrect' });
        return;
      }

      // Update to new password
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateError) {
        setPasswordMessage({ type: 'error', text: updateError.message });
        return;
      }

      setPasswordMessage({ type: 'success', text: 'Password changed successfully' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');

      setTimeout(() => setPasswordMessage(null), 3000);
    } catch {
      setPasswordMessage({ type: 'error', text: 'Failed to change password' });
    } finally {
      setPasswordSaving(false);
    }
  };

  if (!user) {
    return (
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="h-8 w-40 animate-pulse rounded bg-bg-elevated" />
        <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-6">
          <div className="h-80 animate-pulse rounded-xl border border-border-primary bg-bg-card" />
          <div className="h-80 animate-pulse rounded-xl border border-border-primary bg-bg-card" />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto">
      {/* Page header */}
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-border-primary pb-6">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-purple-400/80">
            Your account
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-text-primary">Profile</h1>
          <p className="mt-1.5 text-sm text-text-muted">
            Identity, credentials, and CLI access — all in one place.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-border-primary bg-bg-card px-3 py-1.5 text-[11px] font-mono text-text-muted">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
          Active session
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-6 items-start">
        {/* ─────────── LEFT: Identity (sticky anchor) ─────────── */}
        <aside className="space-y-6 lg:sticky lg:top-6">
          {/* Identity card */}
          <div className="relative overflow-hidden rounded-xl border border-border-primary bg-bg-card p-6">
            {/* Soft purple halo behind avatar */}
            <div
              className="pointer-events-none absolute -top-12 left-1/2 h-40 w-40 -translate-x-1/2 rounded-full bg-purple-500/10 blur-3xl"
              aria-hidden="true"
            />

            <div className="relative flex flex-col items-center text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-purple-500/30 bg-purple-600/20 ring-4 ring-purple-500/5">
                <User className="h-7 w-7 text-purple-400" />
              </div>
              <p className="mt-3 text-base font-semibold text-text-primary">{user.name}</p>
              <p className="text-xs text-text-muted">{user.email}</p>

              <div className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-border-primary bg-bg-elevated px-2.5 py-1 text-[11px] font-medium text-text-secondary">
                <Shield className="h-3 w-3 text-purple-400" />
                <span className="capitalize">{user.role}</span>
                <span className="text-text-muted">·</span>
                <span className="truncate max-w-[120px]">{user.teamName}</span>
              </div>
            </div>

            {/* Metadata grid */}
            <div className="mt-6 grid grid-cols-2 gap-4 border-t border-border-primary pt-5">
              {profile?.githubUsername && (
                <MetaCell icon={Github} label="GitHub" value={profile.githubUsername} />
              )}
              <MetaCell
                icon={Terminal}
                label="CLI"
                value={profile?.cliInstalled ? 'Installed' : 'Not installed'}
                valueClass={profile?.cliInstalled ? 'text-emerald-400' : 'text-text-muted'}
              />
              {profile?.joinedAt && (
                <MetaCell
                  icon={Calendar}
                  label="Joined"
                  value={new Date(profile.joinedAt).toLocaleDateString('en-US', {
                    month: 'short',
                    year: 'numeric',
                  })}
                />
              )}
              {profile && (
                <MetaCell
                  icon={Users}
                  label="Sessions"
                  value={`${profile.totalSessions} · $${profile.totalCost.toFixed(2)}`}
                />
              )}
            </div>
          </div>

          {/* Account details — reference data, compact */}
          <div className="rounded-xl border border-border-primary bg-bg-card p-5">
            <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
              Account Details
            </h2>
            <dl className="space-y-2.5 text-xs">
              <DetailRow label="Email" value={user.email} mono />
              <DetailRow
                label="User ID"
                value={(supabaseUser?.id ?? '').slice(0, 12) + '…'}
                mono
                muted
              />
              <DetailRow label="Team Code" value={user.teamCode} mono />
              <DetailRow label="Member ID" value={user.memberId.slice(0, 12) + '…'} mono muted />
            </dl>
          </div>
        </aside>

        {/* ─────────── RIGHT: Actionable sections ─────────── */}
        <div className="min-w-0 space-y-6">
          {/* Display name — compact inline form */}
          <section className="rounded-xl border border-border-primary bg-bg-card p-6">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-sm font-semibold text-text-primary">Display name</h2>
                <p className="mt-0.5 text-xs text-text-muted">
                  How your name appears across the workspace.
                </p>
              </div>
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-purple-500/20 bg-purple-900/20">
                <User className="h-4 w-4 text-purple-400" />
              </div>
            </div>

            <form onSubmit={handleUpdateName} className="space-y-3">
              {nameMessage && <InlineMessage type={nameMessage.type} text={nameMessage.text} />}
              <div className="flex flex-col gap-2.5 sm:flex-row">
                <input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  required
                  className="flex-1 rounded-lg border border-border-primary bg-bg-primary px-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted transition-colors focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500/30"
                />
                <button
                  type="submit"
                  disabled={nameSaving || name.trim() === user.name}
                  className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-purple-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-purple-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {nameSaving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  {nameSaving ? 'Saving' : 'Save'}
                </button>
              </div>
            </form>
          </section>

          {/* Change password */}
          <section className="rounded-xl border border-border-primary bg-bg-card p-6">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-sm font-semibold text-text-primary">Change password</h2>
                <p className="mt-0.5 text-xs text-text-muted">
                  Use a strong password you haven&apos;t used elsewhere.
                </p>
              </div>
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-blue-500/20 bg-blue-900/20">
                <Lock className="h-4 w-4 text-blue-400" />
              </div>
            </div>

            <form onSubmit={handleChangePassword} className="space-y-3">
              {passwordMessage && (
                <InlineMessage type={passwordMessage.type} text={passwordMessage.text} />
              )}

              <PasswordField
                id="currentPassword"
                label="Current password"
                value={currentPassword}
                onChange={setCurrentPassword}
                visible={showCurrentPassword}
                onToggle={() => setShowCurrentPassword((v) => !v)}
                placeholder="Enter current password"
              />

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <PasswordField
                  id="newPassword"
                  label="New password"
                  value={newPassword}
                  onChange={setNewPassword}
                  visible={showNewPassword}
                  onToggle={() => setShowNewPassword((v) => !v)}
                  placeholder="At least 6 characters"
                  minLength={6}
                />
                <PasswordField
                  id="confirmNewPassword"
                  label="Confirm new password"
                  value={confirmPassword}
                  onChange={setConfirmPassword}
                  visible={showNewPassword}
                  placeholder="Re-enter new password"
                  minLength={6}
                />
              </div>

              <div className="flex justify-end pt-1">
                <button
                  type="submit"
                  disabled={
                    passwordSaving || !currentPassword || !newPassword || !confirmPassword
                  }
                  className="inline-flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {passwordSaving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Lock className="h-4 w-4" />
                  )}
                  {passwordSaving ? 'Updating' : 'Change password'}
                </button>
              </div>
            </form>
          </section>

          {/* CLI & API Keys */}
          <section className="rounded-xl border border-border-primary bg-bg-card p-6">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div className="flex-1">
                <h2 className="text-sm font-semibold text-text-primary">CLI &amp; API keys</h2>
                <p className="mt-0.5 text-xs text-text-muted">
                  Generate an API key for{' '}
                  <code className="rounded bg-bg-elevated px-1.5 py-0.5 font-mono text-[11px] text-text-secondary">
                    evalai setup --token &lt;key&gt;
                  </code>{' '}
                  in CI/CD, Docker, or headless installs.
                </p>
              </div>
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-orange-500/20 bg-orange-900/20">
                <Key className="h-4 w-4 text-orange-400" />
              </div>
            </div>

            {cliTokensMessage && (
              <div className="mb-3">
                <InlineMessage type={cliTokensMessage.type} text={cliTokensMessage.text} />
              </div>
            )}

            {/* Newly generated token — show once */}
            {newToken && (
              <div className="mb-4 rounded-lg border border-yellow-800/30 bg-yellow-900/10 p-4">
                <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-yellow-400">
                  <AlertCircle className="h-3.5 w-3.5" />
                  Copy this token now — it won&apos;t be shown again.
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 break-all rounded border border-border-primary bg-bg-primary px-3 py-2 font-mono text-xs text-text-primary">
                    {newToken}
                  </code>
                  <button
                    onClick={handleCopyToken}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border-primary text-text-muted transition-colors hover:bg-bg-elevated hover:text-text-primary"
                    title="Copy token"
                  >
                    {copiedToken ? (
                      <Check className="h-3.5 w-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
                <p className="mt-2 text-[11px] text-text-muted">
                  Paste into:{' '}
                  <code className="rounded bg-bg-elevated px-1 py-0.5 font-mono">
                    evalai setup --token {newToken.slice(0, 12)}…
                  </code>
                </p>
              </div>
            )}

            {/* Token list */}
            {cliTokensLoading ? (
              <div className="mb-4 flex items-center justify-center gap-2 rounded-lg border border-dashed border-border-primary py-6 text-xs text-text-muted">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Loading keys…
              </div>
            ) : cliTokens.length > 0 ? (
              <div className="mb-4 divide-y divide-border-primary overflow-hidden rounded-lg border border-border-primary">
                {cliTokens.map((token) => (
                  <div
                    key={token.id}
                    className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-bg-elevated/40"
                  >
                    <Key className="h-3.5 w-3.5 shrink-0 text-text-muted" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-mono text-xs text-text-primary">
                        {token.prefix}...
                        {token.isRevoked && (
                          <span className="ml-2 font-sans text-red-400">(revoked)</span>
                        )}
                      </p>
                      <p className="mt-0.5 text-[10px] text-text-muted">
                        Created {new Date(token.createdAt).toLocaleDateString()}
                        {token.lastUsedAt &&
                          ` · Last used ${new Date(token.lastUsedAt).toLocaleDateString()}`}
                      </p>
                    </div>
                    {!token.isRevoked && (
                      <button
                        onClick={() => handleRevokeToken(token.id)}
                        className="shrink-0 rounded border border-red-900/40 px-2.5 py-1 text-[10px] text-red-400/80 transition-colors hover:bg-red-900/10 hover:text-red-400"
                      >
                        Revoke
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="mb-4 flex flex-col items-center justify-center rounded-lg border border-dashed border-border-primary py-8 text-center">
                <Key className="mb-2 h-6 w-6 text-text-muted" />
                <p className="text-sm text-text-secondary">No API keys yet</p>
                <p className="mt-0.5 text-xs text-text-muted">
                  Generate one to install EvaluateAI from a non-browser environment.
                </p>
              </div>
            )}

            <button
              onClick={handleGenerateToken}
              disabled={generatingToken}
              className="inline-flex items-center gap-2 rounded-lg border border-border-primary px-4 py-2 text-sm font-medium text-text-secondary transition-all hover:border-border-hover hover:bg-bg-elevated hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              {generatingToken ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              {generatingToken ? 'Generating…' : 'Generate new API key'}
            </button>
          </section>
        </div>
      </div>
    </div>
  );
}
