import { NextResponse } from 'next/server';
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

// ---------- Types ----------

interface SyncResult {
  reposSynced: number;
  commitsProcessed: number;
  commitsSkipped: number;
  prsProcessed: number;
  prsSkipped: number;
  errors: string[];
}

// ---------- Helpers ----------

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

// ---------- Main Handler ----------

/**
 * POST /api/integrations/github/sync
 *
 * Syncs commits and PRs for all tracked repos using the OAuth token.
 * Body: { team_id: string }
 *
 * NOTE: Currently triggered manually via "Sync Now" button.
 * TODO: Enable cron-based auto-sync (every 15 min) when ready.
 * The cron endpoint at /api/cron/daily can be extended to call this,
 * or a dedicated /api/cron/github-sync endpoint can be created.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { team_id: teamId } = body;

    if (!teamId) {
      return NextResponse.json({ error: 'team_id is required' }, { status: 400 });
    }

    const guard = await guardApi({ teamId, roles: ['owner', 'manager'] });
    if (guard.response) return guard.response;

    const supabase = getSupabaseAdmin();

    // Get OAuth token
    let token: string;
    try {
      token = await getValidToken(teamId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      return NextResponse.json({ error: msg }, { status: 404 });
    }

    // Get last sync time
    const { data: integration } = await supabase
      .from('integrations')
      .select('id, last_sync_at')
      .eq('team_id', teamId)
      .eq('provider', 'github')
      .eq('status', 'active')
      .single();

    const since = integration?.last_sync_at
      ? new Date(integration.last_sync_at).toISOString()
      : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(); // Default: last 7 days

    // Get tracked repos
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

    const result: SyncResult = {
      reposSynced: 0,
      commitsProcessed: 0,
      commitsSkipped: 0,
      prsProcessed: 0,
      prsSkipped: 0,
      errors: [],
    };

    // Process each tracked repo
    for (const repoFullName of trackedRepos) {
      try {
        // Sync commits
        const commits = await fetchRecentCommits(token, repoFullName, since);
        for (const commit of commits) {
          const sha = commit.sha as string;

          // Idempotency check
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

          // Match commit to open tasks (fire-and-forget)
          if (codeChange?.id) {
            matchCodeChangeToTasks(codeChange.id, teamId, developerId).catch((err) =>
              console.error('Task matching failed for commit:', err)
            );
          }

          result.commitsProcessed++;
        }

        // Sync PRs
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

          // Match PR to open tasks (fire-and-forget)
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

    // Update last_sync_at
    if (integration) {
      await supabase
        .from('integrations')
        .update({ last_sync_at: new Date().toISOString() })
        .eq('id', integration.id);
    }

    return NextResponse.json({
      success: true,
      ...result,
      syncedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('GitHub sync error:', err);
    return NextResponse.json(
      { error: 'Sync failed unexpectedly' },
      { status: 500 }
    );
  }
}
