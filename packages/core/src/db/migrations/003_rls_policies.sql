-- Migration: Enable Row Level Security on all tables
-- Purpose: Ensure no user can access another team's data
-- Run in: Supabase SQL Editor
-- NOTE: CLI ingest endpoint uses service_role key (bypasses RLS)

-- ================================================================
-- ENABLE RLS
-- ================================================================

ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_turns ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_tool_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE code_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE config ENABLE ROW LEVEL SECURITY;
ALTER TABLE cli_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_timeline ENABLE ROW LEVEL SECURITY;

-- ================================================================
-- HELPER: Get team IDs the current user belongs to
-- ================================================================

CREATE OR REPLACE FUNCTION user_team_ids()
RETURNS SETOF UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT team_id FROM team_members WHERE user_id = auth.uid()
$$;

-- ================================================================
-- TEAMS — users can only see teams they belong to
-- ================================================================

CREATE POLICY "teams_select" ON teams
  FOR SELECT USING (id IN (SELECT user_team_ids()));

CREATE POLICY "teams_update" ON teams
  FOR UPDATE USING (id IN (SELECT user_team_ids()));

-- ================================================================
-- TEAM_MEMBERS — users can see members of their own teams
-- ================================================================

CREATE POLICY "team_members_select" ON team_members
  FOR SELECT USING (team_id IN (SELECT user_team_ids()));

CREATE POLICY "team_members_insert" ON team_members
  FOR INSERT WITH CHECK (team_id IN (SELECT user_team_ids()));

CREATE POLICY "team_members_update" ON team_members
  FOR UPDATE USING (team_id IN (SELECT user_team_ids()));

CREATE POLICY "team_members_delete" ON team_members
  FOR DELETE USING (team_id IN (SELECT user_team_ids()));

-- ================================================================
-- AI_SESSIONS — team-scoped
-- ================================================================

CREATE POLICY "ai_sessions_select" ON ai_sessions
  FOR SELECT USING (team_id IN (SELECT user_team_ids()));

CREATE POLICY "ai_sessions_insert" ON ai_sessions
  FOR INSERT WITH CHECK (team_id IN (SELECT user_team_ids()));

CREATE POLICY "ai_sessions_update" ON ai_sessions
  FOR UPDATE USING (team_id IN (SELECT user_team_ids()));

-- ================================================================
-- AI_TURNS — team-scoped
-- ================================================================

CREATE POLICY "ai_turns_select" ON ai_turns
  FOR SELECT USING (team_id IN (SELECT user_team_ids()));

CREATE POLICY "ai_turns_insert" ON ai_turns
  FOR INSERT WITH CHECK (team_id IN (SELECT user_team_ids()));

CREATE POLICY "ai_turns_update" ON ai_turns
  FOR UPDATE USING (team_id IN (SELECT user_team_ids()));

-- ================================================================
-- AI_TOOL_EVENTS — team-scoped
-- ================================================================

CREATE POLICY "ai_tool_events_select" ON ai_tool_events
  FOR SELECT USING (team_id IN (SELECT user_team_ids()));

CREATE POLICY "ai_tool_events_insert" ON ai_tool_events
  FOR INSERT WITH CHECK (team_id IN (SELECT user_team_ids()));

-- ================================================================
-- CODE_CHANGES — team-scoped
-- ================================================================

CREATE POLICY "code_changes_select" ON code_changes
  FOR SELECT USING (team_id IN (SELECT user_team_ids()));

CREATE POLICY "code_changes_insert" ON code_changes
  FOR INSERT WITH CHECK (team_id IN (SELECT user_team_ids()));

-- ================================================================
-- TASKS — team-scoped
-- ================================================================

CREATE POLICY "tasks_select" ON tasks
  FOR SELECT USING (team_id IN (SELECT user_team_ids()));

CREATE POLICY "tasks_insert" ON tasks
  FOR INSERT WITH CHECK (team_id IN (SELECT user_team_ids()));

CREATE POLICY "tasks_update" ON tasks
  FOR UPDATE USING (team_id IN (SELECT user_team_ids()));

-- ================================================================
-- DAILY_REPORTS — team-scoped
-- ================================================================

CREATE POLICY "daily_reports_select" ON daily_reports
  FOR SELECT USING (team_id IN (SELECT user_team_ids()));

CREATE POLICY "daily_reports_insert" ON daily_reports
  FOR INSERT WITH CHECK (team_id IN (SELECT user_team_ids()));

-- ================================================================
-- ALERTS — team-scoped
-- ================================================================

CREATE POLICY "alerts_select" ON alerts
  FOR SELECT USING (team_id IN (SELECT user_team_ids()));

CREATE POLICY "alerts_update" ON alerts
  FOR UPDATE USING (team_id IN (SELECT user_team_ids()));

-- ================================================================
-- CONFIG — team-scoped
-- ================================================================

CREATE POLICY "config_select" ON config
  FOR SELECT USING (team_id IN (SELECT user_team_ids()));

CREATE POLICY "config_insert" ON config
  FOR INSERT WITH CHECK (team_id IN (SELECT user_team_ids()));

CREATE POLICY "config_update" ON config
  FOR UPDATE USING (team_id IN (SELECT user_team_ids()));

-- ================================================================
-- CLI_TOKENS — users can only manage their own tokens
-- ================================================================

CREATE POLICY "cli_tokens_select" ON cli_tokens
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "cli_tokens_insert" ON cli_tokens
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "cli_tokens_update" ON cli_tokens
  FOR UPDATE USING (user_id = auth.uid());

-- ================================================================
-- ACTIVITY_TIMELINE — team-scoped
-- ================================================================

CREATE POLICY "activity_timeline_select" ON activity_timeline
  FOR SELECT USING (team_id IN (SELECT user_team_ids()));

CREATE POLICY "activity_timeline_insert" ON activity_timeline
  FOR INSERT WITH CHECK (team_id IN (SELECT user_team_ids()));
