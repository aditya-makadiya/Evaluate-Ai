'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/components/auth-provider';
import {
  Calendar,
  Clock,
  Users,
  CheckCircle2,
  AlertTriangle,
  ArrowUpRight,
  Mic,
  TrendingUp,
  RefreshCw,
  Sparkles,
  X,
  Circle,
  CircleDot,
} from 'lucide-react';
import MeetingDetailPanel, {
  type Meeting,
  type OverallStats,
} from '@/components/meetings/meeting-detail-panel';

// ═══════════════════════════════════════
//  STATS
// ═══════════════════════════════════════

function StatsRow({ stats }: { stats: OverallStats }) {
  const items = [
    { label: 'Meetings', value: stats.totalMeetings, icon: Calendar, accent: 'text-accent-purple' },
    { label: 'Action Items', value: stats.totalTasks, icon: CheckCircle2, accent: 'text-sky-400' },
    { label: 'Completed', value: stats.completedTasks, icon: TrendingUp, accent: 'text-emerald-400' },
    { label: 'Delivery', value: `${stats.deliveryRate}%`, icon: ArrowUpRight, accent: stats.deliveryRate >= 70 ? 'text-emerald-400' : stats.deliveryRate >= 40 ? 'text-amber-400' : 'text-red-400', sub: `${stats.completedTasks}/${stats.totalTasks}` },
  ];
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5 animate-section">
      {items.map((c) => {
        const Icon = c.icon;
        return (
          <div key={c.label} className="bg-bg-card border border-border-primary rounded-xl p-4 hover:border-border-hover transition-colors">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-text-muted">{c.label}</span>
              <Icon className={`h-3.5 w-3.5 ${c.accent} opacity-60`} />
            </div>
            <p className="text-xl font-bold text-text-primary tracking-tight">{c.value}</p>
            {'sub' in c && c.sub && <p className="text-[10px] text-text-muted mt-0.5">{c.sub}</p>}
          </div>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════
//  MEETING LIST ITEM (Linear-style)
// ═══════════════════════════════════════

function MeetingListItem({ meeting, isSelected, onSelect }: {
  meeting: Meeting; isSelected: boolean; onSelect: () => void;
}) {
  const participantCount = meeting.participants?.length ?? 0;
  const deliveryColor = meeting.stats.deliveryRate >= 70 ? 'text-emerald-400' : meeting.stats.deliveryRate >= 40 ? 'text-amber-400' : 'text-red-400';
  const hasTasks = meeting.stats.totalTasks > 0;
  const tasksDone = meeting.stats.completedTasks;
  const tasksTotal = meeting.stats.totalTasks;

  // Status icon based on task completion
  const allDone = hasTasks && tasksDone === tasksTotal;
  const someInProgress = hasTasks && tasksDone > 0 && tasksDone < tasksTotal;

  return (
    <div
      onClick={onSelect}
      className={`group flex items-center gap-3 px-4 py-3 cursor-pointer border-b border-border-primary transition-colors ${
        isSelected
          ? 'bg-accent-purple/5 border-l-2 border-l-accent-purple'
          : 'border-l-2 border-l-transparent hover:bg-bg-elevated/40'
      }`}
    >
      {/* Status indicator */}
      <div className="shrink-0">
        {allDone ? (
          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
        ) : someInProgress ? (
          <CircleDot className="h-4 w-4 text-sky-400" />
        ) : (
          <Circle className="h-4 w-4 text-text-muted" />
        )}
      </div>

      {/* Title & meta */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-medium text-text-primary truncate">{meeting.title}</span>
          <span className="text-[9px] font-semibold uppercase tracking-wider text-accent-purple bg-accent-purple/10 rounded px-1.5 py-0.5 shrink-0">
            {meeting.source}
          </span>
        </div>
        <div className="flex items-center gap-3 mt-0.5 text-[11px] text-text-muted">
          <span className="flex items-center gap-1">
            <Calendar className="h-3 w-3 opacity-60" />
            {new Date(meeting.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
          </span>
          {meeting.durationMinutes && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3 opacity-60" />{meeting.durationMinutes}m
            </span>
          )}
          <span className="flex items-center gap-1">
            <Users className="h-3 w-3 opacity-60" />{participantCount}
          </span>
        </div>
      </div>

      {/* Right side: task count + delivery */}
      <div className="flex items-center gap-3 shrink-0">
        {hasTasks ? (
          <>
            <span className="text-[10px] text-text-muted">{tasksDone}/{tasksTotal} tasks</span>
            <span className={`text-sm font-bold ${deliveryColor} min-w-[40px] text-right`}>{meeting.stats.deliveryRate}%</span>
          </>
        ) : (
          <span className="text-[11px] text-text-muted opacity-60">No tasks</span>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════
//  LOADING & EMPTY
// ═══════════════════════════════════════

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        {[...Array(4)].map((_, i) => <div key={i} className="bg-bg-card border border-border-primary rounded-xl p-4"><div className="h-3 shimmer rounded w-14 mb-3" /><div className="h-6 shimmer rounded w-10" /></div>)}
      </div>
      <div className="bg-bg-card border border-border-primary rounded-xl overflow-hidden">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3.5 border-b border-border-primary">
            <div className="h-4 w-4 shimmer rounded-full" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3.5 shimmer rounded max-w-sm" />
              <div className="h-2.5 shimmer rounded max-w-xs" />
            </div>
            <div className="h-3 shimmer rounded w-16" />
            <div className="h-4 shimmer rounded w-10" />
          </div>
        ))}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center animate-section">
      <div className="p-4 rounded-2xl bg-bg-card border border-border-primary mb-5">
        <Mic className="w-7 h-7 text-text-muted" />
      </div>
      <p className="text-sm font-medium text-text-primary">No meetings yet</p>
      <p className="text-xs text-text-muted mt-1.5 max-w-sm leading-relaxed">
        Connect Fireflies.ai on the Integrations page to automatically capture meeting transcripts and extract action items.
      </p>
      <a href="/dashboard/integrations" className="mt-5 inline-flex items-center gap-2 bg-accent-purple hover:bg-accent-hover text-white rounded-lg px-4 py-2.5 text-sm font-medium transition-colors">
        <Mic className="h-4 w-4" /> Connect Fireflies
      </a>
    </div>
  );
}

// ═══════════════════════════════════════
//  MAIN PAGE
// ═══════════════════════════════════════

export default function MeetingsPage() {
  const { user: authUser } = useAuth();
  const teamId = authUser?.teamId ?? '';

  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [overallStats, setOverallStats] = useState<OverallStats>({ totalMeetings: 0, totalTasks: 0, completedTasks: 0, deliveryRate: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const fetchMeetings = useCallback(async () => {
    if (!teamId) { setLoading(false); return; }
    try {
      const res = await fetch(`/api/dashboard/meetings?team_id=${teamId}&limit=50`);
      if (!res.ok) throw new Error('Failed to fetch meetings');
      const data = await res.json();
      setMeetings(data.meetings ?? []);
      setOverallStats(data.overallStats ?? { totalMeetings: 0, totalTasks: 0, completedTasks: 0, deliveryRate: 0 });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load meetings');
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  async function handleSync() {
    setSyncing(true); setSyncMsg(null); setError(null);
    try {
      const res = await fetch('/api/integrations/fireflies/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ team_id: teamId }) });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Sync failed'); return; }
      if (data.meetingsProcessed > 0) {
        setSyncMsg(`Synced ${data.meetingsProcessed} meeting${data.meetingsProcessed !== 1 ? 's' : ''}${data.tasksExtracted > 0 ? ` with ${data.tasksExtracted} action item${data.tasksExtracted !== 1 ? 's' : ''}` : ''}`);
        await fetchMeetings();
      } else if (data.meetingsFound === 0) {
        setSyncMsg('No new meetings found.');
      } else {
        setSyncMsg('All meetings already synced.');
      }
      setTimeout(() => setSyncMsg(null), 7000);
    } catch { setError('Failed to sync meetings.'); } finally { setSyncing(false); }
  }

  async function handleReExtract() {
    setExtracting(true); setSyncMsg(null); setError(null);
    try {
      const res = await fetch('/api/dashboard/meetings/re-extract', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ team_id: teamId }) });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Extraction failed'); return; }
      if (data.tasksExtracted > 0) {
        setSyncMsg(`Extracted ${data.tasksExtracted} action item${data.tasksExtracted !== 1 ? 's' : ''} from ${data.meetingsProcessed} meeting${data.meetingsProcessed !== 1 ? 's' : ''}.`);
        await fetchMeetings();
      } else {
        setSyncMsg(data.message ?? 'No new tasks found.');
      }
      setTimeout(() => setSyncMsg(null), 7000);
    } catch { setError('Task extraction failed.'); } finally { setExtracting(false); }
  }

  // Keyboard navigation
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'ArrowDown' || e.key === 'j') {
        e.preventDefault();
        setSelectedId((prev) => {
          const idx = meetings.findIndex((m) => m.id === prev);
          return meetings[idx + 1]?.id ?? prev;
        });
      }
      if (e.key === 'ArrowUp' || e.key === 'k') {
        e.preventDefault();
        setSelectedId((prev) => {
          const idx = meetings.findIndex((m) => m.id === prev);
          return idx > 0 ? meetings[idx - 1].id : prev;
        });
      }
      if (e.key === 'Escape') setSelectedId(null);
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [meetings]);

  useEffect(() => {
    fetchMeetings();
  }, [fetchMeetings]);

  const selectedMeeting = meetings.find((m) => m.id === selectedId) ?? null;

  return (
    <div>
      {/* Header */}
      <header className="mb-5 flex items-start justify-between animate-section">
        <div>
          <div className="flex items-center gap-3 mb-0.5">
            <h1 className="text-2xl font-bold tracking-tight text-text-primary">Meetings</h1>
            {overallStats.totalMeetings > 0 && (
              <span className="text-[11px] font-medium text-text-muted bg-bg-elevated border border-border-primary rounded-md px-2 py-0.5">{overallStats.totalMeetings}</span>
            )}
          </div>
          <p className="text-sm text-text-muted">Track meeting decisions and task delivery</p>
        </div>
        {teamId && (
          <div className="flex items-center gap-2">
            {meetings.some((m) => m.stats.totalTasks === 0) && (
              <button onClick={handleReExtract} disabled={extracting}
                className="flex items-center gap-2 border border-border-primary bg-bg-card hover:bg-bg-elevated disabled:opacity-50 text-text-secondary rounded-lg px-3.5 py-2 text-xs font-medium transition-colors">
                <Sparkles className={`h-3.5 w-3.5 ${extracting ? 'animate-pulse' : ''}`} />
                {extracting ? 'Extracting...' : 'Extract Tasks'}
              </button>
            )}
            <button onClick={handleSync} disabled={syncing}
              className="flex items-center gap-2 bg-accent-purple hover:bg-accent-hover disabled:opacity-50 text-white rounded-lg px-3.5 py-2 text-xs font-medium transition-colors">
              <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Syncing...' : 'Sync Meetings'}
            </button>
          </div>
        )}
      </header>

      {/* Sync message */}
      {syncMsg && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-300 animate-section">
          <CheckCircle2 className="h-4 w-4 shrink-0" />{syncMsg}
          <button onClick={() => setSyncMsg(null)} className="ml-auto text-emerald-400/60 hover:text-emerald-400"><X className="h-3.5 w-3.5" /></button>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mb-4 bg-red-500/5 border border-red-500/20 rounded-xl p-3.5 text-sm flex items-center gap-3">
          <AlertTriangle className="h-4 w-4 shrink-0 text-red-400" /><span className="text-red-300 flex-1">{error}</span>
          <button onClick={() => setError(null)} className="text-red-400/60 hover:text-red-400"><X className="h-4 w-4" /></button>
        </div>
      )}

      {loading && <LoadingSkeleton />}

      {!loading && !error && meetings.length === 0 && <EmptyState />}

      {!loading && !error && meetings.length > 0 && (
        <>
          <StatsRow stats={overallStats} />

          <div className="animate-section">
            {/* Split layout: list + detail panel */}
            <div className="flex gap-0 rounded-xl overflow-hidden border border-border-primary bg-bg-card">
              {/* Meeting list */}
              <div className={`min-w-0 transition-all duration-200 ${selectedMeeting ? 'flex-1' : 'w-full'}`}>
                <div className="overflow-y-auto max-h-[calc(100vh-340px)]">
                  {meetings.map((meeting) => (
                    <MeetingListItem
                      key={meeting.id}
                      meeting={meeting}
                      isSelected={selectedId === meeting.id}
                      onSelect={() => setSelectedId(selectedId === meeting.id ? null : meeting.id)}
                    />
                  ))}
                </div>
              </div>

              {/* Detail side panel */}
              {selectedMeeting && (
                <div className="w-[440px] xl:w-[480px] shrink-0 max-h-[calc(100vh-340px)] overflow-hidden">
                  <MeetingDetailPanel
                    meeting={selectedMeeting}
                    teamId={teamId}
                    onTaskUpdated={fetchMeetings}
                    onClose={() => setSelectedId(null)}
                  />
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
