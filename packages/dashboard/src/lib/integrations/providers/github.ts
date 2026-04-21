/**
 * GitHub provider adapter.
 *
 * Thin wrappers for OAuth + identity + repo discovery plus the full sync
 * algorithm (one repo, one token, ETag-cached, fail-through). Connect-time
 * primitives reuse lib/github-oauth.ts; sync-time primitives are local to
 * this module so we can capture rate-limit headers and ETags uniformly.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ProviderAdapter } from '../provider';
import type {
  ExternalAccount,
  RateLimitSnapshot,
  RepoRef,
  SyncContext,
  SyncResult,
  TokenBundle,
} from '../types';
import {
  discoverAllRepos,
  exchangeCodeForTokens,
  fetchAuthenticatedUser,
  refreshAccessToken,
} from '../../github-oauth';
import { getSupabaseAdmin } from '../../supabase-server';
import {
  decryptAccessToken,
  dropAccessibleRepo,
  markIntegrationStatus,
  updateRateLimitSnapshot,
} from '../user-integrations';
import {
  listTeamTrackedRepos,
  migrateLegacyTrackedReposIfNeeded,
} from '../tracked-repos';
import { updateJobProgress } from '../sync-jobs';
import { resolveGitHubDeveloper } from '../attribution';
import { logIntegration } from '../logger';

const GITHUB_API = 'https://api.github.com';
const CONCURRENCY = 5;
const BACKFILL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days — first-sync window

interface FetchOutcome<T> {
  status: number;
  body: T | null;
  etag: string | null;
  rateLimit: RateLimitSnapshot;
}

function readRateLimit(res: Response): RateLimitSnapshot {
  const rem = res.headers.get('x-ratelimit-remaining');
  const reset = res.headers.get('x-ratelimit-reset');
  return {
    remaining: rem != null ? parseInt(rem, 10) : null,
    resetAt: reset != null ? new Date(parseInt(reset, 10) * 1000) : null,
  };
}

async function ghFetch<T>(
  token: string,
  path: string,
  etag?: string | null
): Promise<FetchOutcome<T>> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github.v3+json',
  };
  if (etag) headers['If-None-Match'] = etag;

  const res = await fetch(`${GITHUB_API}${path}`, { headers });
  const rateLimit = readRateLimit(res);
  const etagOut = res.headers.get('etag');

  if (res.status === 304) {
    return { status: 304, body: null, etag: etagOut, rateLimit };
  }
  if (!res.ok) {
    return { status: res.status, body: null, etag: etagOut, rateLimit };
  }
  const body = (await res.json()) as T;
  return { status: res.status, body, etag: etagOut, rateLimit };
}

function notImplemented(method: string): never {
  throw new Error(`githubAdapter.${method} not yet implemented`);
}

/**
 * Bounded parallel map. Works through `items` with at most `limit` fetches
 * in flight; returns in item order. Cheaper than p-limit for this one-off.
 */
async function parallelMap<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers: Promise<void>[] = [];
  for (let w = 0; w < Math.min(limit, items.length); w++) {
    workers.push(
      (async () => {
        while (true) {
          const i = next++;
          if (i >= items.length) return;
          results[i] = await fn(items[i], i);
        }
      })()
    );
  }
  await Promise.all(workers);
  return results;
}

// ---------------------------------------------------------------------------
// Public adapter
// ---------------------------------------------------------------------------

export const githubAdapter: ProviderAdapter = {
  slug: 'github',
  displayName: 'GitHub',
  authType: 'oauth2',
  oauthConfig: {
    authorizeUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    defaultScopes: ['repo', 'read:org', 'read:user', 'user:email'],
  },

  async exchangeCodeForToken(code: string): Promise<TokenBundle> {
    const t = await exchangeCodeForTokens(code);
    return {
      accessToken: t.accessToken,
      refreshToken: t.refreshToken,
      expiresAt: t.expiresIn ? new Date(Date.now() + t.expiresIn * 1000) : null,
    };
  },

  async refreshToken(refreshToken: string): Promise<TokenBundle> {
    const t = await refreshAccessToken(refreshToken);
    return {
      accessToken: t.accessToken,
      refreshToken: t.refreshToken,
      expiresAt: t.expiresIn ? new Date(Date.now() + t.expiresIn * 1000) : null,
    };
  },

  async revoke(token: string): Promise<void> {
    const clientId = process.env.GITHUB_OAUTH_CLIENT_ID;
    const clientSecret = process.env.GITHUB_OAUTH_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      throw new Error('GitHub OAuth credentials missing — cannot revoke');
    }
    const basic = Buffer.from(`${clientId}:${clientSecret}`, 'utf8').toString('base64');
    const response = await fetch(
      `${GITHUB_API}/applications/${clientId}/grant`,
      {
        method: 'DELETE',
        headers: {
          Authorization: `Basic ${basic}`,
          Accept: 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ access_token: token }),
      }
    );
    if (response.status !== 204 && response.status !== 404) {
      const body = await response.text().catch(() => '');
      throw new Error(`GitHub revoke failed (${response.status}): ${body.slice(0, 200)}`);
    }
  },

  async fetchAccountIdentity(token: string): Promise<ExternalAccount> {
    const user = await fetchAuthenticatedUser(token);
    return { id: String(user.id), handle: user.login };
  },

  async fetchAccessibleRepos(token: string): Promise<RepoRef[]> {
    const repos = await discoverAllRepos(token);
    return repos.map((r) => ({ fullName: r.full_name, externalId: String(r.id) }));
  },

  async sync(ctx: SyncContext): Promise<SyncResult> {
    return runGitHubSync(ctx);
  },
};

// ---------------------------------------------------------------------------
// Sync implementation
// ---------------------------------------------------------------------------

interface RepoSyncStats {
  repo: string;
  status: 'synced' | 'skipped_304' | 'failed' | 'no_token';
  commitsInserted: number;
  prsInserted: number;
  error?: string;
}

async function runGitHubSync(ctx: SyncContext): Promise<SyncResult> {
  const admin = getSupabaseAdmin();
  const { teamId, jobId } = ctx;

  // Lazy migration of legacy tracked_repos so the first v2 sync for a team
  // has repos to work with.
  await migrateLegacyTrackedReposIfNeeded(admin, teamId, 'github');

  const tracked = await listTeamTrackedRepos(admin, teamId, 'github');

  if (tracked.length === 0) {
    return {
      reposTotal: 0,
      reposSynced: 0,
      reposSkipped304: 0,
      reposFailed: 0,
      commitsInserted: 0,
      prsInserted: 0,
      errors: [],
    };
  }

  // Planner picks one user_integration per repo (rarity-sorted, budget-aware).
  const { planTokenAssignments } = await import('../user-integrations');
  const plan = await planTokenAssignments(admin, teamId, 'github');
  const assignmentByRepo = new Map(plan.assignments.map((a) => [a.repoFullName, a]));

  // Pre-fetch the encrypted tokens keyed by user_integration_id so we don't
  // re-query per repo.
  const integrationIds = [...new Set(plan.assignments.map((a) => a.userIntegrationId))];
  const tokenByIntegration = new Map<string, string>();
  if (integrationIds.length > 0) {
    const { data, error } = await admin
      .from('user_integrations')
      .select('id, access_token_encrypted')
      .in('id', integrationIds);
    if (error) throw new Error(`sync(load tokens): ${error.message}`);
    for (const row of data ?? []) {
      tokenByIntegration.set(
        row.id as string,
        decryptAccessToken({ access_token_encrypted: (row as { access_token_encrypted: Buffer }).access_token_encrypted })
      );
    }
  }

  const trackedByName = new Map(tracked.map((r) => [r.repo_full_name, r]));

  let completed = 0;
  const progress = {
    reposTotal: tracked.length,
    reposSynced: 0,
    reposSkipped304: 0,
    reposFailed: 0,
    reposUncovered: 0,
    commitsInserted: 0,
    prsInserted: 0,
  };

  const perRepo: RepoSyncStats[] = await parallelMap(tracked, CONCURRENCY, async (trackedRow) => {
    const assignment = assignmentByRepo.get(trackedRow.repo_full_name);
    if (!assignment) {
      // Marked uncovered by the planner.
      await admin
        .from('team_tracked_repos')
        .update({ coverage_status: 'no_token_available' })
        .eq('id', trackedRow.id);
      progress.reposUncovered++;
      completed++;
      await updateJobProgress(admin, jobId, { ...progress, completed, total: tracked.length });
      return {
        repo: trackedRow.repo_full_name,
        status: 'no_token',
        commitsInserted: 0,
        prsInserted: 0,
      } satisfies RepoSyncStats;
    }

    const token = tokenByIntegration.get(assignment.userIntegrationId);
    if (!token) {
      return {
        repo: trackedRow.repo_full_name,
        status: 'failed',
        commitsInserted: 0,
        prsInserted: 0,
        error: 'token unavailable',
      } satisfies RepoSyncStats;
    }

    const result = await syncOneRepo(admin, ctx, trackedRow, assignment.userIntegrationId, token);

    if (result.status === 'synced') {
      progress.reposSynced++;
      progress.commitsInserted += result.commitsInserted;
      progress.prsInserted += result.prsInserted;
    } else if (result.status === 'skipped_304') {
      progress.reposSkipped304++;
    } else if (result.status === 'failed') {
      progress.reposFailed++;
    }

    completed++;
    await updateJobProgress(admin, jobId, { ...progress, completed, total: tracked.length });
    return result;
  });

  // Bump the integration-level last_sync_at for every token we actually used
  // successfully. Drives the "last synced N ago" indicator on the roster UI.
  const usedIntegrationIds = [...new Set(
    perRepo
      .filter((r) => r.status === 'synced' || r.status === 'skipped_304')
      .map((r) => assignmentByRepo.get(r.repo)?.userIntegrationId)
      .filter((id): id is string => !!id)
  )];
  if (usedIntegrationIds.length > 0) {
    await admin
      .from('user_integrations')
      .update({ last_sync_at: new Date().toISOString() })
      .in('id', usedIntegrationIds);
  }

  const errors = perRepo
    .filter((r) => r.status === 'failed' && r.error)
    .map((r) => `${r.repo}: ${r.error}`);

  return {
    reposTotal: tracked.length,
    reposSynced: progress.reposSynced,
    reposSkipped304: progress.reposSkipped304,
    reposFailed: progress.reposFailed,
    reposUncovered: progress.reposUncovered,
    commitsInserted: progress.commitsInserted,
    prsInserted: progress.prsInserted,
    errors,
  };
}

interface TrackedRepoMinimal {
  id: string;
  repo_full_name: string;
  etag_commits: string | null;
  etag_pulls: string | null;
  last_sync_at: string | null;
}

async function syncOneRepo(
  admin: SupabaseClient,
  ctx: SyncContext,
  tracked: TrackedRepoMinimal,
  userIntegrationId: string,
  token: string
): Promise<RepoSyncStats> {
  const { teamId } = ctx;
  const repoFullName = tracked.repo_full_name;
  const since = tracked.last_sync_at
    ? new Date(tracked.last_sync_at).toISOString()
    : new Date(Date.now() - BACKFILL_MS).toISOString();

  try {
    const commitsPath = `/repos/${repoFullName}/commits?per_page=100&since=${encodeURIComponent(since)}`;
    const commitsRes = await ghFetch<Array<Record<string, unknown>>>(
      token,
      commitsPath,
      tracked.etag_commits
    );
    await updateRateLimitSnapshot(admin, userIntegrationId, commitsRes.rateLimit);

    if (commitsRes.status === 401) {
      await markIntegrationStatus(admin, userIntegrationId, 'expired', 'GitHub returned 401');
      return { repo: repoFullName, status: 'failed', commitsInserted: 0, prsInserted: 0, error: 'token expired (401)' };
    }
    if (commitsRes.status === 403 || commitsRes.status === 404) {
      await dropAccessibleRepo(admin, userIntegrationId, repoFullName);
      return { repo: repoFullName, status: 'failed', commitsInserted: 0, prsInserted: 0, error: `access revoked (${commitsRes.status})` };
    }

    let commitsInserted = 0;
    const prsResult = { etag: null as string | null };
    let prsInserted = 0;

    const commitIs304 = commitsRes.status === 304;

    if (commitsRes.status === 200 && commitsRes.body) {
      for (const commit of commitsRes.body) {
        const sha = commit.sha as string;
        if (!sha) continue;

        const { data: existing } = await admin
          .from('code_changes')
          .select('id')
          .eq('external_id', sha)
          .eq('team_id', teamId)
          .maybeSingle();
        if (existing) continue;

        const cmt = commit.commit as Record<string, unknown> | undefined;
        const authorMeta = cmt?.author as Record<string, unknown> | undefined;
        const githubAuthor = commit.author as Record<string, unknown> | undefined;
        const message = (cmt?.message as string) ?? '';
        const timestamp = (authorMeta?.date as string) ?? new Date().toISOString();

        const developerId = await resolveGitHubDeveloper(admin, teamId, {
          authorId: githubAuthor?.id != null ? String(githubAuthor.id) : null,
          username: (githubAuthor?.login as string) ?? null,
          email: (authorMeta?.email as string) ?? null,
        });

        const { data: codeChange } = await admin
          .from('code_changes')
          .insert({
            team_id: teamId,
            developer_id: developerId,
            type: 'commit',
            external_id: sha,
            repo: repoFullName,
            title: message.split('\n')[0] ?? sha.slice(0, 8),
            body: message,
            files_changed: 0,
            additions: 0,
            deletions: 0,
            created_at: timestamp,
          })
          .select('id')
          .single();

        await admin.from('activity_timeline').insert({
          team_id: teamId,
          developer_id: developerId,
          event_type: 'commit',
          title: `Committed: ${message.split('\n')[0] ?? sha.slice(0, 8)}`,
          description: repoFullName,
          metadata: { sha, repo: repoFullName },
          source_id: codeChange?.id ?? sha,
          source_table: 'code_changes',
          occurred_at: timestamp,
        });

        if (codeChange?.id) {
          // Fire-and-forget task matching — don't block on it
          const { matchCodeChangeToTasks } = await import('../../services/task-matcher');
          matchCodeChangeToTasks(codeChange.id, teamId, developerId).catch((e) =>
            console.error('Task matching (commit) failed:', e)
          );
        }

        commitsInserted++;
      }
    }

    // Pull requests — no If-None-Match on /pulls (often changes even without new PRs),
    // but we still capture the ETag and read it for future comparison.
    const prsPath = `/repos/${repoFullName}/pulls?state=all&sort=updated&direction=desc&per_page=50`;
    const prsRes = await ghFetch<Array<Record<string, unknown>>>(token, prsPath, tracked.etag_pulls);
    await updateRateLimitSnapshot(admin, userIntegrationId, prsRes.rateLimit);
    prsResult.etag = prsRes.etag;

    if (prsRes.status === 200 && prsRes.body) {
      const sinceMs = new Date(since).getTime();
      const recent = prsRes.body.filter((pr) => {
        const updatedAt = pr.updated_at ? new Date(pr.updated_at as string).getTime() : 0;
        return updatedAt >= sinceMs;
      });

      for (const pr of recent) {
        const prNumber = pr.number as number;
        const prState = pr.state as string;
        const merged = pr.merged_at !== null;

        let type: string;
        if (prState === 'open') type = 'pr_opened';
        else if (prState === 'closed' && merged) type = 'pr_merged';
        else type = 'pr_closed';

        const externalId = `pr-${prNumber}-${type}`;

        const { data: existing } = await admin
          .from('code_changes')
          .select('id')
          .eq('external_id', externalId)
          .eq('team_id', teamId)
          .maybeSingle();
        if (existing) continue;

        const prTitle = (pr.title as string) ?? `#${prNumber}`;
        const prUser = pr.user as Record<string, unknown> | undefined;
        const developerId = await resolveGitHubDeveloper(admin, teamId, {
          authorId: prUser?.id != null ? String(prUser.id) : null,
          username: (prUser?.login as string) ?? null,
          email: null,
        });
        const timestamp =
          (pr.merged_at as string) ?? (pr.updated_at as string) ?? (pr.created_at as string) ?? new Date().toISOString();

        const { data: codeChange } = await admin
          .from('code_changes')
          .insert({
            team_id: teamId,
            developer_id: developerId,
            type,
            external_id: externalId,
            repo: repoFullName,
            branch: (pr.head as Record<string, unknown>)?.ref as string | null,
            title: prTitle,
            body: (pr.body as string) ?? null,
            files_changed: 0,
            additions: 0,
            deletions: 0,
            created_at: timestamp,
          })
          .select('id')
          .single();

        const labels: Record<string, string> = {
          pr_opened: 'Opened PR',
          pr_merged: 'Merged PR',
          pr_closed: 'Closed PR',
        };
        await admin.from('activity_timeline').insert({
          team_id: teamId,
          developer_id: developerId,
          event_type: type,
          title: `${labels[type]}: #${prNumber} ${prTitle}`,
          description: repoFullName,
          metadata: { pr_number: prNumber, repo: repoFullName },
          source_id: codeChange?.id ?? externalId,
          source_table: 'code_changes',
          occurred_at: timestamp,
        });

        if (codeChange?.id) {
          const { matchCodeChangeToTasks } = await import('../../services/task-matcher');
          matchCodeChangeToTasks(codeChange.id, teamId, developerId).catch((e) =>
            console.error('Task matching (PR) failed:', e)
          );
        }

        prsInserted++;
      }
    }

    // Persist repo-level state: ETags, last_sync_at, coverage=ok, the
    // user_integration that actually did the work. Even on 304 we bump
    // last_sync_at so the "last synced N ago" indicator stays fresh.
    await admin
      .from('team_tracked_repos')
      .update({
        etag_commits: commitsRes.etag ?? tracked.etag_commits,
        etag_pulls: prsResult.etag ?? tracked.etag_pulls,
        last_sync_at: new Date().toISOString(),
        last_synced_via_user_integration_id: userIntegrationId,
        coverage_status: 'ok',
      })
      .eq('id', tracked.id);

    logIntegration({
      team_id: teamId,
      provider: 'github',
      action: 'sync_repo',
      outcome: commitIs304 ? 'skip' : 'ok',
      repo: repoFullName,
      commits_inserted: commitsInserted,
      prs_inserted: prsInserted,
      commits_304: commitIs304,
    });

    return {
      repo: repoFullName,
      status: commitIs304 && prsInserted === 0 ? 'skipped_304' : 'synced',
      commitsInserted,
      prsInserted,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logIntegration({
      team_id: teamId,
      provider: 'github',
      action: 'sync_repo',
      outcome: 'error',
      repo: repoFullName,
      error_message: message,
    });
    return { repo: repoFullName, status: 'failed', commitsInserted: 0, prsInserted: 0, error: message };
  }
}

// Kept importable from outside (e.g. tests) without forcing the whole module.
export { runGitHubSync };
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function _ensureSignature(): never {
  return notImplemented('unused');
}
