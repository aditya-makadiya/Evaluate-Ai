'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import {
  Bot,
  Clock,
  DollarSign,
  Zap,
  Hash,
  ArrowRight,
  Loader2,
  ChevronDown,
  Timer,
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
  endedAt: string | null;
  durationMin: number | null;
  firstPrompt: string | null;
  workSummary: string | null;
  workTags: string[];
  workCategory: string | null;
}

const DAY_FILTERS = [
  { label: '7 days', value: 7 },
  { label: '14 days', value: 14 },
  { label: '30 days', value: 30 },
  { label: 'All time', value: 0 },
] as const;

const PAGE_SIZE = 20;

interface DeveloperSessionsTabProps {
  developerId: string;
  initialSessions: Session[];
  initialTotal: number;
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

function formatDuration(minutes: number | null): string | null {
  if (minutes == null || minutes < 0) return null;
  if (minutes < 1) return '<1m';
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
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

export default function DeveloperSessionsTab({ developerId, initialSessions, initialTotal, stats }: DeveloperSessionsTabProps) {
  const [sessions, setSessions] = useState<Session[]>(initialSessions);
  const [totalCount, setTotalCount] = useState(initialTotal);
  const [selectedDays, setSelectedDays] = useState(7);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const hasMore = sessions.length < totalCount;

  const fetchSessions = useCallback(async (days: number, offset: number, append: boolean) => {
    if (append) setLoadingMore(true); else setLoading(true);
    try {
      const params = new URLSearchParams({
        sessionDays: String(days),
        sessionLimit: String(PAGE_SIZE),
        sessionOffset: String(offset),
      });
      const res = await fetch(`/api/dashboard/developers/${developerId}?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (append) {
        setSessions(prev => [...prev, ...json.sessions]);
      } else {
        setSessions(json.sessions);
      }
      setTotalCount(json.sessionTotal);
    } catch (err) {
      console.error('Failed to fetch sessions:', err);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [developerId]);

  const handleFilterChange = (days: number) => {
    setSelectedDays(days);
    fetchSessions(days, 0, false);
  };

  const handleLoadMore = () => {
    fetchSessions(selectedDays, sessions.length, true);
  };

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

      {/* Filter bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 bg-bg-card border border-border-primary rounded-lg p-1">
          {DAY_FILTERS.map(f => (
            <button
              key={f.value}
              onClick={() => handleFilterChange(f.value)}
              disabled={loading}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                selectedDays === f.value
                  ? 'bg-purple-600 text-white'
                  : 'text-text-muted hover:text-text-primary hover:bg-bg-elevated'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <span className="text-xs text-text-muted">
          {totalCount} session{totalCount !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 text-text-muted animate-spin" />
        </div>
      )}

      {/* Sessions grouped by date */}
      {!loading && sessions.length === 0 && (
        <div className="bg-bg-card border border-border-primary rounded-lg p-5">
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Bot className="w-10 h-10 text-text-muted mb-3" />
            <p className="text-sm text-text-secondary">No AI sessions found</p>
            <p className="text-xs text-text-muted mt-1">
              {selectedDays > 0
                ? `No sessions in the last ${selectedDays} days`
                : 'Sessions will appear here once the developer uses AI coding tools'}
            </p>
          </div>
        </div>
      )}

      {!loading && sessions.length > 0 && (
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
                              <p className="text-sm text-text-primary truncate" title={s.workSummary ?? s.firstPrompt ?? `Session ${s.id}`}>
                                {s.workSummary
                                  ? s.workSummary.slice(0, 90)
                                  : s.firstPrompt
                                    ? s.firstPrompt.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, 70) || `Session ${s.id.slice(0, 8)}`
                                    : `Session ${s.id.slice(0, 8)}`}
                              </p>
                              {s.workTags && s.workTags.length > 0 && (
                                <div className="flex items-center gap-1 mt-0.5">
                                  {s.workTags.slice(0, 3).map((tag) => (
                                    <span key={tag} className="text-[9px] px-1 py-px rounded bg-purple-900/20 text-purple-400">
                                      {tag}
                                    </span>
                                  ))}
                                </div>
                              )}
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
                            {formatDuration(s.durationMin) && (
                              <span className="text-[10px] text-text-muted" title="Session duration">
                                <Timer className="h-2.5 w-2.5 inline mr-0.5" />{formatDuration(s.durationMin)}
                              </span>
                            )}
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

          {/* Load more button */}
          {hasMore && (
            <div className="flex justify-center pt-2">
              <button
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-text-secondary bg-bg-card border border-border-primary rounded-lg hover:bg-bg-elevated hover:border-border-hover transition-colors disabled:opacity-50"
              >
                {loadingMore ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
                Load more ({totalCount - sessions.length} remaining)
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
