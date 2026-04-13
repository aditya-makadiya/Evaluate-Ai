'use client';

import { useState } from 'react';
import {
  X,
  Calendar,
  Clock,
  Users,
  CheckCircle2,
  Folder,
  GitCommit,
  User,
  Circle,
  CircleDot,
  SignalHigh,
  SignalMedium,
  SignalLow,
  TrendingUp,
} from 'lucide-react';

// ═══════════════════════════════════════
//  TYPES
// ═══════════════════════════════════════

export interface TaskItem {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  deadline: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  project: string | null;
  matchedChanges: string[];
  alignmentScore: number | null;
  createdAt: string;
}

export interface MeetingStats {
  totalTasks: number;
  completedTasks: number;
  inProgressTasks: number;
  pendingTasks: number;
  deliveryRate: number;
}

export interface Meeting {
  id: string;
  externalId: string | null;
  title: string;
  date: string;
  durationMinutes: number | null;
  participants: Array<{ name: string; member_id: string | null }> | null;
  summary: string | null;
  keywords: string[];
  source: string;
  actionItemsCount: number;
  createdAt: string;
  tasks: TaskItem[];
  stats: MeetingStats;
}

export interface OverallStats {
  totalMeetings: number;
  totalTasks: number;
  completedTasks: number;
  deliveryRate: number;
}

// ═══════════════════════════════════════
//  CONSTANTS
// ═══════════════════════════════════════

const STATUS_META: Record<string, { color: string; label: string; icon: typeof Circle }> = {
  completed: { color: 'text-emerald-400', label: 'Done', icon: CheckCircle2 },
  in_progress: { color: 'text-sky-400', label: 'In Progress', icon: CircleDot },
  pending: { color: 'text-text-muted', label: 'Todo', icon: Circle },
};

const PRIORITY_META: Record<string, { color: string; icon: typeof SignalHigh }> = {
  high: { color: 'text-orange-400', icon: SignalHigh },
  medium: { color: 'text-amber-400', icon: SignalMedium },
  low: { color: 'text-text-muted', icon: SignalLow },
};

export const STATUS_FLOW: Record<string, string> = {
  pending: 'in_progress',
  in_progress: 'completed',
  completed: 'pending',
};

// ═══════════════════════════════════════
//  TASK ROW (inside meeting panel)
// ═══════════════════════════════════════

function PanelTaskRow({ task, teamId, onTaskUpdated }: { task: TaskItem; teamId: string; onTaskUpdated: () => void }) {
  const [updating, setUpdating] = useState(false);
  const meta = STATUS_META[task.status] ?? STATUS_META.pending;
  const pMeta = PRIORITY_META[task.priority] ?? PRIORITY_META.medium;
  const StatusIcon = meta.icon;
  const PriorityIcon = pMeta.icon;
  const done = task.status === 'completed';
  const nextStatus = STATUS_FLOW[task.status] ?? 'pending';

  async function handleStatusClick(e: React.MouseEvent) {
    e.stopPropagation();
    setUpdating(true);
    try {
      const res = await fetch(`/api/dashboard/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ team_id: teamId, status: nextStatus }),
      });
      if (res.ok) onTaskUpdated();
    } catch { /* ignore */ }
    setUpdating(false);
  }

  return (
    <div className={`flex items-center gap-2.5 py-2 px-3 rounded-lg hover:bg-bg-elevated/40 transition-colors ${updating ? 'opacity-50' : ''}`}>
      <button onClick={handleStatusClick} disabled={updating} className={`shrink-0 transition-colors hover:scale-110 ${meta.color}`}
        title={`Mark as ${STATUS_META[nextStatus]?.label}`}>
        <StatusIcon className="h-3.5 w-3.5" />
      </button>
      <PriorityIcon className={`h-3 w-3 shrink-0 ${pMeta.color}`} />
      <span className={`flex-1 text-xs truncate ${done ? 'line-through text-text-muted' : 'text-text-primary'}`}>
        {task.title}
      </span>
      <div className="flex items-center gap-2 shrink-0">
        {task.project && (
          <span className="hidden sm:inline-flex items-center gap-1 text-[9px] text-sky-400/80 font-medium">
            <Folder className="h-2.5 w-2.5 opacity-60" />{task.project}
          </span>
        )}
        {task.matchedChanges.length > 0 && (
          <span className="inline-flex items-center gap-0.5 text-[9px] text-emerald-400 font-medium">
            <GitCommit className="h-2.5 w-2.5" />{task.matchedChanges.length}
          </span>
        )}
        {task.assigneeName ? (
          <span className="h-4 w-4 rounded-full bg-accent-purple/15 border border-accent-purple/25 flex items-center justify-center text-[8px] font-bold text-accent-purple" title={task.assigneeName}>
            {task.assigneeName.charAt(0).toUpperCase()}
          </span>
        ) : (
          <span className="h-4 w-4 rounded-full bg-bg-elevated border border-border-primary flex items-center justify-center opacity-40">
            <User className="h-2 w-2 text-text-muted" />
          </span>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════
//  DETAIL PANEL
// ═══════════════════════════════════════

interface Props {
  meeting: Meeting;
  teamId: string;
  onTaskUpdated: () => void;
  onClose: () => void;
}

export default function MeetingDetailPanel({ meeting, teamId, onTaskUpdated, onClose }: Props) {
  const participantCount = meeting.participants?.length ?? 0;
  const deliveryColor = meeting.stats.deliveryRate >= 70 ? 'text-emerald-400' : meeting.stats.deliveryRate >= 40 ? 'text-amber-400' : 'text-red-400';
  const deliveryBg = meeting.stats.deliveryRate >= 70 ? 'bg-emerald-500/10' : meeting.stats.deliveryRate >= 40 ? 'bg-amber-500/10' : 'bg-red-500/10';

  return (
    <div className="h-full flex flex-col bg-bg-card border-l border-border-primary">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-border-primary shrink-0">
        <span className="text-[9px] font-semibold uppercase tracking-wider text-accent-purple bg-accent-purple/10 rounded px-1.5 py-0.5">
          {meeting.source}
        </span>
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-bg-elevated transition-colors text-text-muted hover:text-text-primary">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-5 pt-5 pb-6 space-y-5">
          {/* Title */}
          <h2 className="text-base font-semibold text-text-primary leading-snug">{meeting.title}</h2>

          {/* Meta row */}
          <div className="flex items-center gap-4 text-[11px] text-text-muted">
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3 opacity-60" />
              {new Date(meeting.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
            </span>
            {meeting.durationMinutes && (
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3 opacity-60" />{meeting.durationMinutes}m
              </span>
            )}
            <span className="flex items-center gap-1">
              <Users className="h-3 w-3 opacity-60" />{participantCount}
            </span>
          </div>

          {/* Delivery stat */}
          {meeting.stats.totalTasks > 0 && (
            <div className={`flex items-center gap-3 px-3 py-2.5 rounded-lg ${deliveryBg}`}>
              <TrendingUp className={`h-4 w-4 ${deliveryColor}`} />
              <div>
                <span className={`text-sm font-bold ${deliveryColor}`}>{meeting.stats.deliveryRate}%</span>
                <span className="text-[11px] text-text-muted ml-1.5">{meeting.stats.completedTasks}/{meeting.stats.totalTasks} tasks delivered</span>
              </div>
            </div>
          )}

          {/* Summary */}
          {meeting.summary && (
            <div className="border-t border-border-primary pt-4">
              <h3 className="text-[10px] font-semibold uppercase tracking-widest text-text-muted mb-2">Summary</h3>
              <p className="text-sm text-text-secondary leading-relaxed whitespace-pre-line">{meeting.summary}</p>
            </div>
          )}

          {/* Keywords */}
          {meeting.keywords?.length > 0 && (
            <div>
              <h3 className="text-[10px] font-semibold uppercase tracking-widest text-text-muted mb-2">Topics</h3>
              <div className="flex flex-wrap gap-1.5">
                {meeting.keywords.map((kw, i) => (
                  <span key={i} className="text-[10px] font-medium text-sky-400/80 bg-sky-500/8 border border-sky-500/15 rounded-md px-2 py-0.5">{kw}</span>
                ))}
              </div>
            </div>
          )}

          {/* Participants */}
          {meeting.participants && meeting.participants.length > 0 && (
            <div>
              <h3 className="text-[10px] font-semibold uppercase tracking-widest text-text-muted mb-2">Participants</h3>
              <div className="flex flex-wrap gap-1.5">
                {meeting.participants.map((p, i) => {
                  const isMember = !!p.member_id;
                  const cls = isMember
                    ? 'text-accent-purple bg-accent-purple/8 border-accent-purple/15'
                    : 'text-text-muted bg-bg-elevated border-border-primary';
                  return (
                    <span key={i} className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-medium border ${cls}`}>
                      {isMember && (
                        <span className="h-3.5 w-3.5 rounded-full bg-accent-purple/15 flex items-center justify-center text-[7px] font-bold">
                          {p.name.charAt(0).toUpperCase()}
                        </span>
                      )}
                      {p.name}
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {/* Action Items */}
          <div className="border-t border-border-primary pt-4">
            <h3 className="text-[10px] font-semibold uppercase tracking-widest text-text-muted mb-3 flex items-center gap-2">
              Action Items
              {meeting.tasks.length > 0 && (
                <span className="bg-accent-purple/10 text-accent-purple text-[9px] font-bold rounded px-1.5 py-0.5 normal-case tracking-normal">
                  {meeting.tasks.length}
                </span>
              )}
            </h3>
            {meeting.tasks.length > 0 ? (
              <div className="space-y-0.5">
                {meeting.tasks.map((task) => (
                  <PanelTaskRow key={task.id} task={task} teamId={teamId} onTaskUpdated={onTaskUpdated} />
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-2 py-3 px-3 rounded-lg border border-dashed border-border-primary">
                <CheckCircle2 className="h-3.5 w-3.5 text-text-muted opacity-40" />
                <span className="text-xs text-text-muted">No action items extracted</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
