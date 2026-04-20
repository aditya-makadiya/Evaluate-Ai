'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/components/auth-provider';
import {
  Users,
  CheckCircle2,
  AlertTriangle,
  Activity,
  Bot,
  GitCommit,
  GitMerge,
  GitPullRequest,
  Eye,
  Calendar,
  ArrowRight,
} from 'lucide-react';

interface OverviewData {
  greeting: string;
  scope?: 'team' | 'self';
  role?: 'owner' | 'manager' | 'developer';
  stats: {
    activeDevs: number;
    totalDevs: number;
    prsMerged: number;
    tasksDone: number;
    tasksTotal: number;
    aiSpend: number;
    commits: number;
  };
  timeline: TimelineEvent[];
  alerts: Alert[];
  healthScore: number;
}

interface TimelineEvent {
  id: string;
  eventType: string;
  title: string;
  description: string;
  developerName: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

interface Alert {
  id: string;
  title: string;
  severity: string;
  description: string;
  createdAt: string;
}

const EVENT_ICONS: Record<string, { icon: typeof Bot; label: string }> = {
  ai_prompt: { icon: Bot, label: 'AI Prompt' },
  ai_response: { icon: Bot, label: 'AI Response' },
  ai_session: { icon: Bot, label: 'AI Session' },
  ai_session_start: { icon: Bot, label: 'AI Session' },
  ai_session_end: { icon: Bot, label: 'AI Session' },
  commit: { icon: GitCommit, label: 'Commit' },
  pr_opened: { icon: GitPullRequest, label: 'PR Opened' },
  pr_merged: { icon: GitMerge, label: 'PR Merged' },
  review: { icon: Eye, label: 'Review' },
  task_completed: { icon: CheckCircle2, label: 'Task Done' },
  task_assigned: { icon: CheckCircle2, label: 'Task Assigned' },
  meeting: { icon: Calendar, label: 'Meeting' },
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

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

function getScoreColor(score: number): string {
  if (score >= 80) return 'text-emerald-400';
  if (score >= 60) return 'text-blue-400';
  if (score >= 40) return 'text-yellow-400';
  return 'text-red-400';
}

function getScoreRingColor(score: number): string {
  if (score >= 80) return 'stroke-emerald-400';
  if (score >= 60) return 'stroke-blue-400';
  if (score >= 40) return 'stroke-yellow-400';
  return 'stroke-red-400';
}

function getSeverityColor(severity: string): string {
  switch (severity) {
    case 'critical': return 'border-red-800/50 bg-red-950/20 text-red-400';
    case 'warning': return 'border-yellow-800/50 bg-yellow-950/20 text-yellow-400';
    default: return 'border-blue-800/50 bg-blue-950/20 text-blue-400';
  }
}

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`shimmer rounded-lg ${className}`} />;
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-4 w-40" />
      </div>
      <div className="flex items-start gap-6">
        <Skeleton className="h-40 w-40 rounded-full" />
        <div className="flex-1 grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-[100px]" />)}
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Skeleton className="lg:col-span-2 h-[400px]" />
        <Skeleton className="h-[400px]" />
      </div>
    </div>
  );
}

function HealthScoreCircle({ score }: { score: number }) {
  const circumference = 2 * Math.PI * 56;
  const offset = circumference - (score / 100) * circumference;
  const colorClass = getScoreRingColor(score);
  const textColor = getScoreColor(score);

  return (
    <div className="relative flex items-center justify-center w-36 h-36">
      <svg className="w-36 h-36 -rotate-90" viewBox="0 0 128 128">
        <circle cx="64" cy="64" r="56" fill="none" stroke="var(--border-primary)" strokeWidth="8" />
        <circle
          cx="64" cy="64" r="56"
          fill="none"
          className={colorClass}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 1s ease-out' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-3xl font-bold ${textColor}`}>{score}</span>
        <span className="text-xs text-text-muted">Health</span>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { user: authUser } = useAuth();
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOverview = useCallback(() => {
    if (!authUser) return;
    fetch('/api/dashboard/overview')
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(json => { setData(json); setLoading(false); })
      .catch(err => { setError(err.message); setLoading(false); });
  }, [authUser]);

  useEffect(() => {
    fetchOverview();
  }, [fetchOverview]);

  const noTeam = !authUser && !loading;
  const hasAnyData = data && (
    data.stats.activeDevs > 0 ||
    data.stats.aiSpend > 0 ||
    (data.alerts && data.alerts.length > 0) ||
    data.stats.totalDevs > 0 ||
    data.healthScore > 0
  );
  const isEmpty = data && !hasAnyData;

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="mb-8 animate-section">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-text-primary">
              {data?.greeting ?? (authUser?.name ? `Good morning, ${authUser.name}` : 'Good morning')}
            </h1>
            <p className="mt-1 text-sm text-text-muted">
              {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
              {' \u00B7 '}
              {data?.scope === 'self' ? 'Your activity' : 'Team Overview'}
            </p>
          </div>
          {data?.scope && (
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${
                data.scope === 'self'
                  ? 'border-blue-800/50 bg-blue-900/20 text-blue-300'
                  : 'border-purple-800/50 bg-purple-900/20 text-purple-300'
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${data.scope === 'self' ? 'bg-blue-400' : 'bg-purple-400'}`} />
              {data.scope === 'self' ? 'Personal view' : 'Team view'}
            </span>
          )}
        </div>
      </header>

      {noTeam && (
        <div className="animate-section flex flex-col items-center justify-center py-16 text-center">
          <Activity className="w-10 h-10 text-text-muted mb-3" />
          <p className="text-sm text-text-secondary">No team linked</p>
          <p className="text-xs text-text-muted mt-1">Login and link to a team to see your dashboard.</p>
        </div>
      )}

      {loading && authUser && <LoadingSkeleton />}

      {error && (
        <div className="animate-section rounded-lg border border-red-900/50 bg-red-950/20 p-5 text-sm text-red-400">
          <span className="font-medium">Failed to load dashboard:</span> {error}
        </div>
      )}

      {!loading && !error && isEmpty && (
        <div className="animate-section flex flex-col items-center justify-center py-16 text-center">
          <Activity className="w-10 h-10 text-text-muted mb-3" />
          <p className="text-sm text-text-secondary">No team data yet</p>
          <p className="text-xs text-text-muted mt-1">Add team members and connect integrations to get started.</p>
        </div>
      )}

      {!loading && !error && data && !isEmpty && (
        <>
          {/* Health score + stat cards */}
          <div className="animate-section mb-8 flex flex-col lg:flex-row items-start gap-6">
            <div className="bg-bg-card border border-border-primary rounded-lg p-5 flex flex-col items-center">
              <HealthScoreCircle score={data.healthScore} />
              <p className="mt-2 text-xs text-text-muted">Team Health Score</p>
            </div>

            <div className="flex-1 grid grid-cols-2 gap-4">
              <StatCard
                icon={Users}
                label={data.scope === 'self' ? 'Your Activity' : 'Active Devs'}
                value={data.scope === 'self'
                  ? (data.stats.activeDevs > 0 ? 'Active' : 'Idle')
                  : `${data.stats.activeDevs}/${data.stats.totalDevs}`}
                color="text-[#8b5cf6]"
              />
              <StatCard
                icon={CheckCircle2}
                label={data.scope === 'self' ? 'Your Tasks Done' : 'Tasks Done'}
                value={`${data.stats.tasksDone}/${data.stats.tasksTotal}`}
                color="text-emerald-400"
              />
            </div>
          </div>

          {/* Activity feed + alerts */}
          <div className="animate-section grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Activity Feed */}
            <div className="lg:col-span-2 bg-bg-card border border-border-primary rounded-lg p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-text-primary">Activity Feed</h2>
                <span className="text-xs text-text-muted">Last 20 events</span>
              </div>

              {data.timeline.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Activity className="w-8 h-8 text-text-muted mb-2" />
                  <p className="text-sm text-text-secondary">No recent activity</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {data.timeline.map(event => (
                    <ActivityFeedItem key={event.id} event={event} />
                  ))}
                </div>
              )}
            </div>

            {/* Quick Alerts */}
            <div className="bg-bg-card border border-border-primary rounded-lg p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-text-primary">Alerts</h2>
                <AlertTriangle className="h-4 w-4 text-text-muted" />
              </div>

              {data.alerts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <CheckCircle2 className="w-8 h-8 text-emerald-400 mb-2" />
                  <p className="text-sm text-text-secondary">No alerts</p>
                  <p className="text-xs text-text-muted mt-1">Everything looks good!</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {data.alerts.map(alert => (
                    <div
                      key={alert.id}
                      className={`rounded-lg border p-3 text-sm ${getSeverityColor(alert.severity)}`}
                    >
                      <p className="font-medium">{alert.title}</p>
                      {alert.description && (
                        <p className="text-xs mt-1 opacity-80">{alert.description}</p>
                      )}
                      <p className="text-xs mt-1 opacity-60">{timeAgo(alert.createdAt)}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Quick links */}
              <div className="mt-6 pt-4 border-t border-border-primary space-y-2">
                <Link
                  href="/dashboard/developers"
                  className="flex items-center justify-between text-sm text-text-secondary hover:text-text-primary transition-colors"
                >
                  View all developers
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function ActivityFeedItem({ event }: { event: TimelineEvent }) {
  const evtConfig = EVENT_ICONS[event.eventType];
  const EventIcon = evtConfig?.icon ?? Activity;
  const emoji = EVENT_EMOJIS[event.eventType] ?? '';
  const meta = event.metadata ?? {};

  const sessionId = meta.session_id as string | undefined;
  const totalTurns = meta.total_turns as number | undefined;
  const repo = meta.repo as string | undefined;
  const filesChanged = meta.files_changed as number | undefined;
  const isSessionEnd = event.eventType === 'ai_session_end';
  const isSessionStart = event.eventType === 'ai_session_start';
  const isCommit = event.eventType === 'commit';
  const sha = meta.sha as string | undefined;

  // Extract project name from description for session starts
  const projectName = isSessionStart && event.description
    ? event.description.replace('Claude Code session in ', '')
    : null;

  return (
    <div className="flex items-start gap-3 px-3 py-2.5 rounded-md hover:bg-bg-elevated transition-colors">
      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-bg-elevated">
        <EventIcon className="h-3.5 w-3.5 text-text-muted" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-text-primary truncate">
          <span className="mr-1">{emoji}</span>
          {event.title}
          {isSessionStart && projectName && (
            <span className="text-text-muted font-normal"> in {projectName}</span>
          )}
        </p>

        {/* Rich details for session end */}
        {isSessionEnd && (
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {totalTurns != null && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-bg-elevated text-text-secondary">
                {totalTurns} turns
              </span>
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
        )}

        {/* Rich details for commits */}
        {isCommit && (
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
        )}

        {/* Description for non-enriched events */}
        {!isSessionEnd && !isSessionStart && !isCommit && event.description && (
          <p className="text-xs text-text-muted mt-0.5 line-clamp-1">{event.description}</p>
        )}

        <p className="text-xs text-text-muted mt-0.5">
          {event.developerName} {'\u00B7'} {timeAgo(event.createdAt)}
        </p>
      </div>
    </div>
  );
}

interface StatCardProps {
  icon: typeof Users;
  label: string;
  value: string;
  color: string;
  mono?: boolean;
}

function StatCard({ icon: Icon, label, value, color, mono }: StatCardProps) {
  return (
    <div className="bg-bg-card border border-border-primary rounded-lg p-5 hover:border-border-hover transition-colors">
      <div className="flex items-center gap-2 mb-3">
        <Icon className={`h-4 w-4 ${color}`} />
        <span className="text-xs text-text-muted uppercase tracking-wider">{label}</span>
      </div>
      <p className={`text-2xl font-bold text-text-primary ${mono ? 'font-mono' : ''}`}>
        {value}
      </p>
    </div>
  );
}
