'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, Users, DollarSign, Activity, Zap, CheckSquare, GitCommit, GitPullRequest,
  GitMerge, Target, Github, Terminal, Clock,
} from 'lucide-react';
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
} from 'recharts';
import { AdminStatCard } from '@/components/admin/admin-stat-card';
import { AdminChartCard } from '@/components/admin/admin-chart-card';

const MODEL_COLORS = ['#8b5cf6', '#3b82f6', '#22c55e', '#f97316', '#06b6d4', '#ec4899'];
const CATEGORY_STYLES: Record<string, string> = {
  feature: 'text-green-400 bg-green-900/30', debug: 'text-red-400 bg-red-900/30',
  refactor: 'text-blue-400 bg-blue-900/30', research: 'text-purple-400 bg-purple-900/30',
  review: 'text-yellow-400 bg-yellow-900/30', config: 'text-orange-400 bg-orange-900/30',
  general: 'text-text-muted bg-bg-elevated',
};
const STATUS_COLORS: Record<string, string> = {
  pending: '#f97316', in_progress: '#3b82f6', completed: '#22c55e', dropped: '#6b7280',
};
const ROLE_STYLES: Record<string, string> = {
  owner: 'text-purple-400 bg-purple-900/30', manager: 'text-blue-400 bg-blue-900/30',
  developer: 'text-green-400 bg-green-900/30',
};

function scoreColor(s: number | null): string {
  if (s == null) return 'text-text-muted';
  if (s >= 80) return 'text-emerald-400';
  if (s >= 60) return 'text-blue-400';
  if (s >= 40) return 'text-yellow-400';
  return 'text-red-400';
}

function formatTokens(v: number): string {
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  return String(v);
}

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function AdminUserDetailPage({ params }: { params: any }) {
  const { id } = use<{ id: string }>(params);
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'sessions' | 'code' | 'tasks' | 'usage'>('sessions');

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/admin/users/${id}`);
        if (!res.ok) throw new Error('Failed to load');
        setData(await res.json());
      } catch {
        setError('Failed to load user details');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-6 w-32 animate-pulse rounded bg-bg-elevated" />
        <div className="h-8 w-64 animate-pulse rounded bg-bg-elevated" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-xl border border-border-primary bg-bg-card" />
          ))}
        </div>
        <div className="h-96 animate-pulse rounded-xl border border-border-primary bg-bg-card" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-4">
        <Link href="/admin/users" className="inline-flex items-center gap-1.5 text-xs text-text-muted hover:text-text-primary transition-colors">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Users
        </Link>
        <div className="bg-red-900/20 border border-red-800/50 rounded-lg p-5 text-red-300 text-sm">{error || 'Not found'}</div>
      </div>
    );
  }

  const user = data.user as { id: string; name: string; email: string; role: string; githubUsername: string | null; cliInstalled: boolean; isActive: boolean; joinedAt: string; teamName: string; teamSlug: string; teamId: string; lastSyncAt: string | null };
  const stats = data.stats as Record<string, number | null>;
  const modelUsage = data.modelUsage as { model: string; count: number; cost: number }[];
  const categoryBreakdown = data.categoryBreakdown as { category: string; count: number }[];
  const dailyActivity = data.dailyActivity as { date: string; sessions: number; cost: number }[];
  const sessions = data.sessions as { id: string; model: string; cost: number; turns: number; score: number | null; efficiencyScore: number | null; workSummary: string | null; workCategory: string | null; workTags: string[] | null; gitRepo: string | null; filesChanged: number; toolCalls: number; inputTokens: number; outputTokens: number; startedAt: string; durationMin: number | null }[];
  const codeChanges = data.codeChanges as { id: string; type: string; repo: string; branch: string; title: string; additions: number; deletions: number; filesChanged: number; isAiAssisted: boolean; createdAt: string }[];
  const tasks = data.tasks as { id: string; title: string; status: string; priority: string; deadline: string | null; cycleTimeHours: number | null; source: string | null; completedAt: string | null; createdAt: string }[];
  const taskStats = stats.taskStats as unknown as Record<string, number>;

  const chartTooltipStyle = { backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-primary)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 12 };
  const totalModelSessions = modelUsage.reduce((s, m) => s + m.count, 0);

  const TABS = [
    { key: 'sessions', label: `Sessions (${sessions.length})` },
    { key: 'code', label: `Code (${codeChanges.length})` },
    { key: 'tasks', label: `Tasks (${tasks.length})` },
    { key: 'usage', label: 'AI Usage' },
  ] as const;

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <Link href="/admin/users" className="inline-flex items-center gap-1.5 text-xs text-text-muted hover:text-text-primary transition-colors">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to Users
      </Link>

      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="h-12 w-12 rounded-full bg-purple-600/20 border border-purple-500/30 flex items-center justify-center shrink-0">
          <Users className="h-5 w-5 text-purple-400" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-text-primary">{user.name || user.email}</h1>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${ROLE_STYLES[user.role] ?? ''}`}>{user.role}</span>
            <span className={`h-2.5 w-2.5 rounded-full ${user.isActive ? 'bg-emerald-400' : 'bg-text-muted'}`} />
          </div>
          <div className="flex items-center gap-4 mt-1 text-sm text-text-muted flex-wrap">
            <span>{user.email}</span>
            <span>&middot;</span>
            <Link href={`/admin/teams/${user.teamId}`} className="hover:text-text-primary transition-colors">{user.teamName}</Link>
            {user.githubUsername && (
              <>
                <span>&middot;</span>
                <span className="flex items-center gap-1"><Github className="h-3 w-3" />{user.githubUsername}</span>
              </>
            )}
            {user.cliInstalled && (
              <>
                <span>&middot;</span>
                <span className="flex items-center gap-1 text-emerald-400"><Terminal className="h-3 w-3" />CLI installed</span>
              </>
            )}
          </div>
          <p className="text-xs text-text-muted mt-1">
            Joined {new Date(user.joinedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
            {user.lastSyncAt && <> &middot; Last sync {new Date(user.lastSyncAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</>}
          </p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <AdminStatCard label="Sessions" value={String(stats.totalSessions)} icon={<Activity className="h-4 w-4" />} iconColor="#8b5cf6" />
        <AdminStatCard label="Total Cost" value={`$${((stats.totalCost as number) ?? 0).toFixed(2)}`} icon={<DollarSign className="h-4 w-4" />} iconColor="#ef4444" delay={50} />
        <AdminStatCard label="Tokens" value={formatTokens((stats.totalTokens as number) ?? 0)} icon={<Zap className="h-4 w-4" />} iconColor="#3b82f6" delay={100} />
        <AdminStatCard label="Avg Score" value={stats.avgScore != null ? `${Math.round(stats.avgScore)}/100` : 'N/A'} icon={<Target className="h-4 w-4" />} iconColor="#22c55e" delay={150} />
        <AdminStatCard label="Commits" value={String(stats.commits)} icon={<GitCommit className="h-4 w-4" />} iconColor="#f97316" delay={200} />
        <AdminStatCard label="Tasks Done" value={`${taskStats?.completed ?? 0}/${stats.totalTasks}`} icon={<CheckSquare className="h-4 w-4" />} iconColor="#06b6d4" delay={250} />
      </div>

      {/* Tabs */}
      <div className="border-b border-border-primary">
        <div className="flex gap-0">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2.5 text-xs font-medium transition-all border-b-2 -mb-px ${
                tab === t.key
                  ? 'border-purple-500 text-text-primary'
                  : 'border-transparent text-text-muted hover:text-text-secondary'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      {tab === 'sessions' && (
        <div className="rounded-xl border border-border-primary bg-bg-card overflow-hidden divide-y divide-border-primary">
          {sessions.length === 0 ? (
            <div className="px-5 py-16 text-center text-sm text-text-muted">No sessions yet</div>
          ) : sessions.map((s) => (
            <div key={s.id} className="flex items-center gap-4 px-5 py-3.5">
              <div className={`flex h-9 w-9 items-center justify-center rounded-full border shrink-0 ${
                s.score != null && s.score >= 80 ? 'border-emerald-500/30 bg-emerald-900/20'
                : s.score != null && s.score >= 60 ? 'border-blue-500/30 bg-blue-900/20'
                : 'border-border-primary bg-bg-elevated'
              }`}>
                <span className={`text-xs font-bold ${scoreColor(s.score)}`}>{s.score != null ? Math.round(s.score) : '--'}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-text-primary truncate">{s.workSummary || `${s.model} session`}</p>
                  {s.workCategory && (
                    <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-medium shrink-0 ${CATEGORY_STYLES[s.workCategory] ?? CATEGORY_STYLES.general}`}>{s.workCategory}</span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-0.5 text-xs text-text-muted">
                  <span>{s.model}</span>
                  {s.gitRepo && <><span>&middot;</span><span>{s.gitRepo}</span></>}
                  {s.filesChanged > 0 && <><span>&middot;</span><span>{s.filesChanged} files</span></>}
                </div>
                {s.workTags && s.workTags.length > 0 && (
                  <div className="flex items-center gap-1 mt-1 flex-wrap">
                    {s.workTags.slice(0, 5).map((tag) => (
                      <span key={tag} className="rounded bg-bg-elevated px-1.5 py-0.5 text-[9px] text-text-muted">{tag}</span>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-4 shrink-0 text-xs">
                <div className="text-center">
                  <p className="text-text-muted">Cost</p>
                  <p className="font-mono text-text-primary">${s.cost.toFixed(4)}</p>
                </div>
                <div className="text-center">
                  <p className="text-text-muted">Turns</p>
                  <p className="text-text-primary">{s.turns}</p>
                </div>
                <div className="text-center">
                  <p className="text-text-muted">Tokens</p>
                  <p className="font-mono text-text-primary">{formatTokens(s.inputTokens + s.outputTokens)}</p>
                </div>
                {s.durationMin != null && (
                  <div className="text-center">
                    <p className="text-text-muted">Time</p>
                    <p className="text-text-primary">{s.durationMin}m</p>
                  </div>
                )}
                <span className="text-text-muted">{formatDate(s.startedAt)}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'code' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <AdminStatCard label="Commits" value={String(stats.commits)} icon={<GitCommit className="h-4 w-4" />} iconColor="#8b5cf6" />
            <AdminStatCard label="PRs Opened" value={String(stats.prsOpened)} icon={<GitPullRequest className="h-4 w-4" />} iconColor="#3b82f6" />
            <AdminStatCard label="PRs Merged" value={String(stats.prsMerged)} icon={<GitMerge className="h-4 w-4" />} iconColor="#22c55e" />
            <AdminStatCard label="Lines Changed" value={`+${stats.totalAdditions}/-${stats.totalDeletions}`} icon={<Activity className="h-4 w-4" />} iconColor="#f97316" />
          </div>
          <div className="rounded-xl border border-border-primary bg-bg-card overflow-hidden divide-y divide-border-primary">
            {codeChanges.length === 0 ? (
              <div className="px-5 py-16 text-center text-sm text-text-muted">No code changes yet</div>
            ) : codeChanges.map((c) => (
              <div key={c.id} className="flex items-center gap-4 px-5 py-3">
                {c.type === 'commit' ? <GitCommit className="h-4 w-4 text-purple-400 shrink-0" />
                  : c.type === 'pr_merged' ? <GitMerge className="h-4 w-4 text-emerald-400 shrink-0" />
                  : <GitPullRequest className="h-4 w-4 text-blue-400 shrink-0" />}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-text-primary truncate">{c.title || c.type}</p>
                  <div className="flex items-center gap-2 text-xs text-text-muted mt-0.5">
                    <span>{c.repo}</span>
                    {c.branch && <><span>&middot;</span><span>{c.branch}</span></>}
                    {c.isAiAssisted && <span className="text-purple-400">AI-assisted</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs shrink-0">
                  <span className="text-emerald-400">+{c.additions ?? 0}</span>
                  <span className="text-red-400">-{c.deletions ?? 0}</span>
                  <span className="text-text-muted">{c.filesChanged ?? 0}f</span>
                  <span className="text-text-muted">{formatDate(c.createdAt)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'tasks' && (
        <div className="rounded-xl border border-border-primary bg-bg-card overflow-hidden divide-y divide-border-primary">
          {tasks.length === 0 ? (
            <div className="px-5 py-16 text-center text-sm text-text-muted">No tasks assigned</div>
          ) : tasks.map((t) => (
            <div key={t.id} className="flex items-center gap-4 px-5 py-3">
              <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: STATUS_COLORS[t.status] ?? '#6b7280' }} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-text-primary truncate">{t.title}</p>
                <div className="flex items-center gap-2 text-xs text-text-muted mt-0.5">
                  <span>{t.status.replace('_', ' ')}</span>
                  {t.source && <><span>&middot;</span><span>from {t.source}</span></>}
                  {t.completedAt && <><span>&middot;</span><span className="text-emerald-400">done {formatDate(t.completedAt)}</span></>}
                </div>
              </div>
              {t.priority && (
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                  t.priority === 'high' ? 'text-red-400 bg-red-900/30' : t.priority === 'medium' ? 'text-yellow-400 bg-yellow-900/30' : 'text-blue-400 bg-blue-900/30'
                }`}>{t.priority}</span>
              )}
              {t.cycleTimeHours != null && <span className="text-xs font-mono text-text-muted flex items-center gap-1"><Clock className="h-3 w-3" />{t.cycleTimeHours.toFixed(1)}h</span>}
              <span className="text-xs text-text-muted">{formatDate(t.createdAt)}</span>
            </div>
          ))}
        </div>
      )}

      {tab === 'usage' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Activity Trend */}
          <AdminChartCard title="Daily Activity" subtitle="Last 30 days" >
            {dailyActivity.length === 0 ? (
              <div className="flex items-center justify-center py-16 text-sm text-text-muted">No recent activity</div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={dailyActivity}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-primary)" />
                  <XAxis dataKey="date" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} tickFormatter={formatDate} />
                  <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
                  <Tooltip contentStyle={chartTooltipStyle} />
                  <Area type="monotone" dataKey="sessions" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.15} strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </AdminChartCard>

          {/* Model Usage */}
          <AdminChartCard title="Model Usage">
            {modelUsage.length === 0 ? (
              <div className="flex items-center justify-center py-16 text-sm text-text-muted">No data</div>
            ) : (
              <div className="flex items-center gap-6">
                <div className="flex-1">
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie data={modelUsage.map((m, i) => ({ ...m, color: MODEL_COLORS[i % MODEL_COLORS.length] }))} cx="50%" cy="50%" innerRadius={50} outerRadius={78} dataKey="count" nameKey="model" stroke="var(--bg-card)" strokeWidth={3} paddingAngle={2}>
                        {modelUsage.map((_, i) => <Cell key={i} fill={MODEL_COLORS[i % MODEL_COLORS.length]} />)}
                      </Pie>
                      <Tooltip contentStyle={chartTooltipStyle} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="shrink-0 space-y-2 pr-2">
                  {modelUsage.map((m, i) => (
                    <div key={m.model} className="flex items-center gap-2.5">
                      <span className="h-2.5 w-2.5 rounded-sm shrink-0" style={{ backgroundColor: MODEL_COLORS[i % MODEL_COLORS.length] }} />
                      <div>
                        <p className="text-xs font-medium text-text-primary truncate max-w-[120px]">{m.model}</p>
                        <p className="text-[10px] text-text-muted">{totalModelSessions > 0 ? ((m.count / totalModelSessions) * 100).toFixed(0) : 0}% &middot; ${m.cost.toFixed(2)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </AdminChartCard>

          {/* Work Categories */}
          <AdminChartCard title="Work Categories">
            {categoryBreakdown.length === 0 ? (
              <div className="flex items-center justify-center py-16 text-sm text-text-muted">No data</div>
            ) : (
              <div className="space-y-2">
                {categoryBreakdown.map((c) => {
                  const pct = (stats.totalSessions as number) > 0 ? (c.count / (stats.totalSessions as number)) * 100 : 0;
                  return (
                    <div key={c.category} className="flex items-center gap-3">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium w-20 text-center ${CATEGORY_STYLES[c.category] ?? CATEGORY_STYLES.general}`}>{c.category}</span>
                      <div className="flex-1 h-2 rounded-full bg-bg-elevated overflow-hidden">
                        <div className="h-full rounded-full bg-purple-500" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs text-text-muted w-16 text-right">{c.count} ({pct.toFixed(0)}%)</span>
                    </div>
                  );
                })}
              </div>
            )}
          </AdminChartCard>
        </div>
      )}
    </div>
  );
}
