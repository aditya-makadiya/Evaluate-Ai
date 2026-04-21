-- Migration: Add deterministic GitHub identity to team_members
-- Purpose: Phase 4 of the integrations rework replaces the brittle
--          github_username text match with the immutable numeric user id
--          returned by GitHub's OAuth identity endpoint. Text matching stays
--          as a fallback; numeric id is the primary lookup.
--
-- This migration is additive and safe on its own — the new column is NULL
-- until Phase 2's callback starts populating it. Existing attribution code
-- keeps working unchanged.

ALTER TABLE team_members
  ADD COLUMN IF NOT EXISTS github_user_id TEXT;

-- Used by the commit/PR attribution lookup: `WHERE github_user_id = $1` runs
-- on every ingested commit in the sync handler, so index it.
CREATE INDEX IF NOT EXISTS idx_team_members_github_user_id
  ON team_members (github_user_id)
  WHERE github_user_id IS NOT NULL;
