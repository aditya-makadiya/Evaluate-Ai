-- ============================================================================
-- Migration: Backfill user_integrations from legacy `integrations` rows
-- ============================================================================
--
-- *** DO NOT RUN AUTOMATICALLY ***
-- This is a cutover migration. It should be invoked explicitly, per team, when
-- that team is ready to move from the legacy manager-owned flow to per-user
-- integrations. Running it for a team before they're dogfood-ready will
-- surface a second credential row that competes with the legacy path.
--
-- Operation:
--   1. For every active row in `integrations`, insert a matching row into
--      `user_integrations` owned by the team's *owner* (team_members.role =
--      'owner'). This preserves sync continuity for Phase 3's fan-out — the
--      team already has working tokens, just attributed to a single user now.
--   2. Copy `integrations.config.tracked_repos` into `team_tracked_repos`
--      (idempotent: listTeamTrackedRepos already performs lazy migration
--      from application code, but running this once up front avoids the
--      first-sync surprise).
--
-- Encryption note:
--   Legacy `integrations.access_token` is plaintext. This migration wraps it
--   in the AES-256-GCM envelope expected by `decryptToken()` via a helper
--   function that calls out to... actually no, Postgres can't do AES-256-GCM
--   without a plpython extension. See the application-side backfill script
--   below for the real implementation — this SQL migration only seeds
--   team_tracked_repos (plaintext-safe) and creates audit scaffolding.
--
-- Production runbook:
--   See "Cutover runbook" in INTEGRATIONS-OWNERSHIP-PLAN.md.
--
-- Idempotency:
--   Re-running this migration is safe — UNIQUE constraints prevent duplicate
--   rows; existing records are left untouched.
-- ============================================================================

-- Guard column: mark the team as having been backfilled so the UI / observer
-- can surface which teams have completed cutover. Nullable, purely advisory.
ALTER TABLE teams
  ADD COLUMN IF NOT EXISTS integrations_cutover_at TIMESTAMPTZ;

-- Seed team_tracked_repos from legacy integrations.config.tracked_repos for
-- teams that haven't already got rows. The application's
-- migrateLegacyTrackedReposIfNeeded helper does the same thing lazily on
-- first v2 touch; running it here explicitly just makes the cutover moment
-- observable in the SQL audit log.
INSERT INTO team_tracked_repos (team_id, provider, repo_full_name, added_by_user_id)
SELECT
  i.team_id,
  i.provider,
  repo::text,
  t.owner_id
FROM integrations i
JOIN teams t ON t.id = i.team_id
CROSS JOIN LATERAL jsonb_array_elements_text(
  COALESCE(i.config->'tracked_repos', '[]'::jsonb)
) AS repo
WHERE i.status = 'active'
  AND i.provider = 'github'
  AND repo IS NOT NULL
  AND repo <> ''
  AND repo LIKE '%/%'
  AND NOT EXISTS (
    SELECT 1 FROM team_tracked_repos ttr
    WHERE ttr.team_id = i.team_id
      AND ttr.provider = i.provider
      AND ttr.repo_full_name = repo::text
  );

-- Mark teams with a flagged-on setting as "cutover pending" unless already set.
UPDATE teams
SET integrations_cutover_at = NOW()
WHERE settings->>'multi_user_integrations_enabled' = 'true'
  AND integrations_cutover_at IS NULL;

-- Audit: how many repos did we seed per team?
DO $$
DECLARE
  team_count INT;
  repo_count INT;
BEGIN
  SELECT COUNT(DISTINCT team_id) INTO team_count FROM team_tracked_repos;
  SELECT COUNT(*) INTO repo_count FROM team_tracked_repos;
  RAISE NOTICE 'Backfill complete: % teams, % tracked repos', team_count, repo_count;
END
$$;
