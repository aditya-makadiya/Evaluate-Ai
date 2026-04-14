'use client';

import {
  AlertTriangle,
  Folder,
  User,
  GitCommit,
  Bot,
} from 'lucide-react';
import { type TaskItem, STATUS_META, PRIORITY_META, STATUS_FLOW } from './task-detail-panel';

function relativeDate(d: string): string {
  const date = new Date(d);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

interface Props {
  task: TaskItem;
  isSelected: boolean;
  onSelect: () => void;
  onStatusToggle: () => void;
}

export default function TaskListItem({ task, isSelected, onSelect, onStatusToggle }: Props) {
  const meta = STATUS_META[task.status] ?? STATUS_META.pending;
  const pMeta = PRIORITY_META[task.priority] ?? PRIORITY_META.medium;
  const StatusIcon = meta.icon;
  const PriorityIcon = pMeta.icon;
  const done = task.status === 'completed';
  const overdue = task.deadline && new Date(task.deadline) < new Date() && !done;

  return (
    <div
      onClick={onSelect}
      className={`group flex items-center gap-3 px-4 py-2.5 cursor-pointer border-b border-border-primary transition-colors ${
        isSelected
          ? 'bg-accent-purple/5 border-l-2 border-l-accent-purple'
          : 'border-l-2 border-l-transparent hover:bg-bg-elevated/40'
      }`}
    >
      {/* Status icon */}
      <button
        onClick={(e) => { e.stopPropagation(); onStatusToggle(); }}
        className={`shrink-0 transition-colors hover:scale-110 ${meta.color}`}
        title={`Mark as ${STATUS_META[STATUS_FLOW[task.status] ?? 'pending']?.label}`}
      >
        <StatusIcon className="h-4 w-4" />
      </button>

      {/* Priority icon */}
      <span title={pMeta.label}>
        <PriorityIcon className={`h-3.5 w-3.5 shrink-0 ${pMeta.color}`} />
      </span>

      {/* Title + description */}
      <div className="flex-1 min-w-0">
        <span className={`text-[13px] block truncate leading-snug ${done ? 'line-through text-text-muted' : 'text-text-primary'}`}>
          {task.title}
        </span>
        {task.description && (
          <span className="text-[11px] text-text-muted block truncate mt-0.5 max-w-lg">
            {task.description}
          </span>
        )}
      </div>

      {/* Right-side metadata */}
      <div className="flex items-center gap-2.5 shrink-0">
        {task.project && (
          <span className="hidden lg:inline-flex items-center gap-1 text-[10px] text-sky-400/80 font-medium max-w-[100px] truncate">
            <Folder className="h-3 w-3 shrink-0 opacity-60" />{task.project}
          </span>
        )}
        {overdue && (
          <span className="hidden sm:inline-flex items-center gap-0.5 text-[10px] text-red-400 font-medium">
            <AlertTriangle className="h-3 w-3" />Overdue
          </span>
        )}
        {task.deadline && !overdue && (
          <span className="hidden sm:inline text-[10px] text-text-muted">
            {new Date(task.deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </span>
        )}
        {task.aiCost > 0 && (
          <span className="hidden sm:inline-flex items-center gap-0.5 text-[10px] text-yellow-400 font-mono font-medium" title="AI cost for this task">
            <Bot className="h-3 w-3" />${task.aiCost.toFixed(2)}
          </span>
        )}
        {task.matchedChanges.length > 0 && (
          <span className="hidden sm:inline-flex items-center gap-0.5 text-[10px] text-emerald-400 font-medium">
            <GitCommit className="h-3 w-3" />{task.matchedChanges.length}
          </span>
        )}
        {task.assigneeName ? (
          <span className="h-5 w-5 rounded-full bg-accent-purple/15 border border-accent-purple/25 flex items-center justify-center text-[9px] font-bold text-accent-purple" title={task.assigneeName}>
            {task.assigneeName.charAt(0).toUpperCase()}
          </span>
        ) : (
          <span className="h-5 w-5 rounded-full bg-bg-elevated border border-border-primary flex items-center justify-center opacity-40">
            <User className="h-2.5 w-2.5 text-text-muted" />
          </span>
        )}
        <span className="hidden sm:inline text-[10px] text-text-muted w-14 text-right">{relativeDate(task.createdAt)}</span>
      </div>
    </div>
  );
}
