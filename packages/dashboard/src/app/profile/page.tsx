'use client';

import { useState, useEffect } from 'react';
import {
  User, Mail, Shield, Users, Lock, Eye, EyeOff, AlertCircle, CheckCircle2,
  Github, Terminal, Calendar, Building2, Save,
} from 'lucide-react';
import { useAuth } from '@/components/auth-provider';
import { getSupabaseBrowser } from '@/lib/supabase-browser';

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
    }
  }, [user]);

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

  const inputClasses = [
    'w-full rounded-lg border border-border-primary bg-bg-primary',
    'px-4 py-2.5 pl-10 text-sm text-text-primary',
    'placeholder:text-text-muted',
    'focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500/30',
    'transition-colors',
  ].join(' ');

  if (!user) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-40 animate-pulse rounded bg-bg-elevated" />
        <div className="h-64 animate-pulse rounded-xl border border-border-primary bg-bg-card" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-text-primary">Profile</h1>
        <p className="mt-1 text-sm text-text-muted">Manage your account settings and preferences</p>
      </div>

      {/* Account Overview Card */}
      <div className="rounded-xl border border-border-primary bg-bg-card p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-text-muted mb-4">Account Overview</h2>

        <div className="flex items-start gap-4 mb-6">
          <div className="h-14 w-14 rounded-full bg-purple-600/20 border border-purple-500/30 flex items-center justify-center shrink-0">
            <User className="h-6 w-6 text-purple-400" />
          </div>
          <div className="flex-1">
            <p className="text-lg font-semibold text-text-primary">{user.name}</p>
            <p className="text-sm text-text-muted">{user.email}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="flex items-center gap-2.5 text-text-secondary">
            <Building2 className="h-4 w-4 text-text-muted shrink-0" />
            <div>
              <p className="text-xs text-text-muted">Team</p>
              <p>{user.teamName}</p>
            </div>
          </div>
          <div className="flex items-center gap-2.5 text-text-secondary">
            <Shield className="h-4 w-4 text-text-muted shrink-0" />
            <div>
              <p className="text-xs text-text-muted">Role</p>
              <p className="capitalize">{user.role}</p>
            </div>
          </div>
          {profile?.githubUsername && (
            <div className="flex items-center gap-2.5 text-text-secondary">
              <Github className="h-4 w-4 text-text-muted shrink-0" />
              <div>
                <p className="text-xs text-text-muted">GitHub</p>
                <p>{profile.githubUsername}</p>
              </div>
            </div>
          )}
          <div className="flex items-center gap-2.5 text-text-secondary">
            <Terminal className="h-4 w-4 text-text-muted shrink-0" />
            <div>
              <p className="text-xs text-text-muted">CLI</p>
              <p>{profile?.cliInstalled ? <span className="text-emerald-400">Installed</span> : <span className="text-text-muted">Not installed</span>}</p>
            </div>
          </div>
          {profile?.joinedAt && (
            <div className="flex items-center gap-2.5 text-text-secondary">
              <Calendar className="h-4 w-4 text-text-muted shrink-0" />
              <div>
                <p className="text-xs text-text-muted">Joined</p>
                <p>{new Date(profile.joinedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
              </div>
            </div>
          )}
          {profile && (
            <div className="flex items-center gap-2.5 text-text-secondary">
              <Users className="h-4 w-4 text-text-muted shrink-0" />
              <div>
                <p className="text-xs text-text-muted">AI Sessions</p>
                <p>{profile.totalSessions} sessions &middot; ${profile.totalCost.toFixed(2)}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Edit Name */}
      <div className="rounded-xl border border-border-primary bg-bg-card p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-text-muted mb-4">Edit Name</h2>

        <form onSubmit={handleUpdateName} className="space-y-4">
          {nameMessage && (
            <div className={`flex items-center gap-2 rounded-lg px-4 py-3 text-sm ${
              nameMessage.type === 'success'
                ? 'bg-emerald-900/20 border border-emerald-800/50 text-emerald-300'
                : 'bg-red-900/20 border border-red-800/50 text-red-300'
            }`}>
              {nameMessage.type === 'success' ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
              {nameMessage.text}
            </div>
          )}

          <div>
            <label htmlFor="name" className="block text-xs font-medium text-text-secondary mb-1.5">
              Display name
            </label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                required
                className={inputClasses}
              />
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={nameSaving || name.trim() === user.name}
              className="flex items-center gap-2 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2 text-sm font-medium text-white transition-colors"
            >
              {nameSaving ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {nameSaving ? 'Saving...' : 'Save name'}
            </button>
          </div>
        </form>
      </div>

      {/* Change Password */}
      <div className="rounded-xl border border-border-primary bg-bg-card p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-text-muted mb-4">Change Password</h2>

        <form onSubmit={handleChangePassword} className="space-y-4">
          {passwordMessage && (
            <div className={`flex items-center gap-2 rounded-lg px-4 py-3 text-sm ${
              passwordMessage.type === 'success'
                ? 'bg-emerald-900/20 border border-emerald-800/50 text-emerald-300'
                : 'bg-red-900/20 border border-red-800/50 text-red-300'
            }`}>
              {passwordMessage.type === 'success' ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
              {passwordMessage.text}
            </div>
          )}

          <div>
            <label htmlFor="currentPassword" className="block text-xs font-medium text-text-secondary mb-1.5">
              Current password
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
              <input
                id="currentPassword"
                type={showCurrentPassword ? 'text' : 'password'}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Enter current password"
                required
                className={`${inputClasses} pr-10`}
              />
              <button
                type="button"
                onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary transition-colors"
                tabIndex={-1}
              >
                {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div>
            <label htmlFor="newPassword" className="block text-xs font-medium text-text-secondary mb-1.5">
              New password
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
              <input
                id="newPassword"
                type={showNewPassword ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 6 characters"
                required
                minLength={6}
                className={`${inputClasses} pr-10`}
              />
              <button
                type="button"
                onClick={() => setShowNewPassword(!showNewPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary transition-colors"
                tabIndex={-1}
              >
                {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div>
            <label htmlFor="confirmNewPassword" className="block text-xs font-medium text-text-secondary mb-1.5">
              Confirm new password
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
              <input
                id="confirmNewPassword"
                type={showNewPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter new password"
                required
                minLength={6}
                className={inputClasses}
              />
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={passwordSaving || !currentPassword || !newPassword || !confirmPassword}
              className="flex items-center gap-2 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2 text-sm font-medium text-white transition-colors"
            >
              {passwordSaving ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              ) : (
                <Lock className="h-4 w-4" />
              )}
              {passwordSaving ? 'Updating...' : 'Change password'}
            </button>
          </div>
        </form>
      </div>

      {/* Account Details (read-only) */}
      <div className="rounded-xl border border-border-primary bg-bg-card p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-text-muted mb-4">Account Details</h2>
        <div className="space-y-3 text-sm">
          <div className="flex items-center justify-between py-2 border-b border-border-primary">
            <span className="text-text-muted">Email</span>
            <span className="text-text-primary font-mono">{user.email}</span>
          </div>
          <div className="flex items-center justify-between py-2 border-b border-border-primary">
            <span className="text-text-muted">User ID</span>
            <span className="text-text-muted font-mono text-xs">{supabaseUser?.id?.slice(0, 16)}...</span>
          </div>
          <div className="flex items-center justify-between py-2 border-b border-border-primary">
            <span className="text-text-muted">Team Code</span>
            <span className="text-text-primary font-mono">{user.teamCode}</span>
          </div>
          <div className="flex items-center justify-between py-2">
            <span className="text-text-muted">Member ID</span>
            <span className="text-text-muted font-mono text-xs">{user.memberId.slice(0, 16)}...</span>
          </div>
        </div>
      </div>
    </div>
  );
}
