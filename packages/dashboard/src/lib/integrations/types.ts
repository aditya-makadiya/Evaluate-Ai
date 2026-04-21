/**
 * Shared types for the integrations subsystem.
 *
 * Kept in a separate module so provider adapters, the registry, and route
 * handlers can import without circular dependencies.
 */

export type ProviderSlug = 'github' | 'fireflies';

export type IntegrationStatus = 'active' | 'expired' | 'revoked' | 'error';

export type SyncJobStatus = 'pending' | 'running' | 'done' | 'failed';

export type CoverageStatus = 'ok' | 'coverage_lost' | 'no_token_available';

export interface TokenBundle {
  accessToken: string;
  refreshToken?: string | null;
  expiresAt?: Date | null;
  scopes?: string[];
}

export interface ExternalAccount {
  id: string;
  handle: string;
}

export interface RepoRef {
  fullName: string;       // 'acme/payments-api'
  externalId: string;     // numeric provider id, stable across renames
}

/**
 * Rate-limit snapshot returned by provider API calls. Persisted to
 * user_integrations.rate_limit_* so the sync planner can pick the best
 * token for the next repo.
 */
export interface RateLimitSnapshot {
  remaining: number | null;
  resetAt: Date | null;
}

/**
 * Shared context passed into ProviderAdapter.sync(). Uses the service-role
 * client; never the anon client.
 */
export interface SyncContext {
  teamId: string;
  jobId: string;
  triggeredByUserId: string;
}

export interface SyncResult {
  reposTotal: number;
  reposSynced: number;
  reposSkipped304: number;
  reposFailed: number;
  /**
   * Repos in team_tracked_repos for which no active user_integration has
   * access. Distinct from `reposFailed` — nothing went wrong, there's
   * just no one on the team who can see the repo. Surfaced in the UI so
   * users can see "3 of 5 needs coverage" rather than a silent gap.
   */
  reposUncovered?: number;
  commitsInserted?: number;
  prsInserted?: number;
  meetingsInserted?: number;
  errors: string[];
}
