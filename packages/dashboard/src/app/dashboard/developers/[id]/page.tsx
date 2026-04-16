'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useAuth } from '@/components/auth-provider';
import Link from 'next/link';
import {
  ArrowLeft,
  Github,
  CheckCircle2,
  XCircle,
  Activity,
  Lightbulb,
  MessageSquare,
} from 'lucide-react';
import DeveloperSessionsTab from '@/components/developer-sessions-tab';
import DeveloperTimeline from '@/components/developer-timeline';
import DeveloperWorkTab from '@/components/developer-work-tab';
import DeveloperInsightsTab from '@/components/developer-insights-tab';
import LinkAccountsSection from '@/components/link-accounts-section';

type Tab = 'sessions' | 'activity' | 'insights';

interface DeveloperData {
  developer: {
    id: string;
    userId: string;
    name: string;
    role: string;
    githubUsername: string | null;
    evaluateaiInstalled: boolean;
    avatarUrl: string | null;
  };
  stats: {
    totalAiCost: number;
    avgPromptScore: number | null;
    commits: number;
    prs: number;
    reviews: number;
    tasksCompleted: number;
    tasksAssigned: number;
    sessionsThisWeek: number;
  };
  sessions: {
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
  }[];
  sessionTotal: number;
  codeChanges: {
    id: string;
    type: string;
    title: string;
    description: string | null;
    repo: string | null;
    filesChanged: number | null;
    additions: number | null;
    deletions: number | null;
    branch: string | null;
    createdAt: string;
    metadata: Record<string, unknown> | null;
  }[];
  tasks: {
    id: string;
    title: string;
    status: string;
    source: string | null;
    createdAt: string;
    completedAt: string | null;
  }[];
  modelUsage: { model: string; count: number; cost: number }[];
  antiPatterns: { pattern: string; count: number }[];
  commitsPerDay: { date: string; count: number }[];
  scoreTrend: { date: string; score: number }[];
  costTrend: { date: string; cost: number }[];
  tokenStats: {
    week: { input: number; output: number; turns: number };
    month: { input: number; output: number; turns: number };
  };
  usageByDayOfWeek: { day: string; sessions: number }[];
  insights: string[];
  coachingTips: { pattern: string; count: number; label: string; tip: string; severity: 'high' | 'medium' | 'low' }[];
}

const TABS: { key: Tab; label: string; icon: typeof Activity }[] = [
  { key: 'sessions', label: 'Sessions', icon: MessageSquare },
  { key: 'activity', label: 'Activity', icon: Activity },
  { key: 'insights', label: 'Insights', icon: Lightbulb },
];

function getInitials(name: string): string {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

const AVATAR_COLORS = [
  'bg-purple-600', 'bg-blue-600', 'bg-cyan-600', 'bg-emerald-600',
  'bg-orange-600', 'bg-pink-600', 'bg-indigo-600', 'bg-teal-600',
];

function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function getScoreBadge(score: number): string {
  if (score >= 80) return 'bg-emerald-900/30 text-emerald-400';
  if (score >= 60) return 'bg-blue-900/30 text-blue-400';
  if (score >= 40) return 'bg-yellow-900/30 text-yellow-400';
  return 'bg-red-900/30 text-red-400';
}

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`shimmer rounded-lg ${className}`} />;
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Skeleton className="h-14 w-14 rounded-full" />
        <div className="space-y-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-[500px] w-full" />
    </div>
  );
}

export default function DeveloperDetailPage() {
  const { user: authUser } = useAuth();
  const params = useParams();
  const id = params.id as string;
  const [data, setData] = useState<DeveloperData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('sessions');

  const fetchDeveloper = useCallback(() => {
    if (!authUser) return;
    fetch(`/api/dashboard/developers/${id}`)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(json => { setData(json); setLoading(false); })
      .catch(err => { setError(err.message); setLoading(false); });
  }, [id, authUser]);

  useEffect(() => {
    fetchDeveloper();
  }, [fetchDeveloper]);

  return (
    <div className="min-h-screen">
      {/* Back link */}
      <div className="mb-4 animate-section">
        <Link
          href="/dashboard/developers"
          className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-text-primary transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to developers
        </Link>
      </div>

      {loading && <LoadingSkeleton />}

      {error && (
        <div className="animate-section rounded-lg border border-red-900/50 bg-red-950/20 p-5 text-sm text-red-400">
          <span className="font-medium">Failed to load developer:</span> {error}
        </div>
      )}

      {!loading && !error && data && (
        <>
          {/* Developer header */}
          <header className="animate-section mb-6">
            <div className="flex items-center gap-4">
              <div className={`h-14 w-14 rounded-full ${getAvatarColor(data.developer.name ?? '')} flex items-center justify-center text-white text-lg font-semibold`}>
                {getInitials(data.developer.name ?? 'U')}
              </div>
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-2xl font-bold tracking-tight text-text-primary">
                    {data.developer.name}
                  </h1>
                  {data.developer.evaluateaiInstalled ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  ) : (
                    <XCircle className="h-4 w-4 text-red-400" />
                  )}
                </div>
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-sm text-text-muted">{data.developer.role ?? 'Developer'}</span>
                  {data.developer.githubUsername && (
                    <span className="flex items-center gap-1 text-xs text-text-muted">
                      <Github className="h-3 w-3" />
                      {data.developer.githubUsername}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </header>

          {/* Linked Accounts */}
          <div className="animate-section mb-6">
            <LinkAccountsSection
              developerId={id}
              canEdit={authUser?.role === 'owner' || authUser?.role === 'manager' || authUser?.memberId === id}
            />
          </div>

          {/* Tabs */}
          <div className="animate-section mb-6 border-b border-border-primary">
            <div className="flex gap-0">
              {TABS.map(tab => {
                const isActive = activeTab === tab.key;
                const tabClasses = isActive
                  ? 'text-text-primary border-b-2 border-[#8b5cf6]'
                  : 'text-text-muted hover:text-text-secondary border-b-2 border-transparent';
                return (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${tabClasses}`}
                  >
                    <tab.icon className="h-4 w-4" />
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Tab content */}
          <div className="animate-section">
            {activeTab === 'sessions' && (
              <DeveloperSessionsTab
                developerId={id}
                initialSessions={data.sessions}
                initialTotal={data.sessionTotal}
                stats={{
                  totalAiCost: data.stats.totalAiCost,
                  avgPromptScore: data.stats.avgPromptScore,
                  sessionsThisWeek: data.stats.sessionsThisWeek,
                }}
              />
            )}
            {activeTab === 'activity' && (
              <div className="space-y-8">
                <DeveloperTimeline developerId={id} />
                <DeveloperWorkTab
                  codeChanges={data.codeChanges}
                  tasks={data.tasks}
                  commitsPerDay={data.commitsPerDay}
                  stats={{
                    commits: data.stats.commits,
                    prs: data.stats.prs,
                    reviews: data.stats.reviews,
                    tasksCompleted: data.stats.tasksCompleted,
                    tasksAssigned: data.stats.tasksAssigned,
                  }}
                />
              </div>
            )}
            {activeTab === 'insights' && (
              <DeveloperInsightsTab
                insights={data.insights}
                coachingTips={data.coachingTips ?? []}
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}
