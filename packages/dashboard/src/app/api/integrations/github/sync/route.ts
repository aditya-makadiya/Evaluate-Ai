import { NextResponse, after } from 'next/server';
import { NextRequest } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-server';
import {
  getValidToken,
  getTrackedRepos,
  fetchRecentCommits,
  fetchRecentPRs,
} from '@/lib/github-oauth';
import { matchCodeChangeToTasks } from '@/lib/services/task-matcher';
import { guardApi } from '@/lib/auth';
import { isMultiUserEnabled } from '@/lib/integrations/feature-flag';
import { getProvider } from '@/lib/integrations/registry';
import {
  createOrGetActiveJob,
  markJobDone,
  markJobFailed,
  markJobRunning,
} from '@/lib/integrations/sync-jobs';
import { logIntegration } from '@/lib/integrations/logger';

/**
 * POST /api/integrations/github/sync
 * Body: { team_id: string }
 *
 * Branches on the per-team feature flag:
 *
 *   - Legacy (flag off): synchronous sync using the team-scoped OAuth token
 *     (existing behavior, unchanged).
 *   - Per-user (flag on): creates a sync_jobs row, runs the fan-out via
 *     after() so the HTTP response is a fast 202, returns { job_id }. UI
 *     polls GET /api/integrations/sync-jobs/[jobId] for progress.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { team_id: teamId } = body ?? {};
    if (!teamId) {
      return NextResponse.json({ error: 'team_id is required' }, { status: 400 });
    }

    const admin = getSupabaseAdmin();
    const multiUser = await isMultiUserEnabled(admin, teamId);

    if (multiUser) {
      const guard = await guardApi({ teamId });
      if (guard.response) return guard.response;
      const ctx = guard.ctx;

      const { job, reused } = await createOrGetActiveJob(admin, teamId, 'github', ctx.userId);

      if (!reused) {
        // Kick off the sync after sending the response so clients see a
        // fast 202; the worker updates sync_jobs.progress as it walks repos.
        after(async () => {
          try {
            await markJobRunning(admin, job.id);
            const adapter = getProvider('github');
            const result = await adapter.sync({
              teamId,
              jobId: job.id,
              triggeredByUserId: ctx.userId,
            });
            await markJobDone(admin, job.id, result as unknown as Record<string, unknown>);
            logIntegration({
              team_id: teamId,
              provider: 'github',
              action: 'sync_job_done',
              outcome: 'ok',
              job_id: job.id,
              ...(result as unknown as Record<string, unknown>),
            });
          } catch (err) {
            await markJobFailed(admin, job.id, err);
            logIntegration({
              team_id: teamId,
              provider: 'github',
              action: 'sync_job_failed',
              outcome: 'error',
              job_id: job.id,
              error_message: err instanceof Error ? err.message : String(err),
            });
          }
        });
      }

      return NextResponse.json(
        { success: true, flow: 'v2', jobId: job.id, reused, status: job.status },
        { status: 202 }
      );
    }

    // Legacy path — unchanged synchronous sync
    return await handleLegacySync(teamId);
  } catch (err) {
    console.error('GitHub sync error:', err);
    return NextResponse.json({ error: 'Sync failed unexpectedly' }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// Legacy path (unchanged behavior; pruned of re-runnable comments)
// ---------------------------------------------------------------------------

interface LegacySyncResult {
  reposSynced: number;
  commitsProcessed: number;
  commitsSkipped: number;
  prsProcessed: number;
  prsSkipped: number;
  errors: string[];
}

async function mapGitHubUser(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  teamId: string,
  username: string | null,
  email: string | null
): Promise<string | null> {
  if (!username && !email) return null;
  if (username) {
    const { data } = await supabase
      .from('team_members')
      .select('id')
      .eq('team_id', teamId)
      .ilike('github_username', username)
      .single();
    if (data) return data.id;
  }
  if (email) {
    const { data } = await supabase
      .from('team_members')
      .select('id')
      .eq('team_id', teamId)
      .ilike('email', email)
      .single();
    if (data) return data.id;
  }
  return null;
}

async function handleLegacySync(teamId: string): Promise<NextResponse> {
  const guard = await guardApi({ teamId, roles: ['owner', 'manager'] });
  if (guard.response) return guard.response;

  const supabase = getSupabaseAdmin();

  let token: string;
  try {
    token = await getValidToken(teamId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 404 });
  }

  const { data: integration } = await supabase
    .from('integrations')
    .select('id, last_sync_at')
    .eq('team_id', teamId)
    .eq('provider', 'github')
    .eq('status', 'active')
    .single();

  const since = integration?.last_sync_at
    ? new Date(integration.last_sync_at).toISOString()
    : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const trackedRepos = await getTrackedRepos(teamId);
  if (trackedRepos.length === 0) {
    return NextResponse.json({
      success: true,
      reposSynced: 0,
      commitsProcessed: 0,
      commitsSkipped: 0,
      prsProcessed: 0,
      prsSkipped: 0,
      errors: [],
      message: 'No repos tracked. Select repos to track from the integrations page.',
      syncedAt: new Date().toISOString(),
    });
  }

  const result: LegacySyncResult = {
    reposSynced: 0,
    commitsProcessed: 0,
    commitsSkipped: 0,
    prsProcessed: 0,
    prsSkipped: 0,
    errors: [],
  };

  for (const repoFullName of trackedRepos) {
    try {
      const commits = await fetchRecentCommits(token, repoFullName, since);
      for (const commit of commits) {
        const sha = commit.sha as string;
        const { data: existing } = await supabase
          .from('code_changes')
          .select('id')
          .eq('external_id', sha)
          .eq('team_id', teamId)
          .single();
        if (existing) {
          result.commitsSkipped++;
          continue;
        }
        const commitData = commit.commit as Record<string, unknown>;
        const author = commitData?.author as Record<string, unknown>;
        const message = commitData?.message as string;
        const authorLogin = (commit.author as Record<string, unknown>)?.login as string | null;
        const authorEmail = author?.email as string | null;
        const timestamp = author?.date as string;
        const developerId = await mapGitHubUser(supabase, teamId, authorLogin, authorEmail);

        const { data: codeChange } = await supabase
          .from('code_changes')
          .insert({
            team_id: teamId,
            developer_id: developerId,
            type: 'commit',
            external_id: sha,
            repo: repoFullName,
            title: message?.split('\n')[0] ?? sha.slice(0, 8),
            body: message,
            files_changed: 0,
            additions: 0,
            deletions: 0,
            created_at: timestamp ?? new Date().toISOString(),
          })
          .select('id')
          .single();

        await supabase.from('activity_timeline').insert({
          team_id: teamId,
          developer_id: developerId,
          event_type: 'commit',
          title: `Committed: ${message?.split('\n')[0] ?? sha.slice(0, 8)}`,
          description: `${repoFullName}`,
          metadata: { sha, repo: repoFullName },
          source_id: codeChange?.id ?? sha,
          source_table: 'code_changes',
          occurred_at: timestamp ?? new Date().toISOString(),
        });

        if (codeChange?.id) {
          matchCodeChangeToTasks(codeChange.id, teamId, developerId).catch((err) =>
            console.error('Task matching failed for commit:', err)
          );
        }
        result.commitsProcessed++;
      }

      const prs = await fetchRecentPRs(token, repoFullName, since);
      for (const pr of prs) {
        const prNumber = pr.number as number;
        const prState = pr.state as string;
        const merged = pr.merged_at !== null;
        let type: string;
        if (prState === 'open') type = 'pr_opened';
        else if (prState === 'closed' && merged) type = 'pr_merged';
        else type = 'pr_closed';
        const externalId = `pr-${prNumber}-${type}`;

        const { data: existing } = await supabase
          .from('code_changes')
          .select('id')
          .eq('external_id', externalId)
          .eq('team_id', teamId)
          .single();
        if (existing) {
          result.prsSkipped++;
          continue;
        }
        const prTitle = pr.title as string;
        const userLogin = (pr.user as Record<string, unknown>)?.login as string | null;
        const developerId = await mapGitHubUser(supabase, teamId, userLogin, null);
        const timestamp = (pr.merged_at ?? pr.updated_at ?? pr.created_at) as string;

        const { data: codeChange } = await supabase
          .from('code_changes')
          .insert({
            team_id: teamId,
            developer_id: developerId,
            type,
            external_id: externalId,
            repo: repoFullName,
            branch: (pr.head as Record<string, unknown>)?.ref as string | null,
            title: prTitle,
            body: pr.body as string | null,
            files_changed: 0,
            additions: 0,
            deletions: 0,
            created_at: timestamp ?? new Date().toISOString(),
          })
          .select('id')
          .single();

        const eventLabels: Record<string, string> = {
          pr_opened: 'Opened PR',
          pr_merged: 'Merged PR',
          pr_closed: 'Closed PR',
        };
        await supabase.from('activity_timeline').insert({
          team_id: teamId,
          developer_id: developerId,
          event_type: type,
          title: `${eventLabels[type]}: #${prNumber} ${prTitle}`,
          description: repoFullName,
          metadata: { pr_number: prNumber, repo: repoFullName },
          source_id: codeChange?.id ?? externalId,
          source_table: 'code_changes',
          occurred_at: timestamp ?? new Date().toISOString(),
        });

        if (codeChange?.id) {
          matchCodeChangeToTasks(codeChange.id, teamId, developerId).catch((err) =>
            console.error('Task matching failed for PR:', err)
          );
        }
        result.prsProcessed++;
      }
      result.reposSynced++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      result.errors.push(`${repoFullName}: ${msg}`);
    }
  }

  if (integration) {
    await supabase
      .from('integrations')
      .update({ last_sync_at: new Date().toISOString() })
      .eq('id', integration.id);
  }

  return NextResponse.json({ success: true, ...result, syncedAt: new Date().toISOString() });
}
