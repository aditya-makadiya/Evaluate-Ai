/**
 * ProviderAdapter — one implementation per supported integration.
 *
 * Routes in src/app/api/integrations/... look up the adapter via the
 * registry and delegate all provider-specific behavior here. Adding a new
 * provider means: implement this interface + register it in registry.ts +
 * seed a row in the `providers` table. No route changes.
 *
 * Not every adapter needs every method:
 *   - OAuth providers implement exchangeCodeForToken / refreshToken / revoke
 *   - API-key providers (Fireflies today) skip the OAuth trio and only need
 *     connectWithApiKey
 *   - GitHub-style providers that expose a repo list implement
 *     fetchAccessibleRepos; Fireflies doesn't and leaves it undefined
 */

import type {
  ExternalAccount,
  ProviderSlug,
  RepoRef,
  SyncContext,
  SyncResult,
  TokenBundle,
} from './types';

export interface ProviderAdapter {
  readonly slug: ProviderSlug;
  readonly displayName: string;
  readonly authType: 'oauth2' | 'api_key';

  /** OAuth authorize URL. Only present for authType === 'oauth2'. */
  readonly oauthConfig?: {
    authorizeUrl: string;
    tokenUrl: string;
    defaultScopes: string[];
  };

  /**
   * OAuth path: exchange the code returned from the authorize redirect
   * for an access token. Throws on failure; caller surfaces a user-safe
   * error message.
   */
  exchangeCodeForToken?(code: string): Promise<TokenBundle>;

  /**
   * API-key path: validate the user-supplied key by calling the provider's
   * identity endpoint, return the account identity. If the key is invalid
   * the adapter throws; the route wraps that as a 400 to the user.
   */
  validateApiKey?(apiKey: string): Promise<{ token: TokenBundle; identity: ExternalAccount }>;

  refreshToken?(refreshToken: string): Promise<TokenBundle>;

  /**
   * Revoke the token at the provider side. Best-effort — if the provider
   * is unreachable we still mark our local row as revoked. Called on user
   * disconnect and on team_member offboarding.
   */
  revoke?(token: string): Promise<void>;

  /** Return the user identity (id + handle) for an access token. */
  fetchAccountIdentity(token: string): Promise<ExternalAccount>;

  /**
   * List repos accessible to this token. Populates user_integration_repos
   * so the sync planner can answer "who in this team can see repo X?" in
   * one query. Only meaningful for GitHub-style providers.
   */
  fetchAccessibleRepos?(token: string): Promise<RepoRef[]>;

  /** The sync entrypoint. Implementations update sync_jobs.progress as they go. */
  sync(ctx: SyncContext): Promise<SyncResult>;
}
