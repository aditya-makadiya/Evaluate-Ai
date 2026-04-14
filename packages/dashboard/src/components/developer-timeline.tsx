'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/components/auth-provider';
import {
  Bot,
  GitCommit,
  GitPullRequest,
  GitMerge,
  Eye,
  CheckCircle2,
  Calendar,
  Activity,
  Loader2,
} from 'lucide-react';

interface TimelineEvent {
  id: string;
  eventType: string;
  title: string;
  description: string;
  developerName: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

interface DeveloperTimelineProps {
  developerId: string;
}

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'ai', label: 'AI' },
  { key: 'code', label: 'Code' },
  { key: 'meeting', label: 'Meetings' },
  { key: 'task', label: 'Tasks' },
];

const EVENT_ICONS: Record<string, typeof Bot> = {
  ai_prompt: Bot,
  ai_response: Bot,
  ai_session: Bot,
  ai_session_start: Bot,
  ai_session_end: Bot,
  commit: GitCommit,
  pr_opened: GitPullRequest,
  pr_merged: GitMerge,
  review: Eye,
  task_completed: CheckCircle2,
  task_assigned: CheckCircle2,
  meeting: Calendar,
};

const EVENT_EMOJIS: Record<string, string> = {
  ai_prompt: '\u{1F916}',
  ai_response: '\u{1F916}',
  ai_session: '\u{1F916}',
  ai_session_start: '\u{1F916}',
  ai_session_end: '\u{1F916}',
  commit: '\u{1F4BB}',
  pr_opened: '\u{1F500}',
  pr_merged: '\u{1F500}',
  review: '\u{1F440}',
  task_completed: '\u2705',
  task_assigned: '\u2705',
  meeting: '\u{1F5D3}\uFE0F',
};

function getScoreBadge(score: number): string {
  if (score >= 80) return 'bg-emerald-900/30 text-emerald-400';
  if (score >= 60) return 'bg-blue-900/30 text-blue-400';
  if (score >= 40) return 'bg-yellow-900/30 text-yellow-400';
  return 'bg-red-900/30 text-red-400';
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const yesterday = new Date(now.getTime() - 86400000).toISOString().slice(0, 10);
  const ds = dateStr.slice(0, 10);
  if (ds === today) return 'Today';
  if (ds === yesterday) return 'Yesterday';
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function TimelineEventItem({ event }: { event: TimelineEvent }) {
  const EventIcon = EVENT_ICONS[event.eventType] ?? Activity;
  const emoji = EVENT_EMOJIS[event.eventType] ?? '';
  const meta = event.metadata ?? {};

  const sessionId = meta.session_id as string | undefined;
  const totalTurns = meta.total_turns as number | undefined;
  const cost = (meta.total_cost_usd ?? meta.cost) as number | undefined;
  const model = meta.model as string | undefined;
  const score = (meta.avg_prompt_score ?? meta.score) as number | undefined;
  const repo = (meta.repo ?? meta.git_repo) as string | undefined;
  const branch = meta.git_branch as string | undefined;
  const filesChanged = meta.files_changed as number | undefined;
  const projectDir = meta.project_dir as string | undefined;
  const sha = meta.sha as string | undefined;

  const workSummary = meta.work_summary as string | undefined;
  const workTags = meta.work_tags as string[] | undefined;

  const isSessionEnd = event.eventType === 'ai_session_end';
  const isSessionStart = event.eventType === 'ai_session_start';
  const isCommit = event.eventType === 'commit';

  // Extract project name from dir or description
  const projectName = projectDir
    ? projectDir.split('/').pop()
    : isSessionStart && event.description
      ? event.description.replace('Claude Code session in ', '')
      : null;

  const shortModel = model
    ? model.replace('claude-', '').replace(/-20\d{6}/, '')
    : null;

  // Dot color by event type
  const dotColor = isSessionEnd
    ? 'bg-[#8b5cf6]'
    : isCommit
      ? 'bg-emerald-400'
      : 'bg-border-hover';

  return (
    <div className="relative pl-6 pr-3 py-2.5 hover:bg-bg-elevated rounded-md transition-colors -ml-px">
      <div className={`absolute left-[-5px] top-4 h-2 w-2 rounded-full ${dotColor}`} />

      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-bg-elevated">
          <EventIcon className="h-3.5 w-3.5 text-text-muted" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-muted">{formatTime(event.createdAt)}</span>
            <span className="text-xs">{emoji}</span>
          </div>

          {/* Session completed — rich card */}
          {isSessionEnd && (
            <>
              {workSummary ? (
                <p className="text-sm text-text-primary mt-0.5 leading-relaxed">{workSummary}</p>
              ) : (
                <p className="text-sm text-text-primary mt-0.5">
                  AI session completed
                  {projectName && (
                    <span className="text-text-muted font-normal"> in {projectName}</span>
                  )}
                </p>
              )}
              {workTags && workTags.length > 0 && (
                <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                  {workTags.slice(0, 5).map((tag) => (
                    <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-purple-900/20 text-purple-400">
                      {tag}
                    </span>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                {totalTurns != null && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-bg-elevated text-text-secondary">
                    {totalTurns} turns
                  </span>
                )}
                {cost != null && cost > 0 && (
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-bg-elevated text-text-secondary">
                    ${cost.toFixed(2)}
                  </span>
                )}
                {shortModel && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-bg-elevated text-text-secondary">
                    {shortModel}
                  </span>
                )}
                {score != null && (
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${getScoreBadge(score)}`}>
                    Score: {Math.round(score)}
                  </span>
                )}
                {branch && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-bg-elevated text-text-secondary font-mono">
                    {branch}
                  </span>
                )}
              </div>
              {sessionId && (
                <Link
                  href={`/sessions/${sessionId}`}
                  className="inline-block mt-1.5 text-[11px] text-[#8b5cf6] hover:underline"
                >
                  View session details
                </Link>
              )}
            </>
          )}

          {/* Session started — compact */}
          {isSessionStart && (
            <p className="text-sm text-text-primary mt-0.5">
              AI session started
              {projectName && (
                <span className="text-text-muted font-normal"> in {projectName}</span>
              )}
              {branch && (
                <span className="text-text-muted font-normal font-mono text-xs"> ({branch})</span>
              )}
            </p>
          )}

          {/* Commit — show title + repo + GitHub link */}
          {isCommit && (
            <>
              <p className="text-sm text-text-primary mt-0.5">{event.title}</p>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                {repo && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-bg-elevated text-text-secondary">
                    {repo}
                  </span>
                )}
                {filesChanged != null && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-bg-elevated text-text-secondary">
                    {filesChanged} files
                  </span>
                )}
                {repo && sha && (
                  <a
                    href={`https://github.com/${repo}/commit/${sha}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] text-[#8b5cf6] hover:underline"
                  >
                    {sha.slice(0, 7)}
                  </a>
                )}
              </div>
            </>
          )}

          {/* Other events — generic */}
          {!isSessionEnd && !isSessionStart && !isCommit && (
            <>
              <p className="text-sm text-text-primary mt-0.5">{event.title}</p>
              {event.description && (
                <p className="text-xs text-text-muted mt-0.5 line-clamp-2">{event.description}</p>
              )}
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                {repo && (
                  <span className="text-[10px] text-text-muted">{repo}</span>
                )}
                {filesChanged != null && (
                  <span className="text-[10px] text-text-muted">{filesChanged} files</span>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function DeveloperTimeline({ developerId }: DeveloperTimelineProps) {
  const { user: authUser } = useAuth();
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('all');
  const [offset, setOffset] = useState(0);
  const pageSize = 20;

  const fetchEvents = useCallback((filterType: string, startOffset: number, append: boolean) => {
    if (!authUser) return;
    const filterParam = filterType === 'all' ? '' : `&type=${filterType}`;
    const url = `/api/dashboard/developers/${developerId}/timeline?limit=${pageSize}&offset=${startOffset}${filterParam}`;

    fetch(url)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(json => {
        if (append) {
          setEvents(prev => [...prev, ...json.events]);
        } else {
          setEvents(json.events);
        }
        setTotal(json.total);
        setLoading(false);
        setLoadingMore(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
        setLoadingMore(false);
      });
  }, [developerId, authUser]);

  useEffect(() => {
    fetchEvents(filter, 0, false);
  }, [filter, fetchEvents]);

  const handleLoadMore = () => {
    const newOffset = offset + pageSize;
    setOffset(newOffset);
    setLoadingMore(true);
    fetchEvents(filter, newOffset, true);
  };

  const hasMore = events.length < total;

  // Consolidate: merge adjacent session_start + session_end with same session_id
  const consolidated: TimelineEvent[] = [];
  const usedIds = new Set<string>();

  for (let i = 0; i < events.length; i++) {
    if (usedIds.has(events[i].id)) continue;
    const ev = events[i];

    // If this is a session_end, look for the matching session_start nearby
    if (ev.eventType === 'ai_session_end') {
      const endMeta = ev.metadata ?? {};
      const sid = endMeta.session_id as string | undefined;
      if (sid) {
        // Find matching start within next 5 events
        const startIdx = events.findIndex(
          (e, j) => j > i && !usedIds.has(e.id) && e.eventType === 'ai_session_start'
            && (e.metadata as Record<string, unknown> | null)?.session_id === sid
        );
        if (startIdx !== -1) {
          usedIds.add(events[startIdx].id);
          // Merge start info into end event
          const startMeta = events[startIdx].metadata ?? {};
          const mergedMeta = { ...startMeta, ...endMeta };
          consolidated.push({ ...ev, metadata: mergedMeta });
          continue;
        }
      }
    }

    // Skip standalone session_start if it was already merged
    if (ev.eventType === 'ai_session_start') {
      const startMeta = ev.metadata ?? {};
      const sid = startMeta.session_id as string | undefined;
      if (sid) {
        // Check if a matching end exists earlier (already processed)
        const alreadyMerged = consolidated.some(
          c => c.eventType === 'ai_session_end'
            && (c.metadata as Record<string, unknown> | null)?.session_id === sid
        );
        if (alreadyMerged) continue;
      }
    }

    consolidated.push(ev);
  }

  // Group events by date
  const groupedEvents: { date: string; events: TimelineEvent[] }[] = [];
  let currentDate = '';
  for (const event of consolidated) {
    const date = event.createdAt.slice(0, 10);
    if (date !== currentDate) {
      currentDate = date;
      groupedEvents.push({ date, events: [event] });
    } else {
      groupedEvents[groupedEvents.length - 1].events.push(event);
    }
  }

  return (
    <div>
      {/* Filter pills */}
      <div className="flex items-center gap-2 mb-6">
        {FILTERS.map(f => (
          <button
            key={f.key}
            onClick={() => { setFilter(f.key); setOffset(0); setLoading(true); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              filter === f.key
                ? 'bg-purple-600 text-white'
                : 'border border-border-primary bg-bg-card text-text-secondary hover:bg-bg-elevated'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading && (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="shimmer rounded-lg h-16" />
          ))}
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-900/50 bg-red-950/20 p-5 text-sm text-red-400">
          Failed to load timeline: {error}
        </div>
      )}

      {!loading && !error && events.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Activity className="w-10 h-10 text-text-muted mb-3" />
          <p className="text-sm text-text-secondary">No activity found</p>
          <p className="text-xs text-text-muted mt-1">Try changing the filter or check back later.</p>
        </div>
      )}

      {!loading && !error && events.length > 0 && (
        <div className="space-y-6">
          {groupedEvents.map(group => (
            <div key={group.date}>
              <p className="text-xs font-semibold uppercase tracking-wider text-text-muted mb-3">
                {formatDate(group.date)}
              </p>
              <div className="space-y-1 border-l-2 border-border-primary ml-2">
                {group.events.map(event => (
                  <TimelineEventItem key={event.id} event={event} />
                ))}
              </div>
            </div>
          ))}

          {hasMore && (
            <div className="flex justify-center pt-4">
              <button
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium border border-border-primary bg-bg-card rounded-lg text-text-secondary hover:bg-bg-elevated transition-colors disabled:opacity-50"
              >
                {loadingMore && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {loadingMore ? 'Loading...' : 'Load more'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
