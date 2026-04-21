'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, Check, AlertCircle } from 'lucide-react';

type Status = 'pending' | 'running' | 'done' | 'failed';

interface SyncJobResponse {
  id: string;
  status: Status;
  progress: Record<string, unknown>;
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
}

interface SyncProgressProps {
  jobId: string;
  onComplete?: (job: SyncJobResponse) => void;
  pollMs?: number;
}

/**
 * Polls /api/integrations/sync-jobs/[jobId] every ~2s and renders the
 * progress snapshot until the job resolves. Styled to match the dark app
 * theme — purple accent for in-flight, emerald for done, red for failed.
 */
export function SyncProgress({ jobId, onComplete, pollMs = 2000 }: SyncProgressProps) {
  const [job, setJob] = useState<SyncJobResponse | null>(null);
  const [pollError, setPollError] = useState<string | null>(null);
  const completedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = async () => {
      try {
        const res = await fetch(`/api/integrations/sync-jobs/${jobId}`);
        if (!res.ok) {
          setPollError(`HTTP ${res.status}`);
        } else {
          const data = (await res.json()) as SyncJobResponse;
          if (cancelled) return;
          setJob(data);
          if ((data.status === 'done' || data.status === 'failed') && !completedRef.current) {
            completedRef.current = true;
            onComplete?.(data);
            return;
          }
        }
      } catch (err) {
        setPollError(err instanceof Error ? err.message : 'poll failed');
      }
      timer = setTimeout(tick, pollMs);
    };
    tick();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [jobId, pollMs, onComplete]);

  if (!job) {
    return (
      <div className="flex items-center gap-2 text-sm text-text-secondary py-1">
        <Loader2 className="h-4 w-4 animate-spin text-purple-400" />
        <span>Starting sync…</span>
      </div>
    );
  }

  const p = job.progress as Record<string, number | undefined>;
  const completed = p.completed ?? (p.reposSynced ?? 0) + (p.reposSkipped304 ?? 0);
  const total = p.reposTotal ?? p.usersTotal ?? 0;
  const synced = p.reposSynced ?? 0;
  const skipped = p.reposSkipped304 ?? 0;
  const failed = p.reposFailed ?? 0;
  const uncovered = p.reposUncovered ?? 0;
  const meetingsInserted = p.meetingsInserted ?? 0;
  const commitsInserted = p.commitsInserted ?? 0;
  const prsInserted = p.prsInserted ?? 0;

  const pct = total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0;

  if (job.status === 'done') {
    const summary =
      commitsInserted > 0 || prsInserted > 0
        ? `${commitsInserted} commit${commitsInserted === 1 ? '' : 's'}, ${prsInserted} PR${prsInserted === 1 ? '' : 's'}`
        : meetingsInserted > 0
          ? `${meetingsInserted} meeting${meetingsInserted === 1 ? '' : 's'}`
          : 'no new data';
    return (
      <div className="flex items-center gap-2 text-sm text-emerald-400 py-1">
        <Check className="h-4 w-4" />
        <span>
          Synced {synced} of {total}
          {skipped > 0 ? ` (${skipped} unchanged)` : ''}
          {uncovered > 0 ? ` · ${uncovered} need coverage` : ''}
          {' · '}
          {summary}
        </span>
      </div>
    );
  }

  if (job.status === 'failed') {
    return (
      <div className="flex items-start gap-2 text-sm text-red-400 py-1">
        <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
        <div>
          <div>Sync failed</div>
          {job.error && <div className="text-xs text-red-300/80 mt-0.5">{job.error}</div>}
        </div>
      </div>
    );
  }

  return (
    <div className="py-1">
      <div className="flex items-center gap-2 text-sm text-text-secondary mb-1.5">
        <Loader2 className="h-4 w-4 animate-spin text-purple-400" />
        <span>
          Syncing… {completed}/{total}
          {skipped > 0 ? ` · ${skipped} unchanged` : ''}
          {failed > 0 ? ` · ${failed} failed` : ''}
          {uncovered > 0 ? ` · ${uncovered} uncovered` : ''}
        </span>
      </div>
      <div className="h-1 bg-bg-elevated rounded-full overflow-hidden">
        <div
          className="h-full bg-purple-500 transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
      {pollError && (
        <div className="text-xs text-text-muted mt-1 opacity-60">poll: {pollError}</div>
      )}
    </div>
  );
}
