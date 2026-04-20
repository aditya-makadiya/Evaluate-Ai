-- ================================================================
-- Migration 007: Add last_activity_at to ai_sessions
-- Tracks the last Stop event time so stale sessions (Ctrl+C) can
-- be auto-closed with accurate end times.
-- Run in Supabase SQL Editor
-- ================================================================

ALTER TABLE ai_sessions ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ;

-- Index for stale session queries: open sessions ordered by last activity
CREATE INDEX IF NOT EXISTS idx_ai_sessions_stale
  ON ai_sessions(team_id, last_activity_at)
  WHERE ended_at IS NULL;
