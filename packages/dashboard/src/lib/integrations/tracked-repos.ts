/**
 * team_tracked_repos helpers.
 *
 * Handles the team-level list of repos the sync button will pull from, plus
 * the one-shot migration from the legacy integrations.config.tracked_repos
 * JSONB array. The migration is idempotent and runs the first time a v2
 * code path touches the list for a team that has legacy data — callers
 * don't need to remember to trigger it explicitly.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { CoverageStatus, ProviderSlug } from './types';
import { logIntegration } from './logger';

export interface TrackedRepoRow {
  id: string;
  team_id: string;
  provider: ProviderSlug;
  repo_full_name: string;
  repo_external_id: string | null;
  added_by_user_id: string | null;
  added_at: string;
  etag_commits: string | null;
  etag_pulls: string | null;
  last_commit_sha_seen: string | null;
  last_sync_at: string | null;
  last_synced_via_user_integration_id: string | null;
  coverage_status: CoverageStatus;
}

/**
 * Copy repos from integrations.config.tracked_repos into team_tracked_repos.
 * Idempotent: skips if team_tracked_repos already has any rows for the
 * (team, provider). Safe to call on every code path — cheap when a no-op.
 */
export async function migrateLegacyTrackedReposIfNeeded(
  admin: SupabaseClient,
  teamId: string,
  provider: ProviderSlug
): Promise<void> {
  const { count, error: countErr } = await admin
    .from('team_tracked_repos')
    .select('id', { count: 'exact', head: true })
    .eq('team_id', teamId)
    .eq('provider', provider);
  if (countErr) throw new Error(`migrate(count): ${countErr.message}`);
  if ((count ?? 0) > 0) return; // already has v2 data, nothing to migrate

  const { data: legacy, error: legacyErr } = await admin
    .from('integrations')
    .select('config')
    .eq('team_id', teamId)
    .eq('provider', provider)
    .eq('status', 'active')
    .maybeSingle();
  if (legacyErr) throw new Error(`migrate(read): ${legacyErr.message}`);
  if (!legacy) return;

  const config = (legacy.config ?? {}) as Record<string, unknown>;
  const repos = config.tracked_repos;
  if (!Array.isArray(repos) || repos.length === 0) return;

  const rows = (repos as unknown[])
    .filter((r): r is string => typeof r === 'string' && r.includes('/'))
    .map((repoFullName) => ({
      team_id: teamId,
      provider,
      repo_full_name: repoFullName,
    }));
  if (rows.length === 0) return;

  const { error: insErr } = await admin
    .from('team_tracked_repos')
    .insert(rows);
  if (insErr && !insErr.message.includes('duplicate key')) {
    throw new Error(`migrate(insert): ${insErr.message}`);
  }

  logIntegration({
    team_id: teamId,
    provider,
    action: 'migrate_legacy_tracked_repos',
    outcome: 'ok',
    count: rows.length,
  });
}

export async function listTeamTrackedRepos(
  admin: SupabaseClient,
  teamId: string,
  provider: ProviderSlug
): Promise<TrackedRepoRow[]> {
  await migrateLegacyTrackedReposIfNeeded(admin, teamId, provider);
  const { data, error } = await admin
    .from('team_tracked_repos')
    .select('*')
    .eq('team_id', teamId)
    .eq('provider', provider)
    .order('added_at', { ascending: true });
  if (error) throw new Error(`listTeamTrackedRepos: ${error.message}`);
  return (data ?? []) as TrackedRepoRow[];
}

/**
 * Bulk replace: the passed `repoFullNames` becomes the complete tracked list.
 * Rows added get recorded with `addedByUserId`; rows removed are deleted.
 * Implemented as two passes (insert-missing, delete-stale) to avoid
 * wiping+reseeding the whole table, which would drop ETag / last_sync_at
 * state that took work to accumulate.
 */
export async function replaceTeamTrackedRepos(
  admin: SupabaseClient,
  teamId: string,
  provider: ProviderSlug,
  repoFullNames: string[],
  addedByUserId: string
): Promise<{ added: number; removed: number; kept: number }> {
  const desired = new Set(repoFullNames.filter((r) => typeof r === 'string' && r.includes('/')));
  const existing = await listTeamTrackedRepos(admin, teamId, provider);
  const existingNames = new Set(existing.map((r) => r.repo_full_name));

  const toAdd = [...desired].filter((r) => !existingNames.has(r));
  const toRemove = existing.filter((r) => !desired.has(r.repo_full_name));
  const kept = existing.length - toRemove.length;

  if (toAdd.length > 0) {
    const rows = toAdd.map((name) => ({
      team_id: teamId,
      provider,
      repo_full_name: name,
      added_by_user_id: addedByUserId,
    }));
    const { error } = await admin.from('team_tracked_repos').insert(rows);
    if (error) throw new Error(`replaceTeamTrackedRepos(insert): ${error.message}`);
  }

  if (toRemove.length > 0) {
    const { error } = await admin
      .from('team_tracked_repos')
      .delete()
      .in(
        'id',
        toRemove.map((r) => r.id)
      );
    if (error) throw new Error(`replaceTeamTrackedRepos(delete): ${error.message}`);
  }

  logIntegration({
    team_id: teamId,
    provider,
    action: 'replace_tracked_repos',
    outcome: 'ok',
    added: toAdd.length,
    removed: toRemove.length,
    kept,
    initiated_by: addedByUserId,
  });

  return { added: toAdd.length, removed: toRemove.length, kept };
}

export async function removeTrackedRepo(
  admin: SupabaseClient,
  teamId: string,
  provider: ProviderSlug,
  repoFullName: string
): Promise<boolean> {
  const { error, count } = await admin
    .from('team_tracked_repos')
    .delete({ count: 'exact' })
    .eq('team_id', teamId)
    .eq('provider', provider)
    .eq('repo_full_name', repoFullName);
  if (error) throw new Error(`removeTrackedRepo: ${error.message}`);
  return (count ?? 0) > 0;
}
