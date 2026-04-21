# Integrations Ownership Rework — Developer-Inclusive Model

**Status:** Proposal / Architecture Plan — **Revision 2**
**Author:** Architecture review (ASK)
**Date:** 2026-04-20 (original) · **2026-04-21 (revised)**
**Scope (in):** GitHub + Fireflies.
**Scope (out — deferred to future work):** Jira, Linear, Slack, Google Drive.
**Scope (out — removed):** Fathom (no longer integrated into the portal; its routes are to be deleted in Phase 0).
**Execution model:** Manual sync button on the dashboard only. **No webhooks. No cron.** All sync is user-initiated via a button click.

---

## Implementation Status

| Phase | Status | Date |
|---|---|---|
| Phase 0 — Prep, safety net & dead-code cleanup | ✅ Shipped | 2026-04-21 |
| Phase 1 — New schema + provider registry | ✅ Shipped | 2026-04-21 |
| Phase 2 — Per-user OAuth connect flow | ✅ Shipped | 2026-04-21 |
| Phase 3 — Sync fan-out (one repo, one token) | ✅ Shipped | 2026-04-21 |
| Phase 4 — OAuth-based attribution | ✅ Shipped | 2026-04-21 |
| Phase 5 — UI polish + freshness signal | ✅ Shipped | 2026-04-21 |
| Phase 6 — Cutover scaffolding | ✅ Shipped (manual runbook) | 2026-04-21 |

**Phase 0 delivered:**
- Deleted `src/app/api/integrations/fathom/`, `.../github/webhook/`, `.../fireflies/webhook/`
- Removed corresponding whitelist entries in `src/middleware.ts`
- Patched `/api/admin/overview` to dedupe on `team_id` so dual-path rollout doesn't double-count teams
- Comment in `src/lib/services/task-matcher.ts` updated — sync handler, not webhook

**Phase 1 delivered:**
- Migration `012_per_user_integrations.sql` — `providers`, `user_integrations`, `user_integration_repos`, `team_tracked_repos`, `sync_jobs`, plus RLS and the `user_integrations_public` view
- Migration `013_add_github_user_id.sql` — `team_members.github_user_id` column + index for Phase 4 attribution
- `src/lib/integrations/crypto.ts` — AES-256-GCM encrypt/decrypt (replaced the spec's pgcrypto with Node-native crypto for zero DB round-trips; schema-compatible upgrade path to Vault documented in the file)
- `src/lib/integrations/logger.ts` — structured JSON logger with automatic token/secret redaction
- `src/lib/integrations/types.ts` — shared types (ProviderSlug, TokenBundle, RateLimitSnapshot, SyncContext, etc.)
- `src/lib/integrations/provider.ts` — `ProviderAdapter` interface
- `src/lib/integrations/registry.ts` — frozen `PROVIDERS` map + `getProvider()` / `isProviderSlug()` helpers
- `src/lib/integrations/providers/github.ts` and `.../fireflies.ts` — scaffolded adapters (Phase 2 fills in bodies)
- `src/lib/integrations/user-integrations.ts` — CRUD helpers + `planTokenAssignments()` implementing the rarity-sorted + budget-aware one-repo-one-token algorithm

**Two implementation-time deviations from the written spec:**

1. **No `/v2/` URL prefix.** The existing GitHub OAuth app is registered at `/api/integrations/github/callback` — reregistering or adding a second redirect is needless friction. Phase 2 will keep that URL and branch inside the handler based on the OAuth `state` token and a per-team feature flag. Phase 6 cutover = delete the v1 branch from the handler, no URL migration.
2. **Node AES-256-GCM instead of pgcrypto `pgp_sym_encrypt`.** Same security posture (strong symmetric cipher, app-held key), but no DB round-trip on every encrypt/decrypt and simpler Vault upgrade path (the crypto.ts helpers are the only thing that changes). The migration comment reflects this.

**Phase 2 delivered:**
- `src/lib/integrations/oauth-state.ts` — HMAC-SHA256 signed state envelope with 10-min TTL; timing-safe signature verification; graceful fallback to legacy `{team_id}` base64 format so both flows share the callback URL
- `src/lib/integrations/feature-flag.ts` — `isMultiUserEnabled(teamId)` reads `teams.settings.multi_user_integrations_enabled`; per-request memo via WeakMap on the admin client
- `src/lib/integrations/providers/github.ts` — full implementation: `exchangeCodeForToken`, `refreshToken`, `fetchAccountIdentity`, `fetchAccessibleRepos`, `revoke` (GitHub `DELETE /applications/:client_id/grant` with Basic auth)
- `src/lib/integrations/providers/fireflies.ts` — full implementation: `validateApiKey`, `fetchAccountIdentity` against Fireflies GraphQL
- `src/app/api/integrations/github/connect/route.ts` — rewritten to branch on flag: any team member can connect under v2; state token is signed envelope
- `src/app/api/integrations/github/callback/route.ts` — rewritten to branch on state kind (`v2` / `legacy` / `invalid`); writes to `user_integrations` + populates `user_integration_repos` on v2
- `src/app/api/integrations/disconnect/route.ts` — accepts optional `target_user_id`; self-disconnect allowed to any team member under v2; manager-only for disconnecting others; calls `adapter.revoke()` best-effort at provider side
- `src/app/api/integrations/fireflies/connect/route.ts` — branch on flag; v2 path delegates to adapter and `upsertUserIntegration`
- `src/app/api/integrations/github/refresh-repos/route.ts` — **new.** Self-service endpoint: any user can refresh their own `user_integration_repos` after gaining access to new repos
- `src/app/api/integrations/status/route.ts` — **new.** Returns team roster with per-provider coverage; response shape keyed on `flow: 'v2' | 'legacy'` so the frontend can render both during dual-path

**Security / robustness notes:**
- OAuth state is HMAC-signed with a key derived from `EVALUATEAI_ENCRYPTION_KEY` via `sha256('oauth-state|<key>')` — token-encryption key leak does not automatically enable state forgery (and vice versa)
- State carries `iat`; callbacks older than 10 minutes are rejected before any DB work happens
- `timingSafeEqual` used for signature comparison
- `adapter.revoke` is intentionally best-effort — we never block local status cleanup on a provider round-trip; errors are logged via the structured logger with auto-redaction

**Enabling the per-user flow for a team (dogfood):**
```sql
UPDATE teams
SET settings = jsonb_set(
  COALESCE(settings, '{}'::jsonb),
  '{multi_user_integrations_enabled}',
  'true'::jsonb
)
WHERE id = '<team-uuid>';
```
Everything stays on the legacy path by default. Flip the flag per team for staged rollout.

**Phase 3 delivered:**
- `src/lib/integrations/tracked-repos.ts` — `migrateLegacyTrackedReposIfNeeded` (idempotent seed from `integrations.config.tracked_repos`), `listTeamTrackedRepos`, `replaceTeamTrackedRepos` (set-based bulk replace preserving ETag state), `removeTrackedRepo`
- `src/lib/integrations/sync-jobs.ts` — `createOrGetActiveJob` with debounce (reuses any pending/running row for `(team, provider)`), `markJobRunning` / `markJobDone` / `markJobFailed`, `updateJobProgress`, `getSyncJob`
- `src/lib/integrations/providers/github.ts` — full `sync()` implementation: `planTokenAssignments` → parallel per-repo fetch (cap 5) with If-None-Match ETag conditional GETs, rate-limit snapshot updates from `X-RateLimit-*` after every call, fail-through on 401 (mark expired) / 403 / 404 (drop access row), `ON CONFLICT`-style dedup via check-then-insert on `code_changes.external_id`, deterministic attribution using `github_user_id` → `github_username` → email. Updates `team_tracked_repos.etag_commits/etag_pulls/last_commit_sha_seen/last_sync_at/coverage_status`.
- `src/lib/integrations/providers/fireflies.ts` — full `sync()`: iterates active `user_integrations`, fetches transcripts since per-user `last_sync_at` (30-day first-sync fallback), union-dedupe on `meetings.external_id`, fail-through per-user (401/403 → mark expired). Fireflies is per-attendee so there's no one-repo-one-token analog — coverage comes from token union.
- `src/app/api/integrations/github/sync/route.ts` — rewritten to branch on flag. v2: creates `sync_jobs` row, kicks off `adapter.sync` via Next.js `after()`, returns `202 { jobId }`. Legacy path unchanged.
- `src/app/api/integrations/fireflies/sync/route.ts` — same pattern.
- `src/app/api/integrations/sync-jobs/[jobId]/route.ts` — **new.** Returns `{ status, progress, startedAt, finishedAt, error }`. Any team member of the owning team can poll.
- `src/app/api/integrations/github/track/route.ts` — branches on flag. v2 writes `team_tracked_repos` via `replaceTeamTrackedRepos` (any team member can update the list; manager review via DELETE).
- `src/app/api/integrations/github/tracked-repos/route.ts` — **new.** `GET` lists the team's tracked repos with coverage info; `DELETE ?repo_full_name=...` removes one (manager-only).

**Sync algorithm highlights:**
- **One repo, one token.** For each tracked repo, the planner picks the single best-budget `user_integration` with access; no duplicate fetches. Mature teams see ~90% fewer GitHub API calls than a naive fan-out.
- **ETag 304s are free.** Unchanged repos return 304 without consuming rate-limit budget. A quiet sync of 12 repos where 10 haven't changed costs ~2 API calls.
- **Concurrency-bounded parallelism.** 5 repos in flight at a time. Latency ≈ slowest repo, not sum of repos.
- **Rarity-first assignment.** If Raj is the only teammate with access to `billing-internal`, that repo is assigned before public repos so his token isn't spent on work anyone could do.
- **Fail-through per repo.** 401 → mark that integration expired, other repos continue. 403/404 → drop the (user_integration, repo) access row, next planner run picks a different token. No single bad token kills a team-wide sync.
- **Debounced job creation.** If two teammates click Sync within the same window, the second call returns the existing running job's id instead of creating a parallel one.
- **Legacy migration on first v2 sync.** `integrations.config.tracked_repos` is copied into `team_tracked_repos` idempotently — teams that flip the flag keep their existing tracked list without operator intervention.

**Tests — 29 passing, 4 suites:**
- `crypto.test.ts` — 9 tests (round-trip, tamper detection, missing key)
- `oauth-state.test.ts` — 10 tests (HMAC verify, TTL, tamper detection, legacy fallback)
- `planner.test.ts` — 7 tests (rarity sort, budget selection, null-budget handling, load spread)
- `sync-jobs.test.ts` — 3 tests (debounce reuses pending/running, inserts when none active)

**Bugs found and fixed during verification:**
1. `oauth-state.ts` TTL check used `>` where `>=` is correct (ttl=0 and boundary tokens wrongly accepted)
2. `disconnect/route.ts` — developer passing their own `target_user_id` was blocked by the manager role gate; now authenticates first, compares target to self, then gates on role

**Phase 4 delivered:**
- `src/lib/integrations/attribution.ts` — **new.** Three exports:
  - `resolveGitHubDeveloper(admin, teamId, { authorId, username, email })` — deterministic-first 3-tier lookup. Short-circuits on first hit (no wasted round-trips).
  - `resolveFirefliesParticipant(members, { organizerEmail, name })` — pure function; matches email deterministically first, then falls back to existing fuzzy name heuristic.
  - `writeGitHubUserId(admin, teamId, authUserId, githubUserId)` — best-effort writeback; returns `false` on error instead of throwing so OAuth flow never breaks on attribution writeback.
- `src/app/api/integrations/github/callback/route.ts` — v2 path now calls `writeGitHubUserId` after `upsertUserIntegration`. Updates `team_members.github_user_id` with the immutable numeric id from GitHub's identity endpoint.
- `src/lib/integrations/providers/github.ts` — sync now uses `resolveGitHubDeveloper` (replaced inline `mapGitHubUser`). Attribution becomes deterministic for any user who has connected under v2, regardless of what was typed in `github_username` at onboarding.
- `src/lib/integrations/providers/fireflies.ts` — `processMeeting` now resolves organizer-matching participants via `organizer_email → team_members.email` before falling back to fuzzy name matching. Non-organizer participants still use the fuzzy path (Fireflies doesn't expose per-participant emails in the transcripts query).

**Why this matters:**
Before Phase 4, commits from a user whose `team_members.github_username` was typo'd at onboarding attributed as `developer_id = NULL` forever. After Phase 4, the moment a user completes v2 OAuth, the immutable GitHub id backfills into `team_members.github_user_id`, and every subsequent commit they author attributes correctly. Onboarding typos stop breaking dashboards.

**Tests — 44 passing, 5 suites:**
- Added `attribution.test.ts` — 15 tests covering:
  - GitHub: `github_user_id` short-circuits (verified no fallback queries run), username fallback, email fallback, null when nothing matches, null with no signals, skips id query when authorId missing
  - Fireflies: email wins over name, case-insensitive email, exact name fallback, first-name fallback, substring fallback, no-match returns null
  - `writeGitHubUserId` — returns true on success, false (doesn't throw) on error

**Phase 5 delivered:**
- `src/lib/integrations/time-ago.ts` — deterministic "Nm / Nh / Nd ago" formatter with test coverage
- `src/components/integrations/sync-progress.tsx` — polls `/api/integrations/sync-jobs/[jobId]` every 2s, renders progress bar with completed/total/skipped/failed counts, terminates on `done | failed`
- `src/components/integrations/team-coverage-roster.tsx` — per-provider member roster with connection status, handle, repo count, last-sync badge, status dot. Managers get per-row revoke; developers see read-only. Auto-refreshes via `rosterRefreshKey` after any revoke.
- `src/components/integrations/onboarding-nudge.tsx` — dismissible banner shown to v2 users who haven't connected. Persists dismissal in localStorage per team.
- `src/app/dashboard/integrations/page.tsx` — flag-aware rewrite (surgical edits, not full rewrite):
  - Fetches `/api/integrations/status` up front to detect v2
  - `guardWrite()` no longer blocks developers under v2 (server enforces per-user access)
  - Read-only banner only shows in legacy mode
  - Sync handlers detect 202+jobId and delegate to `<SyncProgress />` — the button stays in "syncing" state until the background job resolves
  - `<TeamCoverageRoster />` renders below the provider cards when v2 is on
  - `<OnboardingNudge />` renders when a v2 user hasn't connected anything

**Tests — 51 passing, 6 suites:**
Added `time-ago.test.ts` (7 tests covering every bucket: never / just now / s / m / h / d / mo / y).

**Phase 6 delivered:**
- `supabase/migrations/014_backfill_user_integrations.sql` — cutover migration. Adds `teams.integrations_cutover_at` marker column, seeds `team_tracked_repos` from `integrations.config.tracked_repos` for any teams not already migrated (idempotent; the app does this lazily but the SQL version makes the cutover moment observable). Includes a NOTICE audit block.
- **Intentional omission:** the migration does **not** insert encrypted `user_integrations` rows from legacy plaintext `integrations.access_token`. Postgres pgcrypto can't produce AES-256-GCM ciphertext directly, and the application-side approach is to have each user re-authorize via the v2 OAuth flow — which also writes `team_members.github_user_id` (Phase 4) and populates `user_integration_repos` (Phase 2) in one step. Migrating ciphertext silently would skip both benefits.
- **Intentional omission:** the migration does **not** drop the legacy `integrations` table. That's a product-timing decision; see the runbook below.

---

## Cutover Runbook — from legacy to v2

This runbook turns the flag into a real cutover on a real team. Do each step in order; each is individually reversible until Step 5.

### Step 1 — Pre-flight verification (~5 min)

Confirm the infrastructure is ready:

```sql
-- Verify all new tables exist
SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  AND tablename IN ('providers', 'user_integrations', 'user_integration_repos',
                    'team_tracked_repos', 'sync_jobs')
ORDER BY tablename;
-- Expected: 5 rows

-- Verify EVALUATEAI_ENCRYPTION_KEY is set in the deployment env (check your
-- hosting dashboard — not queryable from SQL).
```

### Step 2 — Flip the flag for ONE team (dogfood, ~1 hour)

```sql
UPDATE teams
SET settings = jsonb_set(COALESCE(settings, '{}'::jsonb),
                         '{multi_user_integrations_enabled}',
                         'true'::jsonb)
WHERE id = '<internal-team-uuid>';
```

On the internal team, verify end-to-end:

1. Every member reconnects GitHub at `/dashboard/integrations` — the connect button no longer gates on role.
2. Check `user_integrations` — one row per member connected.
3. Check `user_integration_repos` — populated for each member.
4. Check `team_members.github_user_id` — populated after each callback.
5. Click **Sync now** — response is 202 with `jobId`; UI renders live progress; `sync_jobs` table shows the row transition `pending → running → done`.
6. Verify `code_changes` gets fresh rows with `developer_id` populated via `github_user_id`.
7. Verify the coverage roster at the bottom of the integrations page shows X of Y members connected.

If any step fails, flip the flag back off and diagnose. The legacy path is untouched.

### Step 3 — Run the backfill migration (optional but recommended, <1 min)

```bash
# Via the Supabase SQL editor or CLI
psql <DATABASE_URL> -f supabase/migrations/014_backfill_user_integrations.sql
```

This seeds `team_tracked_repos` from legacy `integrations.config.tracked_repos` and stamps `teams.integrations_cutover_at`. Safe to re-run.

### Step 4 — Roll out per team (~2 weeks, one team per day)

Flip the flag for 2–3 friendly customer teams first. Communicate to each team that every member needs to reconnect. Monitor:

```sql
-- Cutover health per team
SELECT
  t.name,
  t.integrations_cutover_at,
  (SELECT COUNT(*) FROM team_members WHERE team_id = t.id AND is_active) AS total_members,
  (SELECT COUNT(DISTINCT user_id) FROM user_integrations
     WHERE team_id = t.id AND provider = 'github' AND status = 'active') AS github_connected,
  (SELECT COUNT(*) FROM team_tracked_repos
     WHERE team_id = t.id AND provider = 'github') AS tracked_repos,
  (SELECT COUNT(*) FROM sync_jobs
     WHERE team_id = t.id AND status = 'failed' AND created_at > NOW() - INTERVAL '7 days') AS recent_sync_failures
FROM teams t
WHERE t.integrations_cutover_at IS NOT NULL
ORDER BY t.integrations_cutover_at DESC;
```

Target: `github_connected / total_members > 80%` within 4 weeks of cutover per team.

Once 80%+ of all teams are cut over, move to Step 5.

### Step 5 — Retire the legacy path (destructive — coordinate broadly)

This is the point of no return. Before starting:
- Ensure every team has `multi_user_integrations_enabled = true`
- Ensure zero requests hit the legacy `.from('integrations')` path for 7 consecutive days (add a temporary log to verify)
- Take a full database snapshot

Then:

```sql
-- 1. Drop the legacy integrations table
DROP TABLE IF EXISTS integrations CASCADE;

-- 2. Remove the feature flag column (optional — leave if it's harmless)
UPDATE teams SET settings = settings - 'multi_user_integrations_enabled';
```

Application-side cleanup (separate release):
- Delete legacy branches inside `callback`, `connect`, `disconnect`, `sync`, `track` routes
- Delete `isMultiUserEnabled` helper + all call sites (always treat as true)
- Delete `integrations.webhook_secret` column (already dead)
- Delete `src/lib/github-oauth.ts` functions `getValidToken` / `getTrackedRepos` / `getOAuthUsername` that query the dropped table
- Delete the legacy `handleLegacySync` / `handleLegacyCallback` / `handleLegacyDisconnect` functions from route handlers
- Update `CLAUDE.md` to describe the per-user model as the only model

### Step 6 — Delete archives (30 days post-cutover)

If nothing has regressed in 30 days, you're done. Drop any remaining archive tables and close the rework issue.

---

## Migration is complete

Across six phases the integrations layer has gone from "one manager-owned credential per team, silently lossy" to "per-user credentials with one-repo-one-token sync, deterministic attribution, manager governance, and live progress UI." The data plane is richer, the sync is ~90% cheaper on mature teams, and no existing feature regressed during the rollout.

---

## Revision Notes (what changed in v2)

This revision locks down scope, architecture, and sequencing based on product decisions made after the v1 review. Key deltas from v1:

| Area | v1 assumption | v2 decision |
|---|---|---|
| Providers in scope | GitHub, Fireflies, Fathom | **GitHub + Fireflies only.** Fathom routes deleted in Phase 0. |
| Webhook ingestion | Both providers had webhook routes | **Removed entirely.** `github/webhook` and `fireflies/webhook` deleted in Phase 0. |
| Sync trigger | "Cron or Supabase Scheduled Function" | **Manual sync button on the dashboard** — one click per team per provider. |
| Sync algorithm | Fan-out: each user fetches each repo; dedupe on `ON CONFLICT` | **One repo, one token.** Assign each tracked repo to exactly one user's token (the one with access + most rate-limit budget), then dedupe on `ON CONFLICT` as a safety net. ~90% fewer API calls on mature teams. |
| Tracked repos | `config.tracked_repos` JSONB on per-user rows | **New `team_tracked_repos` table** — repos belong to the team, not to any one user. |
| Rate-limit awareness | "Prefer the warmest token" (wish) | **`rate_limit_remaining` + `rate_limit_reset_at` columns** on `user_integrations`, updated from GitHub response headers after every call. |
| Request timeout | Not addressed | **`sync_jobs` table + status polling** (Next.js `after()` / `waitUntil()`). UI polls for progress; handles teams with 10+ repos that would blow Vercel's 60s/300s limit. |
| Provider registry | §6.2 Q6 flagged as "strongly recommend yes" but optional | **Mandatory, folded into Phase 1** (1 day budget). Jira/Linear/Slack will land faster when they come. |
| ETag / conditional fetches | Not mentioned | **Required.** Unchanged repos return HTTP 304 — free, don't count against rate limit. Store `etag_commits` / `etag_pulls` on `team_tracked_repos`. |
| Timeline | 3–4 weeks | **~3 weeks focused / 4 weeks with review cycles.** Scope cuts (no webhooks, no cron, no Fathom) offset additions (provider registry, sync_jobs). |

---

## 1. Executive Summary

Today, third-party integrations in EvaluateAI are **team-scoped and manager-gated**: one row per team in the `integrations` table, and only `owner` / `manager` roles can connect, sync, or disconnect. The product thesis depended on managers being the canonical source of truth.

The team has identified two real-world gaps that invalidate that assumption:

| Signal source | Reality on the ground |
|---|---|
| **GitHub** | Not every manager is a collaborator on every repo. Developers always are. Manager-only OAuth misses private repos, fork-based workflows, and org-level repos the manager was never added to. |
| **Fireflies / Meetings** | Managers don't attend every standup, refinement, or spike-review. Developers do. Manager-only transcript pulls miss the actual decision moments. |

Consequence: **the data the platform ingests is structurally incomplete**, and incompleteness is silent (nobody knows what they can't see). This is a data-integrity problem, not a UX problem.

**Recommendation:** Move to a **"per-user credentials, team-aggregated data"** ownership model — the standard used by Linear, Notion, Slack, Segment, and every modern B2B SaaS with integrations. Each user connects their own OAuth/API-key; the platform picks one token per repo (the one with access + best rate-limit budget) and unions results at the team level. Managers retain visibility and governance; developers become first-class data contributors.

This is a **multi-week migration**, not a toggle. Below is the full architectural breakdown + a phased rollout plan designed to ship safely without breaking existing customers.

---

## 2. Current-State Audit

### 2.1 Data model — what's there today

`packages/dashboard/supabase/migrations/000_initial_schema.sql`

```sql
CREATE TABLE integrations (
  id UUID PRIMARY KEY,
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,   -- ← team, not user
  provider TEXT NOT NULL,                                 -- 'github' | 'fireflies'
  access_token TEXT,
  refresh_token TEXT,
  webhook_secret TEXT,                                    -- being deprecated (no webhooks in v2)
  config JSONB DEFAULT '{}',
  status TEXT DEFAULT 'active',
  last_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Key observations:**
- `(team_id, provider)` is effectively unique — **one credential per team per provider**.
- `access_token` and `refresh_token` are **stored in plaintext** (no column-level encryption, no Supabase Vault).
- The `integrations` table **has no RLS policy** (verified against `003_rls_policies.sql`). Access is only safe because all touches are server-side via the service-role key.
- `team_members.role` is an enum: `'owner' | 'manager' | 'developer'`.
- `webhook_secret` column exists but is effectively dead — webhooks are being removed in Phase 0.

### 2.2 Role gates — where "manager-only" is hardcoded

Every mutating integration route calls `guardApi({ teamId, roles: ['owner', 'manager'] })`:

| Route | File | Effect |
|---|---|---|
| `POST /api/integrations/github/connect` | `connect/route.ts:21` | Initiate OAuth |
| `GET  /api/integrations/github/callback` | `callback/route.ts` | (state-scoped, no role check) |
| `GET  /api/integrations/github/discover` | `discover/route.ts:36` | List accessible repos |
| `POST /api/integrations/github/track` | `track/route.ts` | Persist tracked repos |
| `POST /api/integrations/github/sync` | `sync/route.ts:79` | Pull commits/PRs |
| `POST /api/integrations/fireflies/connect` | `fireflies/connect/route.ts:25` | Store API key |
| `POST /api/integrations/fireflies/sync` | `fireflies/sync/route.ts:276` | Pull transcripts |
| `POST /api/integrations/disconnect` | `disconnect/route.ts:32` | Revoke credential |

UI mirrors this: `dashboard/integrations/page.tsx:106` uses `useCanAccess('owner', 'manager')` and displays *"Only owners and managers can configure integrations"* to developers.

### 2.3 Dead code to remove in Phase 0

These paths exist in the repo but are out of scope for v2 and must be deleted **before** migration work begins, to avoid confusion:

| Path | Reason for removal |
|---|---|
| `src/app/api/integrations/fathom/` | Fathom is no longer integrated into the portal. |
| `src/app/api/integrations/github/webhook/route.ts` | v2 uses sync-button-only; no webhook ingestion. |
| `src/app/api/integrations/fireflies/webhook/route.ts` | v2 uses sync-button-only; no webhook ingestion. |
| `integrations.webhook_secret` column (usage) | No producers after webhook routes are deleted. Column itself stays until Phase 6. |

Also audit: admin overview/teams queries for any `provider = 'fathom'` filter — these must be removed before the Fathom routes are deleted, or the admin page will 500.

### 2.4 Attribution path (where developer data actually gets linked)

- **GitHub commits/PRs** → `sync/route.ts: mapGitHubUser()` (lines 26-55) looks up a `team_members` row by `github_username` or falls back to `email`, then writes to `code_changes.developer_id`.
- **Meeting transcripts** → `fireflies/sync/route.ts` (lines 115-135) matches Fireflies participant `name`/`email` against `team_members`, then writes `tasks.assignee_id`.

Both attribution paths **assume the team_member has filled in their GitHub username / email correctly** — a brittle manual step that the new per-user OAuth flow can eliminate (the OAuth identity *is* the ground truth).

---

## 3. Why This Is a Real Problem (Not Just Ergonomics)

1. **Silent data loss.** A manager who isn't a collaborator on a repo can still "connect GitHub" successfully — their OAuth token just returns an empty repo list for that repo. The platform *does not know* what it's missing. Dashboards show "all green" while reality has holes.
2. **Attribution gaps → wrong coaching signals.** If Alice's commits aren't ingested because the manager's OAuth doesn't see her fork, the scoring engine has no heuristics to fire on. Her coaching tips page will be sparse or empty, and she looks less productive than she is.
3. **Meeting → task linkage breaks for the most valuable meetings.** The meetings where managers are *absent* (refinement, spike reviews, pair-debug sessions) are exactly the ones with the richest task-generating signal. Missing those defeats the "meeting decisions → tasks → code" value proposition in CLAUDE.md.
4. **Manager bottleneck.** Every team has one manager who has to reconnect OAuth when a token expires, add every new repo, re-onboard when a new dev joins. This doesn't scale past ~20-person teams.
5. **Security posture.** One manager's leaked token → entire team's GitHub + Fireflies data is exposed. Per-user credentials reduce blast radius.

---

## 4. Target Architecture

### 4.1 The mental model

> **Credentials are personal. Data is shared. Governance is managerial. One repo, one token.**

- Each user connects their own GitHub / Fireflies account with their own OAuth / API-key.
- The platform stores one `user_integrations` row per `(user_id, team_id, provider)`.
- The sync button assigns **each tracked repo to exactly one token** (the best token for that repo) and fetches once. Dedup via `ON CONFLICT` is a safety net for edge cases, not the primary mechanism.
- Managers retain a **governance view**: who connected what, when, last-sync status, revoke button.
- Developers see **their own connections** and the team's coverage status.

### 4.2 Schema changes

Five new tables. Old `integrations` table stays read-only until Phase 6.

#### 4.2.1 `user_integrations` — per-user credentials

```sql
CREATE TABLE user_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL REFERENCES providers(slug),         -- 'github' | 'fireflies'
  access_token_encrypted BYTEA NOT NULL,                     -- Supabase Vault (preferred) or pgcrypto
  refresh_token_encrypted BYTEA,
  token_expires_at TIMESTAMPTZ,
  external_account_id TEXT,                                  -- e.g. GitHub numeric user id
  external_account_handle TEXT,                              -- e.g. 'alice-dev'
  scopes TEXT[],                                             -- granted OAuth scopes
  config JSONB DEFAULT '{}',                                 -- per-user preferences only (no tracked repos — see 4.2.3)
  status TEXT DEFAULT 'active',                              -- 'active' | 'expired' | 'revoked' | 'error'
  rate_limit_remaining INT,                                  -- from X-RateLimit-Remaining after last call
  rate_limit_reset_at TIMESTAMPTZ,                           -- from X-RateLimit-Reset after last call
  last_sync_at TIMESTAMPTZ,
  last_error TEXT,
  last_error_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (team_id, user_id, provider)
);

CREATE INDEX ON user_integrations (team_id, provider, status);
CREATE INDEX ON user_integrations (user_id);
```

**Why `external_account_id`:** Attribution becomes deterministic (OAuth tells us the GitHub numeric id), eliminating the `team_members.github_username` text-matching fragility.

**Why `rate_limit_remaining` / `rate_limit_reset_at`:** With one sync button driving multiple API calls, a naively-picked token can burn through its 5,000/hour budget, 403, and leave the user stuck for an hour. These columns — populated from GitHub's response headers on every call — let the worker pick the token with the most budget for each repo. See §4.3.

#### 4.2.2 `user_integration_repos` — who-can-see-what index

```sql
CREATE TABLE user_integration_repos (
  user_integration_id UUID NOT NULL REFERENCES user_integrations(id) ON DELETE CASCADE,
  repo_full_name TEXT NOT NULL,                  -- 'acme/payments-api'
  repo_external_id TEXT,                         -- GitHub numeric repo id (stable across renames)
  last_verified_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_integration_id, repo_full_name)
);

CREATE INDEX ON user_integration_repos (repo_full_name);
```

Populated when a user connects (the existing `/discover` flow already calls `GET /user/repos`) and refreshable on demand via a "refresh my accessible repos" action. Used by the sync assignment algorithm to answer *"who in this team can see repo X?"* in one query.

#### 4.2.3 `team_tracked_repos` — the team's sync list

Replaces the old `config.tracked_repos` JSONB blob. Tracked repos belong to the team, not to any one user.

```sql
CREATE TABLE team_tracked_repos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  provider TEXT NOT NULL REFERENCES providers(slug),
  repo_full_name TEXT NOT NULL,
  repo_external_id TEXT,
  added_by_user_id UUID REFERENCES auth.users(id),
  added_at TIMESTAMPTZ DEFAULT NOW(),
  etag_commits TEXT,                              -- for conditional GET on commits endpoint
  etag_pulls TEXT,                                -- for conditional GET on PRs endpoint
  last_commit_sha_seen TEXT,
  last_sync_at TIMESTAMPTZ,
  last_synced_via_user_integration_id UUID REFERENCES user_integrations(id),
  coverage_status TEXT DEFAULT 'ok',              -- 'ok' | 'coverage_lost' | 'no_token_available'
  UNIQUE (team_id, provider, repo_full_name)
);

CREATE INDEX ON team_tracked_repos (team_id, provider);
```

**Why ETags live here (not on user_integrations):** ETags are a property of the repo's state at GitHub, not of the user's session. If Alice's token sees `acme/payments-api` at etag `W/"abc123"` and Bob's token later fetches the same repo, GitHub will return the same ETag. Storing at the team/repo level means *any* token can use the ETag to skip a no-change fetch.

#### 4.2.4 `sync_jobs` — background sync with status polling

```sql
CREATE TABLE sync_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  provider TEXT NOT NULL REFERENCES providers(slug),
  triggered_by_user_id UUID NOT NULL REFERENCES auth.users(id),
  status TEXT NOT NULL DEFAULT 'pending',         -- 'pending' | 'running' | 'done' | 'failed'
  progress JSONB DEFAULT '{}',                    -- { repos_total, repos_synced, repos_skipped_304, ... }
  error TEXT,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX ON sync_jobs (team_id, provider, created_at DESC);
```

See §4.8 for why this exists.

#### 4.2.5 `providers` — registry (optional SQL mirror of the TS registry)

```sql
CREATE TABLE providers (
  slug TEXT PRIMARY KEY,                          -- 'github', 'fireflies'
  display_name TEXT NOT NULL,
  auth_type TEXT NOT NULL,                        -- 'oauth2' | 'api_key'
  is_enabled BOOLEAN DEFAULT true,
  config JSONB DEFAULT '{}'                       -- non-secret: default scopes, rate-limit hints
);

INSERT INTO providers (slug, display_name, auth_type) VALUES
  ('github', 'GitHub', 'oauth2'),
  ('fireflies', 'Fireflies', 'api_key');
```

Gives you referential integrity (no typo'd `'githab'` rows) and a platform-wide kill switch per provider. See §4.7 for the TS side.

#### 4.2.6 Why a new set of tables, not in-place migration

- The old `integrations` table stays as a read-only fallback for one release. If the new sync path has a bug, we can revert without data loss.
- After Phase 6, old rows get backfilled into `user_integrations` and the `integrations` table is dropped.

### 4.3 Sync strategy — one repo, one token

With **no cron and no webhooks**, sync fires exclusively on a user clicking the **Sync** button. The algorithm must be fast (user is waiting, serverless has a time budget) and thrifty (rate-limit budget is finite).

#### The algorithm (one pass, per provider)

```
1. Create a sync_job row for (team_id, provider, triggered_by = clicker)
2. Kick off async work via Next.js after() / waitUntil(); respond 202 with job_id

   In the background:
3. Load team_tracked_repos for (team_id, provider)
4. Load all active user_integrations in the team, with rate_limit_remaining / reset
5. Load user_integration_repos joined against those integrations

6. Sort tracked repos by (users_with_access ASC, last_sync_at ASC)
   → rare repos first (so their only-possible token isn't wasted on public ones)
   → oldest-synced first within a rarity bucket (freshness)

7. For each repo (with a concurrency cap, e.g. 5 in parallel):
     chosen = user_integration with access to this repo AND max(rate_limit_remaining)
     if no active token has access:
       set team_tracked_repos.coverage_status = 'no_token_available'
       continue

     issue conditional GET with If-None-Match: team_tracked_repos.etag_commits
       on 304 Not Modified → skip, bump last_sync_at, don't decrement budget
       on 200 OK           → upsert into code_changes ON CONFLICT (repo_id, commit_sha) DO NOTHING
                             store new etag, new last_commit_sha_seen
                             same dance for PRs: ON CONFLICT (repo_id, pr_number) DO UPDATE SET ...
       on 401 Unauthorized → mark this user_integration 'expired', retry repo with next-best token (1 retry)
       on 403/404          → delete (user_integration_id, repo_full_name) from user_integration_repos,
                             retry repo with next-best token (1 retry)
       on 429 rate-limited → update rate_limit_remaining=0 and reset_at from headers, retry with next-best token

     always → update rate_limit_remaining / rate_limit_reset_at from X-RateLimit-* response headers

8. Update sync_jobs.status = 'done' with progress stats
```

#### Why "one repo, one token" matters

Naive fan-out (every user fetches every accessible repo) makes N × R API calls. For a 6-person team with 4 shared repos that's ~15 fetch-cycles. One-repo-one-token makes exactly 4 — a **~73% reduction**. For 10-user teams with 20 repos it approaches **95% reduction**.

Dedup via `ON CONFLICT DO NOTHING` stays in place as a safety net (concurrent sync clicks, rare assignment-churn edge cases) but is no longer on the critical path.

#### Why ETags are load-bearing

304 responses **don't count against GitHub's rate limit**. For a team syncing once an hour where most repos are quiet, the common case becomes near-free: 12 `If-None-Match` calls, 10 return 304, 2 actually fetch data.

#### Fireflies sync

Fireflies is per-account (each user only sees meetings they attended), so "one repo, one token" doesn't apply — every user's token must be fetched. The union-then-dedupe model holds:

```
For each active user_integration where provider='fireflies':
  fetch transcripts since this row's last_sync_at
  upsert into meetings ON CONFLICT (external_meeting_id) DO NOTHING
  update last_sync_at, rate_limit counters
```

Rate limits on Fireflies are generous, so budget-based token selection isn't needed there — but the columns on `user_integrations` remain reusable when future providers (Jira, Linear) arrive.

### 4.4 Authorization model (who can do what)

| Action | Owner | Manager | Developer |
|---|---|---|---|
| Connect own GitHub/Fireflies | ✅ | ✅ | ✅ **(new)** |
| Disconnect own credential | ✅ | ✅ | ✅ **(new)** |
| View own connection status | ✅ | ✅ | ✅ **(new)** |
| Click sync button (team-wide) | ✅ | ✅ | ✅ — any connected user can trigger a team sync |
| View team-wide integration roster | ✅ | ✅ | ⚠️ read-only (names + status, no tokens) |
| Revoke **another** user's credential | ✅ | ✅ | ❌ |
| Add / remove team_tracked_repos | ✅ | ✅ | ⚠️ can propose adds from their own accessible list; managers see audit log and can remove |
| Configure sync preferences / team settings | ✅ | ✅ | ❌ |

Two design choices worth calling out:

- **Tracked-repo governance** is a judgment call. Recommended middle ground (locked in v2): devs can add repos they have access to; managers see an audit log and can remove any repo.
- **Disconnecting another user** stays manager-only — otherwise a disgruntled user could wipe teammates' connections.

### 4.5 RLS policies — close the silent hole

The current `integrations` table has no RLS. That's a latent security issue this rework fixes.

```sql
-- user_integrations
ALTER TABLE user_integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_integrations_self_read ON user_integrations
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY user_integrations_manager_read ON user_integrations
  FOR SELECT USING (
    team_id IN (
      SELECT team_id FROM team_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'manager')
    )
  );

CREATE POLICY user_integrations_self_insert ON user_integrations
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY user_integrations_self_write ON user_integrations
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY user_integrations_self_or_manager_delete ON user_integrations
  FOR DELETE USING (
    user_id = auth.uid()
    OR team_id IN (
      SELECT team_id FROM team_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'manager')
    )
  );

-- user_integration_repos: team-visible (via user_integrations join), but no tokens exposed
ALTER TABLE user_integration_repos ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_integration_repos_team_read ON user_integration_repos
  FOR SELECT USING (
    user_integration_id IN (
      SELECT id FROM user_integrations
      WHERE team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid())
    )
  );

-- team_tracked_repos: any team member can read; only managers can delete
ALTER TABLE team_tracked_repos ENABLE ROW LEVEL SECURITY;

CREATE POLICY team_tracked_repos_team_read ON team_tracked_repos
  FOR SELECT USING (
    team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid())
  );

CREATE POLICY team_tracked_repos_team_insert ON team_tracked_repos
  FOR INSERT WITH CHECK (
    team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid())
  );

CREATE POLICY team_tracked_repos_manager_delete ON team_tracked_repos
  FOR DELETE USING (
    team_id IN (
      SELECT team_id FROM team_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'manager')
    )
  );

-- sync_jobs: team-wide read, trigger insert by any team member
ALTER TABLE sync_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY sync_jobs_team_read ON sync_jobs
  FOR SELECT USING (
    team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid())
  );

CREATE POLICY sync_jobs_team_insert ON sync_jobs
  FOR INSERT WITH CHECK (
    team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid())
    AND triggered_by_user_id = auth.uid()
  );
```

Browser/anon key should **never** read the encrypted token columns. Expose a SQL view `user_integrations_public` that omits `access_token_encrypted` / `refresh_token_encrypted`.

### 4.6 Token storage — encrypt at rest

Two options; pick one up front:

1. **pgcrypto** (`pgp_sym_encrypt(token, app_secret)`) — app holds the key via `SUPABASE_ENCRYPTION_KEY`. Simple, but key rotation is manual.
2. **Supabase Vault** — native, rotatable, slightly more setup. **Preferred for v2.**

Either way: **tokens must never leave the server.** API routes decrypt, use, and discard; they never serialize to JSON responses.

### 4.7 Provider registry — one adapter per integration

A typed TypeScript interface plus a lookup map. Routes become generic.

```ts
// packages/dashboard/src/lib/integrations/provider.ts
export interface ProviderAdapter {
  slug: 'github' | 'fireflies';
  displayName: string;
  authType: 'oauth2' | 'api_key';
  oauthConfig?: {
    authorizeUrl: string;
    tokenUrl: string;
    defaultScopes: string[];
  };

  exchangeCodeForToken(code: string): Promise<TokenBundle>;
  refreshToken(refreshToken: string): Promise<TokenBundle>;
  revoke(token: string): Promise<void>;
  fetchAccountIdentity(token: string): Promise<{ id: string; handle: string }>;
  fetchAccessibleRepos?(token: string): Promise<RepoRef[]>;      // optional, GitHub-specific

  sync(ctx: SyncContext): Promise<SyncResult>;                   // primary sync entrypoint
}
```

Each provider lives in its own file (`providers/github.ts`, `providers/fireflies.ts`) implementing the interface. The registry:

```ts
// packages/dashboard/src/lib/integrations/registry.ts
export const PROVIDERS = {
  github: githubAdapter,
  fireflies: firefliesAdapter,
} as const satisfies Record<string, ProviderAdapter>;
```

Routes collapse from per-provider directories to a single `[provider]` dynamic route:

```
src/app/api/integrations/v2/[provider]/connect/route.ts
src/app/api/integrations/v2/[provider]/callback/route.ts
src/app/api/integrations/v2/[provider]/disconnect/route.ts
src/app/api/integrations/v2/[provider]/sync/route.ts
src/app/api/integrations/v2/[provider]/sync/[jobId]/route.ts
```

Each does `const adapter = PROVIDERS[params.provider]` and delegates. **Cost now: ~1 day. Cost avoided: ~1.5 weeks per future provider.** Non-negotiable in v2.

### 4.8 Long-running sync — `sync_jobs` + status polling

A real-world team sync:

- 6 users × 12 tracked repos × ~200 new commits + 30 PRs
- ≈ 400–800 GitHub API calls (minus 304s)
- At ~200ms per call: **80–160 seconds**

This blows past Vercel Pro's default 60s request limit and may graze the 300s extended limit for big teams. A synchronous `POST /sync` that tries to do everything in one request is the wrong shape.

**Pattern:** user-triggered, but non-blocking.

```
POST /api/integrations/v2/:provider/sync
  → Insert into sync_jobs (status='pending', triggered_by=auth.uid())
  → Kick off the sync loop via Next.js after() / waitUntil()
  → Return 202 { job_id } immediately

GET  /api/integrations/v2/:provider/sync/:jobId
  → Returns { status, progress: { repos_total, repos_synced, repos_skipped_304, repos_failed }, started_at, finished_at }

Frontend:
  → POST sync → gets job_id
  → Polls GET /:jobId every 2s
  → Shows progress bar + per-repo status
  → Stops polling on status in ('done', 'failed')
```

Two extra guarantees:

- **Debounce concurrent clicks.** If a sync_job is already `pending` or `running` for `(team_id, provider)`, return that job's id instead of creating a new one. Prevents thundering herd from someone mashing the button.
- **`sync_jobs` is also the audit log.** "When was the last successful sync? Who triggered it? Which tokens were used?" All answered by querying `sync_jobs`. No extra logging plumbing needed.

### 4.9 UI sketch (reference for Phase 5)

```
╭─────────────────────────────── Integrations ──────────────────────────╮
│                                                                        │
│  GitHub     ● Connected as @alice-dev · 12 repos accessible            │
│             Last synced: 18m ago                                       │
│             [Sync now]  [Manage repos]  [Disconnect]                   │
│                                                                        │
│  Fireflies  ○ Not connected                                            │
│             [Connect Fireflies →]                                      │
│                                                                        │
│─────────────── Team coverage (visible to managers) ───────────────────│
│                                                                        │
│  GitHub     5 of 7 members connected · last team sync 18m ago          │
│    ✓ alice-dev (owner)   · last sync 18m ago                           │
│    ✓ bob-eng             · last sync 18m ago                           │
│    ✓ carol-dev           · last sync 18m ago                           │
│    ⚠ dan-eng             · token expired 2d ago  [Notify]              │
│    ○ eve-dev             · not connected          [Remind]             │
│                                                                        │
│  Fireflies  3 of 7 members connected                                   │
│    ...                                                                 │
╰────────────────────────────────────────────────────────────────────────╯
```

While a sync is in progress, the **[Sync now]** button becomes a progress bar fed by polling `sync_jobs`:

```
[ syncing · 7/12 repos · 2 skipped (no change) ]
```

---

## 5. Phased Implementation Plan

Each phase is independently shippable and reversible. Don't batch.

### Phase 0 — Prep, Safety Net & Dead-Code Cleanup (~1–2 days)

- Add encryption extension (`CREATE EXTENSION pgcrypto`) or enable Supabase Vault. **Vault preferred.**
- Add RLS policies to the **existing** `integrations` table as a belt-and-suspenders measure (current behavior unchanged for service-role calls, but closes the gap if anon key is ever misused).
- **Delete dead code:**
  - `src/app/api/integrations/fathom/` (entire directory)
  - `src/app/api/integrations/github/webhook/`
  - `src/app/api/integrations/fireflies/webhook/`
  - Any admin query with `provider = 'fathom'` filters
- **Patch admin counts** to `COUNT(DISTINCT team_id)` in:
  - `src/app/api/admin/overview/route.ts`
  - `src/app/api/admin/teams/route.ts`
  - `src/app/api/admin/teams/[id]/route.ts`
  - Ensures no double-counting during the Phase 2–5 dual-path window.
- Add structured logging (`team_id`, `user_id`, `provider`, `action`, `outcome`) to every surviving integration route.
- **Exit criteria:** No behavioral change for users. Dead code gone. Admin counts robust to dual-path. Encryption primitives available.

### Phase 1 — New Schema + Provider Registry (~3 days)

- Migrations (all in one release):
  - `providers` table (seed `github`, `fireflies`)
  - `user_integrations` (with rate_limit columns)
  - `user_integration_repos`
  - `team_tracked_repos`
  - `sync_jobs`
  - `user_integrations_public` view (no token columns)
  - All RLS policies from §4.5
- TypeScript:
  - `packages/dashboard/src/lib/integrations/provider.ts` (the `ProviderAdapter` interface)
  - `packages/dashboard/src/lib/integrations/providers/github.ts` — scaffold implementing the interface (not yet wired to routes)
  - `packages/dashboard/src/lib/integrations/providers/fireflies.ts` — same
  - `packages/dashboard/src/lib/integrations/registry.ts` — the `PROVIDERS` map
  - `packages/dashboard/src/lib/user-integrations.ts` — CRUD helpers (`getActiveIntegrations`, `upsertIntegration`, `markExpired`, encrypted read/write)
- **No routes wired up yet.** Table and adapter code dormant.
- Unit tests for helpers.
- **Exit criteria:** Migrations deploy cleanly in staging. Provider adapters implement the interface with contract tests. No user-visible change.

### Phase 2 — Per-User OAuth Connect Flow (~3–5 days)

New routes (parallel to old, not replacing), all delegating to `PROVIDERS[provider]`:

- `POST /api/integrations/v2/:provider/connect` — any authenticated team member
- `GET  /api/integrations/v2/:provider/callback` — writes to `user_integrations`, populates `user_integration_repos` for GitHub via `fetchAccessibleRepos`
- `POST /api/integrations/v2/:provider/disconnect` — self-service; managers can pass `target_user_id`
- `POST /api/integrations/v2/:provider/refresh-repos` — (GitHub only) re-fetch accessible repos
- `GET  /api/integrations/v2/:provider/status` — team roster: who's connected, status, last sync

Update integrations page to detect `user_integrations` rows and render the new roster UI (§4.9). Feature-flag behind `NEXT_PUBLIC_MULTI_USER_INTEGRATIONS=true`, per team. Old flow remains default until Phase 6.

- **Exit criteria:** Internal team dogfooding. Both flows coexist. Old data untouched. OAuth re-consent (user re-clicks Connect to upgrade scopes) handled via `ON CONFLICT DO UPDATE` on `(team_id, user_id, provider)`.

### Phase 3 — Sync Fan-Out With One-Repo-One-Token (~3–5 days)

- New sync handler: `packages/dashboard/src/lib/sync/github.ts` implementing the §4.3 algorithm.
  - Rarity-sorted assignment
  - Budget-aware token selection
  - ETag conditional GETs
  - Fail-through on per-repo 401/403/404/429
  - Parallel per-repo fetch with concurrency cap (5)
  - `rate_limit_remaining` / `reset_at` updated from headers after every call
- Same pattern for Fireflies (simpler — no repo assignment needed).
- `POST /api/integrations/v2/:provider/sync` creates a `sync_jobs` row, kicks off `after()` / `waitUntil()`, returns 202 + `job_id`.
- `GET /api/integrations/v2/:provider/sync/:jobId` returns job status + progress.
- Debounce: if a pending/running job exists for `(team_id, provider)`, return its id.
- Team-tracked-repos CRUD routes:
  - `POST /api/integrations/v2/:provider/tracked-repos` — add a repo (any member; audit logged)
  - `DELETE /api/integrations/v2/:provider/tracked-repos/:id` — manager-only
  - `GET /api/integrations/v2/:provider/tracked-repos` — team-visible list with coverage status

- **Exit criteria:** Staging team has 3+ users connected. Sync button works. No dupes in `code_changes` / `meetings`. Verified metrics: average API calls per sync (should be ~1 per repo, not N), % of repos returning 304 on second sync, worst-case sync duration < serverless timeout.

### Phase 4 — Attribution Via OAuth Identity (~2–3 days)

- On OAuth callback, write `team_members.github_user_id` (new column — distinct from the existing free-text `github_username`).
- Update `mapGitHubUser()` lookup order: `github_user_id` → `github_username` (fallback) → email (fallback).
- Same pattern for Fireflies participant matching (store external account id on `team_members`).
- **Exit criteria:** Attribution accuracy metric (% of `code_changes` rows with non-null `developer_id` for a team where all devs have connected) measurably improves vs. baseline.

### Phase 5 — UI Polish, Governance, Freshness Signal (~3–4 days)

Integrations page redesign (§4.9):

- "Your connections" card (per-user actions, with "last synced N ago" indicator)
- "Team coverage" card (manager-visible roster, revoke controls)
- Coverage banner: *"5 of 7 teammates connected GitHub · last synced 4m ago"*
- **Sync button with live progress** driven by `sync_jobs` polling

Freshness signals elsewhere:

- "Last synced: 2h ago" badge on the developer detail page and analytics page (since there's no cron, data freshness is user-behavior-dependent and worth surfacing)
- Inline "Sync now" shortcut where fresh data matters most

Onboarding nudge: when a developer logs in and hasn't connected, show a dismissible banner.

Weekly digest email to managers flagging disconnected / expired users (email-only, no push — Fireflies transcript ingestion latency isn't emergency-grade).

- **Exit criteria:** Designer + PM sign-off. UX testing with 2+ real teams.

### Phase 6 — Cut Over + Cleanup (~2 days)

- Backfill script: migrate rows from `integrations` → `user_integrations`, attributing ownership to the team's owner (or whoever `config.oauth_user` names). Also migrate `config.tracked_repos` → `team_tracked_repos` rows.
- Remove feature flag; v1 endpoints return `301` redirects to v2 for 2 weeks, then get deleted.
- Drop `integrations` table in a subsequent release (keep around for at least 30 days post-cutover).
- Drop `integrations.webhook_secret` column (already dead).
- Update CLAUDE.md, architecture docs.
- **Exit criteria:** Zero traffic to v1 routes for 7 consecutive days. Old table dropped.

**Total realistic timeline: ~3 weeks focused work, ~4 weeks with review cycles, QA, and staged rollout.** Don't compress this.

---

## 6. Risks, Mitigations, Open Questions

### 6.1 Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Token leak in logs during debugging | Medium | Lint rule blocking `console.log` on `access_token*` columns; redact at logger level. |
| Rate-limit exhaustion on a single sync click | Medium | One-repo-one-token + budget-aware selection + ETag 304s keep average sync cost low. `rate_limit_remaining` column makes the budget state visible. |
| Duplicate commits from overlapping OAuth scopes | Low | `ON CONFLICT DO NOTHING` at DB level. Non-negotiable. |
| Dev disconnects → historical attribution breaks | Medium | Disconnecting revokes the token but **does not delete** `code_changes` rows. Keep attribution; stop ingesting new data. |
| Migration corrupts prod | Low | Dual-path period in Phase 2–5; old table stays intact until Phase 6. |
| Developer connects a personal GitHub with access to irrelevant repos | Medium | Tracked repos list is team-scoped; managers can remove any. Personal side projects never enter `team_tracked_repos`. |
| Sync button click times out (serverless limit) | Medium | `sync_jobs` table + `after()` / `waitUntil()` + status polling — user never blocks on a long request. |
| Freshness drift (no cron) | Medium | "Last synced N ago" indicator; sync button prominent on dashboards where fresh data matters. |
| Admin overview double-counts during dual-path | Medium | `COUNT(DISTINCT team_id)` patch in Phase 0. |
| Provider registry typos break RLS | Low | `providers` table with FK from `user_integrations.provider` and `team_tracked_repos.provider`. |

### 6.2 Open questions for the team

Decisions already locked in v2:

1. **Tracked-repo governance** → hybrid: devs self-serve from their accessible list, managers audit + remove.
2. **Cross-team membership** → per-team connect. User connects twice if on two teams.
3. **Notifications** → user email on own-token expiry; manager weekly digest for team-wide coverage gaps.
4. **Feature-flag strategy** → per-team rollout, starting with internal team, then 2–3 friendly customers, then GA.
5. **Provider registry** → yes, Phase 1.

Still to decide before Phase 0 kickoff:

1. **What happens when a team member leaves?** Auto-revoke their `user_integrations` on `team_members.is_active=false`? **Recommended:** yes, flip status to `revoked` AND call provider revoke API (GitHub `DELETE /applications/:client_id/grant`). Keep historical `code_changes` attribution intact.
2. **Sync debounce window.** If Alice clicks Sync, then Bob clicks 5 seconds later while Alice's job is still running, Bob sees Alice's job progress. But what if Bob clicks *after* Alice's job finishes? Probably: no cooldown — just run a fresh job. Confirm.
3. **Encryption choice — Vault vs pgcrypto.** Recommend Vault. Needs explicit sign-off.

---

## 7. What We're Not Changing (Intentionally)

To keep scope honest:

- **No changes to the scoring engine, CLI hooks, or transcript parsing** in `packages/core`. The data shape arriving at those systems is unchanged — we're widening the *funnel*, not reshaping the *signal*.
- **No changes to the `ai_sessions` / `ai_turns` CLI ingestion path.** That already operates per-developer (one CLI install per dev).
- **No changes to Supabase Auth / team membership model.** Teams, roles, invite codes, `team_members` — all unchanged (one additive column: `team_members.github_user_id`).
- **No UI redesign beyond the Integrations page.** Dashboards, analytics, developer detail pages — all keep current behavior; they just get more complete data and a freshness indicator.
- **No webhooks, no cron, no Fathom.** Explicitly out of scope; existing code for these gets deleted in Phase 0.

---

## 8. Success Metrics

Track these from Day 1 of rollout to prove the migration delivers:

1. **Coverage rate**: `% of team_members with active user_integration` per provider. Target: >80% within 4 weeks of launch.
2. **Attribution rate**: `% of code_changes rows with non-null developer_id`. Should increase vs. baseline.
3. **Meeting capture rate**: unique `meetings` ingested per team per week. Should increase vs. baseline.
4. **Token health**: `% user_integrations in 'active' state`. Alert if <90%.
5. **Sync efficiency** (new): average API calls per sync job per repo. Target: ≈1 (one-repo-one-token working). Watch for regressions above ~2.
6. **Sync cost reduction** (new): % of repos returning 304 on sync. Target: >60% of syncs hit mostly-unchanged repos. Proves ETag pipeline works.
7. **Sync duration** (new): p95 sync-job duration. Alert if >90s (serverless timeout guard rail).
8. **Manager feedback (qualitative)**: do they trust the dashboard more? Do "my team looks less productive than they are" complaints drop?

---

## 9. TL;DR for the Manager

> We've been asking one manager to be the eyes and ears for the entire team's GitHub and meeting data. That works until it doesn't — and we have direct evidence it's not working now (missing repos, missing meetings). The fix is the industry-standard one: every team member connects their own accounts, the platform picks the best single token per repo, merges the data at the team level, and dedupes canonically. It's a ~3-week job, ships in 6 phases, each phase is independently safe to roll back. After it lands, coverage goes up, attribution gets more accurate, sync API cost drops ~90%, security posture improves, and the platform stops depending on one person being a collaborator on everything.

---

*End of plan. Next step: lock the three open questions in §6.2 and begin Phase 0.*

---

## Appendix A — Real-World Examples

Concrete walkthroughs so every stakeholder can picture the change. Fictional team: **"Acme Payments"** — 6 people:

- **Priya** (Manager)
- **Raj** (Tech Lead)
- **Aditya, Lav, Meera, Sam** (Developers)

### A.1 GitHub Connection — The Repo-Access Gap

**Today (manager-only):** Priya connects GitHub as `@priya-mgr`. Acme has 4 repos:

| Repo | Priya has access? |
|---|---|
| `acme/payments-api` | ✅ |
| `acme/payments-web` | ✅ |
| `acme/billing-internal` (infra team private repo) | ❌ |
| `raj-personal/acme-migration-scripts` (fork for DB migration) | ❌ |

Result: 2 of 4 repos ingested. Meera's 3 weeks of work on `billing-internal` is invisible. Her dashboard looks empty. Priya quietly concludes Meera is underperforming. Meera is actually the top contributor.

**After (per-user):** Six OAuth tokens; platform picks one token per repo:

| Repo | Priya | Raj | Aditya | Lav | Meera | Sam | Token chosen |
|---|---|---|---|---|---|---|---|
| `acme/payments-api` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | whoever has max `rate_limit_remaining` |
| `acme/payments-web` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | whoever has next-max budget |
| `acme/billing-internal` | ❌ | ✅ | ❌ | ❌ | ✅ | ❌ | Raj or Meera (rarity-sorted first) |
| `raj-personal/acme-migration-scripts` | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | Raj (only option) |

**Four API-call cycles total, not 15.** Full coverage. Meera's real work surfaces.

---

### A.2 Fireflies Meetings — The Attendance Gap

**Today:** Priya's Fireflies API key only returns meetings **she attended**. Last week's 11 meetings:

| Meeting | Attendees | Priya there? | Captured? |
|---|---|---|---|
| Monday standup | All 6 | ✅ | ✅ |
| Sprint planning | All 6 | ✅ | ✅ |
| **Refinement session** | Raj, Aditya, Lav, Meera | ❌ | ❌ |
| **Spike review: payment-retry** | Raj, Meera, Sam | ❌ | ❌ |
| **Pair-debug: webhook timeout** | Aditya, Lav | ❌ | ❌ |
| Client demo | Priya, Raj | ✅ | ✅ |

4 of 11 captured. The refinement + spike reviews — where tasks actually get assigned — are exactly what's missing.

**After:** Every dev connects their Fireflies. Sync unions all tokens and dedupes by `external_meeting_id`. All 11 captured. (Fireflies is per-attendee, so union-then-dedupe is the right model — it's the one case where "one token per resource" doesn't apply.)

---

### A.3 Sync Fan-Out With One-Repo-One-Token (the core optimization)

Aditya clicks **Sync**. The handler:

```
1. Insert sync_jobs row (status='pending'); return 202 { job_id }
2. In background (after/waitUntil):
   Load team_tracked_repos:
     - acme/payments-api       (6 users have access)
     - acme/payments-web       (6 users have access)
     - acme/billing-internal   (2 users: Raj, Meera)
     - raj-personal/acme-migr. (1 user: Raj)

   Load user_integrations with rate_limit_remaining:
     Priya 4900 | Raj 4800 | Aditya 4950 | Lav 4920 | Meera 4990 | Sam 4880

   Sort repos by rarity ASC:
     1. raj-personal/acme-migr.  (1 user)   → Raj's token
     2. acme/billing-internal    (2 users)  → Meera (4990 > Raj 4800 after step 1)
     3. acme/payments-api        (6 users)  → Aditya (4950, highest remaining)
     4. acme/payments-web        (6 users)  → Priya (4900)

   Fetch all 4 in parallel (concurrency cap 5):
     raj-personal/acme-migr.  → If-None-Match: W/"abc" → 304 Not Modified  (free!)
     acme/billing-internal    → 200 OK, 12 new commits
     acme/payments-api        → If-None-Match: W/"def" → 304 Not Modified  (free!)
     acme/payments-web        → 200 OK, 3 new commits

   Upsert 15 commits with ON CONFLICT (repo_id, commit_sha) DO NOTHING.
   Update rate_limit_remaining per token from X-RateLimit-Remaining headers.
   sync_jobs status → 'done', progress = { repos_total: 4, synced: 2, skipped_304: 2, failed: 0 }
```

UI: progress bar ticks from 0/4 → 4/4 over ~2 seconds. Aditya sees "2 repos had new data, 2 were up to date."

Compare to naive fan-out: 6 users × 4 repos = 24 fetch attempts. With one-repo-one-token: 4 fetches, 2 of which are free 304s. **~92% fewer API calls on this sync.**

---

### A.4 Attribution via OAuth Identity

**Today (fragile text-matching):** Meera's commit arrives:
```json
{ "author": { "login": "meera-dev-99", "email": "meera.r@acme.com" } }
```

`mapGitHubUser()` runs:
1. `team_members.github_username = 'meera-dev-99'` → miss (Priya typed `meera99` during onboarding).
2. Email fallback → works, but only because Meera used work email on GitHub.

Sam's row has `github_username = NULL` (Priya forgot). His GitHub email is personal Gmail. **His commits get `developer_id = NULL`** — ingested but "Unknown" in dashboards for weeks.

**After:** OAuth callback writes `team_members.github_user_id = 4472831` (immutable numeric ID). Lookup order:

```
1. github_user_id = 4472831  → HIT (deterministic)
2. github_username fallback
3. email fallback
```

Onboarding typos stop breaking dashboards.

---

### A.5 What Each User Sees in the UI

**Aditya (developer):**

```
╭─ Integrations ──────────────────────────────────────────╮
│  GitHub    ● Connected as @aditya-m                     │
│            Last synced 4m ago                           │
│            [Sync now]  [Manage my repos]  [Disconnect]  │
│  Fireflies ○ Not connected                              │
│            [Connect →]                                  │
╰─────────────────────────────────────────────────────────╯
```

Only his own connections. No tokens, no teammates' data. He can click **Sync now** — it syncs the whole team's surface area (any member's click triggers a team-wide job).

**Priya (manager) — sees roster:**

```
╭─ Integrations ──────────────────────────────────────────╮
│  Your connections                                       │
│    GitHub    ● Connected as @priya-mgr  [Disconnect]    │
│    Fireflies ● Connected  [Disconnect]                  │
│                                                         │
│  ── Team coverage ──────────────────────────────────── │
│  GitHub     5 of 6 connected · last team sync 4m ago    │
│    ✓ priya-mgr  (you)      last sync 4m ago             │
│    ✓ raj-lead              last sync 4m ago             │
│    ✓ aditya-m              last sync 4m ago             │
│    ✓ lav-panchal           last sync 4m ago             │
│    ✓ meera-r               last sync 4m ago             │
│    ⚠ sam-dev     token expired 2d ago  [Remind Sam]     │
│                                                         │
│  Fireflies  3 of 6 connected                            │
│    ○ lav, meera, sam  not connected  [Remind all]       │
│                                                         │
│  [Sync all]     Last team sync: 4m ago by @aditya-m    │
╰─────────────────────────────────────────────────────────╯
```

Governance data — who's connected, expired, missing — never the tokens themselves.

---

### A.6 Governance Edge Cases

**Sam leaves the company.** Priya deactivates him:
- `team_members.is_active = false`
- His `user_integrations` rows auto-transition to `status = 'revoked'` AND platform calls GitHub's grant revocation endpoint.
- Historical `code_changes` rows stay intact — "Sam merged PR #421 last March" remains in the audit log.

**Lav's GitHub token expires** (90-day OAuth lifecycle):
- Next sync returns 401 for calls using Lav's token → Lav's row marked `expired`, sync handler retries affected repos with next-best token.
- Lav gets an email to reconnect. Priya sees ⚠ on the roster.
- **Sync job never fails entirely** on one bad token.

**Meera accidentally connects her personal GitHub** (47 personal repos visible in `user_integration_repos`):
- None of them are in `team_tracked_repos` — only the team's tracked ones get synced.
- If she proposes adding one by mistake, Priya sees it in the audit log and can remove it.

**Raj tries to disconnect Aditya's GitHub:**
- Raj is `developer`, not `manager`. API returns `403` (manager_delete RLS policy).
- UI doesn't render the "Disconnect" button on Aditya's row for Raj.

**Rate-limit near-exhaustion scenario:**
- Aditya's token is at 120 remaining after a big sync.
- Lav clicks Sync 10 minutes later.
- Algorithm picks Meera's token (4,900 remaining) for the shared repos, not Aditya's.
- Aditya's budget replenishes on the next hour boundary; the load self-balances.

---

### A.7 The "Silent Data Loss" Problem Made Concrete

**Today**, ask Priya *"Are we capturing all of Meera's work?"* — she says *"Yes, GitHub is connected, status is green."* The system has no way to tell her she's wrong. The only feedback loop is Meera herself noticing *"why does my dashboard show 2 commits this month when I pushed 47?"* — weeks later, after coaching insights have been wrong the whole time.

**After**, Priya opens the integrations page:

```
GitHub  5 of 6 connected · coverage: 12 of 12 repos visible · last sync 4m ago
```

Plus a roster showing **exactly who hasn't connected yet**, and `coverage_status` on each tracked repo. Incompleteness becomes **visible and actionable**. Managers stop making decisions on partial data without knowing it's partial.

---

### A.8 One-Sentence Summary

> **Old model:** Priya is the single lens. If she can't see it, the platform can't see it.
>
> **New model:** Everyone carries their own lens. The platform picks the best lens per repo, shares what it sees at the team level, and tells Priya when someone's lens is missing.
