'use client';

import { useState, useEffect } from 'react';
import { DollarSign, Zap, Activity, Database } from 'lucide-react';
import {
  BarChart,
  Bar,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
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

interface CostsData {
  totalSpend: number;
  totalTokens: number;
  avgCostPerSession: number;
  cacheHitRate: number;
  totalSessions: number;
  costByTeam: { teamId: string; teamName: string; cost: number; sessions: number }[];
  costByModel: { model: string; cost: number; sessions: number }[];
  costByDeveloper: { developerId: string; name: string; cost: number; sessions: number; tokens: number }[];
  dailyTrend: { date: string; cost: number; sessions: number }[];
}

const MODEL_COLORS = ['#8b5cf6', '#3b82f6', '#22c55e', '#f97316', '#06b6d4', '#ec4899', '#eab308'];

function formatTokens(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function AdminCostsPage() {
  const { teamId } = useAdminTeamFilter();
  const [period, setPeriod] = useState<AdminPeriod>('month');
  const [data, setData] = useState<CostsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const params = new URLSearchParams({ period });
        if (teamId) params.set('teamId', teamId);
        const res = await fetch(`/api/admin/costs?${params.toString()}`);
        if (!res.ok) throw new Error('Failed to load');
        setData(await res.json());
        setError('');
      } catch {
        setError('Failed to load cost data');
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

  const devColumns: Column<CostsData['costByDeveloper'][0]>[] = [
    {
      key: 'name',
      label: 'Developer',
      render: (row) => <span className="font-medium text-text-primary">{row.name}</span>,
    },
    {
      key: 'cost',
      label: 'Cost',
      sortable: true,
      render: (row) => <span className="font-mono text-text-secondary">${row.cost.toFixed(4)}</span>,
    },
    {
      key: 'sessions',
      label: 'Sessions',
      sortable: true,
      render: (row) => <span className="text-text-secondary">{row.sessions}</span>,
    },
    {
      key: 'tokens',
      label: 'Tokens',
      sortable: true,
      render: (row) => <span className="font-mono text-text-secondary">{formatTokens(row.tokens)}</span>,
    },
  ];

  if (loading && !data) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="h-8 w-36 animate-pulse rounded bg-bg-elevated" />
            <div className="mt-2 h-4 w-56 animate-pulse rounded bg-bg-elevated" />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
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

  const totalModels = data.costByModel.reduce((sum, m) => sum + m.sessions, 0);
  const modelChartData = data.costByModel.map((m, i) => ({
    ...m,
    color: MODEL_COLORS[i % MODEL_COLORS.length],
    percent: totalModels > 0 ? (m.sessions / totalModels) * 100 : 0,
  }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text-primary">AI Costs</h1>
          <p className="mt-1 text-sm text-text-muted">Token usage and cost monitoring across all teams</p>
        </div>
        <AdminPeriodSelector value={period} onChange={setPeriod} />
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <AdminStatCard
          label="Total Spend"
          value={`$${data.totalSpend.toFixed(2)}`}
          icon={<DollarSign className="h-4 w-4" />}
          iconColor="#ef4444"
          delay={0}
        />
        <AdminStatCard
          label="Avg Cost/Session"
          value={`$${data.avgCostPerSession.toFixed(4)}`}
          icon={<Activity className="h-4 w-4" />}
          iconColor="#8b5cf6"
          delay={50}
        />
        <AdminStatCard
          label="Total Tokens"
          value={formatTokens(data.totalTokens)}
          icon={<Zap className="h-4 w-4" />}
          iconColor="#3b82f6"
          delay={100}
        />
        <AdminStatCard
          label="Cache Hit Rate"
          value={`${data.cacheHitRate.toFixed(1)}%`}
          icon={<Database className="h-4 w-4" />}
          iconColor="#22c55e"
          delay={150}
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <AdminChartCard title="Cost by Team">
          {data.costByTeam.length === 0 ? (
            <div className="flex items-center justify-center py-16 text-sm text-text-muted">No team cost data yet</div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={data.costByTeam.slice(0, 10)}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-primary)" />
                <XAxis dataKey="teamName" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
                <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} tickFormatter={(v: number) => `$${v.toFixed(2)}`} />
                <Tooltip contentStyle={chartTooltipStyle} formatter={(value: number) => [`$${value.toFixed(4)}`, 'Cost']} />
                <Bar dataKey="cost" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </AdminChartCard>

        <AdminChartCard title="Cost by Model">
          {modelChartData.length === 0 ? (
            <div className="flex items-center justify-center py-16 text-sm text-text-muted">No model data yet</div>
          ) : (
            <div className="flex items-center gap-6">
              <div className="flex-1">
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={modelChartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={85}
                      dataKey="sessions"
                      nameKey="model"
                      stroke="var(--bg-card)"
                      strokeWidth={3}
                      paddingAngle={2}
                    >
                      {modelChartData.map((entry) => (
                        <Cell key={entry.model} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={chartTooltipStyle} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="shrink-0 space-y-2.5 pr-2">
                {modelChartData.map((entry) => (
                  <div key={entry.model} className="flex items-center gap-2.5">
                    <span className="h-2.5 w-2.5 rounded-sm shrink-0" style={{ backgroundColor: entry.color }} />
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-text-primary truncate max-w-[120px]">{entry.model}</p>
                      <p className="text-[10px] text-text-muted">
                        {entry.percent.toFixed(0)}% &middot; ${entry.cost.toFixed(2)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </AdminChartCard>
      </div>

      {/* Daily Cost Trend */}
      <AdminChartCard title="Daily Cost Trend">
        {data.dailyTrend.length === 0 ? (
          <div className="flex items-center justify-center py-16 text-sm text-text-muted">No trend data yet</div>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={data.dailyTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-primary)" />
              <XAxis dataKey="date" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} tickFormatter={formatDate} />
              <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} tickFormatter={(v: number) => `$${v.toFixed(2)}`} />
              <Tooltip contentStyle={chartTooltipStyle} formatter={(value: number) => [`$${value.toFixed(4)}`, 'Cost']} />
              <Area type="monotone" dataKey="cost" stroke="#ef4444" fill="#ef4444" fillOpacity={0.15} strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </AdminChartCard>

      {/* Cost by Developer */}
      <AdminChartCard title="Cost by Developer" subtitle="Top spenders this period">
        <AdminDataTable
          columns={devColumns}
          data={data.costByDeveloper}
          keyExtractor={(row) => row.developerId}
          emptyMessage="No developer cost data yet"
        />
      </AdminChartCard>
    </div>
  );
}
