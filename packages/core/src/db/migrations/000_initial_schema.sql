-- ================================================================
-- EvaluateAI v2 — Complete Supabase Schema
-- Run this in Supabase SQL Editor
-- ================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ================================================================
-- TEAMS
-- ================================================================
CREATE TABLE IF NOT EXISTS teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  team_code TEXT UNIQUE,
  owner_id UUID REFERENCES auth.users(id),
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_teams_team_code ON teams(team_code);

-- ================================================================
-- TEAM MEMBERS
-- ================================================================
CREATE TABLE IF NOT EXISTS team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT DEFAULT 'developer',
  github_username TEXT,
  jira_account_id TEXT,
  evaluateai_installed BOOLEAN DEFAULT FALSE,
  last_ai_sync_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT TRUE,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(team_id, email)
);

-- ================================================================
-- INTEGRATIONS
-- ================================================================
CREATE TABLE IF NOT EXISTS integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  access_token TEXT,
  refresh_token TEXT,
  webhook_secret TEXT,
  config JSONB DEFAULT '{}',
  status TEXT DEFAULT 'active',
  last_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ================================================================
-- MEETINGS
-- ================================================================
CREATE TABLE IF NOT EXISTS meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  external_id TEXT,
  title TEXT NOT NULL,
  date TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER,
  participants JSONB,
  transcript TEXT,
  summary TEXT,
  source TEXT NOT NULL,
  action_items_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ================================================================
-- TASKS (from meetings + Jira)
-- ================================================================
CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  meeting_id UUID REFERENCES meetings(id),
  assignee_id UUID REFERENCES team_members(id),
  title TEXT NOT NULL,
  description TEXT,
  source TEXT NOT NULL,
  external_id TEXT,
  priority TEXT DEFAULT 'medium',
  deadline TIMESTAMPTZ,
  status TEXT DEFAULT 'pending',
  status_updated_at TIMESTAMPTZ,
  matched_changes TEXT[],
  alignment_score REAL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ================================================================
-- CODE CHANGES (GitHub webhooks)
-- ================================================================
CREATE TABLE IF NOT EXISTS code_changes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  developer_id UUID REFERENCES team_members(id),
  type TEXT NOT NULL,
  external_id TEXT NOT NULL,
  repo TEXT NOT NULL,
  branch TEXT,
  title TEXT,
  body TEXT,
  files_changed INTEGER DEFAULT 0,
  additions INTEGER DEFAULT 0,
  deletions INTEGER DEFAULT 0,
  ai_summary TEXT,
  matched_task_ids UUID[],
  is_planned BOOLEAN,
  is_ai_assisted BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL
);

-- ================================================================
-- AI SESSIONS (from npm package)
-- ================================================================
CREATE TABLE IF NOT EXISTS ai_sessions (
  id TEXT PRIMARY KEY,
  team_id UUID REFERENCES teams(id),
  developer_id UUID REFERENCES team_members(id),
  tool TEXT NOT NULL DEFAULT 'claude-code',
  model TEXT,
  project_dir TEXT,
  git_repo TEXT,
  git_branch TEXT,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  total_turns INTEGER DEFAULT 0,
  total_input_tokens INTEGER DEFAULT 0,
  total_output_tokens INTEGER DEFAULT 0,
  total_cost_usd DOUBLE PRECISION DEFAULT 0,
  total_tool_calls INTEGER DEFAULT 0,
  files_changed INTEGER DEFAULT 0,
  avg_prompt_score DOUBLE PRECISION,
  efficiency_score DOUBLE PRECISION,
  token_waste_ratio DOUBLE PRECISION,
  context_peak_pct DOUBLE PRECISION,
  analysis JSONB,
  analyzed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ================================================================
-- AI TURNS (from npm package)
-- ================================================================
CREATE TABLE IF NOT EXISTS ai_turns (
  id TEXT PRIMARY KEY,
  session_id TEXT REFERENCES ai_sessions(id) ON DELETE CASCADE,
  team_id UUID REFERENCES teams(id),
  developer_id UUID REFERENCES team_members(id),
  turn_number INTEGER NOT NULL,
  prompt_text TEXT,
  prompt_hash TEXT NOT NULL,
  prompt_tokens_est INTEGER,
  heuristic_score DOUBLE PRECISION,
  anti_patterns JSONB,
  llm_score DOUBLE PRECISION,
  score_breakdown JSONB,
  suggestion_text TEXT,
  suggestion_accepted BOOLEAN,
  tokens_saved_est INTEGER,
  response_tokens_est INTEGER,
  response_text TEXT,
  tool_calls JSONB,
  latency_ms INTEGER,
  was_retry BOOLEAN DEFAULT FALSE,
  context_used_pct DOUBLE PRECISION,
  intent TEXT,
  created_at TIMESTAMPTZ NOT NULL
);

-- ================================================================
-- AI TOOL EVENTS (from npm package)
-- ================================================================
CREATE TABLE IF NOT EXISTS ai_tool_events (
  id TEXT PRIMARY KEY,
  session_id TEXT REFERENCES ai_sessions(id) ON DELETE CASCADE,
  team_id UUID REFERENCES teams(id),
  developer_id UUID REFERENCES team_members(id),
  turn_id TEXT REFERENCES ai_turns(id),
  tool_name TEXT NOT NULL,
  tool_input_summary TEXT,
  success BOOLEAN,
  execution_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL
);

-- ================================================================
-- DAILY REPORTS (auto-generated per developer)
-- ================================================================
CREATE TABLE IF NOT EXISTS daily_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  developer_id UUID REFERENCES team_members(id),
  date DATE NOT NULL,
  commits_count INTEGER DEFAULT 0,
  prs_opened INTEGER DEFAULT 0,
  prs_merged INTEGER DEFAULT 0,
  reviews_given INTEGER DEFAULT 0,
  lines_added INTEGER DEFAULT 0,
  lines_removed INTEGER DEFAULT 0,
  ai_summary TEXT,
  tasks_assigned INTEGER DEFAULT 0,
  tasks_completed INTEGER DEFAULT 0,
  planned_commits INTEGER DEFAULT 0,
  unplanned_commits INTEGER DEFAULT 0,
  alignment_score REAL,
  ai_sessions_count INTEGER DEFAULT 0,
  ai_total_cost DOUBLE PRECISION DEFAULT 0,
  ai_avg_prompt_score DOUBLE PRECISION,
  ai_tokens_used INTEGER DEFAULT 0,
  ai_model_breakdown JSONB,
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(developer_id, date)
);

-- ================================================================
-- ALIGNMENT REPORTS (team-level daily)
-- ================================================================
CREATE TABLE IF NOT EXISTS alignment_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  team_health_score REAL,
  active_developers INTEGER,
  total_developers INTEGER,
  tasks_total INTEGER,
  tasks_completed INTEGER,
  tasks_in_progress INTEGER,
  tasks_dropped INTEGER,
  unplanned_work_count INTEGER,
  total_commits INTEGER,
  total_prs INTEGER,
  total_ai_cost DOUBLE PRECISION DEFAULT 0,
  avg_prompt_score DOUBLE PRECISION,
  meeting_to_code_rate REAL,
  analysis JSONB,
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(team_id, date)
);

-- ================================================================
-- ALERTS
-- ================================================================
CREATE TABLE IF NOT EXISTS alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  severity TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  developer_id UUID REFERENCES team_members(id),
  task_id UUID REFERENCES tasks(id),
  is_read BOOLEAN DEFAULT FALSE,
  is_dismissed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ================================================================
-- ACTIVITY TIMELINE (unified chronological feed)
-- ================================================================
CREATE TABLE IF NOT EXISTS activity_timeline (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  developer_id UUID REFERENCES team_members(id),
  event_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  metadata JSONB DEFAULT '{}',
  source_id TEXT,
  source_table TEXT,
  is_ai_assisted BOOLEAN DEFAULT FALSE,
  occurred_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ================================================================
-- CONFIG (per-team settings)
-- ================================================================
CREATE TABLE IF NOT EXISTS config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(team_id, key)
);

-- ================================================================
-- CLI TOKENS (for CLI → Dashboard API auth)
-- ================================================================
CREATE TABLE IF NOT EXISTS cli_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  token_prefix TEXT NOT NULL,
  name TEXT DEFAULT 'CLI',
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ================================================================
-- INDEXES
-- ================================================================
CREATE INDEX IF NOT EXISTS idx_team_members_team ON team_members(team_id);
CREATE INDEX IF NOT EXISTS idx_team_members_email ON team_members(email);
CREATE INDEX IF NOT EXISTS idx_integrations_team ON integrations(team_id, provider);
CREATE INDEX IF NOT EXISTS idx_meetings_team ON meetings(team_id, date);
CREATE INDEX IF NOT EXISTS idx_tasks_team ON tasks(team_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee_id);
CREATE INDEX IF NOT EXISTS idx_code_changes_dev ON code_changes(developer_id, created_at);
CREATE INDEX IF NOT EXISTS idx_code_changes_repo ON code_changes(team_id, repo);
CREATE INDEX IF NOT EXISTS idx_ai_sessions_dev ON ai_sessions(developer_id, started_at);
CREATE INDEX IF NOT EXISTS idx_ai_sessions_team ON ai_sessions(team_id, started_at);
CREATE INDEX IF NOT EXISTS idx_ai_turns_session ON ai_turns(session_id, turn_number);
CREATE INDEX IF NOT EXISTS idx_ai_turns_dev ON ai_turns(developer_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ai_tool_events_session ON ai_tool_events(session_id);
CREATE INDEX IF NOT EXISTS idx_daily_reports_dev ON daily_reports(developer_id, date);
CREATE INDEX IF NOT EXISTS idx_daily_reports_team ON daily_reports(team_id, date);
CREATE INDEX IF NOT EXISTS idx_alignment_reports_team ON alignment_reports(team_id, date);
CREATE INDEX IF NOT EXISTS idx_alerts_team ON alerts(team_id, is_read, created_at);
CREATE INDEX IF NOT EXISTS idx_timeline_dev ON activity_timeline(developer_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_timeline_team ON activity_timeline(team_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_timeline_type ON activity_timeline(team_id, event_type, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_config_team ON config(team_id, key);
CREATE INDEX IF NOT EXISTS idx_cli_tokens_hash ON cli_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_cli_tokens_user ON cli_tokens(user_id);

-- ================================================================
-- AUTO-UPDATE updated_at
-- ================================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ================================================================
-- VIEWS
-- ================================================================

-- Developer daily summary
CREATE OR REPLACE VIEW developer_daily_summary AS
SELECT
  dm.team_id,
  dm.id as developer_id,
  dm.name as developer_name,
  CURRENT_DATE as date,
  COALESCE(cc.commits, 0) as commits_today,
  COALESCE(cc.prs, 0) as prs_today,
  COALESCE(ai.sessions, 0) as ai_sessions_today,
  COALESCE(ai.cost, 0) as ai_cost_today,
  COALESCE(ai.avg_score, 0) as ai_avg_score_today,
  COALESCE(t.assigned, 0) as tasks_assigned,
  COALESCE(t.completed, 0) as tasks_completed
FROM team_members dm
LEFT JOIN LATERAL (
  SELECT
    COUNT(*) FILTER (WHERE type = 'commit') as commits,
    COUNT(*) FILTER (WHERE type = 'pr_merged') as prs
  FROM code_changes
  WHERE developer_id = dm.id AND created_at >= CURRENT_DATE
) cc ON true
LEFT JOIN LATERAL (
  SELECT
    COUNT(DISTINCT id) as sessions,
    SUM(total_cost_usd) as cost,
    AVG(avg_prompt_score) as avg_score
  FROM ai_sessions
  WHERE developer_id = dm.id AND started_at >= CURRENT_DATE
) ai ON true
LEFT JOIN LATERAL (
  SELECT
    COUNT(*) as assigned,
    COUNT(*) FILTER (WHERE status = 'done') as completed
  FROM tasks
  WHERE assignee_id = dm.id
) t ON true
WHERE dm.is_active = true;
