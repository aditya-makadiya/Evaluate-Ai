'use client';

import { useState, useEffect } from 'react';
import { GitCommit, GitPullRequest, GitMerge } from 'lucide-react';
import {
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { AdminStatCard } from '@/components/admin/admin-stat-card';
import { AdminPeriodSelector, type AdminPeriod } from '@/components/admin/admin-period-selector';
import { AdminChartCard } from '@/components/admin/admin-chart-card';
import { AdminDataTable, type Column } from '@/components/admin/admin-data-table';
import { useAdminTeamFilter } from '@/components/admin/admin-team-context';

interface GitHubData {
  commits: number;
  prsOpened: number;
  prsMerged: number;
  topRepos: { repo: string; count: number }[];
  developerActivity: { developerId: string; name: string; commits: number; prs: number; total: number }[];
  dailyTrend: { date: string; commits: number; prs: number }[];
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function AdminGitHubPage() {
  const { teamId } = useAdminTeamFilter();
  const [period, setPeriod] = useState<AdminPeriod>('month');
  const [data, setData] = useState<GitHubData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const params = new URLSearchParams({ period });
        if (teamId) params.set('teamId', teamId);
        const res = await fetch(`/api/admin/github?${params.toString()}`);
        if (!res.ok) throw new Error('Failed to load');
        setData(await res.json());
        setError('');
      } catch {
        setError('Failed to load GitHub data');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [period, teamId]);

  const chartTooltipStyle = {
    backgroundColor: 'var(--bg-card)',
    border: '1px solid var(--border-primary)',
    borderRadius: 8,
    color: 'var(--text-primary)',
    fontSize: 12,
  };

  const devColumns: Column<GitHubData['developerActivity'][0]>[] = [
    {
      key: 'name',
      label: 'Developer',
      render: (row) => <span className="font-medium text-text-primary">{row.name}</span>,
    },
    {
      key: 'commits',
      label: 'Commits',
      sortable: true,
      render: (row) => <span className="text-text-secondary">{row.commits}</span>,
    },
    {
      key: 'prs',
      label: 'PRs',
      sortable: true,
      render: (row) => <span className="text-text-secondary">{row.prs}</span>,
    },
    {
      key: 'total',
      label: 'Total',
      sortable: true,
      render: (row) => <span className="font-medium text-text-primary">{row.total}</span>,
    },
  ];

  if (loading && !data) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="h-8 w-48 animate-pulse rounded bg-bg-elevated" />
            <div className="mt-2 h-4 w-64 animate-pulse rounded bg-bg-elevated" />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-xl border border-border-primary bg-bg-card" />
          ))}
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="bg-red-900/20 border border-red-800/50 rounded-lg p-5 text-red-300 text-sm">
        {error}
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text-primary">GitHub Activity</h1>
          <p className="mt-1 text-sm text-text-muted">Cross-team code activity and contributions</p>
        </div>
        <AdminPeriodSelector value={period} onChange={setPeriod} />
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <AdminStatCard
          label="Commits"
          value={String(data.commits)}
          icon={<GitCommit className="h-4 w-4" />}
          iconColor="#8b5cf6"
          delay={0}
        />
        <AdminStatCard
          label="PRs Opened"
          value={String(data.prsOpened)}
          icon={<GitPullRequest className="h-4 w-4" />}
          iconColor="#3b82f6"
          delay={50}
        />
        <AdminStatCard
          label="PRs Merged"
          value={String(data.prsMerged)}
          icon={<GitMerge className="h-4 w-4" />}
          iconColor="#22c55e"
          delay={100}
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <AdminChartCard title="Top Repositories" subtitle="By activity count">
          {data.topRepos.length === 0 ? (
            <div className="flex items-center justify-center py-16 text-sm text-text-muted">No repo data yet</div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={data.topRepos} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-primary)" />
                <XAxis type="number" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
                <YAxis type="category" dataKey="repo" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} width={140} />
                <Tooltip contentStyle={chartTooltipStyle} />
                <Bar dataKey="count" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </AdminChartCard>

        <AdminChartCard title="Activity Trend">
          {data.dailyTrend.length === 0 ? (
            <div className="flex items-center justify-center py-16 text-sm text-text-muted">No activity data yet</div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={data.dailyTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-primary)" />
                <XAxis dataKey="date" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} tickFormatter={formatDate} />
                <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
                <Tooltip contentStyle={chartTooltipStyle} />
                <Area type="monotone" dataKey="commits" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.15} stackId="1" />
                <Area type="monotone" dataKey="prs" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.15} stackId="1" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </AdminChartCard>
      </div>

      {/* Developer Leaderboard */}
      <AdminChartCard title="Developer Leaderboard" subtitle="Top contributors this period">
        <AdminDataTable
          columns={devColumns}
          data={data.developerActivity}
          keyExtractor={(row) => row.developerId}
          emptyMessage="No developer activity yet"
        />
      </AdminChartCard>
    </div>
  );
}
