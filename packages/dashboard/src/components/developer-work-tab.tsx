'use client';

import {
  GitCommit,
  GitPullRequest,
  Eye,
  CheckCircle2,
  Clock,
  FileText,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';

interface CodeChange {
  id: string;
  type: string;
  title: string;
  description: string | null;
  repo: string | null;
  filesChanged: number | null;
  additions: number | null;
  deletions: number | null;
  branch: string | null;
  createdAt: string;
  metadata: Record<string, unknown> | null;
}

interface Task {
  id: string;
  title: string;
  status: string;
  source: string | null;
  createdAt: string;
  completedAt: string | null;
}

interface CommitDay {
  date: string;
  count: number;
}

interface DeveloperWorkTabProps {
  codeChanges: CodeChange[];
  tasks: Task[];
  commitsPerDay: CommitDay[];
  stats: {
    commits: number;
    prs: number;
    reviews: number;
    tasksCompleted: number;
    tasksAssigned: number;
  };
}

const chartTooltipStyle = {
  backgroundColor: 'var(--bg-card)',
  border: '1px solid var(--border-primary)',
  borderRadius: 8,
  color: 'var(--text-primary)',
  fontSize: 12,
};

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatDay(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const yesterday = new Date(now.getTime() - 86400000).toISOString().slice(0, 10);
  if (dateStr === today) return 'Today';
  if (dateStr === yesterday) return 'Yesterday';
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

export default function DeveloperWorkTab({ codeChanges, tasks, commitsPerDay, stats }: DeveloperWorkTabProps) {
  // Group commits by day
  const commits = codeChanges.filter(c => c.type === 'commit');
  const prs = codeChanges.filter(c => c.type === 'pr_opened' || c.type === 'pr_merged');
  const reviews = codeChanges.filter(c => c.type === 'review');

  const commitsByDay: Record<string, CodeChange[]> = {};
  for (const c of commits) {
    const day = c.createdAt.slice(0, 10);
    if (!commitsByDay[day]) commitsByDay[day] = [];
    commitsByDay[day].push(c);
  }
  const commitDays = Object.entries(commitsByDay)
    .sort(([a], [b]) => b.localeCompare(a));

  const chartData = commitsPerDay.map(d => ({
    date: formatDate(d.date),
    commits: d.count,
  }));

  const completedTasks = tasks.filter(t => t.status === 'completed');
  const pendingTasks = tasks.filter(t => t.status !== 'completed');

  return (
    <div className="space-y-6">
      {/* Commits per day chart */}
      {chartData.length > 0 && (
        <div className="bg-bg-card border border-border-primary rounded-lg p-5">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-text-muted mb-4">
            Commits / Day (30 days)
          </h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-primary)" />
              <XAxis dataKey="date" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
              <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} allowDecimals={false} />
              <Tooltip contentStyle={chartTooltipStyle} />
              <Bar dataKey="commits" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Commits list */}
        <div className="bg-bg-card border border-border-primary rounded-lg p-5">
          <div className="flex items-center gap-2 mb-4">
            <GitCommit className="h-4 w-4 text-text-muted" />
            <h3 className="text-sm font-semibold uppercase tracking-wider text-text-muted">
              Commits ({stats.commits})
            </h3>
          </div>
          {commitDays.length === 0 ? (
            <p className="text-sm text-text-muted py-4 text-center">No commits this week</p>
          ) : (
            <div className="space-y-4 max-h-80 overflow-y-auto">
              {commitDays.map(([day, dayCommits]) => (
                <div key={day}>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted mb-2">
                    {formatDay(day)}
                  </p>
                  <div className="space-y-1">
                    {dayCommits.map(c => (
                      <div key={c.id} className="flex items-start gap-2 px-2 py-1.5 rounded hover:bg-bg-elevated transition-colors">
                        <GitCommit className="h-3.5 w-3.5 text-text-muted mt-0.5 shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs text-text-primary truncate">{c.title}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            {c.repo && <span className="text-[10px] text-text-muted">{c.repo}</span>}
                            {c.additions != null && c.deletions != null && (
                              <span className="text-[10px] text-text-muted">
                                +{c.additions} -{c.deletions}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* PRs + Reviews */}
        <div className="space-y-4">
          <div className="bg-bg-card border border-border-primary rounded-lg p-5">
            <div className="flex items-center gap-2 mb-4">
              <GitPullRequest className="h-4 w-4 text-text-muted" />
              <h3 className="text-sm font-semibold uppercase tracking-wider text-text-muted">
                Pull Requests ({stats.prs})
              </h3>
            </div>
            {prs.length === 0 ? (
              <p className="text-sm text-text-muted py-4 text-center">No PRs this week</p>
            ) : (
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {prs.map(pr => (
                  <div key={pr.id} className="flex items-start gap-2 px-2 py-1.5 rounded hover:bg-bg-elevated transition-colors">
                    {pr.type === 'pr_merged' ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 mt-0.5 shrink-0" />
                    ) : (
                      <GitPullRequest className="h-3.5 w-3.5 text-blue-400 mt-0.5 shrink-0" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-text-primary truncate">{pr.title}</p>
                      <span className="text-[10px] text-text-muted">
                        {pr.type === 'pr_merged' ? 'Merged' : 'Opened'} {'\u00B7'} {formatDate(pr.createdAt)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-bg-card border border-border-primary rounded-lg p-5">
            <div className="flex items-center gap-2 mb-4">
              <Eye className="h-4 w-4 text-text-muted" />
              <h3 className="text-sm font-semibold uppercase tracking-wider text-text-muted">
                Reviews ({stats.reviews})
              </h3>
            </div>
            {reviews.length === 0 ? (
              <p className="text-sm text-text-muted py-4 text-center">No reviews this week</p>
            ) : (
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {reviews.map(r => (
                  <div key={r.id} className="flex items-start gap-2 px-2 py-1.5 rounded hover:bg-bg-elevated transition-colors">
                    <Eye className="h-3.5 w-3.5 text-text-muted mt-0.5 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-text-primary truncate">{r.title}</p>
                      <span className="text-[10px] text-text-muted">{formatDate(r.createdAt)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tasks */}
      <div className="bg-bg-card border border-border-primary rounded-lg p-5">
        <div className="flex items-center gap-2 mb-4">
          <FileText className="h-4 w-4 text-text-muted" />
          <h3 className="text-sm font-semibold uppercase tracking-wider text-text-muted">
            Tasks ({stats.tasksCompleted}/{stats.tasksAssigned})
          </h3>
        </div>
        {tasks.length === 0 ? (
          <p className="text-sm text-text-muted py-4 text-center">No tasks assigned</p>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Completed */}
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400 mb-2">Completed</p>
              <div className="space-y-1">
                {completedTasks.map(t => (
                  <div key={t.id} className="flex items-center gap-2 px-2 py-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                    <span className="text-xs text-text-primary truncate">{t.title}</span>
                  </div>
                ))}
                {completedTasks.length === 0 && (
                  <p className="text-xs text-text-muted px-2">None</p>
                )}
              </div>
            </div>
            {/* Pending */}
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-yellow-400 mb-2">Pending</p>
              <div className="space-y-1">
                {pendingTasks.map(t => (
                  <div key={t.id} className="flex items-center gap-2 px-2 py-1.5">
                    <Clock className="h-3.5 w-3.5 text-yellow-400 shrink-0" />
                    <span className="text-xs text-text-primary truncate">{t.title}</span>
                  </div>
                ))}
                {pendingTasks.length === 0 && (
                  <p className="text-xs text-text-muted px-2">None</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
