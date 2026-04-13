'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Users,
  Copy,
  Check,
  RefreshCw,
  MoreVertical,
  Shield,
  UserMinus,
  Terminal,
  Hash,
} from 'lucide-react';
import { useAuth, useCanAccess } from '@/components/auth-provider';

interface Member {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: string;
  githubUsername: string | null;
  evaluateaiInstalled: boolean;
  createdAt: string;
}

export default function TeamPage() {
  const { user: authUser } = useAuth();
  const canManage = useCanAccess('owner', 'manager');
  const isOwner = useCanAccess('owner');

  const [members, setMembers] = useState<Member[]>([]);
  const [teamCode, setTeamCode] = useState('');
  const [loading, setLoading] = useState(true);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedInstall, setCopiedInstall] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchTeamData = useCallback(async () => {
    if (!authUser) return;
    setLoading(true);
    try {
      const [membersRes, teamsRes] = await Promise.all([
        fetch(`/api/teams/${authUser.teamId}/members`),
        fetch('/api/teams'),
      ]);

      if (membersRes.ok) {
        const data = await membersRes.json();
        const list = (data.members ?? []).map((m: Record<string, unknown>) => ({
          id: m.id,
          userId: m.user_id ?? m.userId,
          name: m.name,
          email: m.email,
          role: m.role,
          githubUsername: m.github_username ?? m.githubUsername ?? null,
          evaluateaiInstalled: m.evaluateai_installed ?? m.evaluateaiInstalled ?? false,
          createdAt: m.created_at ?? m.createdAt,
        }));
        setMembers(list);
      }

      if (teamsRes.ok) {
        const data = await teamsRes.json();
        const team = (data.teams ?? []).find((t: Record<string, unknown>) => t.id === authUser.teamId);
        if (team?.teamCode) setTeamCode(team.teamCode);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [authUser]);

  useEffect(() => {
    fetchTeamData();
  }, [fetchTeamData]);

  const copyToClipboard = (text: string, setter: (v: boolean) => void) => {
    navigator.clipboard.writeText(text).then(() => {
      setter(true);
      setTimeout(() => setter(false), 2000);
    });
  };

  const handleRegenerateCode = async () => {
    if (!authUser) return;
    setRegenerating(true);
    try {
      const res = await fetch(`/api/teams/${authUser.teamId}/regenerate-code`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setTeamCode(data.teamCode);
      }
    } catch {
      // silently fail
    } finally {
      setRegenerating(false);
    }
  };

  const handleChangeRole = async (memberId: string, newRole: string) => {
    if (!authUser) return;
    setActionLoading(memberId);
    try {
      await fetch(`/api/teams/${authUser.teamId}/members/${memberId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      });
      await fetchTeamData();
    } catch {
      // silently fail
    } finally {
      setActionLoading(null);
      setActiveMenu(null);
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    if (!authUser) return;
    setActionLoading(memberId);
    try {
      await fetch(`/api/teams/${authUser.teamId}/members/${memberId}`, {
        method: 'DELETE',
      });
      await fetchTeamData();
    } catch {
      // silently fail
    } finally {
      setActionLoading(null);
      setActiveMenu(null);
    }
  };

  const roleColors: Record<string, string> = {
    owner: 'bg-purple-900/30 text-purple-400',
    manager: 'bg-blue-900/30 text-blue-400',
    developer: 'bg-green-900/30 text-green-400',
  };

  if (!authUser) return null;

  return (
    <div className="space-y-8 animate-section">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Team Management</h1>
        <p className="text-sm text-text-secondary mt-1">
          {authUser.teamName}
        </p>
      </div>

      {/* Team Code Section */}
      <div className="bg-bg-card border border-border-primary rounded-lg p-6">
        <div className="flex items-center gap-2 mb-4">
          <Hash className="h-4 w-4 text-purple-400" />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-text-secondary">
            Team Code
          </h2>
        </div>

        <p className="text-xs text-text-muted mb-4">
          Share this code with developers so they can join your team during signup.
        </p>

        <div className="flex items-center gap-3">
          <div className="flex-1 bg-bg-secondary border border-border-primary rounded-lg px-4 py-3">
            {loading ? (
              <div className="h-7 bg-bg-elevated rounded w-32 animate-pulse" />
            ) : (
              <code className="text-xl font-mono font-bold text-purple-400 tracking-widest">
                {teamCode || 'N/A'}
              </code>
            )}
          </div>
          <button
            onClick={() => copyToClipboard(teamCode, setCopiedCode)}
            disabled={!teamCode}
            className="h-11 w-11 shrink-0 flex items-center justify-center rounded-lg border border-border-primary bg-bg-card text-text-muted hover:text-text-primary hover:bg-bg-elevated transition-colors disabled:opacity-50"
            title="Copy team code"
          >
            {copiedCode ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
          </button>
          {canManage && (
            <button
              onClick={handleRegenerateCode}
              disabled={regenerating}
              className="h-11 w-11 shrink-0 flex items-center justify-center rounded-lg border border-border-primary bg-bg-card text-text-muted hover:text-text-primary hover:bg-bg-elevated transition-colors disabled:opacity-50"
              title="Regenerate team code"
            >
              <RefreshCw className={`h-4 w-4 ${regenerating ? 'animate-spin' : ''}`} />
            </button>
          )}
        </div>
      </div>

      {/* Members Section */}
      <div className="bg-bg-card border border-border-primary rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-purple-400" />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-text-secondary">
              Members ({members.length})
            </h2>
          </div>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="flex items-center gap-3 p-3 animate-pulse">
                <div className="h-9 w-9 rounded-full bg-bg-elevated" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3.5 bg-bg-elevated rounded w-28" />
                  <div className="h-3 bg-bg-elevated rounded w-40" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="divide-y divide-border-primary">
            {members.map(member => (
              <div key={member.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                <div className="h-9 w-9 rounded-full bg-purple-600/20 border border-purple-500/30 flex items-center justify-center shrink-0">
                  <span className="text-xs font-bold text-purple-400">
                    {(member.name || '?').split(' ').map(n => n[0]).join('').slice(0, 2)}
                  </span>
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-text-primary truncate">
                    {member.name}
                  </p>
                  <p className="text-xs text-text-muted truncate">{member.email}</p>
                </div>

                <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full ${roleColors[member.role] || roleColors.developer}`}>
                  {member.role}
                </span>

                <span className={`text-[10px] px-1.5 py-0.5 rounded ${member.evaluateaiInstalled ? 'bg-green-900/30 text-green-400' : 'bg-bg-elevated text-text-muted'}`}>
                  {member.evaluateaiInstalled ? 'CLI' : 'No CLI'}
                </span>

                {/* Action menu */}
                {canManage && member.role !== 'owner' && (
                  <div className="relative">
                    <button
                      onClick={() => setActiveMenu(activeMenu === member.id ? null : member.id)}
                      disabled={actionLoading === member.id}
                      className="h-7 w-7 flex items-center justify-center rounded text-text-muted hover:text-text-primary hover:bg-bg-elevated transition-colors"
                    >
                      {actionLoading === member.id ? (
                        <div className="h-3 w-3 animate-spin rounded-full border border-purple-400/30 border-t-purple-400" />
                      ) : (
                        <MoreVertical className="h-3.5 w-3.5" />
                      )}
                    </button>

                    {activeMenu === member.id && (
                      <div className="absolute right-0 top-8 z-20 w-44 bg-bg-card border border-border-primary rounded-lg shadow-xl py-1">
                        {isOwner && member.role === 'developer' && (
                          <button
                            onClick={() => handleChangeRole(member.id, 'manager')}
                            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-text-secondary hover:bg-bg-elevated hover:text-text-primary transition-colors"
                          >
                            <Shield className="h-3.5 w-3.5" />
                            Promote to Manager
                          </button>
                        )}
                        {isOwner && member.role === 'manager' && (
                          <button
                            onClick={() => handleChangeRole(member.id, 'developer')}
                            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-text-secondary hover:bg-bg-elevated hover:text-text-primary transition-colors"
                          >
                            <Shield className="h-3.5 w-3.5" />
                            Demote to Developer
                          </button>
                        )}
                        <button
                          onClick={() => handleRemoveMember(member.id)}
                          className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-400 hover:bg-red-900/20 transition-colors"
                        >
                          <UserMinus className="h-3.5 w-3.5" />
                          Remove from Team
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* CLI Setup Section */}
      <div className="bg-bg-card border border-border-primary rounded-lg p-6">
        <div className="flex items-center gap-2 mb-4">
          <Terminal className="h-4 w-4 text-purple-400" />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-text-secondary">
            CLI Setup
          </h2>
        </div>
        <p className="text-xs text-text-muted mb-4">
          Have developers run this command to get started:
        </p>
        <div className="flex items-center gap-2 bg-bg-secondary border border-border-primary rounded-lg px-4 py-3">
          <code className="flex-1 text-sm font-mono text-purple-400">
            npm install -g evaluateai && evalai login
          </code>
          <button
            onClick={() => copyToClipboard('npm install -g evaluateai && evalai login', setCopiedInstall)}
            className="h-8 w-8 shrink-0 flex items-center justify-center rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-elevated transition-colors"
          >
            {copiedInstall ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>
    </div>
  );
}
