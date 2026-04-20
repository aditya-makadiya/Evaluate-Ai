-- ================================================================
-- Migration 006: Phase 1 & 2 Enhancements
-- Run in Supabase SQL Editor
-- ================================================================

-- Phase 1b: Developer identity resolution
-- Allows mapping multiple Fireflies display names to one team member
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS fireflies_display_names TEXT[];

-- Phase 2a: Branch-to-task matching on AI sessions
ALTER TABLE ai_sessions ADD COLUMN IF NOT EXISTS matched_task_id UUID REFERENCES tasks(id);
CREATE INDEX IF NOT EXISTS idx_ai_sessions_matched_task
  ON ai_sessions(matched_task_id) WHERE matched_task_id IS NOT NULL;

-- Phase 2b: Cycle time tracking on tasks
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS first_commit_at TIMESTAMPTZ;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS first_pr_at TIMESTAMPTZ;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS cycle_time_hours REAL;

CREATE INDEX IF NOT EXISTS idx_tasks_cycle_time
  ON tasks(team_id, cycle_time_hours)
  WHERE cycle_time_hours IS NOT NULL;
