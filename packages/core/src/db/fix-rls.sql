-- Fix RLS recursive policies
-- Run this in Supabase SQL Editor

-- Drop the problematic policies
DROP POLICY IF EXISTS sessions_own ON sessions;
DROP POLICY IF EXISTS sessions_team ON sessions;
DROP POLICY IF EXISTS turns_access ON turns;
DROP POLICY IF EXISTS tool_events_access ON tool_events;
DROP POLICY IF EXISTS teams_member ON teams;
DROP POLICY IF EXISTS teams_create ON teams;
DROP POLICY IF EXISTS team_members_access ON team_members;

-- Disable RLS for now (solo dev mode)
-- Re-enable when team features are added
ALTER TABLE sessions DISABLE ROW LEVEL SECURITY;
ALTER TABLE turns DISABLE ROW LEVEL SECURITY;
ALTER TABLE tool_events DISABLE ROW LEVEL SECURITY;
ALTER TABLE api_calls DISABLE ROW LEVEL SECURITY;
ALTER TABLE scoring_calls DISABLE ROW LEVEL SECURITY;
ALTER TABLE teams DISABLE ROW LEVEL SECURITY;
ALTER TABLE team_members DISABLE ROW LEVEL SECURITY;
