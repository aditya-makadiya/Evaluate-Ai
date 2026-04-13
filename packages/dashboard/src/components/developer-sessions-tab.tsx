'use client';

import Link from 'next/link';
import {
  Bot,
  Clock,
  DollarSign,
  Zap,
  Hash,
  ArrowRight,
} from 'lucide-react';

interface Session {
  id: string;
  model: string | null;
  cost: number | null;
  score: number | null;
  turns: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  startedAt: string;
  firstPrompt: string | null;
}

interface DeveloperSessionsTabProps {
  sessions: Session[];
  stats: {
    totalAiCost: number;
    avgPromptScore: number | null;
    sessionsThisWeek: number;
  };
}

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

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function groupByDate(sessions: Session[]): Record<string, Session[]> {
  const groups: Record<string, Session[]> = {};
  for (const s of sessions) {
    const dateKey = new Date(s.startedAt).toISOString().slice(0, 10);
    if (!groups[dateKey]) groups[dateKey] = [];
    groups[dateKey].push(s);
  }
  return groups;
}

export default function DeveloperSessionsTab({ sessions, stats }: DeveloperSessionsTabProps) {
  const grouped = groupByDate(sessions);
  const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  return (
    <div className="space-y-6">
      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-bg-card border border-border-primary rounded-lg p-5">
          <div className="flex items-center gap-2 mb-2">
            <Bot className="h-4 w-4 text-blue-400" />
            <span className="text-xs text-text-muted uppercase tracking-wider">Sessions</span>
          </div>
          <p className="text-2xl font-bold text-text-primary" title="Total number of AI coding sessions this week">
            {stats.sessionsThisWeek}
          </p>
          <p className="text-xs text-text-muted mt-1">This week</p>
        </div>
        <div className="bg-bg-card border border-border-primary rounded-lg p-5">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="h-4 w-4 text-yellow-400" />
            <span className="text-xs text-text-muted uppercase tracking-wider">Total Cost</span>
          </div>
          <p className="text-2xl font-bold font-mono text-text-primary" title="Combined cost of all AI API calls this week">
            ${stats.totalAiCost.toFixed(2)}
          </p>
          <p className="text-xs text-text-muted mt-1">This week</p>
        </div>
        <div className="bg-bg-card border border-border-primary rounded-lg p-5">
          <div className="flex items-center gap-2 mb-2">
            <Zap className="h-4 w-4 text-[#8b5cf6]" />
            <span className="text-xs text-text-muted uppercase tracking-wider">Avg Score</span>
          </div>
          <p className={`text-2xl font-bold ${stats.avgPromptScore != null ? getScoreColor(stats.avgPromptScore) : 'text-text-muted'}`} title="Average prompt quality score (0-100). Higher means better prompt engineering.">
            {stats.avgPromptScore != null ? stats.avgPromptScore : '--'}
          </p>
          <p className="text-xs text-text-muted mt-1">Prompt quality</p>
        </div>
      </div>

      {/* Sessions grouped by date */}
      {sessions.length === 0 ? (
        <div className="bg-bg-card border border-border-primary rounded-lg p-5">
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Bot className="w-10 h-10 text-text-muted mb-3" />
            <p className="text-sm text-text-secondary">No AI sessions this week</p>
            <p className="text-xs text-text-muted mt-1">Sessions will appear here once the developer uses AI coding tools</p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {sortedDates.map(dateKey => {
            const daySessions = grouped[dateKey];
            const dayTotal = daySessions.reduce((s, sess) => s + (sess.cost ?? 0), 0);
            return (
              <div key={dateKey} className="bg-bg-card border border-border-primary rounded-lg overflow-hidden">
                {/* Date header */}
                <div className="flex items-center justify-between px-5 py-3 border-b border-border-primary bg-bg-elevated/50">
                  <span className="text-xs font-semibold text-text-secondary">
                    {formatDate(daySessions[0].startedAt)}
                  </span>
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] text-text-muted" title="Number of sessions on this day">{daySessions.length} session{daySessions.length !== 1 ? 's' : ''}</span>
                    <span className="text-[10px] font-mono text-text-muted" title="Total AI cost for this day">${dayTotal.toFixed(3)}</span>
                  </div>
                </div>

                {/* Session rows */}
                <div className="divide-y divide-border-primary">
                  {daySessions.map(s => {
                    const totalTokens = (s.inputTokens ?? 0) + (s.outputTokens ?? 0);
                    return (
                      <Link key={s.id} href={`/sessions/${s.id}`}>
                        <div className="flex items-center justify-between px-5 py-3.5 hover:bg-bg-elevated transition-colors cursor-pointer group">
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
                                  <span className="text-[10px] text-text-muted bg-bg-primary px-1.5 py-0.5 rounded" title="AI model used for this session">
                                    {s.model}
                                  </span>
                                )}
                                <span className="flex items-center gap-1 text-[10px] text-text-muted" title="Time the session started">
                                  <Clock className="h-2.5 w-2.5" />
                                  {formatTime(s.startedAt)}
                                </span>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            {s.turns != null && (
                              <span className="text-[10px] text-text-muted" title="Number of prompt-response exchanges in this session">
                                <Hash className="h-2.5 w-2.5 inline mr-0.5" />{s.turns}
                              </span>
                            )}
                            {totalTokens > 0 && (
                              <span className="text-[10px] font-mono text-text-muted" title="Total tokens consumed (input + output)">
                                {formatTokens(totalTokens)}
                              </span>
                            )}
                            {s.score != null && (
                              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${getScoreBadge(s.score)}`} title={`Prompt quality score: ${s.score}/100. ${s.score >= 80 ? 'Excellent' : s.score >= 60 ? 'Good' : s.score >= 40 ? 'Needs work' : 'Poor'}`}>
                                {s.score}
                              </span>
                            )}
                            {s.cost != null && (
                              <span className="text-xs font-mono text-text-muted" title="API cost for this session">
                                ${s.cost.toFixed(3)}
                              </span>
                            )}
                            <ArrowRight className="h-3.5 w-3.5 text-text-muted opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
