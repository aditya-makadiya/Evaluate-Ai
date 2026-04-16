'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { UsersRound, DollarSign, Activity, ChevronRight } from 'lucide-react';
import { AdminStatCard } from '@/components/admin/admin-stat-card';
import { useAdminTeamFilter } from '@/components/admin/admin-team-context';

interface TeamRow {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  memberCount: number;
  activeMembers: number;
  integrations: number;
  totalCost: number;
  totalSessions: number;
  lastActive: string;
}

export default function AdminTeamsPage() {
  const router = useRouter();
  const { teamId: globalTeamId } = useAdminTeamFilter();
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [filtered, setFiltered] = useState<TeamRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/admin/teams');
        if (!res.ok) throw new Error('Failed to load');
        const data = await res.json();
        setTeams(data.teams);
        setFiltered(data.teams);
      } catch {
        setError('Failed to load teams data');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const displayTeams = globalTeamId
    ? filtered.filter((t) => t.id === globalTeamId)
    : filtered;

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    if (!query) {
      setFiltered(teams);
      return;
    }
    const q = query.toLowerCase();
    setFiltered(teams.filter((t) => t.name.toLowerCase().includes(q) || t.slug.toLowerCase().includes(q)));
  };

  const totalMembers = displayTeams.reduce((s, t) => s + t.memberCount, 0);
  const totalSpend = displayTeams.reduce((s, t) => s + t.totalCost, 0);
  const totalSessions = displayTeams.reduce((s, t) => s + t.totalSessions, 0);

  if (loading) {
    return (
      <div className="space-y-6">
        <div><div className="h-8 w-32 animate-pulse rounded bg-bg-elevated" /></div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-xl border border-border-primary bg-bg-card" />
          ))}
        </div>
        <div className="h-96 animate-pulse rounded-xl border border-border-primary bg-bg-card" />
      </div>
    );
  }

  if (error) {
    return <div className="bg-red-900/20 border border-red-800/50 rounded-lg p-5 text-red-300 text-sm">{error}</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-text-primary">Teams</h1>
        <p className="mt-1 text-sm text-text-muted">
          {globalTeamId ? 'Filtered team view' : `All teams on the platform (${teams.length} total)`}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <AdminStatCard label="Teams" value={String(displayTeams.length)} icon={<UsersRound className="h-4 w-4" />} iconColor="#8b5cf6" />
        <AdminStatCard label="Total Members" value={String(totalMembers)} icon={<UsersRound className="h-4 w-4" />} iconColor="#3b82f6" delay={50} />
        <AdminStatCard label="Total Spend" value={`$${totalSpend.toFixed(2)}`} icon={<DollarSign className="h-4 w-4" />} iconColor="#ef4444" delay={100} />
        <AdminStatCard label="Total Sessions" value={String(totalSessions)} icon={<Activity className="h-4 w-4" />} iconColor="#22c55e" delay={150} />
      </div>

      <div className="rounded-xl border border-border-primary bg-bg-card overflow-hidden">
        <div className="border-b border-border-primary px-4 py-3">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Search teams by name or slug..."
            className="w-full rounded-lg border border-border-primary bg-bg-primary py-2 pl-3 pr-3 text-xs text-text-primary placeholder:text-text-muted focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500/30"
          />
        </div>

        <div className="grid grid-cols-[1fr_80px_80px_100px_80px_100px_24px] gap-2 px-5 py-2.5 border-b border-border-primary text-xs font-medium uppercase tracking-wider text-text-muted">
          <span>Team</span><span>Members</span><span>Integr.</span><span>AI Spend</span><span>Sessions</span><span>Last Active</span><span />
        </div>

        <div className="divide-y divide-border-primary">
          {displayTeams.length === 0 ? (
            <div className="px-5 py-12 text-center text-sm text-text-muted">No teams found</div>
          ) : (
            displayTeams.map((team) => (
              <div
                key={team.id}
                className="grid grid-cols-[1fr_80px_80px_100px_80px_100px_24px] gap-2 items-center px-5 py-3 cursor-pointer hover:bg-white/[0.02] transition-colors group"
                onClick={() => router.push(`/admin/teams/${team.id}`)}
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-text-primary truncate group-hover:text-purple-400 transition-colors">{team.name}</p>
                  <p className="text-xs text-text-muted">{team.slug}</p>
                </div>
                <span className="text-sm text-text-secondary">{team.activeMembers}/{team.memberCount}</span>
                <span className="text-sm text-text-secondary">{team.integrations}</span>
                <span className="text-sm font-mono text-text-secondary">${team.totalCost.toFixed(2)}</span>
                <span className="text-sm text-text-secondary">{team.totalSessions}</span>
                <span className="text-xs text-text-muted">
                  {team.lastActive ? new Date(team.lastActive).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Never'}
                </span>
                <ChevronRight className="h-4 w-4 text-text-muted group-hover:text-text-primary transition-colors" />
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
