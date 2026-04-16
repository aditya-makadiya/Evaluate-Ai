'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/components/auth-provider';
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import {
  DollarSign,
  Gauge,
  Hash,
  RotateCcw,
  Lightbulb,
  ArrowDown,
  Activity,
} from 'lucide-react';

// --------------- Types ---------------

interface StatsResponse {
  period: string;
  thisMonth: { sessions: number; cost: number; efficiency: number | null; avgScore: number | null };
  costTrend: Array<{ date: string; cost: number }>;
  scoreTrend: Array<{ date: string; score: number }>;
  modelUsage: Array<{ model: string; count: number; cost: number }>;
  topAntiPatterns: Array<{ pattern: string; count: number }>;
  intentDistribution: Array<{ intent: string; count: number }>;
  tokenWaste: {
    retryTurns: number;
    totalTurns: number;
    retryRate: number;
    estimatedWastedTokens: number;
  };
  modelOptimization: Array<{
    model: string;
    intent: string;
    sessions: number;
    currentCost: number;
    recommendedModel: string;
    potentialCost: number;
    savings: number;
  }>;
}

type Period = 'today' | 'week' | 'month' | 'quarter';

// --------------- Constants ---------------

const PIE_COLORS = ['#8b5cf6', '#3b82f6', '#06b6d4', '#22c55e', '#f59e0b', '#ec4899', '#f97316', '#6366f1'];

const CHART_TOOLTIP_STYLE = {
  backgroundColor: 'var(--bg-card)',
  border: '1px solid var(--border-primary)',
  borderRadius: 8,
  color: 'var(--text-primary)',
  fontSize: 12,
};

// --------------- Helpers ---------------

function formatCost(usd: number): string {
  return `$${usd.toFixed(2)}`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatModelName(model: string): string {
  return model
    .replace('claude-', '')
    .replace(/-20\d{6}/, '')
    .replace(/\[\d+[km]?\]$/i, '');
}

function buildScoreDistribution(scoreTrend: Array<{ score: number }>): Array<{ bucket: string; count: number }> {
  const buckets: Record<string, number> = { '0-20': 0, '20-40': 0, '40-60': 0, '60-80': 0, '80-100': 0 };
  for (const { score } of scoreTrend) {
    if (score < 20) buckets['0-20']++;
    else if (score < 40) buckets['20-40']++;
    else if (score < 60) buckets['40-60']++;
    else if (score < 80) buckets['60-80']++;
    else buckets['80-100']++;
  }
  return Object.entries(buckets).map(([bucket, count]) => ({ bucket, count }));
}

function StatCard({ label, value, icon, accent }: { label: string; value: string; icon: React.ReactNode; accent: string }) {
  return (
    <div className="bg-bg-card border border-border-primary rounded-lg p-5 hover:border-border-hover transition-all">
      <div className="flex items-center justify-between mb-3">
        <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${accent}15` }}>
          {icon}
        </div>
      </div>
      <p className="text-2xl font-bold text-text-primary mb-1">{value}</p>
      <p className="text-xs text-text-muted font-medium uppercase tracking-wider">{label}</p>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-bg-card border border-border-primary rounded-lg p-5 hover:border-border-hover transition-colors">
      <h3 className="text-sm font-semibold text-text-secondary mb-4 uppercase tracking-wider">{title}</h3>
      {children}
    </div>
  );
}

function ChartSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="h-4 bg-bg-elevated rounded w-32 mb-4" />
      <div className="h-[280px] bg-bg-primary rounded-lg" />
    </div>
  );
}

// --------------- Main ---------------

export default function AnalyticsPage() {
  const { user: authUser } = useAuth();
  const [data, setData] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<Period>('month');

  const fetchStats = useCallback(() => {
    if (!authUser) return;
    setLoading(true);
    fetch(`/api/stats?period=${period}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((raw) => {
        setData({
          period: raw.period ?? period,
          thisMonth: raw.thisMonth ?? { sessions: 0, cost: 0, efficiency: null, avgScore: null },
          costTrend: raw.costTrend ?? [],
          scoreTrend: raw.scoreTrend ?? [],
          modelUsage: raw.modelUsage ?? [],
          topAntiPatterns: raw.topAntiPatterns ?? [],
          intentDistribution: raw.intentDistribution ?? [],
          tokenWaste: raw.tokenWaste ?? { retryTurns: 0, totalTurns: 0, retryRate: 0, estimatedWastedTokens: 0 },
          modelOptimization: raw.modelOptimization ?? [],
        });
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [authUser, period]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  if (loading) {
    return (
      <div className="min-h-screen bg-bg-primary p-6 lg:p-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <div className="animate-pulse">
              <div className="h-8 bg-bg-elevated rounded w-36 mb-2" />
              <div className="h-4 bg-bg-elevated rounded w-56" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-8">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="bg-bg-card border border-border-primary rounded-lg p-5 animate-pulse">
                <div className="w-10 h-10 bg-bg-elevated rounded-lg mb-3" />
                <div className="h-6 bg-bg-elevated rounded w-24 mb-2" />
                <div className="h-3 bg-bg-elevated rounded w-32" />
              </div>
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="bg-bg-card border border-border-primary rounded-lg p-5">
                <ChartSkeleton />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-bg-primary p-6 lg:p-8">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-2xl font-bold text-text-primary mb-4">Analytics</h1>
          <div className="bg-red-900/20 border border-red-800/50 rounded-lg p-5 text-red-300 text-sm">
            Failed to load analytics: {error ?? 'Unknown error'}
          </div>
        </div>
      </div>
    );
  }

  const { thisMonth, costTrend, scoreTrend, modelUsage, tokenWaste, modelOptimization } = data;
  const scoreDistribution = buildScoreDistribution(scoreTrend);
  const costByDay = costTrend.map(d => ({ ...d, date: d.date?.slice(5) ?? '' }));
  const totalSavings = modelOptimization.reduce((s, m) => s + m.savings, 0);

  return (
    <div className="min-h-screen bg-bg-primary p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold text-text-primary tracking-tight">Analytics</h1>
            <p className="text-sm text-text-muted mt-1">Track your AI usage patterns and efficiency</p>
          </div>

          <div className="flex items-center bg-bg-secondary border border-border-primary rounded-lg p-1">
            {(['today', 'week', 'month', 'quarter'] as Period[]).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-all capitalize ${
                  period === p
                    ? 'bg-purple-600 text-white shadow-sm shadow-purple-900/30'
                    : 'text-text-muted hover:text-text-secondary'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        {/* Summary stat cards */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-8">
          <StatCard
            label="Total Cost"
            value={formatCost(thisMonth.cost)}
            icon={<DollarSign className="w-5 h-5 text-emerald-400" />}
            accent="#22c55e"
          />
          <StatCard
            label="Avg Score"
            value={thisMonth.avgScore != null ? `${Math.round(thisMonth.avgScore)}/100` : '--'}
            icon={<Gauge className="w-5 h-5 text-blue-400" />}
            accent="#3b82f6"
          />
          <StatCard
            label="Total Sessions"
            value={String(thisMonth.sessions)}
            icon={<Hash className="w-5 h-5 text-purple-400" />}
            accent="#8b5cf6"
          />
          <StatCard
            label="Retry Rate"
            value={`${tokenWaste.retryRate}%`}
            icon={<RotateCcw className={`w-5 h-5 ${tokenWaste.retryRate <= 5 ? 'text-emerald-400' : tokenWaste.retryRate <= 15 ? 'text-yellow-400' : 'text-red-400'}`} />}
            accent={tokenWaste.retryRate <= 5 ? '#22c55e' : tokenWaste.retryRate <= 15 ? '#eab308' : '#ef4444'}
          />
        </div>

        {/* Model Optimization Banner — only show when there are savings */}
        {modelOptimization.length > 0 && totalSavings > 0.05 && (
          <div className="mb-8 bg-bg-card border border-purple-800/50 rounded-lg p-5">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-purple-900/30 flex items-center justify-center shrink-0">
                <Lightbulb className="w-5 h-5 text-purple-400" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-text-primary">Model Optimization Opportunities</h3>
                  <span className="text-sm font-mono font-bold text-emerald-400">
                    Save {formatCost(totalSavings)}/{period === 'today' ? 'day' : period === 'quarter' ? 'quarter' : period}
                  </span>
                </div>
                <div className="space-y-2">
                  {modelOptimization.slice(0, 5).map((opt, i) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <span className="text-text-secondary">
                          {opt.sessions} {opt.intent} session{opt.sessions !== 1 ? 's' : ''} on
                        </span>
                        <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-bg-elevated text-text-muted">
                          {formatModelName(opt.model)}
                        </span>
                        <ArrowDown className="w-3 h-3 text-text-muted" />
                        <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-emerald-900/20 text-emerald-400">
                          {formatModelName(opt.recommendedModel)}
                        </span>
                      </div>
                      <span className="text-xs font-mono text-emerald-400">
                        -{formatCost(opt.savings)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Row 1: Cost by Day + Score Distribution */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
          <ChartCard title="Cost by Day">
            {costByDay.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Activity className="w-8 h-8 text-text-muted mb-2" />
                <p className="text-sm text-text-muted">No cost data for this period</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={costByDay}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--bg-elevated)" />
                  <XAxis dataKey="date" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} tickFormatter={(v: string) => v.slice(3)} />
                  <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
                  <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(value: number) => [formatCost(value), 'Cost']} />
                  <Bar dataKey="cost" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          <ChartCard title="Score Distribution">
            {scoreTrend.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Activity className="w-8 h-8 text-text-muted mb-2" />
                <p className="text-sm text-text-muted">No score data for this period</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={scoreDistribution}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--bg-elevated)" />
                  <XAxis dataKey="bucket" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
                  <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
                  <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(value: number) => [value, 'Sessions']} />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {scoreDistribution.map((_, i) => {
                      const colors = ['#ef4444', '#f59e0b', '#eab308', '#3b82f6', '#22c55e'];
                      return <Cell key={i} fill={colors[i] ?? '#8b5cf6'} />;
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>
        </div>

        {/* Row 2: Model Usage */}
        <div className="grid grid-cols-1 gap-4 mb-4">
          <ChartCard title="Model Usage">
            {modelUsage.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Activity className="w-8 h-8 text-text-muted mb-2" />
                <p className="text-sm text-text-muted">No model data</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={modelUsage}
                    dataKey="count"
                    nameKey="model"
                    cx="50%"
                    cy="50%"
                    outerRadius={95}
                    innerRadius={0}
                    label={({ model, percent }: { model: string; percent: number }) =>
                      `${formatModelName(model)} ${(percent * 100).toFixed(0)}%`
                    }
                    labelLine={{ stroke: 'var(--border-hover)' }}
                  >
                    {modelUsage.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(value: number) => [value, 'Sessions']} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </ChartCard>
        </div>

        {/* Row 3: Token Waste Summary */}
        {tokenWaste.totalTurns > 0 && (
          <div className="bg-bg-card border border-border-primary rounded-lg p-5">
            <h3 className="text-sm font-semibold text-text-secondary mb-3 uppercase tracking-wider">Token Waste</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-text-muted">Retry turns</span>
                <span className={`text-sm font-mono font-semibold ${tokenWaste.retryRate <= 5 ? 'text-emerald-400' : tokenWaste.retryRate <= 15 ? 'text-yellow-400' : 'text-red-400'}`}>
                  {tokenWaste.retryTurns}/{tokenWaste.totalTurns}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-text-muted">Retry rate</span>
                <span className={`text-sm font-mono font-semibold ${tokenWaste.retryRate <= 5 ? 'text-emerald-400' : tokenWaste.retryRate <= 15 ? 'text-yellow-400' : 'text-red-400'}`}>
                  {tokenWaste.retryRate}%
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-text-muted">Wasted tokens (est.)</span>
                <span className="text-sm font-mono text-text-secondary">
                  {formatTokens(tokenWaste.estimatedWastedTokens)}
                </span>
              </div>
              {/* Visual bar */}
              <div className="pt-2">
                <div className="h-3 bg-bg-elevated rounded-full overflow-hidden flex">
                  <div
                    className="h-full bg-emerald-500 rounded-l-full transition-all"
                    style={{ width: `${100 - tokenWaste.retryRate}%` }}
                  />
                  <div
                    className="h-full bg-red-500 rounded-r-full transition-all"
                    style={{ width: `${tokenWaste.retryRate}%` }}
                  />
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-[10px] text-emerald-400">Useful</span>
                  <span className="text-[10px] text-red-400">Wasted</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
