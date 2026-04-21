import { NextResponse } from 'next/server';
import { NextRequest } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-server';
import { guardApi } from '@/lib/auth';
import { getSyncJob } from '@/lib/integrations/sync-jobs';

/**
 * GET /api/integrations/sync-jobs/[jobId]
 *
 * Returns the status + progress of a sync job. Any team member of the
 * owning team can read; service returns 404 if the job doesn't belong to
 * the caller's team (avoids leaking other teams' job ids even if someone
 * iterates UUIDs).
 *
 * UI polls this endpoint every ~2s while a sync is in progress.
 */
export async function GET(
  _request: NextRequest,
  ctx: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await ctx.params;
    if (!jobId) {
      return NextResponse.json({ error: 'jobId is required' }, { status: 400 });
    }

    const admin = getSupabaseAdmin();
    const job = await getSyncJob(admin, jobId);
    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    // Auth: any member of the owning team
    const guard = await guardApi({ teamId: job.team_id });
    if (guard.response) return guard.response;

    return NextResponse.json({
      id: job.id,
      teamId: job.team_id,
      provider: job.provider,
      status: job.status,
      progress: job.progress,
      error: job.error,
      startedAt: job.started_at,
      finishedAt: job.finished_at,
      createdAt: job.created_at,
    });
  } catch (err) {
    console.error('Sync-job status error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch job' },
      { status: 500 }
    );
  }
}
