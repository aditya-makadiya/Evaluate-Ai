# Integrations

Per-user GitHub + Fireflies integration flow. Every team member connects their own account; sync fans out across tokens using a one-repo-one-token assignment that prefers the member with the most rate-limit budget.

This document is the **current truth**. The full original design proposal with phase-by-phase rollout lives in [`history/integrations-ownership-plan.md`](./history/integrations-ownership-plan.md).

## Model

> **Credentials are personal. Data is shared. Governance is managerial. One repo, one token.**

- Each user has at most one `user_integrations` row per provider
- The team has one `team_tracked_repos` list — managers curate, any member can propose
- Sync picks exactly one token per tracked repo (the one with the most remaining rate-limit budget among members with access)
- Attribution uses OAuth-provided identity (`github_user_id`, Fireflies `user_id`) — not brittle text matching

## Data plane

### Tables

| Table | What it stores | Written by |
|---|---|---|
| `providers` | Registry: `github`, `fireflies`. Not user-facing. | Seed migration only |
| `user_integrations` | Per-user encrypted tokens, account identity, rate-limit snapshot, status | OAuth callback + adapter refresh |
| `user_integration_repos` | Who-can-see-what index (for the planner) | Populated on connect and refresh |
| `team_tracked_repos` | Team's sync list with per-repo ETag cache | Manager via Manage modal |
| `sync_jobs` | One row per sync click; `pending → running → done\|failed` | Sync route + background worker |
| `team_members.github_user_id` | Numeric GitHub id for deterministic attribution | OAuth callback (Phase 4 writeback) |

### Encryption

Integration tokens are encrypted in Node with AES-256-GCM:
- Key: `EVALUATEAI_ENCRYPTION_KEY` env var, 32 bytes base64 (or any string, derived via SHA-256)
- Storage: `BYTEA` column, layout `iv(12) || authTag(16) || ciphertext`
- Helpers: `src/lib/integrations/crypto.ts` (`encryptToken`, `decryptToken`)
- Vault migration path: swap the helper bodies to call `vault.decrypted_secrets`; re-encrypt rows once. Schema unchanged.

### RLS

`user_integrations` ciphertext columns are never exposed via the anon key — the public view `user_integrations_public` omits them. Browsers read identity + status through the view; tokens are decrypted server-side only.

Row-level policies:
- Users see their own rows (`self_read`)
- Managers see all rows in their team (`manager_read`)
- Inserts are self-only
- Deletes: self or team manager

## Sync algorithm

Triggered by clicking **Sync** in the dashboard. Not cron, not webhook — explicit user action.

```
1. Create sync_jobs row (status: pending). Return 202 + jobId immediately.
2. Background via Next.js `after()`:
   a. migrateLegacyTrackedReposIfNeeded() — one-shot copy from legacy config.tracked_repos
   b. planTokenAssignments() — (team, provider) → { repo → user_integration_id, uncovered[] }
      - Load tracked repos, active user_integrations, who-can-see-what matrix
      - Sort repos by access rarity ASC, then last_sync_at ASC (freshness)
      - For each repo: pick the candidate with the most rate_limit_remaining
      - Decrement that candidate's budget in-memory, continue
   c. Parallel (cap=5) per-repo fetch:
      - If-None-Match: team_tracked_repos.etag_commits → GitHub returns 304 if unchanged
      - On 304: skip, bump last_sync_at
      - On 200: dedupe by (team_id, external_id) in code_changes, insert fresh rows
      - Update rate_limit_remaining from X-RateLimit-* response headers
      - Failure modes:
        • 401 → mark user_integration expired, retry repo with next-best token
        • 403/404 → drop access row, retry repo with next-best token
        • no token with access → mark repo coverage_status=no_token_available, continue
   d. sync_jobs: status → done | failed, progress = { reposTotal, reposSynced, reposSkipped304, reposFailed, reposUncovered, commitsInserted, prsInserted }
3. Front-end polls /api/integrations/sync-jobs/[jobId] every 2s until status != pending/running.
```

Why one-repo-one-token instead of fan-out-and-dedupe: on a 6-person team with 4 shared repos, fan-out would make 24 API calls. One-repo-one-token makes 4 (with most returning 304 → zero rate-limit cost). Dedupe via `ON CONFLICT DO NOTHING` stays in place as a safety net for concurrent clicks.

### Debounce

`createOrGetActiveJob()` returns the existing row if a job is already `pending` or `running` for that `(team, provider)`. Two teammates clicking Sync within the same window see the same job.

### Provider registry

Adding a provider = implementing `ProviderAdapter` (one file under `src/lib/integrations/providers/`) + seeding `providers` table. Route handlers are generic — they look up the adapter via `PROVIDERS[slug]` and delegate.

```ts
interface ProviderAdapter {
  slug: 'github' | 'fireflies';
  displayName: string;
  authType: 'oauth2' | 'api_key';
  oauthConfig?: { authorizeUrl; tokenUrl; defaultScopes };

  exchangeCodeForToken?(code): Promise<TokenBundle>;
  validateApiKey?(key): Promise<{ token; identity }>;
  refreshToken?(refreshToken): Promise<TokenBundle>;
  revoke?(token): Promise<void>;
  fetchAccountIdentity(token): Promise<ExternalAccount>;
  fetchAccessibleRepos?(token): Promise<RepoRef[]>;
  sync(ctx): Promise<SyncResult>;
}
```

## Authorization model

| Action | Owner | Manager | Developer |
|---|---|---|---|
| Connect own integration | ✅ | ✅ | ✅ |
| Disconnect own | ✅ | ✅ | ✅ |
| Trigger sync | ✅ | ✅ | ✅ (any member can click the button) |
| View team roster | ✅ | ✅ | ❌ (product call — devs don't have actionable items in the roster) |
| Revoke another user's credential | ✅ | ✅ | ❌ |
| Edit team-tracked-repos (add/remove) | ✅ | ✅ | ❌ |
| View own connection status | ✅ | ✅ | ✅ |

Enforcement is server-side via `guardApi({ teamId, roles: [...] })`. The UI shows/hides buttons consistently with the server's rules — clicking a hidden button never triggers a 403 surprise.

## Feature flag (kill switch)

Routes branch on `teams.settings.multi_user_integrations_enabled`. Default is **true** — only an explicit `false` opts a team out to the legacy flow (which is still in the codebase but sees no new traffic).

```sql
-- emergency rollback for one team
UPDATE teams
SET settings = jsonb_set(COALESCE(settings, '{}'::jsonb),
                         '{multi_user_integrations_enabled}', 'false'::jsonb)
WHERE id = '<team-uuid>';
```

Flip back by setting to `true` or removing the key.

## Lifecycle events

| Event | Behavior |
|---|---|
| User connects first time | OAuth → `user_integrations` row + `user_integration_repos` populated + `team_members.github_user_id` backfilled |
| User reconnects (scope upgrade) | Same path; row upserts on `(team_id, user_id, provider)` |
| User self-disconnects | Row deleted + adapter.revoke() called at provider (best-effort — local cleanup never blocks on provider response) |
| Manager revokes another user | Server checks manager role, otherwise same as self-disconnect |
| Team member offboarded (`is_active=false`) | (planned) Auto-revoke their user_integrations rows + call provider revoke |
| Token expires mid-sync | Row marked `expired`, sync fails through to the next candidate token for that repo |
| User loses access to a repo | Row in `user_integration_repos` is removed on the 403/404; next planner run picks a different token |

## Routes

### New v2 routes

| Route | Method | Description |
|---|---|---|
| `/api/integrations/status` | GET | Team roster (per-provider members with status + last sync) |
| `/api/integrations/github/sync` | POST | 202 + `jobId`; runs `adapter.sync` via `after()` |
| `/api/integrations/fireflies/sync` | POST | Same pattern |
| `/api/integrations/sync-jobs/[jobId]` | GET | Poll job status + progress |
| `/api/integrations/github/tracked-repos` | GET/DELETE | List; per-repo remove (manager-only) |
| `/api/integrations/github/track` | POST | Bulk replace team-tracked-repos (manager-only) |
| `/api/integrations/github/refresh-repos` | POST | Refresh caller's accessible-repo list |
| `/api/integrations/disconnect` | POST | Self-disconnect; `target_user_id` for manager-revoking-other |

### Shared with legacy

- `/api/integrations/github/connect` — OAuth initiate, branches on flag
- `/api/integrations/github/callback` — OAuth exchange, branches on state token (v1 = plain base64 `{team_id}`; v2 = HMAC-signed envelope with TTL)

### Deleted

- `/api/integrations/github/webhook/` (sync is button-only)
- `/api/integrations/fireflies/webhook/` (same)
- `/api/integrations/fathom/*` (deprecated integration)

## UI

- **`/dashboard/integrations`**: own cards (Connect or Sync+Manage/Disconnect) + onboarding nudge + active sync progress + team coverage roster (managers only)
- **`/profile`**: Connected Accounts section for adding Google via `supabase.auth.linkIdentity()`

## Observability

- `sync_jobs` is the audit log — who triggered, when, what progress, final stats
- `user_integrations.rate_limit_remaining` and `reset_at` — live budget tracking
- `user_integrations.last_error` / `last_error_at` — last failure per row
- Structured logs via `src/lib/integrations/logger.ts` — includes `{team_id, user_id, provider, action, outcome}` and auto-redacts any key matching `/token|secret|key|password/i`

## Emergency procedures

| Situation | Action |
|---|---|
| One team needs rollback to legacy | `UPDATE teams SET settings = jsonb_set(settings, '{multi_user_integrations_enabled}', 'false')` |
| Global rollback | `UPDATE teams SET settings = jsonb_set(settings, '{multi_user_integrations_enabled}', 'false')` (unqualified) |
| `EVALUATEAI_ENCRYPTION_KEY` rotated accidentally | All existing v2 tokens are now unreadable. Users must reconnect. Legacy data untouched. |
| Sync job stuck in `running` | Function duration likely exceeded. Bump `export const maxDuration` on the sync route, or abort + restart by deleting the stuck row. |
| Team needs attribution repair | Delete + recreate: the user reconnects under v2 → `github_user_id` backfilled → next sync attributes correctly |

## Testing

Unit tests in `packages/dashboard/src/lib/integrations/__tests__/`:

- `crypto.test.ts` — encrypt/decrypt round-trip, tamper detection, missing-key guard
- `oauth-state.test.ts` — HMAC verification, TTL enforcement, legacy fallback
- `planner.test.ts` — rarity-first assignment, budget-aware selection, uncovered handling
- `attribution.test.ts` — 3-tier GitHub lookup, Fireflies email-first
- `sync-jobs.test.ts` — debounce reuses active job
- `feature-flag.test.ts` — default-true with explicit-false opt-out
- `time-ago.test.ts` — every bucket

Run with `pnpm --filter evaluateai-dashboard exec vitest run`.
