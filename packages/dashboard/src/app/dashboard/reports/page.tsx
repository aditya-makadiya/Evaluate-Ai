'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/components/auth-provider';
import {
  FileBarChart,
  GitCommit,
  GitPullRequest,
  CheckCircle2,
  Eye,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Users,
  TrendingUp,
  Lightbulb,
  Lock,
} from 'lucide-react';

type TabType = 'daily' | 'weekly' | 'sprint';

interface DailyReport {
  id: string;
  developerId: string;
  developerName: string;
  date: string;
  commitsCount: number;
  prsOpened: number;
  prsMerged: number;
  reviewsGiven: number;
  linesAdded: number;
  linesRemoved: number;
  aiSummary: string | null;
  tasksAssigned: number;
  tasksCompleted: number;
  aiSessionsCount: number;
  aiTotalCost: number;
  aiAvgPromptScore: number | null;
  aiTokensUsed: number;
  alignmentScore: number | null;
}

interface WeeklyData {
  teamStats: {
    weekStart: string;
    weekEnd: string;
    totalCommits: number;
    totalPrsOpened: number;
    totalPrsMerged: number;
    totalReviews: number;
    totalLinesAdded: number;
    totalLinesRemoved: number;
    totalAiSessions: number;
    totalAiCost: number;
    totalTasksCompleted: number;
    activeDevelopers: number;
  };
  developerStats: Array<{
    developerId: string;
    developerName: string;
    commits: number;
    prsOpened: number;
    prsMerged: number;
    reviews: number;
    linesAdded: number;
    linesRemoved: number;
    aiSessions: number;
    aiCost: number;
    aiAvgPromptScore: number | null;
    tasksCompleted: number;
    tasksAssigned: number;
    daysActive: number;
  }>;
  topInsights: string[];
  alerts: Array<{
    id: string;
    type: string;
    severity: string;
    title: string;
    description: string | null;
    createdAt: string;
  }>;
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

/** Build YYYY-MM-DD from local date parts (no timezone drift) */
function toDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`shimmer rounded-lg ${className}`} />;
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24" />)}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-40" />)}
      </div>
    </div>
  );
}

function getTodayStr(): string {
  return toDateString(new Date());
}

function getWeekStartStr(): string {
  const now = new Date();
  const dayOfWeek = now.getDay() || 7;
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek + 1);
  return toDateString(monday);
}

export default function ReportsPage() {
  const [tab, setTab] = useState<TabType>('daily');
  // Use empty string as SSR-safe default; set real date on mount to avoid hydration mismatch
  const [selectedDate, setSelectedDate] = useState('');
  const [weekStart, setWeekStart] = useState('');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setSelectedDate(getTodayStr());
    setWeekStart(getWeekStartStr());
    setMounted(true);
  }, []);

  const { user: authUser } = useAuth();
  const [dailyReports, setDailyReports] = useState<DailyReport[]>([]);
  const [weeklyData, setWeeklyData] = useState<WeeklyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchReports = useCallback(() => {
    if (!authUser || !mounted) return;

    if (tab === 'daily') {
      fetch(`/api/reports/daily?date=${selectedDate}`)
        .then(res => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json();
        })
        .then(json => {
          setDailyReports(json.reports ?? []);
          setLoading(false);
        })
        .catch(err => { setError(err.message); setLoading(false); });
    } else if (tab === 'weekly') {
      fetch(`/api/reports/weekly?week_start=${weekStart}`)
        .then(res => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json();
        })
        .then(json => {
          setWeeklyData(json);
          setLoading(false);
        })
        .catch(err => { setError(err.message); setLoading(false); });
    }
  }, [tab, selectedDate, weekStart, authUser, mounted]);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  const navigateDate = (direction: number) => {
    const [y, m, d] = selectedDate.split('-').map(Number);
    const next = new Date(y, m - 1, d + direction);
    setSelectedDate(toDateString(next));
    setLoading(true);
    setError(null);
  };

  const navigateWeek = (direction: number) => {
    const [y, m, d] = weekStart.split('-').map(Number);
    const next = new Date(y, m - 1, d + direction * 7);
    setWeekStart(toDateString(next));
    setLoading(true);
    setError(null);
  };

  const handleTabChange = (t: TabType) => {
    setTab(t);
    setLoading(true);
    setError(null);
  };

  const tabs: { key: TabType; label: string }[] = [
    { key: 'daily', label: 'Daily' },
    { key: 'weekly', label: 'Weekly' },
    { key: 'sprint', label: 'Sprint' },
  ];

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="mb-8 animate-section">
        <h1 className="text-2xl font-bold tracking-tight text-text-primary">
          Reports
        </h1>
        <p className="mt-1 text-sm text-text-muted">
          Auto-generated daily and weekly reports
        </p>
      </header>

      {/* Tab selector */}
      <div className="animate-section mb-6 flex gap-1 bg-bg-card border border-border-primary rounded-lg p-1 w-fit">
        {tabs.map(t => {
          const isActive = tab === t.key;
          return (
            <button
              key={t.key}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-purple-600 text-white'
                  : 'text-text-secondary hover:text-text-primary hover:bg-bg-elevated'
              }`}
              onClick={() => handleTabChange(t.key)}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Date picker */}
      {mounted && tab === 'daily' && (
        <div className="animate-section mb-6 flex items-center gap-3">
          <button
            onClick={() => navigateDate(-1)}
            className="p-1.5 rounded-md text-text-muted hover:text-text-primary hover:bg-bg-elevated transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-text-muted" />
            <input
              type="date"
              value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)}
              className="bg-bg-card border border-border-primary rounded-md px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:border-purple-500"
            />
          </div>
          <button
            onClick={() => navigateDate(1)}
            className="p-1.5 rounded-md text-text-muted hover:text-text-primary hover:bg-bg-elevated transition-colors"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <span className="text-xs text-text-muted">
            {formatDate(selectedDate)}
          </span>
        </div>
      )}

      {mounted && tab === 'weekly' && (
        <div className="animate-section mb-6 flex items-center gap-3">
          <button
            onClick={() => navigateWeek(-1)}
            className="p-1.5 rounded-md text-text-muted hover:text-text-primary hover:bg-bg-elevated transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-text-muted" />
            <span className="text-sm text-text-primary">
              Week of {formatDate(weekStart)}
            </span>
          </div>
          <button
            onClick={() => navigateWeek(1)}
            className="p-1.5 rounded-md text-text-muted hover:text-text-primary hover:bg-bg-elevated transition-colors"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Content */}
      {loading && tab !== 'sprint' && <LoadingSkeleton />}

      {error && (
        <div className="animate-section rounded-lg border border-red-900/50 bg-red-950/20 p-5 text-sm text-red-400">
          <span className="font-medium">Failed to load reports:</span> {error}
        </div>
      )}

      {/* Daily tab */}
      {!loading && !error && tab === 'daily' && (
        <div className="animate-section">
          {dailyReports.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <FileBarChart className="w-10 h-10 text-text-muted mb-3" />
              <p className="text-sm text-text-secondary">No reports for this date</p>
              <p className="text-xs text-text-muted mt-1">
                Reports are generated daily by the cron system
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {dailyReports.map(report => (
                <DailyReportCard key={report.id} report={report} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Weekly tab */}
      {!loading && !error && tab === 'weekly' && (
        <div className="animate-section">
          {!weeklyData || weeklyData.developerStats.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <FileBarChart className="w-10 h-10 text-text-muted mb-3" />
              <p className="text-sm text-text-secondary">No weekly data available</p>
              <p className="text-xs text-text-muted mt-1">
                Weekly reports aggregate daily data
              </p>
            </div>
          ) : (
            <WeeklyReport data={weeklyData} />
          )}
        </div>
      )}

      {/* Sprint tab */}
      {!loading && !error && tab === 'sprint' && (
        <div className="animate-section flex flex-col items-center justify-center py-16 text-center">
          <Lock className="w-10 h-10 text-text-muted mb-3" />
          <p className="text-sm text-text-secondary">Coming in Phase 2</p>
          <p className="text-xs text-text-muted mt-1">
            Sprint reports with Jira integration and burndown charts
          </p>
        </div>
      )}
    </div>
  );
}

function DailyReportCard({ report }: { report: DailyReport }) {
  return (
    <div className="bg-bg-card border border-border-primary rounded-lg p-5 hover:border-border-hover transition-colors">
      {/* Developer name */}
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-text-primary">
          {report.developerName}
        </h3>
      </div>

      {/* AI Summary */}
      {report.aiSummary && (
        <p className="text-xs text-text-secondary mb-3 leading-relaxed">
          {report.aiSummary}
        </p>
      )}

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3">
        <MiniStat icon={GitCommit} label="Commits" value={report.commitsCount} />
        <MiniStat icon={GitPullRequest} label="PRs" value={report.prsOpened + report.prsMerged} />
        <MiniStat icon={Eye} label="Reviews" value={report.reviewsGiven} />
        <MiniStat icon={CheckCircle2} label="Tasks Done" value={`${report.tasksCompleted}/${report.tasksAssigned}`} />
      </div>
    </div>
  );
}

function MiniStat({
  icon: Icon,
  label,
  value,
  mono,
}: {
  icon: typeof GitCommit;
  label: string;
  value: number | string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-3.5 w-3.5 text-text-muted shrink-0" />
      <div>
        <p className={`text-sm font-semibold text-text-primary ${mono ? 'font-mono' : ''}`}>
          {value}
        </p>
        <p className="text-xs text-text-muted">{label}</p>
      </div>
    </div>
  );
}

function WeeklyReport({ data }: { data: WeeklyData }) {
  const { teamStats, developerStats, topInsights, alerts } = data;

  return (
    <div className="space-y-6">
      {/* Team overview stats */}
      <div className="grid grid-cols-3 gap-4">
        <WeeklyStatCard
          icon={GitCommit}
          label="Total Commits"
          value={String(teamStats.totalCommits)}
          color="text-[#8b5cf6]"
        />
        <WeeklyStatCard
          icon={GitPullRequest}
          label="PRs Merged"
          value={String(teamStats.totalPrsMerged)}
          color="text-blue-400"
        />
        <WeeklyStatCard
          icon={CheckCircle2}
          label="Tasks Done"
          value={String(teamStats.totalTasksCompleted)}
          color="text-emerald-400"
        />
      </div>

      {/* Top insights */}
      {topInsights.length > 0 && (
        <div className="bg-bg-card border border-border-primary rounded-lg p-5">
          <div className="flex items-center gap-2 mb-3">
            <Lightbulb className="h-4 w-4 text-yellow-400" />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-text-muted">
              Key Insights
            </h2>
          </div>
          <ul className="space-y-2">
            {topInsights.map((insight, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-text-secondary">
                <TrendingUp className="h-3.5 w-3.5 text-text-muted mt-0.5 shrink-0" />
                {insight}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Per-developer breakdown */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <Users className="h-4 w-4 text-text-muted" />
          <h2 className="text-lg font-semibold text-text-primary">
            Developer Breakdown
          </h2>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {developerStats.map(dev => (
            <div
              key={dev.developerId}
              className="bg-bg-card border border-border-primary rounded-lg p-5 hover:border-border-hover transition-colors"
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-text-primary">
                  {dev.developerName}
                </h3>
                <span className="text-xs text-text-muted">
                  {dev.daysActive}/7 days active
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <MiniStat icon={GitCommit} label="Commits" value={dev.commits} />
                <MiniStat icon={GitPullRequest} label="PRs" value={dev.prsMerged} />
                <MiniStat icon={Eye} label="Reviews" value={dev.reviews} />
                <MiniStat
                  icon={CheckCircle2}
                  label="Tasks"
                  value={`${dev.tasksCompleted}/${dev.tasksAssigned}`}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Weekly alerts */}
      {alerts.length > 0 && (
        <div className="bg-bg-card border border-border-primary rounded-lg p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-text-muted mb-3">
            Alerts This Week
          </h2>
          <div className="space-y-2">
            {alerts.map(alert => {
              const sevColor = alert.severity === 'critical'
                ? 'text-red-400'
                : alert.severity === 'warning'
                  ? 'text-yellow-400'
                  : alert.severity === 'positive'
                    ? 'text-emerald-400'
                    : 'text-blue-400';
              return (
                <div key={alert.id} className="flex items-start gap-2 text-sm">
                  <span className={`text-xs font-medium uppercase ${sevColor}`}>
                    {alert.severity}
                  </span>
                  <span className="text-text-secondary">{alert.title}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function WeeklyStatCard({
  icon: Icon,
  label,
  value,
  color,
  mono,
}: {
  icon: typeof GitCommit;
  label: string;
  value: string;
  color: string;
  mono?: boolean;
}) {
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
