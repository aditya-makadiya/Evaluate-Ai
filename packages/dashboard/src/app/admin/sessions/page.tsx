'use client';

import { useState, useEffect, useCallback } from 'react';
import { Activity, Clock, Zap, ChevronLeft, ChevronRight, GitBranch, FileCode } from 'lucide-react';
import { useAdminTeamFilter } from '@/components/admin/admin-team-context';

interface SessionItem {
  id: string;
  teamId: string;
  teamName: string;
  developerName: string;
  tool: string;
  model: string;
  gitRepo: string | null;
  gitBranch: string | null;
  startedAt: string;
  endedAt: string | null;
  durationMin: number | null;
  totalTurns: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCost: number;
  avgScore: number | null;
  efficiencyScore: number | null;
  workSummary: string | null;
  workCategory: string | null;
  workTags: string[] | null;
  toolCalls: number;
  filesChanged: number;
}

interface SessionsData {
  sessions: SessionItem[];
  total: number;
  limit: number;
  offset: number;
}

const CATEGORY_STYLES: Record<string, string> = {
  feature: 'text-green-400 bg-green-900/30',
  debug: 'text-red-400 bg-red-900/30',
  refactor: 'text-blue-400 bg-blue-900/30',
  research: 'text-purple-400 bg-purple-900/30',
  review: 'text-yellow-400 bg-yellow-900/30',
  config: 'text-orange-400 bg-orange-900/30',
  general: 'text-text-muted bg-bg-elevated',
};

function scoreColor(score: number | null): string {
  if (score == null) return 'text-text-muted';
  if (score >= 80) return 'text-emerald-400';
  if (score >= 60) return 'text-blue-400';
  if (score >= 40) return 'text-yellow-400';
  return 'text-red-400';
}

function formatTokens(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
}

export default function AdminSessionsPage() {
  const { teamId } = useAdminTeamFilter();
  const [data, setData] = useState<SessionsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const limit = 30;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (teamId) params.set('teamId', teamId);
      params.set('limit', String(limit));
      params.set('offset', String(page * limit));

      const res = await fetch(`/api/admin/sessions?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to load');
      setData(await res.json());
      setError('');
    } catch {
      setError('Failed to load sessions');
    } finally {
      setLoading(false);
    }
  }, [teamId, page]);

  useEffect(() => {
    setPage(0);
  }, [teamId]);

  useEffect(() => {
    load();
  }, [load]);

  const totalPages = data ? Math.ceil(data.total / limit) : 0;

  if (loading && !data) {
    return (
      <div className="space-y-6">
        <div>
          <div className="h-8 w-40 animate-pulse rounded bg-bg-elevated" />
          <div className="mt-2 h-4 w-64 animate-pulse rounded bg-bg-elevated" />
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-xl border border-border-primary bg-bg-card" />
        ))}
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text-primary">Sessions</h1>
          <p className="mt-1 text-sm text-text-muted">
            All AI sessions across the platform ({data?.total ?? 0} total)
          </p>
        </div>
      </div>

      {/* Session List */}
      <div className="rounded-xl border border-border-primary bg-bg-card overflow-hidden">
        <div className="divide-y divide-border-primary">
          {(data?.sessions ?? []).length === 0 ? (
            <div className="px-5 py-16 text-center">
              <Activity className="mx-auto h-10 w-10 text-text-muted mb-3" />
              <p className="text-sm text-text-secondary">No sessions found</p>
              <p className="text-xs text-text-muted mt-1">Sessions will appear here once developers start using AI tools</p>
            </div>
          ) : (
            (data?.sessions ?? []).map((session) => (
              <div key={session.id}>
                <div
                  className="flex items-center gap-4 px-5 py-3.5 cursor-pointer hover:bg-white/[0.02] transition-colors"
                  onClick={() => setExpandedId(expandedId === session.id ? null : session.id)}
                >
                  {/* Score circle */}
                  <div className={`flex h-10 w-10 items-center justify-center rounded-full border shrink-0 ${
                    session.avgScore != null && session.avgScore >= 80 ? 'border-emerald-500/30 bg-emerald-900/20'
                    : session.avgScore != null && session.avgScore >= 60 ? 'border-blue-500/30 bg-blue-900/20'
                    : session.avgScore != null && session.avgScore >= 40 ? 'border-yellow-500/30 bg-yellow-900/20'
                    : 'border-border-primary bg-bg-elevated'
                  }`}>
                    <span className={`text-xs font-bold ${scoreColor(session.avgScore)}`}>
                      {session.avgScore != null ? Math.round(session.avgScore) : '--'}
                    </span>
                  </div>

                  {/* Main info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-text-primary truncate">
                        {session.workSummary || `${session.model} session`}
                      </p>
                      {session.workCategory && (
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium shrink-0 ${CATEGORY_STYLES[session.workCategory] ?? CATEGORY_STYLES.general}`}>
                          {session.workCategory}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-text-muted">
                      <span>{session.developerName}</span>
                      <span>&middot;</span>
                      <span>{session.teamName}</span>
                      <span>&middot;</span>
                      <span>{session.model}</span>
                    </div>
                  </div>

                  {/* Metrics */}
                  <div className="flex items-center gap-4 shrink-0 text-xs">
                    <div className="text-center">
                      <p className="text-text-muted">Turns</p>
                      <p className="font-medium text-text-primary">{session.totalTurns}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-text-muted">Cost</p>
                      <p className="font-mono font-medium text-text-primary">${(session.totalCost ?? 0).toFixed(4)}</p>
                    </div>
                    {session.durationMin != null && (
                      <div className="text-center">
                        <p className="text-text-muted">Duration</p>
                        <p className="font-medium text-text-primary">{session.durationMin}m</p>
                      </div>
                    )}
                    <div className="text-center">
                      <p className="text-text-muted">Started</p>
                      <p className="text-text-secondary">
                        {new Date(session.startedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Expanded details */}
                {expandedId === session.id && (
                  <div className="px-5 pb-4 pt-1 ml-14 border-l-2 border-border-primary">
                    <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-xs lg:grid-cols-4">
                      <div>
                        <span className="text-text-muted">Input Tokens: </span>
                        <span className="font-mono text-text-secondary">{formatTokens(session.totalInputTokens ?? 0)}</span>
                      </div>
                      <div>
                        <span className="text-text-muted">Output Tokens: </span>
                        <span className="font-mono text-text-secondary">{formatTokens(session.totalOutputTokens ?? 0)}</span>
                      </div>
                      <div>
                        <span className="text-text-muted">Tool Calls: </span>
                        <span className="text-text-secondary">{session.toolCalls ?? 0}</span>
                      </div>
                      <div>
                        <span className="text-text-muted">Files Changed: </span>
                        <span className="text-text-secondary">{session.filesChanged ?? 0}</span>
                      </div>
                      {session.gitRepo && (
                        <div className="flex items-center gap-1">
                          <GitBranch className="h-3 w-3 text-text-muted" />
                          <span className="text-text-secondary truncate">{session.gitRepo}</span>
                          {session.gitBranch && (
                            <span className="text-text-muted">/{session.gitBranch}</span>
                          )}
                        </div>
                      )}
                      <div>
                        <span className="text-text-muted">Efficiency: </span>
                        <span className={scoreColor(session.efficiencyScore)}>
                          {session.efficiencyScore != null ? `${Math.round(session.efficiencyScore)}/100` : 'N/A'}
                        </span>
                      </div>
                      <div>
                        <span className="text-text-muted">Tool: </span>
                        <span className="text-text-secondary">{session.tool ?? 'unknown'}</span>
                      </div>
                      <div>
                        <span className="text-text-muted">Session ID: </span>
                        <span className="font-mono text-text-muted text-[10px]">{session.id.slice(0, 12)}...</span>
                      </div>
                      {session.workTags && session.workTags.length > 0 && (
                        <div className="col-span-2 lg:col-span-4 flex items-center gap-1.5 flex-wrap">
                          <span className="text-text-muted">Tags:</span>
                          {session.workTags.map((tag) => (
                            <span key={tag} className="rounded bg-bg-elevated px-1.5 py-0.5 text-[10px] text-text-secondary">
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-border-primary px-5 py-3">
            <p className="text-xs text-text-muted">
              Page {page + 1} of {totalPages}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(Math.max(0, page - 1))}
                disabled={page === 0}
                className="flex items-center gap-1 rounded-md border border-border-primary px-2.5 py-1 text-xs text-text-secondary hover:bg-bg-elevated disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="h-3 w-3" /> Prev
              </button>
              <button
                onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
                disabled={page >= totalPages - 1}
                className="flex items-center gap-1 rounded-md border border-border-primary px-2.5 py-1 text-xs text-text-secondary hover:bg-bg-elevated disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Next <ChevronRight className="h-3 w-3" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
