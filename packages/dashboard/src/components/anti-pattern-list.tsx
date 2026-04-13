'use client';

import { useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react';

interface AntiPatternListProps {
  patterns: { pattern: string; count: number }[];
}

type Severity = 'high' | 'medium' | 'low';

function getSeverity(pattern: string): Severity {
  const lower = pattern.toLowerCase();
  if (
    lower.includes('vague') ||
    lower.includes('no context') ||
    lower.includes('too broad') ||
    lower.includes('lazy')
  ) {
    return 'high';
  }
  if (
    lower.includes('retry') ||
    lower.includes('repeat') ||
    lower.includes('redundant') ||
    lower.includes('long')
  ) {
    return 'medium';
  }
  return 'low';
}

const severityConfig: Record<Severity, { dot: string; bg: string; label: string; hint: string }> = {
  high: {
    dot: 'bg-red-500',
    bg: 'bg-red-500/10',
    label: 'High',
    hint: 'Add specific context and constraints to your prompts. Include file names, function names, and desired output format.',
  },
  medium: {
    dot: 'bg-yellow-500',
    bg: 'bg-yellow-500/10',
    label: 'Medium',
    hint: 'Break complex requests into smaller steps. Review AI output before requesting changes.',
  },
  low: {
    dot: 'bg-blue-500',
    bg: 'bg-blue-500/10',
    label: 'Low',
    hint: 'Minor improvement opportunity. Consider structuring prompts with clear sections.',
  },
};

interface PatternRowProps {
  pattern: string;
  count: number;
  rank: number;
}

function PatternRow({ pattern, count, rank }: PatternRowProps) {
  const [expanded, setExpanded] = useState(false);
  const severity = getSeverity(pattern);
  const config = severityConfig[severity];

  return (
    <li>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-white/[0.03]"
      >
        <span className="text-xs font-medium text-text-muted w-4 text-right tabular-nums">
          {rank}
        </span>
        <span className={`h-2 w-2 shrink-0 rounded-full ${config.dot}`} />
        <span className="min-w-0 flex-1 truncate text-sm text-text-primary">
          {pattern}
        </span>
        <span
          className={`shrink-0 rounded-md px-2 py-0.5 text-[10px] font-semibold tabular-nums ${config.bg} text-text-secondary`}
        >
          {count}
        </span>
        {expanded ? (
          <ChevronDown className="h-3 w-3 shrink-0 text-text-muted" />
        ) : (
          <ChevronRight className="h-3 w-3 shrink-0 text-text-muted" />
        )}
      </button>
      {expanded && (
        <div className="ml-[52px] mr-3 mb-1 rounded-md bg-white/[0.02] border border-border-primary px-3 py-2 text-xs text-text-secondary leading-relaxed">
          <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${config.bg} ${severity === 'high' ? 'text-red-400' : severity === 'medium' ? 'text-yellow-400' : 'text-blue-400'} mr-2 mb-1`}>
            {config.label} severity
          </span>
          {config.hint}
        </div>
      )}
    </li>
  );
}

export function AntiPatternList({ patterns }: AntiPatternListProps) {
  const sorted = [...patterns].sort((a, b) => b.count - a.count);

  return (
    <div className="card">
      <div className="mb-4 flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-score-warning" />
        <h3 className="text-sm font-medium text-text-primary">Top Issues</h3>
      </div>
      {sorted.length === 0 ? (
        <div className="flex flex-col items-center py-8 text-center">
          <p className="text-sm text-text-muted">No anti-patterns detected yet.</p>
          <p className="mt-1 text-xs text-text-muted">
            Great job, or just getting started!
          </p>
        </div>
      ) : (
        <ul className="space-y-0.5">
          {sorted.map((item, i) => (
            <PatternRow
              key={item.pattern}
              pattern={item.pattern}
              count={item.count}
              rank={i + 1}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
