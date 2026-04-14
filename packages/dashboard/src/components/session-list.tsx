'use client';

import { useRouter } from 'next/navigation';
import { Clock, ArrowUpRight } from 'lucide-react';

export interface SessionItem {
  id: string;
  task: string;
  turns: number;
  cost: number;
  score: number | null;
  startedAt: string;
  durationMin?: number | null;
}

interface SessionListProps {
  sessions: SessionItem[];
}

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function scoreBadge(score: number | null) {
  if (score === null) {
    return (
      <span className="inline-flex items-center rounded-md bg-white/[0.05] px-2 py-0.5 text-xs font-medium text-text-muted">
        --
      </span>
    );
  }

  let bg: string;
  let text: string;
  if (score >= 80) {
    bg = 'bg-emerald-500/10';
    text = 'text-emerald-400';
  } else if (score >= 60) {
    bg = 'bg-blue-500/10';
    text = 'text-blue-400';
  } else if (score >= 40) {
    bg = 'bg-yellow-500/10';
    text = 'text-yellow-400';
  } else {
    bg = 'bg-red-500/10';
    text = 'text-red-400';
  }

  return (
    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold tabular-nums ${bg} ${text}`}>
      {Math.round(score)}
    </span>
  );
}

function intentBadge(task: string) {
  const lower = task.toLowerCase();
  let intent = 'general';
  let color = 'bg-accent-purple/10 text-[#a78bfa]';

  if (lower.includes('fix') || lower.includes('bug') || lower.includes('debug')) {
    intent = 'fix';
    color = 'bg-red-500/10 text-red-400';
  } else if (lower.includes('refactor') || lower.includes('clean')) {
    intent = 'refactor';
    color = 'bg-cyan-500/10 text-cyan-400';
  } else if (lower.includes('test') || lower.includes('spec')) {
    intent = 'test';
    color = 'bg-yellow-500/10 text-yellow-400';
  } else if (lower.includes('add') || lower.includes('create') || lower.includes('implement') || lower.includes('build')) {
    intent = 'feature';
    color = 'bg-emerald-500/10 text-emerald-400';
  } else if (lower.includes('explain') || lower.includes('what') || lower.includes('how') || lower.includes('why')) {
    intent = 'question';
    color = 'bg-blue-500/10 text-blue-400';
  }

  return (
    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${color}`}>
      {intent}
    </span>
  );
}

export function SessionList({ sessions }: SessionListProps) {
  const router = useRouter();

  if (sessions.length === 0) {
    return (
      <div className="card">
        <h3 className="mb-4 text-sm font-medium text-text-primary">Recent Sessions</h3>
        <div className="flex flex-col items-center py-8 text-center">
          <p className="text-sm text-text-muted">No sessions recorded yet.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-medium text-text-primary">Recent Sessions</h3>
        <button
          onClick={() => router.push('/sessions')}
          className="flex items-center gap-1 text-xs font-medium text-text-muted transition-colors hover:text-accent-purple"
        >
          View all
          <ArrowUpRight className="h-3 w-3" />
        </button>
      </div>
      <div className="overflow-x-auto -mx-5">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border-primary text-left text-[10px] font-semibold uppercase tracking-wider text-text-muted">
              <th className="pb-3 pl-5 pr-4">Task</th>
              <th className="pb-3 pr-4">Intent</th>
              <th className="pb-3 pr-4">Turns</th>
              <th className="pb-3 pr-4">Cost</th>
              <th className="pb-3 pr-4">Score</th>
              <th className="pb-3 pr-5">Time</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((s) => (
              <tr
                key={s.id}
                onClick={() => router.push(`/sessions/${s.id}`)}
                className="group cursor-pointer border-b border-border-primary/50 transition-colors last:border-0 hover:bg-white/[0.02]"
              >
                <td className="max-w-[260px] truncate py-3 pl-5 pr-4 text-text-primary group-hover:text-accent-purple transition-colors">
                  {s.task}
                </td>
                <td className="py-3 pr-4">
                  {intentBadge(s.task)}
                </td>
                <td className="py-3 pr-4 tabular-nums text-text-muted">{s.turns}</td>
                <td className="py-3 pr-4 tabular-nums text-text-primary">
                  ${s.cost.toFixed(2)}
                </td>
                <td className="py-3 pr-4">
                  {scoreBadge(s.score)}
                </td>
                <td className="py-3 pr-5 text-text-muted">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {timeAgo(s.startedAt)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
