'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/components/auth-provider';
import {
  CheckSquare,
  AlertTriangle,
  TrendingUp,
  Clock,
  ChevronLeft,
  ChevronRight,
  Mic,
  X,
  ListFilter,
  AlertCircle,
} from 'lucide-react';
import TaskDetailPanel, {
  type TaskItem,
  type TaskStats,
  type FilterOptions,
  STATUS_FLOW,
} from '@/components/tasks/task-detail-panel';
import TaskListItem from '@/components/tasks/task-list-item';

// ═══════════════════════════════════════
//  CONSTANTS
// ═══════════════════════════════════════

const PAGE_SIZE = 20;

// ═══════════════════════════════════════
//  STATS
// ═══════════════════════════════════════

function StatsRow({ stats }: { stats: TaskStats }) {
  const items = [
    { label: 'Total', value: stats.total, icon: CheckSquare, accent: 'text-accent-purple' },
    { label: 'Pending', value: stats.pending, icon: Clock, accent: 'text-amber-400', sub: stats.highPriority > 0 ? `${stats.highPriority} urgent` : undefined },
    { label: 'Done', value: stats.completed, icon: TrendingUp, accent: 'text-emerald-400' },
  ];
  return (
    <div className="grid grid-cols-3 gap-3 mb-5 animate-section">
      {items.map((c) => {
        const Icon = c.icon;
        return (
          <div key={c.label} className="bg-bg-card border border-border-primary rounded-xl p-4 hover:border-border-hover transition-colors">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-text-muted">{c.label}</span>
              <Icon className={`h-3.5 w-3.5 ${c.accent} opacity-60`} />
            </div>
            <p className="text-xl font-bold text-text-primary tracking-tight">{c.value}</p>
            {c.sub && <p className="text-[10px] text-text-muted mt-0.5">{c.sub}</p>}
          </div>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════
//  FILTER BAR
// ═══════════════════════════════════════

function PillBtn({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  const cls = active
    ? 'bg-accent-purple/10 border-accent-purple/30 text-accent-purple'
    : 'bg-bg-primary border-border-primary text-text-secondary hover:border-border-hover';
  return (
    <button onClick={onClick} className={`border rounded-full px-3 py-1 text-[11px] font-medium transition-colors ${cls}`}>
      {label}
    </button>
  );
}

function FilterBar({
  filters, activeStatus, activePriority, activeAssignee, activeProject,
  onStatusChange, onPriorityChange, onAssigneeChange, onProjectChange,
}: {
  filters: FilterOptions;
  activeStatus: string; activePriority: string; activeAssignee: string; activeProject: string;
  onStatusChange: (v: string) => void; onPriorityChange: (v: string) => void;
  onAssigneeChange: (v: string) => void; onProjectChange: (v: string) => void;
}) {
  const any = !!(activeStatus || activePriority || activeAssignee || activeProject);

  return (
    <div className="flex items-center gap-2 mb-4 flex-wrap animate-section">
      <ListFilter className="h-3.5 w-3.5 text-text-muted mr-0.5" />

      {/* Status pills */}
      <PillBtn active={activeStatus === 'pending'} label="Todo" onClick={() => onStatusChange(activeStatus === 'pending' ? '' : 'pending')} />
      <PillBtn active={activeStatus === 'in_progress'} label="In Progress" onClick={() => onStatusChange(activeStatus === 'in_progress' ? '' : 'in_progress')} />
      <PillBtn active={activeStatus === 'completed'} label="Done" onClick={() => onStatusChange(activeStatus === 'completed' ? '' : 'completed')} />

      <span className="w-px h-4 bg-border-primary" />

      {/* Priority pills */}
      <PillBtn active={activePriority === 'high'} label="Urgent" onClick={() => onPriorityChange(activePriority === 'high' ? '' : 'high')} />
      <PillBtn active={activePriority === 'medium'} label="Medium" onClick={() => onPriorityChange(activePriority === 'medium' ? '' : 'medium')} />
      <PillBtn active={activePriority === 'low'} label="Low" onClick={() => onPriorityChange(activePriority === 'low' ? '' : 'low')} />

      {/* Assignee & Project dropdowns */}
      {filters.assignees.length > 0 && (
        <>
          <span className="w-px h-4 bg-border-primary" />
          <select value={activeAssignee} onChange={(e) => onAssigneeChange(e.target.value)}
            className="bg-bg-primary border border-border-primary rounded-full px-3 py-1 text-[11px] text-text-secondary focus:outline-none focus:border-accent-purple cursor-pointer hover:border-border-hover transition-colors">
            <option value="">Assignee</option>
            {filters.assignees.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </>
      )}
      {filters.projects.length > 0 && (
        <select value={activeProject} onChange={(e) => onProjectChange(e.target.value)}
          className="bg-bg-primary border border-border-primary rounded-full px-3 py-1 text-[11px] text-text-secondary focus:outline-none focus:border-accent-purple cursor-pointer hover:border-border-hover transition-colors">
          <option value="">Project</option>
          {filters.projects.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      )}

      {any && (
        <button onClick={() => { onStatusChange(''); onPriorityChange(''); onAssigneeChange(''); onProjectChange(''); }}
          className="text-[11px] text-accent-purple hover:text-accent-hover transition-colors ml-1">
          Clear all
        </button>
      )}
    </div>
  );
}

// ═══════════════════════════════════════
//  PAGINATION
// ═══════════════════════════════════════

function Pagination({ page, totalPages, total, onPageChange }: {
  page: number; totalPages: number; total: number; onPageChange: (p: number) => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between px-4 py-2.5 border-t border-border-primary bg-bg-elevated/20">
      <span className="text-[11px] text-text-muted">{total} task{total !== 1 ? 's' : ''}</span>
      <div className="flex items-center gap-1">
        <button onClick={() => onPageChange(page - 1)} disabled={page <= 1}
          className="p-1 rounded-md hover:bg-bg-elevated disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-text-muted">
          <ChevronLeft className="h-4 w-4" />
        </button>
        {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
          <button key={p} onClick={() => onPageChange(p)}
            className={`min-w-[28px] h-7 rounded-md text-[11px] font-medium transition-colors ${
              p === page ? 'bg-accent-purple text-white' : 'text-text-muted hover:bg-bg-elevated hover:text-text-secondary'
            }`}>
            {p}
          </button>
        ))}
        <button onClick={() => onPageChange(page + 1)} disabled={page >= totalPages}
          className="p-1 rounded-md hover:bg-bg-elevated disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-text-muted">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════
//  LOADING & EMPTY
// ═══════════════════════════════════════

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        {[...Array(4)].map((_, i) => <div key={i} className="bg-bg-card border border-border-primary rounded-xl p-4"><div className="h-3 shimmer rounded w-14 mb-3" /><div className="h-6 shimmer rounded w-10" /></div>)}
      </div>
      <div className="bg-bg-card border border-border-primary rounded-xl overflow-hidden">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3 border-b border-border-primary">
            <div className="h-4 w-4 shimmer rounded-full" />
            <div className="h-3.5 w-3.5 shimmer rounded" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3.5 shimmer rounded max-w-sm" />
              <div className="h-2.5 shimmer rounded max-w-xs" />
            </div>
            <div className="h-5 w-5 shimmer rounded-full hidden sm:block" />
            <div className="h-3 shimmer rounded w-12 hidden sm:block" />
          </div>
        ))}
      </div>
    </div>
  );
}

function EmptyState({ hasFilters }: { hasFilters: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center animate-section">
      <div className="p-4 rounded-2xl bg-bg-card border border-border-primary mb-5">
        {hasFilters ? <AlertCircle className="w-7 h-7 text-text-muted" /> : <CheckSquare className="w-7 h-7 text-text-muted" />}
      </div>
      <p className="text-sm font-medium text-text-primary">{hasFilters ? 'No matching tasks' : 'No tasks yet'}</p>
      <p className="text-xs text-text-muted mt-1.5 max-w-sm leading-relaxed">
        {hasFilters ? 'Adjust filters or clear all to see every task.' : 'Tasks are extracted from synced meetings. Start by syncing a meeting.'}
      </p>
      {!hasFilters && (
        <a href="/dashboard/meetings" className="mt-5 inline-flex items-center gap-2 bg-accent-purple hover:bg-accent-hover text-white rounded-lg px-4 py-2.5 text-sm font-medium transition-colors">
          <Mic className="h-4 w-4" /> Go to Meetings
        </a>
      )}
    </div>
  );
}

// ═══════════════════════════════════════
//  MAIN PAGE
// ═══════════════════════════════════════

export default function TasksPage() {
  const { user: authUser } = useAuth();
  const teamId = authUser?.teamId ?? '';

  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [stats, setStats] = useState<TaskStats>({ total: 0, completed: 0, inProgress: 0, pending: 0, highPriority: 0, deliveryRate: 0 });
  const [filters, setFilters] = useState<FilterOptions>({ projects: [], assignees: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [assigneeFilter, setAssigneeFilter] = useState('');
  const [projectFilter, setProjectFilter] = useState('');
  const hasFilters = !!(statusFilter || priorityFilter || assigneeFilter || projectFilter);

  const handleStatusChange = useCallback((v: string) => { setStatusFilter(v); setPage(1); }, []);
  const handlePriorityChange = useCallback((v: string) => { setPriorityFilter(v); setPage(1); }, []);
  const handleAssigneeChange = useCallback((v: string) => { setAssigneeFilter(v); setPage(1); }, []);
  const handleProjectChange = useCallback((v: string) => { setProjectFilter(v); setPage(1); }, []);
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const fetchTasks = useCallback(async () => {
    if (!teamId) { setLoading(false); return; }
    try {
      const params = new URLSearchParams({ team_id: teamId, limit: String(PAGE_SIZE), page: String(page) });
      if (statusFilter) params.set('status', statusFilter);
      if (priorityFilter) params.set('priority', priorityFilter);
      if (assigneeFilter) params.set('assignee_id', assigneeFilter);
      if (projectFilter) params.set('project', projectFilter);
      const res = await fetch(`/api/dashboard/tasks?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch tasks');
      const data = await res.json();
      setTasks(data.tasks ?? []);
      setTotalCount(data.total ?? 0);
      setStats(data.stats ?? { total: 0, completed: 0, inProgress: 0, pending: 0, highPriority: 0, deliveryRate: 0 });
      setFilters(data.filters ?? { projects: [], assignees: [] });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tasks');
    } finally {
      setLoading(false);
    }
  }, [teamId, page, statusFilter, priorityFilter, assigneeFilter, projectFilter]);

  async function handleUpdate(taskId: string, updates: Record<string, unknown>) {
    try {
      const res = await fetch(`/api/dashboard/tasks/${taskId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ team_id: teamId, ...updates }),
      });
      if (!res.ok) { const d = await res.json(); setError(d.error ?? 'Update failed'); return; }
      setTasks((prev) => prev.map((t) => {
        if (t.id !== taskId) return t;
        const u = { ...t };
        if (updates.status !== undefined) u.status = updates.status as string;
        if (updates.priority !== undefined) u.priority = updates.priority as string;
        if (updates.title !== undefined) u.title = updates.title as string;
        if (updates.description !== undefined) u.description = (updates.description as string) || null;
        if (updates.assignee_id !== undefined) { u.assigneeId = updates.assignee_id as string | null; u.assigneeName = filters.assignees.find((a) => a.id === updates.assignee_id)?.name ?? null; }
        if (updates.deadline !== undefined) u.deadline = updates.deadline as string | null;
        return u;
      }));
      fetchTasks();
    } catch { setError('Update failed'); }
  }

  function handlePageChange(p: number) {
    setPage(p);
    setSelectedId(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // Keyboard navigation
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      if (e.key === 'ArrowDown' || e.key === 'j') {
        e.preventDefault();
        setSelectedId((prev) => {
          const idx = tasks.findIndex((t) => t.id === prev);
          return tasks[idx + 1]?.id ?? prev;
        });
      }
      if (e.key === 'ArrowUp' || e.key === 'k') {
        e.preventDefault();
        setSelectedId((prev) => {
          const idx = tasks.findIndex((t) => t.id === prev);
          return idx > 0 ? tasks[idx - 1].id : prev;
        });
      }
      if (e.key === 'Escape') setSelectedId(null);
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [tasks]);

  const selectedTask = tasks.find((t) => t.id === selectedId) ?? null;
  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  return (
    <div>
      {/* Header */}
      <header className="mb-5 animate-section">
        <div className="flex items-center gap-3 mb-0.5">
          <h1 className="text-2xl font-bold tracking-tight text-text-primary">Tasks</h1>
          {totalCount > 0 && <span className="text-[11px] font-medium text-text-muted bg-bg-elevated border border-border-primary rounded-md px-2 py-0.5">{totalCount}</span>}
        </div>
        <p className="text-sm text-text-muted">Meeting decisions tracked through code delivery</p>
      </header>

      {error && (
        <div className="mb-4 bg-red-500/5 border border-red-500/20 rounded-xl p-3 text-sm flex items-center gap-3">
          <AlertTriangle className="h-4 w-4 shrink-0 text-red-400" /><span className="text-red-300 flex-1">{error}</span>
          <button onClick={() => setError(null)} className="text-red-400/60 hover:text-red-400"><X className="h-4 w-4" /></button>
        </div>
      )}

      {loading && <LoadingSkeleton />}

      {!loading && (
        <>
          {tasks.length > 0 || hasFilters ? (
            <>
              <StatsRow stats={stats} />
              <FilterBar filters={filters} activeStatus={statusFilter} activePriority={priorityFilter} activeAssignee={assigneeFilter} activeProject={projectFilter}
                onStatusChange={handleStatusChange} onPriorityChange={handlePriorityChange} onAssigneeChange={handleAssigneeChange} onProjectChange={handleProjectChange} />

              {tasks.length > 0 ? (
                <div className="animate-section">
                  {/* Split layout: list + detail panel */}
                  <div className="flex gap-0 rounded-xl overflow-hidden border border-border-primary bg-bg-card">
                    {/* Task list */}
                    <div className={`min-w-0 transition-all duration-200 ${selectedTask ? 'flex-1' : 'w-full'}`}>
                      <div className="overflow-y-auto max-h-[calc(100vh-320px)]">
                        {tasks.map((task) => (
                          <TaskListItem
                            key={task.id}
                            task={task}
                            isSelected={selectedId === task.id}
                            onSelect={() => setSelectedId(selectedId === task.id ? null : task.id)}
                            onStatusToggle={() => handleUpdate(task.id, { status: STATUS_FLOW[task.status] ?? 'pending' })}
                          />
                        ))}
                      </div>
                      <Pagination page={page} totalPages={totalPages} total={totalCount} onPageChange={handlePageChange} />
                    </div>

                    {/* Detail side panel */}
                    {selectedTask && (
                      <div className="w-[440px] xl:w-[480px] shrink-0 max-h-[calc(100vh-320px)] overflow-hidden">
                        <TaskDetailPanel
                          task={selectedTask}
                          teamMembers={filters.assignees}
                          onUpdate={handleUpdate}
                          onClose={() => setSelectedId(null)}
                        />
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <EmptyState hasFilters={hasFilters} />
              )}
            </>
          ) : (
            <EmptyState hasFilters={false} />
          )}
        </>
      )}
    </div>
  );
}
