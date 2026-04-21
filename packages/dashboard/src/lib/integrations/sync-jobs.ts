/**
 * sync_jobs row lifecycle.
 *
 * One row per user-initiated Sync click (with debounce: if an active job
 * already exists for a (team, provider), the handler reuses it instead of
 * racing two parallel fan-outs over the same repos).
 *
 *   pending  → running  → done
 *                      ↘ failed
 *
 * The routes return the row id immediately; the background worker (invoked
 * via Next.js `after()`) progresses the row as it goes and records final
 * stats to `progress`.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ProviderSlug, SyncJobStatus } from './types';
import { logIntegration } from './logger';

export interface SyncJobRow {
  id: string;
  team_id: string;
  provider: ProviderSlug;
  triggered_by_user_id: string;
  status: SyncJobStatus;
  progress: Record<string, unknown>;
  error: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
}

export interface CreateOrGetActiveJobResult {
  job: SyncJobRow;
  reused: boolean;
}

/**
 * Returns the currently active (pending | running) sync_jobs row for a
 * (team, provider) if one exists; otherwise inserts a fresh pending row.
 *
 * Idempotency is important: users tend to click Sync twice; a passive team
 * member checking status shouldn't cause a second fan-out to fire while
 * the first is still walking repos.
 */
export async function createOrGetActiveJob(
  admin: SupabaseClient,
  teamId: string,
  provider: ProviderSlug,
  triggeredByUserId: string
): Promise<CreateOrGetActiveJobResult> {
  const { data: existing, error: existingErr } = await admin
    .from('sync_jobs')
    .select('*')
    .eq('team_id', teamId)
    .eq('provider', provider)
    .in('status', ['pending', 'running'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingErr) throw new Error(`createOrGetActiveJob(read): ${existingErr.message}`);
  if (existing) {
    return { job: existing as SyncJobRow, reused: true };
  }

  const { data: inserted, error: insertErr } = await admin
    .from('sync_jobs')
    .insert({
      team_id: teamId,
      provider,
      triggered_by_user_id: triggeredByUserId,
      status: 'pending' satisfies SyncJobStatus,
      progress: {},
    })
    .select('*')
    .single();

  if (insertErr || !inserted) {
    throw new Error(`createOrGetActiveJob(insert): ${insertErr?.message ?? 'unknown'}`);
  }

  logIntegration({
    team_id: teamId,
    provider,
    action: 'sync_job_create',
    outcome: 'ok',
    job_id: inserted.id,
    triggered_by: triggeredByUserId,
  });

  return { job: inserted as SyncJobRow, reused: false };
}

export async function markJobRunning(
  admin: SupabaseClient,
  jobId: string
): Promise<void> {
  const { error } = await admin
    .from('sync_jobs')
    .update({
      status: 'running' satisfies SyncJobStatus,
      started_at: new Date().toISOString(),
    })
    .eq('id', jobId);
  if (error) throw new Error(`markJobRunning: ${error.message}`);
}

export async function updateJobProgress(
  admin: SupabaseClient,
  jobId: string,
  progress: Record<string, unknown>
): Promise<void> {
  const { error } = await admin
    .from('sync_jobs')
    .update({ progress })
    .eq('id', jobId);
  if (error) throw new Error(`updateJobProgress: ${error.message}`);
}

export async function markJobDone(
  admin: SupabaseClient,
  jobId: string,
  progress: Record<string, unknown>
): Promise<void> {
  const { error } = await admin
    .from('sync_jobs')
    .update({
      status: 'done' satisfies SyncJobStatus,
      progress,
      finished_at: new Date().toISOString(),
    })
    .eq('id', jobId);
  if (error) throw new Error(`markJobDone: ${error.message}`);
}

export async function markJobFailed(
  admin: SupabaseClient,
  jobId: string,
  err: unknown,
  progress?: Record<string, unknown>
): Promise<void> {
  const message = err instanceof Error ? err.message : String(err);
  const update: Record<string, unknown> = {
    status: 'failed' satisfies SyncJobStatus,
    error: message.slice(0, 1000),
    finished_at: new Date().toISOString(),
  };
  if (progress) update.progress = progress;

  const { error } = await admin.from('sync_jobs').update(update).eq('id', jobId);
  if (error) {
    // Swallow — logging the update failure is better than throwing from a
    // catch handler that was already handling an error.
    logIntegration({
      action: 'mark_job_failed',
      outcome: 'error',
      job_id: jobId,
      error_message: error.message,
    });
  }
}

export async function getSyncJob(
  admin: SupabaseClient,
  jobId: string
): Promise<SyncJobRow | null> {
  const { data, error } = await admin
    .from('sync_jobs')
    .select('*')
    .eq('id', jobId)
    .maybeSingle();
  if (error) throw new Error(`getSyncJob: ${error.message}`);
  return (data ?? null) as SyncJobRow | null;
}
