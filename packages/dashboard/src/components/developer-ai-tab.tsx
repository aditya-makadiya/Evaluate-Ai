'use client';

import Link from 'next/link';
import {
  Bot,
  DollarSign,
  Zap,
  AlertTriangle,
  TrendingUp,
  Hash,
  ArrowUpRight,
  ArrowDownRight,
  Calendar,
  Clock,
} from 'lucide-react';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  BarChart,
  Bar,
  LineChart,
  Line,
} from 'recharts';

interface Session {
  id: string;
  model: string | null;
  cost: number | null;
  score: number | null;
  turns: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  startedAt: string;
  endedAt: string | null;
  durationMin: number | null;
  firstPrompt: string | null;
}

interface ModelUsage {
  model: string;
  count: number;
  cost: number;
}

interface AntiPattern {
  pattern: string;
  count: number;
}

interface TokenStats {
  week: { input: number; output: number; turns: number };
  month: { input: number; output: number; turns: number };
}

interface DeveloperAiTabProps {
  sessions: Session[];
  modelUsage: ModelUsage[];
  antiPatterns: AntiPattern[];
  costTrend: { date: string; cost: number }[];
  tokenStats: TokenStats;
  usageByDayOfWeek: { day: string; sessions: number }[];
  scoreTrend: { date: string; score: number }[];
  stats: {
    totalAiCost: number;
    avgPromptScore: number | null;
    sessionsThisWeek: number;
  };
}

const CHART_COLORS = ['#8b5cf6', '#3b82f6', '#06b6d4', '#22c55e', '#f97316', '#ec4899'];

const chartTooltipStyle = {
  backgroundColor: 'var(--bg-card)',
  border: '1px solid var(--border-primary)',
  borderRadius: 8,
  color: 'var(--text-primary)',
  fontSize: 12,
};

const axisTickStyle = { fill: 'var(--text-muted)', fontSize: 11 };

function getScoreColor(score: number): string {
  if (score >= 80) return 'text-emerald-400';
  if (score >= 60) return 'text-blue-400';
  if (score >= 40) return 'text-yellow-400';
  return 'text-red-400';
}

function getScoreBadge(score: number): string {
  if (score >= 80) return 'bg-emerald-900/30 text-emerald-400';
  if (score >= 60) return 'bg-blue-900/30 text-blue-400';
  if (score >= 40) return 'bg-yellow-900/30 text-yellow-400';
  return 'bg-red-900/30 text-red-400';
}

function formatTokens(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export default function DeveloperAiTab({
  sessions,
  modelUsage,
  antiPatterns,
  costTrend,
  tokenStats,
  usageByDayOfWeek,
  scoreTrend,
  stats,
}: DeveloperAiTabProps) {
  const donutData = modelUsage.map(m => ({
    name: m.model,
    value: m.count,
    cost: m.cost,
  }));

  const totalWeekTokens = tokenStats.week.input + tokenStats.week.output;
  const inputPct = totalWeekTokens > 0 ? Math.round((tokenStats.week.input / totalWeekTokens) * 100) : 0;
  const outputPct = totalWeekTokens > 0 ? 100 - inputPct : 0;

  const costTrendFormatted = costTrend.map(d => ({
    ...d,
    label: formatDate(d.date),
  }));

  const scoreTrendFormatted = scoreTrend.map(d => ({
    ...d,
    label: formatDate(d.date),
  }));

  // Cost per turn calculation
  const costPerTurn = tokenStats.week.turns > 0
    ? (stats.totalAiCost / tokenStats.week.turns)
    : 0;

  return (
    <div className="space-y-6">
      {/* Stats row - 4 cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-bg-card border border-border-primary rounded-lg p-5">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="h-4 w-4 text-yellow-400" />
            <span className="text-xs text-text-muted uppercase tracking-wider">AI Cost</span>
          </div>
          <p className="text-2xl font-bold font-mono text-text-primary">
            ${stats.totalAiCost.toFixed(2)}
          </p>
          <p className="text-xs text-text-muted mt-1">This week</p>
        </div>

        <div className="bg-bg-card border border-border-primary rounded-lg p-5">
          <div className="flex items-center gap-2 mb-2">
            <Zap className="h-4 w-4 text-[#8b5cf6]" />
            <span className="text-xs text-text-muted uppercase tracking-wider">Avg Score</span>
          </div>
          <p className={`text-2xl font-bold ${stats.avgPromptScore != null ? getScoreColor(stats.avgPromptScore) : 'text-text-muted'}`}>
            {stats.avgPromptScore != null ? stats.avgPromptScore : '--'}
          </p>
          <p className="text-xs text-text-muted mt-1">Prompt quality</p>
        </div>

        <div className="bg-bg-card border border-border-primary rounded-lg p-5">
          <div className="flex items-center gap-2 mb-2">
            <Bot className="h-4 w-4 text-blue-400" />
            <span className="text-xs text-text-muted uppercase tracking-wider">Sessions</span>
          </div>
          <p className="text-2xl font-bold text-text-primary">{stats.sessionsThisWeek}</p>
          <p className="text-xs text-text-muted mt-1">This week</p>
        </div>

        <div className="bg-bg-card border border-border-primary rounded-lg p-5">
          <div className="flex items-center gap-2 mb-2">
            <Hash className="h-4 w-4 text-cyan-400" />
            <span className="text-xs text-text-muted uppercase tracking-wider">Tokens</span>
          </div>
          <p className="text-2xl font-bold font-mono text-text-primary">
            {formatTokens(totalWeekTokens)}
          </p>
          <p className="text-xs text-text-muted mt-1">
            ${costPerTurn > 0 ? `$${costPerTurn.toFixed(4)}/turn` : '--/turn'}
          </p>
        </div>
      </div>

      {/* Cost trend + Score trend */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Cost trend area chart */}
        <div className="bg-bg-card border border-border-primary rounded-lg p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-text-muted">
              Cost Trend
            </h3>
            <span className="text-xs text-text-muted">Last 30 days</span>
          </div>
          {costTrendFormatted.length < 2 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <TrendingUp className="w-6 h-6 text-text-muted mb-2" />
              <p className="text-xs text-text-muted">Not enough data for trend</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={costTrendFormatted}>
                <defs>
                  <linearGradient id="costGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-primary)" vertical={false} />
                <XAxis dataKey="label" tick={axisTickStyle} axisLine={false} tickLine={false} />
                <YAxis tick={axisTickStyle} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v}`} width={45} />
                <Tooltip
                  contentStyle={chartTooltipStyle}
                  formatter={(value: number) => [`$${value.toFixed(3)}`, 'Cost']}
                />
                <Area
                  type="monotone"
                  dataKey="cost"
                  stroke="#8b5cf6"
                  strokeWidth={2}
                  fill="url(#costGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Score trend line chart */}
        <div className="bg-bg-card border border-border-primary rounded-lg p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-text-muted">
              Score Trend
            </h3>
            <span className="text-xs text-text-muted">Last 30 days</span>
          </div>
          {scoreTrendFormatted.length < 2 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Zap className="w-6 h-6 text-text-muted mb-2" />
              <p className="text-xs text-text-muted">Not enough data for trend</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={scoreTrendFormatted}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-primary)" vertical={false} />
                <XAxis dataKey="label" tick={axisTickStyle} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 100]} tick={axisTickStyle} axisLine={false} tickLine={false} width={30} />
                <Tooltip
                  contentStyle={chartTooltipStyle}
                  formatter={(value: number) => [value, 'Score']}
                />
                <Line
                  type="monotone"
                  dataKey="score"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={{ fill: '#3b82f6', r: 3 }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Token breakdown + Model donut + Usage pattern */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Token breakdown */}
        <div className="bg-bg-card border border-border-primary rounded-lg p-5">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-text-muted mb-4">
            Token Usage
          </h3>
          {totalWeekTokens === 0 ? (
            <p className="text-sm text-text-muted py-8 text-center">No token data</p>
          ) : (
            <div className="space-y-4">
              {/* Bar visualization */}
              <div className="space-y-3">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <ArrowUpRight className="h-3.5 w-3.5 text-[#8b5cf6]" />
                      <span className="text-xs text-text-secondary">Input</span>
                    </div>
                    <span className="text-xs font-mono text-text-muted">{formatTokens(tokenStats.week.input)}</span>
                  </div>
                  <div className="h-2 bg-bg-elevated rounded-full overflow-hidden">
                    <div className="h-full bg-[#8b5cf6] rounded-full transition-all" style={{ width: `${inputPct}%` }} />
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <ArrowDownRight className="h-3.5 w-3.5 text-[#3b82f6]" />
                      <span className="text-xs text-text-secondary">Output</span>
                    </div>
                    <span className="text-xs font-mono text-text-muted">{formatTokens(tokenStats.week.output)}</span>
                  </div>
                  <div className="h-2 bg-bg-elevated rounded-full overflow-hidden">
                    <div className="h-full bg-[#3b82f6] rounded-full transition-all" style={{ width: `${outputPct}%` }} />
                  </div>
                </div>
              </div>

              {/* Stats */}
              <div className="border-t border-border-primary pt-3 space-y-2">
                <div className="flex justify-between">
                  <span className="text-xs text-text-muted">Total turns</span>
                  <span className="text-xs font-mono text-text-secondary">{tokenStats.week.turns}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-text-muted">Avg tokens/turn</span>
                  <span className="text-xs font-mono text-text-secondary">
                    {tokenStats.week.turns > 0 ? formatTokens(Math.round(totalWeekTokens / tokenStats.week.turns)) : '--'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-text-muted">Input/Output ratio</span>
                  <span className="text-xs font-mono text-text-secondary">
                    {inputPct}% / {outputPct}%
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Model donut */}
        <div className="bg-bg-card border border-border-primary rounded-lg p-5">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-text-muted mb-4">
            Model Breakdown
          </h3>
          {donutData.length === 0 ? (
            <p className="text-sm text-text-muted py-8 text-center">No model data</p>
          ) : (
            <div className="flex flex-col items-center gap-4">
              <ResponsiveContainer width={140} height={140}>
                <PieChart>
                  <Pie
                    data={donutData}
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={65}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {donutData.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={chartTooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2 w-full">
                {donutData.map((d, i) => (
                  <div key={d.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                      <span className="text-xs text-text-secondary truncate">{d.name}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[10px] text-text-muted">{d.value} sessions</span>
                      <span className="text-xs font-mono text-text-muted">${d.cost.toFixed(2)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Usage pattern (day of week) */}
        <div className="bg-bg-card border border-border-primary rounded-lg p-5">
          <div className="flex items-center gap-2 mb-4">
            <Calendar className="h-4 w-4 text-cyan-400" />
            <h3 className="text-sm font-semibold uppercase tracking-wider text-text-muted">
              Usage Pattern
            </h3>
          </div>
          {usageByDayOfWeek.every(d => d.sessions === 0) ? (
            <p className="text-sm text-text-muted py-8 text-center">No usage data</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={usageByDayOfWeek}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-primary)" vertical={false} />
                <XAxis dataKey="day" tick={axisTickStyle} axisLine={false} tickLine={false} />
                <YAxis tick={axisTickStyle} axisLine={false} tickLine={false} width={25} allowDecimals={false} />
                <Tooltip
                  contentStyle={chartTooltipStyle}
                  formatter={(value: number) => [value, 'Sessions']}
                />
                <Bar dataKey="sessions" fill="#06b6d4" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Anti-patterns */}
      <div className="bg-bg-card border border-border-primary rounded-lg p-5">
        <div className="flex items-center gap-2 mb-4">
          <AlertTriangle className="h-4 w-4 text-yellow-400" />
          <h3 className="text-sm font-semibold uppercase tracking-wider text-text-muted">
            Anti-Patterns Detected
          </h3>
          {antiPatterns.length > 0 && (
            <span className="text-[10px] font-semibold bg-yellow-900/30 text-yellow-400 px-2 py-0.5 rounded-full ml-auto">
              {antiPatterns.reduce((s, a) => s + a.count, 0)} total
            </span>
          )}
        </div>
        {antiPatterns.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="w-8 h-8 rounded-full bg-emerald-900/20 flex items-center justify-center mb-2">
              <Zap className="w-4 h-4 text-emerald-400" />
            </div>
            <p className="text-sm text-text-secondary">No anti-patterns detected</p>
            <p className="text-xs text-text-muted mt-1">Clean AI usage this week</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {antiPatterns.map(ap => (
              <div key={ap.pattern} className="flex items-center justify-between px-3 py-2.5 bg-bg-primary rounded-lg border border-bg-elevated">
                <span className="text-xs text-text-secondary">{ap.pattern.replace(/_/g, ' ')}</span>
                <span className="text-xs font-semibold bg-yellow-900/30 text-yellow-400 px-2 py-0.5 rounded-full">
                  {ap.count}x
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Sessions list */}
      <div className="bg-bg-card border border-border-primary rounded-lg p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-text-muted">
            Sessions This Week
          </h3>
          {sessions.length > 0 && (
            <span className="text-xs text-text-muted">{sessions.length} sessions</span>
          )}
        </div>
        {sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Bot className="w-8 h-8 text-text-muted mb-2" />
            <p className="text-sm text-text-secondary">No AI sessions this week</p>
            <p className="text-xs text-text-muted mt-1">Sessions will appear here once the developer uses AI tools</p>
          </div>
        ) : (
          <div className="space-y-1 max-h-[420px] overflow-y-auto">
            {sessions.map(s => {
              const totalTokens = (s.inputTokens ?? 0) + (s.outputTokens ?? 0);
              return (
                <Link key={s.id} href={`/sessions/${s.id}`}>
                  <div className="flex items-center justify-between px-3 py-3 rounded-lg hover:bg-bg-elevated transition-colors cursor-pointer group">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-bg-elevated group-hover:bg-bg-card flex items-center justify-center shrink-0">
                        <Bot className="h-4 w-4 text-text-muted" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm text-text-primary truncate" title={s.firstPrompt ?? `Session ${s.id}`}>
                          {s.firstPrompt
                            ? s.firstPrompt.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, 70) || `Session ${s.id.slice(0, 8)}`
                            : `Session ${s.id.slice(0, 8)}`}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {s.model && (
                            <span className="text-[10px] text-text-muted bg-bg-elevated px-1.5 py-0.5 rounded">
                              {s.model}
                            </span>
                          )}
                          <div className="flex items-center gap-1 text-[10px] text-text-muted">
                            <Clock className="h-2.5 w-2.5" />
                            {formatTime(s.startedAt)}
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {s.turns != null && (
                        <span className="text-[10px] text-text-muted">{s.turns} turns</span>
                      )}
                      {totalTokens > 0 && (
                        <span className="text-[10px] font-mono text-text-muted">
                          {formatTokens(totalTokens)}
                        </span>
                      )}
                      {s.score != null && (
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${getScoreBadge(s.score)}`}>
                          {s.score}
                        </span>
                      )}
                      {s.cost != null && (
                        <span className="text-xs font-mono text-text-muted">${s.cost.toFixed(3)}</span>
                      )}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
