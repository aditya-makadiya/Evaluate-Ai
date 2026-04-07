'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Users,
  GitPullRequest,
  CheckCircle2,
  DollarSign,
  AlertTriangle,
  Activity,
  Bot,
  GitCommit,
  GitMerge,
  Eye,
  Calendar,
  ArrowRight,
} from 'lucide-react';

interface OverviewData {
  greeting: string;
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
        <span className="text-xs text-[var(--text-muted)]">Health</span>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [teamId, setTeamId] = useState<string>('');
  const [userName, setUserName] = useState<string>('');

  useEffect(() => {
    try {
      const team = JSON.parse(localStorage.getItem('evaluateai-team') || '{}');
      const user = JSON.parse(localStorage.getItem('evaluateai-user') || '{}');
      if (team.id) setTeamId(team.id);
      if (user.name) setUserName(user.name);
    } catch {}
  }, []);

  useEffect(() => {
    if (!teamId) return;
    setLoading(true);
    fetch(`/api/dashboard/overview?team_id=${teamId}`, {
      headers: { 'x-user-name': userName },
    })
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(json => { setData(json); setLoading(false); })
      .catch(err => { setError(err.message); setLoading(false); });
  }, [teamId, userName]);

  const noTeam = !teamId && !loading;
  const isEmpty = data && data.timeline.length === 0 && data.stats.totalDevs === 0;

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="mb-8 animate-section">
        <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
          {data?.greeting ?? (userName ? `Good morning, ${userName}` : 'Good morning')}
        </h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          {' \u00B7 '}Team Overview
        </p>
      </header>

      {noTeam && (
        <div className="animate-section flex flex-col items-center justify-center py-16 text-center">
          <Activity className="w-10 h-10 text-[var(--text-muted)] mb-3" />
          <p className="text-sm text-[var(--text-secondary)]">No team linked</p>
          <p className="text-xs text-[var(--text-muted)] mt-1">Login and link to a team to see your dashboard.</p>
        </div>
      )}

      {loading && teamId && <LoadingSkeleton />}

      {error && (
        <div className="animate-section rounded-lg border border-red-900/50 bg-red-950/20 p-5 text-sm text-red-400">
          <span className="font-medium">Failed to load dashboard:</span> {error}
        </div>
      )}

      {!loading && !error && isEmpty && (
        <div className="animate-section flex flex-col items-center justify-center py-16 text-center">
          <Activity className="w-10 h-10 text-[var(--text-muted)] mb-3" />
          <p className="text-sm text-[var(--text-secondary)]">No team data yet</p>
          <p className="text-xs text-[var(--text-muted)] mt-1">Add team members and connect integrations to get started.</p>
        </div>
      )}

      {!loading && !error && data && !isEmpty && (
        <>
          {/* Health score + stat cards */}
          <div className="animate-section mb-8 flex flex-col lg:flex-row items-start gap-6">
            <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-lg p-5 flex flex-col items-center">
              <HealthScoreCircle score={data.healthScore} />
              <p className="mt-2 text-xs text-[var(--text-muted)]">Team Health Score</p>
            </div>

            <div className="flex-1 grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                icon={Users}
                label="Active Devs"
                value={`${data.stats.activeDevs}/${data.stats.totalDevs}`}
                color="text-[#8b5cf6]"
              />
              <StatCard
                icon={GitPullRequest}
                label="PRs Merged"
                value={String(data.stats.prsMerged)}
                color="text-blue-400"
              />
              <StatCard
                icon={CheckCircle2}
                label="Tasks Done"
                value={`${data.stats.tasksDone}/${data.stats.tasksTotal}`}
                color="text-emerald-400"
              />
              <StatCard
                icon={DollarSign}
                label="AI Spend"
                value={`$${data.stats.aiSpend.toFixed(2)}`}
                color="text-yellow-400"
                mono
              />
            </div>
          </div>

          {/* Activity feed + alerts */}
          <div className="animate-section grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Activity Feed */}
            <div className="lg:col-span-2 bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-lg p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-[var(--text-primary)]">Activity Feed</h2>
                <span className="text-xs text-[var(--text-muted)]">Last 20 events</span>
              </div>

              {data.timeline.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Activity className="w-8 h-8 text-[var(--text-muted)] mb-2" />
                  <p className="text-sm text-[var(--text-secondary)]">No recent activity</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {data.timeline.map(event => {
                    const evtConfig = EVENT_ICONS[event.eventType];
                    const EventIcon = evtConfig?.icon ?? Activity;
                    const emoji = EVENT_EMOJIS[event.eventType] ?? '';
                    return (
                      <div
                        key={event.id}
                        className="flex items-start gap-3 px-3 py-2.5 rounded-md hover:bg-[var(--bg-elevated)] transition-colors"
                      >
                        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[var(--bg-elevated)]">
                          <EventIcon className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-[var(--text-primary)] truncate">
                            <span className="mr-1">{emoji}</span>
                            {event.title}
                          </p>
                          <p className="text-xs text-[var(--text-muted)] mt-0.5">
                            {event.developerName} {'\u00B7'} {timeAgo(event.createdAt)}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Quick Alerts */}
            <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-lg p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-[var(--text-primary)]">Alerts</h2>
                <AlertTriangle className="h-4 w-4 text-[var(--text-muted)]" />
              </div>

              {data.alerts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <CheckCircle2 className="w-8 h-8 text-emerald-400 mb-2" />
                  <p className="text-sm text-[var(--text-secondary)]">No alerts</p>
                  <p className="text-xs text-[var(--text-muted)] mt-1">Everything looks good!</p>
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
              <div className="mt-6 pt-4 border-t border-[var(--border-primary)] space-y-2">
                <Link
                  href="/dashboard/developers"
                  className="flex items-center justify-between text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
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

interface StatCardProps {
  icon: typeof Users;
  label: string;
  value: string;
  color: string;
  mono?: boolean;
}

function StatCard({ icon: Icon, label, value, color, mono }: StatCardProps) {
  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-lg p-5 hover:border-[var(--border-hover)] transition-colors">
      <div className="flex items-center gap-2 mb-3">
        <Icon className={`h-4 w-4 ${color}`} />
        <span className="text-xs text-[var(--text-muted)] uppercase tracking-wider">{label}</span>
      </div>
      <p className={`text-2xl font-bold text-[var(--text-primary)] ${mono ? 'font-mono' : ''}`}>
        {value}
      </p>
    </div>
  );
}
