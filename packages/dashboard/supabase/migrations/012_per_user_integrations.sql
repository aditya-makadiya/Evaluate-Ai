-- Migration: Per-user integrations schema (Phase 1 of the ownership rework)
-- Purpose: Move from one manager-owned `integrations` row per team to per-user
--          credentials, team-aggregated data. See INTEGRATIONS-OWNERSHIP-PLAN.md.
--
-- Context: The legacy `integrations` table stays untouched — this migration
-- adds new tables and leaves code paths dormant until Phase 2 wires v2 flows
-- behind a feature flag.
--
-- Tables added:
--   providers                — registry of supported integrations
--   user_integrations        — per-user OAuth credentials (encrypted)
--   user_integration_repos   — which user can see which repo (dedupe index)
--   team_tracked_repos       — team-level sync list with ETag cache
--   sync_jobs                — background sync status + progress
--
-- Encryption: tokens are encrypted in Node using AES-256-GCM with an app-wide
-- key held in EVALUATEAI_ENCRYPTION_KEY (never stored in DB). The BYTEA
-- column stores iv || authTag || ciphertext. When Supabase Vault becomes
-- available on this project, swap the helpers in src/lib/integrations/crypto.ts
-- for vault.decrypted_secrets calls — schema stays identical; re-encrypt rows
-- in a one-shot job. pgcrypto is enabled for future use but not required by
-- the current implementation.

-- ================================================================
-- EXTENSIONS
-- ================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ================================================================
-- HELPER: team IDs where the current user is owner/manager
-- ================================================================
-- Complements the existing user_team_ids() helper (000_initial_schema /
-- 003_rls_policies) with a manager-scoped variant used by the governance
-- policies below.

CREATE OR REPLACE FUNCTION user_manager_team_ids()
RETURNS SETOF UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT team_id
  FROM team_members
  WHERE user_id = auth.uid()
    AND role IN ('owner', 'manager')
    AND is_active = TRUE
$$;

-- ================================================================
-- PROVIDERS — static registry of supported integrations
-- ================================================================

CREATE TABLE IF NOT EXISTS providers (
  slug TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  auth_type TEXT NOT NULL CHECK (auth_type IN ('oauth2', 'api_key')),
  is_enabled BOOLEAN DEFAULT TRUE,
  config JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO providers (slug, display_name, auth_type, config) VALUES
  ('github', 'GitHub', 'oauth2', '{"default_scopes": ["read:user", "user:email", "repo"]}'),
  ('fireflies', 'Fireflies', 'api_key', '{}')
ON CONFLICT (slug) DO NOTHING;

-- Providers table is world-readable (registry is not sensitive). No RLS.

-- ================================================================
-- USER_INTEGRATIONS — per-user credentials
-- ================================================================

CREATE TABLE IF NOT EXISTS user_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL REFERENCES providers(slug),

  -- AES-256-GCM ciphertext: iv(12) || authTag(16) || ciphertext.
  -- Stored as BYTEA so values are never readable via JSON coercion. Decrypt
  -- via decryptToken() in src/lib/integrations/crypto.ts.
  access_token_encrypted BYTEA NOT NULL,
  refresh_token_encrypted BYTEA,
  token_expires_at TIMESTAMPTZ,

  -- Identity of the external account this credential represents. Populated
  -- from the provider's identity endpoint at connect time. Enables
  -- deterministic attribution in Phase 4.
  external_account_id TEXT,
  external_account_handle TEXT,
  scopes TEXT[],

  -- Free-form per-user preferences. Team-level tracked_repos live in
  -- team_tracked_repos, NOT here — that's the whole point of the migration.
  config JSONB DEFAULT '{}',

  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'expired', 'revoked', 'error')),

  -- Rate-limit budget snapshot, updated from X-RateLimit-* response headers
  -- after every provider call. Used by the sync assignment algorithm to pick
  -- the team's best-budget token for each repo (see §4.3 of the plan).
  rate_limit_remaining INT,
  rate_limit_reset_at TIMESTAMPTZ,

  last_sync_at TIMESTAMPTZ,
  last_error TEXT,
  last_error_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (team_id, user_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_user_integrations_team_provider_status
  ON user_integrations (team_id, provider, status);

CREATE INDEX IF NOT EXISTS idx_user_integrations_user
  ON user_integrations (user_id);

-- Public view: never exposes token ciphertext to client-side reads. Server
-- code decrypts via the helpers in src/lib/integrations/crypto.ts using the
-- service-role client; this view is what the dashboard queries for display.
CREATE OR REPLACE VIEW user_integrations_public AS
SELECT
  id,
  team_id,
  user_id,
  provider,
  external_account_id,
  external_account_handle,
  scopes,
  config,
  status,
  rate_limit_remaining,
  rate_limit_reset_at,
  token_expires_at,
  last_sync_at,
  last_error,
  last_error_at,
  created_at,
  updated_at
FROM user_integrations;

ALTER TABLE user_integrations ENABLE ROW LEVEL SECURITY;

-- A user can read their own integration rows.
CREATE POLICY "user_integrations_self_read" ON user_integrations
  FOR SELECT USING (user_id = auth.uid());

-- Managers/owners can read all integrations in their teams (for the coverage
-- roster UI). Note: the view above is what they actually query; tokens are
-- never exposed through the anon key regardless.
CREATE POLICY "user_integrations_manager_read" ON user_integrations
  FOR SELECT USING (team_id IN (SELECT user_manager_team_ids()));

-- Users can only insert rows for themselves.
CREATE POLICY "user_integrations_self_insert" ON user_integrations
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- Users can update their own rows.
CREATE POLICY "user_integrations_self_update" ON user_integrations
  FOR UPDATE USING (user_id = auth.uid());

-- Delete: own, or manager revoking another team member's credential.
CREATE POLICY "user_integrations_self_or_manager_delete" ON user_integrations
  FOR DELETE USING (
    user_id = auth.uid()
    OR team_id IN (SELECT user_manager_team_ids())
  );

-- updated_at trigger
CREATE OR REPLACE FUNCTION set_user_integrations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_user_integrations_updated_at ON user_integrations;
CREATE TRIGGER trg_user_integrations_updated_at
  BEFORE UPDATE ON user_integrations
  FOR EACH ROW EXECUTE FUNCTION set_user_integrations_updated_at();

-- ================================================================
-- USER_INTEGRATION_REPOS — which user can see which repo
-- ================================================================
-- Populated at connect time from the provider's repo-listing endpoint and
-- refreshable on demand. Drives the one-repo-one-token sync assignment: for
-- each tracked repo, we join this table against user_integrations to find
-- candidate tokens.

CREATE TABLE IF NOT EXISTS user_integration_repos (
  user_integration_id UUID NOT NULL REFERENCES user_integrations(id) ON DELETE CASCADE,
  repo_full_name TEXT NOT NULL,
  repo_external_id TEXT,
  last_verified_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_integration_id, repo_full_name)
);

CREATE INDEX IF NOT EXISTS idx_user_integration_repos_repo
  ON user_integration_repos (repo_full_name);

ALTER TABLE user_integration_repos ENABLE ROW LEVEL SECURITY;

-- Team members can see which teammates can access which repo — helps the
-- coverage UI show "2 of 6 members have access to billing-internal". No
-- tokens are exposed here, so visibility is safe.
CREATE POLICY "user_integration_repos_team_read" ON user_integration_repos
  FOR SELECT USING (
    user_integration_id IN (
      SELECT id FROM user_integrations
      WHERE team_id IN (SELECT user_team_ids())
    )
  );

-- Writes are server-side only (service role bypasses RLS).

-- ================================================================
-- TEAM_TRACKED_REPOS — the team's sync list, team-owned
-- ================================================================
-- Replaces the per-user config.tracked_repos JSONB. Repos belong to the team,
-- not to any one user — so disconnecting a member doesn't drop the repo from
-- the sync list, and adding a new member doesn't reset anyone's choices.
--
-- ETags live here (per repo, not per user) because they're a property of the
-- repo's state at the provider, not of the user's session — any token can use
-- a stored ETag to skip a no-change fetch via HTTP 304.

CREATE TABLE IF NOT EXISTS team_tracked_repos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  provider TEXT NOT NULL REFERENCES providers(slug),
  repo_full_name TEXT NOT NULL,
  repo_external_id TEXT,
  added_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  added_at TIMESTAMPTZ DEFAULT NOW(),

  -- Conditional-GET cache. Unchanged repos return 304 and cost zero rate
  -- limit — the dominant performance win over v1's per-user fan-out.
  etag_commits TEXT,
  etag_pulls TEXT,
  last_commit_sha_seen TEXT,

  last_sync_at TIMESTAMPTZ,
  last_synced_via_user_integration_id UUID REFERENCES user_integrations(id) ON DELETE SET NULL,

  coverage_status TEXT NOT NULL DEFAULT 'ok'
    CHECK (coverage_status IN ('ok', 'coverage_lost', 'no_token_available')),

  UNIQUE (team_id, provider, repo_full_name)
);

CREATE INDEX IF NOT EXISTS idx_team_tracked_repos_team_provider
  ON team_tracked_repos (team_id, provider);

ALTER TABLE team_tracked_repos ENABLE ROW LEVEL SECURITY;

-- Any team member can read the tracked-repo list (coverage UI).
CREATE POLICY "team_tracked_repos_team_read" ON team_tracked_repos
  FOR SELECT USING (team_id IN (SELECT user_team_ids()));

-- Any team member can propose adding a repo (governance log lives in
-- added_by_user_id + added_at). Managers can remove.
CREATE POLICY "team_tracked_repos_team_insert" ON team_tracked_repos
  FOR INSERT WITH CHECK (team_id IN (SELECT user_team_ids()));

CREATE POLICY "team_tracked_repos_manager_update" ON team_tracked_repos
  FOR UPDATE USING (team_id IN (SELECT user_manager_team_ids()));

CREATE POLICY "team_tracked_repos_manager_delete" ON team_tracked_repos
  FOR DELETE USING (team_id IN (SELECT user_manager_team_ids()));

-- ================================================================
-- SYNC_JOBS — background sync state + progress
-- ================================================================
-- Sync is user-triggered via a button click; the handler inserts a row here,
-- kicks off async work via Next.js `after()` / `waitUntil()`, and returns 202
-- with the job id. Frontend polls for progress. Jobs are idempotent on
-- (team_id, provider) while pending/running — the handler reuses the existing
-- row rather than creating a duplicate when a second user clicks Sync mid-run.

CREATE TABLE IF NOT EXISTS sync_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  provider TEXT NOT NULL REFERENCES providers(slug),
  triggered_by_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,

  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'done', 'failed')),

  -- { repos_total, repos_synced, repos_skipped_304, repos_failed,
  --   commits_inserted, prs_inserted, meetings_inserted, ... }
  progress JSONB DEFAULT '{}',

  error TEXT,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sync_jobs_team_provider_created
  ON sync_jobs (team_id, provider, created_at DESC);

-- Partial index for fast "is there a pending/running job for this team?" look
-- up used by the debounce logic.
CREATE INDEX IF NOT EXISTS idx_sync_jobs_active
  ON sync_jobs (team_id, provider)
  WHERE status IN ('pending', 'running');

ALTER TABLE sync_jobs ENABLE ROW LEVEL SECURITY;

-- Any team member can read progress (for the sync-button progress UI).
CREATE POLICY "sync_jobs_team_read" ON sync_jobs
  FOR SELECT USING (team_id IN (SELECT user_team_ids()));

-- Any team member can trigger a sync; triggered_by must be self.
CREATE POLICY "sync_jobs_team_insert" ON sync_jobs
  FOR INSERT WITH CHECK (
    team_id IN (SELECT user_team_ids())
    AND triggered_by_user_id = auth.uid()
  );

-- Updates are server-side only (the worker updates status/progress via the
-- service-role client).
