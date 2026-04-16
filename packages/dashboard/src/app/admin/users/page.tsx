'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Users, Check, X, ChevronRight, DollarSign, Activity } from 'lucide-react';
import { AdminStatCard } from '@/components/admin/admin-stat-card';
import { useAdminTeamFilter } from '@/components/admin/admin-team-context';

interface UserRow {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: string;
  teamId: string;
  teamName: string;
  githubUsername: string | null;
  cliInstalled: boolean;
  isActive: boolean;
  joinedAt: string;
  totalCost: number;
  totalSessions: number;
}

interface UsersData {
  users: UserRow[];
  total: number;
  teams: { id: string; name: string }[];
}

const roleColors: Record<string, string> = {
  owner: 'text-purple-400 bg-purple-900/30',
  manager: 'text-blue-400 bg-blue-900/30',
  developer: 'text-green-400 bg-green-900/30',
};

export default function AdminUsersPage() {
  const router = useRouter();
  const { teamId: globalTeamId } = useAdminTeamFilter();
  const [data, setData] = useState<UsersData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterRole, setFilterRole] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchQuery) params.set('search', searchQuery);
      if (globalTeamId) params.set('teamId', globalTeamId);
      if (filterRole) params.set('role', filterRole);

      const res = await fetch(`/api/admin/users?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to load');
      setData(await res.json());
      setError('');
    } catch {
      setError('Failed to load users data');
    } finally {
      setLoading(false);
    }
  }, [searchQuery, globalTeamId, filterRole]);

  useEffect(() => { load(); }, [load]);

  const users = data?.users ?? [];
  const activeCount = users.filter((u) => u.isActive).length;
  const cliCount = users.filter((u) => u.cliInstalled).length;
  const totalCost = users.reduce((s, u) => s + u.totalCost, 0);

  if (loading && !data) {
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

  if (error && !data) {
    return <div className="bg-red-900/20 border border-red-800/50 rounded-lg p-5 text-red-300 text-sm">{error}</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-text-primary">Users</h1>
        <p className="mt-1 text-sm text-text-muted">
          All users across the platform ({data?.total ?? 0} total)
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <AdminStatCard label="Total Users" value={String(users.length)} icon={<Users className="h-4 w-4" />} iconColor="#8b5cf6" />
        <AdminStatCard label="Active" value={String(activeCount)} icon={<Activity className="h-4 w-4" />} iconColor="#22c55e" delay={50} />
        <AdminStatCard label="CLI Installed" value={`${cliCount}/${users.length}`} icon={<Check className="h-4 w-4" />} iconColor="#3b82f6" delay={100} />
        <AdminStatCard label="Total AI Cost" value={`$${totalCost.toFixed(2)}`} icon={<DollarSign className="h-4 w-4" />} iconColor="#ef4444" delay={150} />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by name or email..."
          className="rounded-lg border border-border-primary bg-bg-card px-3 py-2 text-xs text-text-primary placeholder:text-text-muted focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500/30 w-64"
        />
        <select
          value={filterRole}
          onChange={(e) => setFilterRole(e.target.value)}
          className="rounded-lg border border-border-primary bg-bg-card px-3 py-2 text-xs text-text-primary focus:border-purple-500 focus:outline-none"
        >
          <option value="">All Roles</option>
          <option value="owner">Owner</option>
          <option value="manager">Manager</option>
          <option value="developer">Developer</option>
        </select>
      </div>

      {/* User List */}
      <div className="rounded-xl border border-border-primary bg-bg-card overflow-hidden">
        <div className="grid grid-cols-[1fr_120px_80px_100px_80px_60px_60px_24px] gap-2 px-5 py-2.5 border-b border-border-primary text-xs font-medium uppercase tracking-wider text-text-muted">
          <span>User</span><span>Team</span><span>Role</span><span>AI Cost</span><span>Sessions</span><span className="text-center">CLI</span><span className="text-center">Active</span><span />
        </div>

        <div className="divide-y divide-border-primary">
          {users.length === 0 ? (
            <div className="px-5 py-12 text-center text-sm text-text-muted">No users found</div>
          ) : (
            users.map((user) => (
              <div
                key={user.id}
                className="grid grid-cols-[1fr_120px_80px_100px_80px_60px_60px_24px] gap-2 items-center px-5 py-3 cursor-pointer hover:bg-white/[0.02] transition-colors group"
                onClick={() => router.push(`/admin/users/${user.id}`)}
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-text-primary truncate group-hover:text-purple-400 transition-colors">{user.name || 'Unnamed'}</p>
                  <p className="text-xs text-text-muted truncate">{user.email}</p>
                </div>
                <span className="text-xs text-text-secondary truncate">{user.teamName}</span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium w-fit ${roleColors[user.role] ?? 'text-text-muted bg-bg-elevated'}`}>
                  {user.role}
                </span>
                <span className="text-sm font-mono text-text-secondary">${user.totalCost.toFixed(2)}</span>
                <span className="text-sm text-text-secondary">{user.totalSessions}</span>
                <div className="text-center">
                  {user.cliInstalled ? <Check className="h-4 w-4 text-emerald-400 mx-auto" /> : <X className="h-4 w-4 text-text-muted mx-auto" />}
                </div>
                <div className="text-center">
                  <span className={`h-2 w-2 rounded-full inline-block ${user.isActive ? 'bg-emerald-400' : 'bg-text-muted'}`} />
                </div>
                <ChevronRight className="h-4 w-4 text-text-muted group-hover:text-text-primary transition-colors" />
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
