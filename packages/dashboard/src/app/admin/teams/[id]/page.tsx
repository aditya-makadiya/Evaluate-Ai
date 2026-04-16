'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, Users, DollarSign, Activity, Zap, CheckSquare, GitCommit, GitPullRequest,
  GitMerge, Plug, Target,
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function AdminTeamDetailPage({ params }: { params: any }) {
  const { id } = use<{ id: string }>(params);
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'members' | 'sessions' | 'tasks' | 'code' | 'usage'>('members');

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/admin/teams/${id}`);
        if (!res.ok) throw new Error('Failed to load');
        setData(await res.json());
      } catch {
        setError('Failed to load team details');
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
        <Link href="/admin/teams" className="inline-flex items-center gap-1.5 text-xs text-text-muted hover:text-text-primary transition-colors">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Teams
        </Link>
        <div className="bg-red-900/20 border border-red-800/50 rounded-lg p-5 text-red-300 text-sm">{error || 'Not found'}</div>
      </div>
    );
  }

  const team = data.team as { id: string; name: string; slug: string; teamCode: string; createdAt: string };
  const stats = data.stats as Record<string, number>;
  const members = data.members as { id: string; name: string; email: string; role: string; cliInstalled: boolean; isActive: boolean; joinedAt: string; totalCost: number; totalSessions: number; totalTokens: number }[];
  const integrations = data.integrations as { id: string; provider: string; status: string; lastSyncAt: string | null }[];
  const modelUsage = data.modelUsage as { model: string; count: number; cost: number }[];
  const categoryBreakdown = data.categoryBreakdown as { category: string; count: number }[];
  const recentSessions = data.recentSessions as { id: string; developerName: string; model: string; cost: number; turns: number; score: number | null; workSummary: string | null; workCategory: string | null; startedAt: string; durationMin: number | null }[];
  const tasks = data.tasks as { id: string; title: string; status: string; priority: string; assigneeName: string; deadline: string | null; cycleTimeHours: number | null; createdAt: string }[];
  const codeChanges = data.codeChanges as { id: string; type: string; repo: string; title: string; developerName: string; additions: number; deletions: number; filesChanged: number; createdAt: string }[];
  const taskStats = stats.taskStats as unknown as Record<string, number>;

  const chartTooltipStyle = { backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-primary)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 12 };
  const totalModelSessions = modelUsage.reduce((s, m) => s + m.count, 0);

  const TABS = [
    { key: 'members', label: `Members (${members.length})` },
    { key: 'sessions', label: `Sessions (${recentSessions.length})` },
    { key: 'tasks', label: `Tasks (${tasks.length})` },
    { key: 'code', label: `Code (${codeChanges.length})` },
    { key: 'usage', label: 'AI Usage' },
  ] as const;

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <Link href="/admin/teams" className="inline-flex items-center gap-1.5 text-xs text-text-muted hover:text-text-primary transition-colors">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to Teams
      </Link>

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-text-primary">{team.name}</h1>
        <p className="mt-1 text-sm text-text-muted">
          {team.slug} &middot; Created {new Date(team.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
          {integrations.length > 0 && <> &middot; {integrations.filter(i => i.status === 'active').length} active integrations</>}
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <AdminStatCard label="Members" value={`${stats.activeMembers}/${stats.memberCount}`} icon={<Users className="h-4 w-4" />} iconColor="#8b5cf6" />
        <AdminStatCard label="Sessions" value={String(stats.totalSessions)} icon={<Activity className="h-4 w-4" />} iconColor="#3b82f6" delay={50} />
        <AdminStatCard label="Total Cost" value={`$${(stats.totalCost as number).toFixed(2)}`} icon={<DollarSign className="h-4 w-4" />} iconColor="#ef4444" delay={100} />
        <AdminStatCard label="Tokens" value={formatTokens(stats.totalTokens)} icon={<Zap className="h-4 w-4" />} iconColor="#f97316" delay={150} />
        <AdminStatCard label="Avg Score" value={stats.avgScore ? `${Math.round(stats.avgScore as number)}/100` : 'N/A'} icon={<Target className="h-4 w-4" />} iconColor="#22c55e" delay={200} />
        <AdminStatCard label="Tasks Done" value={`${taskStats?.completed ?? 0}/${tasks.length}`} icon={<CheckSquare className="h-4 w-4" />} iconColor="#06b6d4" delay={250} />
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
      {tab === 'members' && (
        <div className="rounded-xl border border-border-primary bg-bg-card overflow-hidden">
          <div className="grid grid-cols-[1fr_80px_100px_80px_80px_60px] gap-2 px-5 py-2.5 border-b border-border-primary text-xs font-medium uppercase tracking-wider text-text-muted">
            <span>Member</span><span>Role</span><span>AI Cost</span><span>Sessions</span><span>Tokens</span><span className="text-center">CLI</span>
          </div>
          <div className="divide-y divide-border-primary">
            {members.map((m) => (
              <Link key={m.id} href={`/admin/users/${m.id}`} className="grid grid-cols-[1fr_80px_100px_80px_80px_60px] gap-2 items-center px-5 py-3 hover:bg-white/[0.02] transition-colors">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`h-2 w-2 rounded-full shrink-0 ${m.isActive ? 'bg-emerald-400' : 'bg-text-muted'}`} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-text-primary truncate">{m.name || m.email}</p>
                    <p className="text-xs text-text-muted truncate">{m.email}</p>
                  </div>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium w-fit ${ROLE_STYLES[m.role] ?? ''}`}>{m.role}</span>
                <span className="text-sm font-mono text-text-secondary">${m.totalCost.toFixed(2)}</span>
                <span className="text-sm text-text-secondary">{m.totalSessions}</span>
                <span className="text-sm font-mono text-text-secondary">{formatTokens(m.totalTokens)}</span>
                <div className="text-center text-xs">{m.cliInstalled ? <span className="text-emerald-400">Yes</span> : <span className="text-text-muted">No</span>}</div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {tab === 'sessions' && (
        <div className="rounded-xl border border-border-primary bg-bg-card overflow-hidden divide-y divide-border-primary">
          {recentSessions.length === 0 ? (
            <div className="px-5 py-16 text-center text-sm text-text-muted">No sessions yet</div>
          ) : recentSessions.map((s) => (
            <div key={s.id} className="flex items-center gap-4 px-5 py-3">
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
                <p className="text-xs text-text-muted">{s.developerName} &middot; {s.model}</p>
              </div>
              <div className="flex items-center gap-4 shrink-0 text-xs">
                <span className="font-mono text-text-secondary">${s.cost.toFixed(4)}</span>
                <span className="text-text-muted">{s.turns}t</span>
                {s.durationMin != null && <span className="text-text-muted">{s.durationMin}m</span>}
                <span className="text-text-muted">{new Date(s.startedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'tasks' && (
        <div className="rounded-xl border border-border-primary bg-bg-card overflow-hidden divide-y divide-border-primary">
          {tasks.length === 0 ? (
            <div className="px-5 py-16 text-center text-sm text-text-muted">No tasks yet</div>
          ) : tasks.map((t) => (
            <div key={t.id} className="flex items-center gap-4 px-5 py-3">
              <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: STATUS_COLORS[t.status] ?? '#6b7280' }} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-text-primary truncate">{t.title}</p>
                <p className="text-xs text-text-muted">{t.assigneeName} &middot; {t.status.replace('_', ' ')}</p>
              </div>
              {t.priority && (
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                  t.priority === 'high' ? 'text-red-400 bg-red-900/30' : t.priority === 'medium' ? 'text-yellow-400 bg-yellow-900/30' : 'text-blue-400 bg-blue-900/30'
                }`}>{t.priority}</span>
              )}
              {t.cycleTimeHours != null && <span className="text-xs font-mono text-text-muted">{t.cycleTimeHours.toFixed(1)}h</span>}
              <span className="text-xs text-text-muted">{new Date(t.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
            </div>
          ))}
        </div>
      )}

      {tab === 'code' && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <AdminStatCard label="Commits" value={String(stats.commits)} icon={<GitCommit className="h-4 w-4" />} iconColor="#8b5cf6" />
            <AdminStatCard label="PRs Opened" value={String(stats.prsOpened)} icon={<GitPullRequest className="h-4 w-4" />} iconColor="#3b82f6" />
            <AdminStatCard label="PRs Merged" value={String(stats.prsMerged)} icon={<GitMerge className="h-4 w-4" />} iconColor="#22c55e" />
          </div>
          <div className="rounded-xl border border-border-primary bg-bg-card overflow-hidden divide-y divide-border-primary">
            {codeChanges.length === 0 ? (
              <div className="px-5 py-16 text-center text-sm text-text-muted">No code changes in last 30 days</div>
            ) : codeChanges.map((c) => (
              <div key={c.id} className="flex items-center gap-4 px-5 py-3">
                {c.type === 'commit' ? <GitCommit className="h-4 w-4 text-purple-400 shrink-0" />
                  : c.type === 'pr_merged' ? <GitMerge className="h-4 w-4 text-emerald-400 shrink-0" />
                  : <GitPullRequest className="h-4 w-4 text-blue-400 shrink-0" />}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-text-primary truncate">{c.title || c.type}</p>
                  <p className="text-xs text-text-muted">{c.developerName} &middot; {c.repo}</p>
                </div>
                <div className="flex items-center gap-2 text-xs shrink-0">
                  <span className="text-emerald-400">+{c.additions ?? 0}</span>
                  <span className="text-red-400">-{c.deletions ?? 0}</span>
                  <span className="text-text-muted">{c.filesChanged ?? 0}f</span>
                  <span className="text-text-muted">{new Date(c.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'usage' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
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

          <AdminChartCard title="Work Categories">
            {categoryBreakdown.length === 0 ? (
              <div className="flex items-center justify-center py-16 text-sm text-text-muted">No data</div>
            ) : (
              <div className="space-y-2">
                {categoryBreakdown.map((c) => {
                  const pct = stats.totalSessions > 0 ? (c.count / (stats.totalSessions as number)) * 100 : 0;
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

          <AdminChartCard title="Integrations">
            {integrations.length === 0 ? (
              <div className="flex items-center justify-center py-16 text-sm text-text-muted">No integrations</div>
            ) : (
              <div className="space-y-2">
                {integrations.map((ig) => (
                  <div key={ig.id} className="flex items-center gap-3">
                    <Plug className="h-4 w-4 text-text-muted shrink-0" />
                    <span className="text-sm text-text-primary capitalize">{ig.provider}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${ig.status === 'active' ? 'text-emerald-400 bg-emerald-900/30' : 'text-text-muted bg-bg-elevated'}`}>{ig.status}</span>
                    {ig.lastSyncAt && <span className="text-xs text-text-muted ml-auto">Synced {new Date(ig.lastSyncAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>}
                  </div>
                ))}
              </div>
            )}
          </AdminChartCard>
        </div>
      )}
    </div>
  );
}
