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

  // Group events by date
  const groupedEvents: { date: string; events: TimelineEvent[] }[] = [];
  let currentDate = '';
  for (const event of events) {
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
                {group.events.map(event => {
                  const EventIcon = EVENT_ICONS[event.eventType] ?? Activity;
                  const emoji = EVENT_EMOJIS[event.eventType] ?? '';
                  const meta = event.metadata ?? {};
                  const score = meta.score as number | undefined;
                  const cost = meta.cost as number | undefined;
                  const model = meta.model as string | undefined;
                  const sessionId = meta.session_id as string | undefined;
                  const repo = meta.repo as string | undefined;
                  const filesChanged = meta.files_changed as number | undefined;

                  return (
                    <div
                      key={event.id}
                      className="relative pl-6 pr-3 py-2.5 hover:bg-bg-elevated rounded-md transition-colors -ml-px"
                    >
                      {/* Dot on timeline */}
                      <div className="absolute left-[-5px] top-4 h-2 w-2 rounded-full bg-border-hover" />

                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-bg-elevated">
                          <EventIcon className="h-3.5 w-3.5 text-text-muted" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-text-muted">{formatTime(event.createdAt)}</span>
                            <span className="text-xs text-text-muted">{emoji}</span>
                            {score != null && (
                              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${getScoreBadge(score)}`}>
                                Score: {score}
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-text-primary mt-0.5">{event.title}</p>
                          {event.description && (
                            <p className="text-xs text-text-muted mt-0.5 line-clamp-2">{event.description}</p>
                          )}
                          <div className="flex items-center gap-3 mt-1 flex-wrap">
                            {model && (
                              <span className="text-[10px] text-text-muted">Model: {model}</span>
                            )}
                            {cost != null && (
                              <span className="text-[10px] font-mono text-text-muted">${cost.toFixed(3)}</span>
                            )}
                            {repo && (
                              <span className="text-[10px] text-text-muted">{repo}</span>
                            )}
                            {filesChanged != null && (
                              <span className="text-[10px] text-text-muted">{filesChanged} files</span>
                            )}
                            {sessionId && (
                              <Link
                                href={`/sessions/${sessionId}`}
                                className="text-[10px] text-[#8b5cf6] hover:underline"
                              >
                                View session
                              </Link>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
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
