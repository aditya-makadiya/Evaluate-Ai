'use client';

import { useState, useEffect } from 'react';
import { CheckSquare, Clock, AlertTriangle, TrendingUp, Plus, CheckCircle2, GitCommit } from 'lucide-react';
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
import { AdminStatCard } from '@/components/admin/admin-stat-card';
import { AdminPeriodSelector, type AdminPeriod } from '@/components/admin/admin-period-selector';
import { AdminChartCard } from '@/components/admin/admin-chart-card';
import { useAdminTeamFilter } from '@/components/admin/admin-team-context';

interface TaskItem {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  source: string | null;
  deadline: string | null;
  cycleTimeHours: number | null;
  hasCodeChanges: boolean;
  firstCommitAt: string | null;
  completedAt: string | null;
  teamId: string;
  teamName: string;
  assigneeName: string;
  createdAt: string;
  updatedAt: string | null;
}

interface TasksData {
  totalTasks: number;
  statusCounts: { pending: number; in_progress: number; completed: number; dropped: number };
  completionRate: number;
  avgCycleTime: number;
  overdueCount: number;
  periodCreated: number;
  periodCompleted: number;
  byTeam: { teamId: string; teamName: string; total: number; completed: number; inProgress: number; pending: number; completionRate: number }[];
  overdueTasks: { id: string; title: string; status: string; priority: string; deadline: string; teamName: string; assigneeName: string }[];
  taskList: TaskItem[];
}

const STATUS_COLORS: Record<string, string> = {
  pending: '#f97316',
  in_progress: '#3b82f6',
  completed: '#22c55e',
  dropped: '#6b7280',
};

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  in_progress: 'In Progress',
  completed: 'Completed',
  dropped: 'Dropped',
};

const PRIORITY_STYLES: Record<string, string> = {
  high: 'text-red-400 bg-red-900/30',
  medium: 'text-yellow-400 bg-yellow-900/30',
  low: 'text-blue-400 bg-blue-900/30',
};

export default function AdminTasksPage() {
  const { teamId } = useAdminTeamFilter();
  const [period, setPeriod] = useState<AdminPeriod>('month');
  const [data, setData] = useState<TasksData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [expandedTask, setExpandedTask] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const params = new URLSearchParams({ period });
        if (teamId) params.set('teamId', teamId);
        const res = await fetch(`/api/admin/tasks?${params.toString()}`);
        if (!res.ok) throw new Error('Failed to load');
        setData(await res.json());
        setError('');
      } catch {
        setError('Failed to load task data');
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

  if (loading && !data) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="h-8 w-32 animate-pulse rounded bg-bg-elevated" />
            <div className="mt-2 h-4 w-56 animate-pulse rounded bg-bg-elevated" />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-xl border border-border-primary bg-bg-card" />
          ))}
        </div>
        <div className="h-96 animate-pulse rounded-xl border border-border-primary bg-bg-card" />
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

  const statusChartData = Object.entries(data.statusCounts)
    .filter(([, count]) => count > 0)
    .map(([status, count]) => ({
      status,
      label: STATUS_LABELS[status] ?? status,
      count,
      color: STATUS_COLORS[status] ?? '#6b7280',
    }));

  const filteredTasks = statusFilter === 'all'
    ? data.taskList
    : data.taskList.filter((t) => t.status === statusFilter);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text-primary">Tasks</h1>
          <p className="mt-1 text-sm text-text-muted">Cross-team task tracking and completion metrics</p>
        </div>
        <AdminPeriodSelector value={period} onChange={setPeriod} />
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-6">
        <AdminStatCard
          label="Total Tasks"
          value={String(data.totalTasks)}
          icon={<CheckSquare className="h-4 w-4" />}
          iconColor="#8b5cf6"
          delay={0}
        />
        <AdminStatCard
          label="Completed"
          value={String(data.statusCounts.completed)}
          icon={<CheckCircle2 className="h-4 w-4" />}
          iconColor="#22c55e"
          delay={50}
        />
        <AdminStatCard
          label="Completion Rate"
          value={`${data.completionRate.toFixed(1)}%`}
          icon={<TrendingUp className="h-4 w-4" />}
          iconColor="#3b82f6"
          delay={100}
        />
        <AdminStatCard
          label="Avg Cycle Time"
          value={data.avgCycleTime > 0 ? `${data.avgCycleTime.toFixed(1)}h` : 'N/A'}
          icon={<Clock className="h-4 w-4" />}
          iconColor="#06b6d4"
          delay={150}
        />
        <AdminStatCard
          label="Created (Period)"
          value={String(data.periodCreated)}
          icon={<Plus className="h-4 w-4" />}
          iconColor="#f97316"
          delay={200}
        />
        <AdminStatCard
          label="Overdue"
          value={String(data.overdueCount)}
          icon={<AlertTriangle className="h-4 w-4" />}
          iconColor="#ef4444"
          delay={250}
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <AdminChartCard title="Status Breakdown">
          {statusChartData.length === 0 ? (
            <div className="flex items-center justify-center py-16 text-sm text-text-muted">No task data yet</div>
          ) : (
            <div className="flex items-center gap-6">
              <div className="flex-1">
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={statusChartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={85}
                      dataKey="count"
                      nameKey="label"
                      stroke="var(--bg-card)"
                      strokeWidth={3}
                      paddingAngle={2}
                    >
                      {statusChartData.map((entry) => (
                        <Cell key={entry.status} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={chartTooltipStyle} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="shrink-0 space-y-2.5 pr-2">
                {statusChartData.map((entry) => (
                  <div key={entry.status} className="flex items-center gap-2.5">
                    <span className="h-2.5 w-2.5 rounded-sm shrink-0" style={{ backgroundColor: entry.color }} />
                    <div>
                      <p className="text-xs font-medium text-text-primary">{entry.label}</p>
                      <p className="text-[10px] text-text-muted">{entry.count} tasks</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </AdminChartCard>

        <AdminChartCard title="Tasks by Team">
          {data.byTeam.length === 0 ? (
            <div className="flex items-center justify-center py-16 text-sm text-text-muted">No team task data yet</div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={data.byTeam.slice(0, 10)}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-primary)" />
                <XAxis dataKey="teamName" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
                <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
                <Tooltip contentStyle={chartTooltipStyle} />
                <Bar dataKey="completed" stackId="a" fill="#22c55e" name="Completed" />
                <Bar dataKey="inProgress" stackId="a" fill="#3b82f6" name="In Progress" />
                <Bar dataKey="pending" stackId="a" fill="#f97316" name="Pending" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </AdminChartCard>
      </div>

      {/* Full Task List */}
      <div className="rounded-xl border border-border-primary bg-bg-card overflow-hidden">
        <div className="flex items-center justify-between border-b border-border-primary px-5 py-3">
          <h3 className="text-sm font-semibold text-text-primary">All Tasks ({filteredTasks.length})</h3>
          <div className="flex items-center gap-2">
            {['all', 'pending', 'in_progress', 'completed', 'dropped'].map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-all ${
                  statusFilter === s
                    ? 'bg-purple-600 text-white'
                    : 'text-text-muted hover:text-text-primary hover:bg-bg-elevated'
                }`}
              >
                {s === 'all' ? 'All' : STATUS_LABELS[s] ?? s}
              </button>
            ))}
          </div>
        </div>

        <div className="divide-y divide-border-primary">
          {filteredTasks.length === 0 ? (
            <div className="px-5 py-12 text-center text-sm text-text-muted">No tasks found</div>
          ) : (
            filteredTasks.slice(0, 50).map((task) => (
              <div key={task.id}>
                <div
                  className="flex items-center gap-4 px-5 py-3 cursor-pointer hover:bg-white/[0.02] transition-colors"
                  onClick={() => setExpandedTask(expandedTask === task.id ? null : task.id)}
                >
                  {/* Status dot */}
                  <span
                    className="h-2.5 w-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: STATUS_COLORS[task.status] ?? '#6b7280' }}
                  />

                  {/* Title + team */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-text-primary truncate">{task.title}</p>
                    <p className="text-xs text-text-muted">{task.teamName} &middot; {task.assigneeName}</p>
                  </div>

                  {/* Priority */}
                  {task.priority && (
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium shrink-0 ${PRIORITY_STYLES[task.priority] ?? 'text-text-muted bg-bg-elevated'}`}>
                      {task.priority}
                    </span>
                  )}

                  {/* Code changes indicator */}
                  {task.hasCodeChanges && (
                    <span title="Has linked code changes"><GitCommit className="h-3.5 w-3.5 text-emerald-400 shrink-0" /></span>
                  )}

                  {/* Status badge */}
                  <span
                    className="rounded-full px-2 py-0.5 text-[10px] font-medium shrink-0"
                    style={{
                      color: STATUS_COLORS[task.status],
                      backgroundColor: `${STATUS_COLORS[task.status]}20`,
                    }}
                  >
                    {STATUS_LABELS[task.status] ?? task.status}
                  </span>

                  {/* Cycle time */}
                  {task.cycleTimeHours != null && (
                    <span className="text-xs font-mono text-text-muted shrink-0">{task.cycleTimeHours.toFixed(1)}h</span>
                  )}
                </div>

                {/* Expanded detail */}
                {expandedTask === task.id && (
                  <div className="px-5 pb-4 pt-1 ml-6 border-l-2 border-border-primary">
                    <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-xs">
                      {task.description && (
                        <div className="col-span-2 mb-2">
                          <span className="text-text-muted">Description: </span>
                          <span className="text-text-secondary">{task.description}</span>
                        </div>
                      )}
                      <div>
                        <span className="text-text-muted">Source: </span>
                        <span className="text-text-secondary">{task.source ?? 'manual'}</span>
                      </div>
                      <div>
                        <span className="text-text-muted">Team: </span>
                        <span className="text-text-secondary">{task.teamName}</span>
                      </div>
                      <div>
                        <span className="text-text-muted">Assignee: </span>
                        <span className="text-text-secondary">{task.assigneeName}</span>
                      </div>
                      <div>
                        <span className="text-text-muted">Priority: </span>
                        <span className="text-text-secondary">{task.priority ?? 'none'}</span>
                      </div>
                      {task.deadline && (
                        <div>
                          <span className="text-text-muted">Deadline: </span>
                          <span className={`${new Date(task.deadline) < new Date() && task.status !== 'completed' ? 'text-red-400' : 'text-text-secondary'}`}>
                            {new Date(task.deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </span>
                        </div>
                      )}
                      {task.firstCommitAt && (
                        <div>
                          <span className="text-text-muted">First commit: </span>
                          <span className="text-text-secondary">{new Date(task.firstCommitAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                        </div>
                      )}
                      {task.completedAt && (
                        <div>
                          <span className="text-text-muted">Completed: </span>
                          <span className="text-emerald-400">{new Date(task.completedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                        </div>
                      )}
                      <div>
                        <span className="text-text-muted">Created: </span>
                        <span className="text-text-secondary">{new Date(task.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                      </div>
                      {task.cycleTimeHours != null && (
                        <div>
                          <span className="text-text-muted">Cycle time: </span>
                          <span className="font-mono text-text-secondary">{task.cycleTimeHours.toFixed(1)} hours</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {filteredTasks.length > 50 && (
          <div className="border-t border-border-primary px-5 py-3 text-center text-xs text-text-muted">
            Showing 50 of {filteredTasks.length} tasks
          </div>
        )}
      </div>

      {/* Overdue Tasks */}
      {data.overdueTasks.length > 0 && (
        <AdminChartCard title="Overdue Tasks" subtitle={`${data.overdueTasks.length} tasks past deadline`}>
          <div className="divide-y divide-border-primary">
            {data.overdueTasks.map((task) => (
              <div key={task.id} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-text-primary truncate">{task.title}</p>
                  <p className="text-xs text-text-muted">{task.teamName} &middot; {task.assigneeName}</p>
                </div>
                {task.priority && (
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium mx-2 ${PRIORITY_STYLES[task.priority] ?? 'text-text-muted bg-bg-elevated'}`}>
                    {task.priority}
                  </span>
                )}
                <span className="text-xs text-red-400 shrink-0">
                  Due {new Date(task.deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
              </div>
            ))}
          </div>
        </AdminChartCard>
      )}
    </div>
  );
}
