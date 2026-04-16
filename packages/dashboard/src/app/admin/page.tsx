'use client';

import { useState, useEffect } from 'react';
import {
  UsersRound,
  Users,
  Activity,
  GitBranch,
  DollarSign,
  Zap,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { AdminStatCard } from '@/components/admin/admin-stat-card';
import { AdminChartCard } from '@/components/admin/admin-chart-card';
import { useAdminTeamFilter } from '@/components/admin/admin-team-context';

interface RecentSession {
  id: string;
  developerName: string;
  model: string;
  cost: number;
  turns: number;
  score: number | null;
  workSummary: string | null;
  workCategory: string | null;
  startedAt: string;
  endedAt: string | null;
}

interface OverviewData {
  totalTeams: number;
  totalUsers: number;
  activeUsersToday: number;
  connectedRepos: number;
  sessionsToday: number;
  monthlySpend: number;
  dailyTrend: { date: string; sessions: number; cost: number }[];
  modelBreakdown: { model: string; count: number; cost: number }[];
  recentSessions: RecentSession[];
  recentTeams: { id: string; name: string; slug: string; created_at: string; memberCount: number }[];
}

const MODEL_COLORS = ['#8b5cf6', '#3b82f6', '#22c55e', '#f97316', '#06b6d4', '#ec4899', '#eab308'];

const CATEGORY_STYLES: Record<string, string> = {
  feature: 'text-green-400 bg-green-900/30',
  debug: 'text-red-400 bg-red-900/30',
  refactor: 'text-blue-400 bg-blue-900/30',
  research: 'text-purple-400 bg-purple-900/30',
  review: 'text-yellow-400 bg-yellow-900/30',
  config: 'text-orange-400 bg-orange-900/30',
  general: 'text-text-muted bg-bg-elevated',
};

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function scoreColor(score: number | null): string {
  if (score == null) return 'text-text-muted';
  if (score >= 80) return 'text-emerald-400';
  if (score >= 60) return 'text-blue-400';
  if (score >= 40) return 'text-yellow-400';
  return 'text-red-400';
}

export default function AdminOverviewPage() {
  const { teamId } = useAdminTeamFilter();
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const params = teamId ? `?teamId=${teamId}` : '';
        const res = await fetch(`/api/admin/overview${params}`);
        if (!res.ok) throw new Error('Failed to load');
        setData(await res.json());
        setError('');
      } catch {
        setError('Failed to load overview data');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [teamId]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <div className="h-8 w-48 animate-pulse rounded bg-bg-elevated" />
          <div className="mt-2 h-4 w-72 animate-pulse rounded bg-bg-elevated" />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-xl border border-border-primary bg-bg-card" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-900/20 border border-red-800/50 rounded-lg p-5 text-red-300 text-sm">
        {error}
      </div>
    );
  }

  if (!data) return null;

  const chartTooltipStyle = {
    backgroundColor: 'var(--bg-card)',
    border: '1px solid var(--border-primary)',
    borderRadius: 8,
    color: 'var(--text-primary)',
    fontSize: 12,
  };

  const totalModelSessions = data.modelBreakdown.reduce((s, m) => s + m.count, 0);
  const modelChartData = data.modelBreakdown.map((m, i) => ({
    ...m,
    color: MODEL_COLORS[i % MODEL_COLORS.length],
    percent: totalModelSessions > 0 ? (m.count / totalModelSessions) * 100 : 0,
  }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-text-primary">Platform Overview</h1>
        <p className="mt-1 text-sm text-text-muted">
          {teamId ? 'Team-filtered metrics' : 'Cross-team metrics and platform health at a glance'}
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <AdminStatCard label="Teams" value={String(data.totalTeams)} icon={<UsersRound className="h-4 w-4" />} iconColor="#8b5cf6" delay={0} />
        <AdminStatCard label="Total Users" value={String(data.totalUsers)} icon={<Users className="h-4 w-4" />} iconColor="#3b82f6" delay={50} />
        <AdminStatCard label="Active Today" value={String(data.activeUsersToday)} icon={<Activity className="h-4 w-4" />} iconColor="#22c55e" delay={100} />
        <AdminStatCard label="GitHub Repos" value={String(data.connectedRepos)} icon={<GitBranch className="h-4 w-4" />} iconColor="#f97316" delay={150} />
        <AdminStatCard label="Monthly Spend" value={`$${data.monthlySpend.toFixed(2)}`} icon={<DollarSign className="h-4 w-4" />} iconColor="#ef4444" delay={200} />
        <AdminStatCard label="Sessions Today" value={String(data.sessionsToday)} icon={<Zap className="h-4 w-4" />} iconColor="#06b6d4" delay={250} />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <AdminChartCard title="Daily Sessions" subtitle="Last 30 days">
          {data.dailyTrend.length === 0 ? (
            <div className="flex items-center justify-center py-16 text-sm text-text-muted">No session data yet</div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={data.dailyTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-primary)" />
                <XAxis dataKey="date" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} tickFormatter={formatDate} />
                <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
                <Tooltip contentStyle={chartTooltipStyle} />
                <Area type="monotone" dataKey="sessions" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.15} strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </AdminChartCard>

        <AdminChartCard title="Daily Cost" subtitle="Last 30 days">
          {data.dailyTrend.length === 0 ? (
            <div className="flex items-center justify-center py-16 text-sm text-text-muted">No cost data yet</div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={data.dailyTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-primary)" />
                <XAxis dataKey="date" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} tickFormatter={formatDate} />
                <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} tickFormatter={(v: number) => `$${v.toFixed(2)}`} />
                <Tooltip contentStyle={chartTooltipStyle} formatter={(value: number) => [`$${value.toFixed(4)}`, 'Cost']} />
                <Line type="monotone" dataKey="cost" stroke="#ef4444" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </AdminChartCard>
      </div>

      {/* Model Breakdown + Recent Sessions */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Model Usage */}
        <AdminChartCard title="Model Usage" subtitle="Last 30 days">
          {modelChartData.length === 0 ? (
            <div className="flex items-center justify-center py-16 text-sm text-text-muted">No model data yet</div>
          ) : (
            <div className="flex items-center gap-6">
              <div className="flex-1">
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={modelChartData} cx="50%" cy="50%" innerRadius={50} outerRadius={78} dataKey="count" nameKey="model" stroke="var(--bg-card)" strokeWidth={3} paddingAngle={2}>
                      {modelChartData.map((entry) => (
                        <Cell key={entry.model} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={chartTooltipStyle} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="shrink-0 space-y-2 pr-2">
                {modelChartData.map((entry) => (
                  <div key={entry.model} className="flex items-center gap-2.5">
                    <span className="h-2.5 w-2.5 rounded-sm shrink-0" style={{ backgroundColor: entry.color }} />
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-text-primary truncate max-w-[120px]">{entry.model}</p>
                      <p className="text-[10px] text-text-muted">{entry.percent.toFixed(0)}% &middot; ${entry.cost.toFixed(2)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </AdminChartCard>

        {/* Recent Sessions */}
        <AdminChartCard title="Recent Sessions" subtitle="Latest 10 sessions">
          {data.recentSessions.length === 0 ? (
            <div className="flex items-center justify-center py-16 text-sm text-text-muted">No sessions yet</div>
          ) : (
            <div className="divide-y divide-border-primary max-h-[260px] overflow-y-auto">
              {data.recentSessions.map((session) => (
                <div key={session.id} className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0">
                  <div className="flex-1 min-w-0 mr-3">
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-medium text-text-primary truncate">
                        {session.workSummary || `${session.model} session`}
                      </p>
                      {session.workCategory && (
                        <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-medium shrink-0 ${CATEGORY_STYLES[session.workCategory] ?? CATEGORY_STYLES.general}`}>
                          {session.workCategory}
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-text-muted mt-0.5">
                      {session.developerName} &middot; {session.model}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 text-xs">
                    <span className={`font-bold ${scoreColor(session.score)}`}>
                      {session.score != null ? Math.round(session.score) : '--'}
                    </span>
                    <span className="font-mono text-text-muted">${session.cost.toFixed(4)}</span>
                    <span className="text-text-muted">{session.turns}t</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </AdminChartCard>
      </div>

      {/* Recent Teams (only when not filtering by team) */}
      {!teamId && data.recentTeams.length > 0 && (
        <AdminChartCard title="Recent Teams" subtitle="Newest teams on the platform">
          <div className="divide-y divide-border-primary">
            {data.recentTeams.map((team) => (
              <div key={team.id} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                <div>
                  <p className="text-sm font-medium text-text-primary">{team.name}</p>
                  <p className="text-xs text-text-muted">{team.slug}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-text-secondary">{team.memberCount} members</p>
                  <p className="text-xs text-text-muted">
                    {new Date(team.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </AdminChartCard>
      )}
    </div>
  );
}
