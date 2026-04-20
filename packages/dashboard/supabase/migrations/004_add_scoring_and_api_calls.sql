-- Migration: Add ai_scoring_calls and ai_api_calls tables
-- Purpose: Track LLM scoring costs and API proxy call metrics
-- Run in: Supabase SQL Editor

-- ================================================================
-- AI SCORING CALLS (track LLM scoring costs per turn)
-- ================================================================
CREATE TABLE IF NOT EXISTS ai_scoring_calls (
  id TEXT PRIMARY KEY,
  turn_id TEXT REFERENCES ai_turns(id) ON DELETE SET NULL,
  model TEXT NOT NULL,
  input_tokens INTEGER,
  output_tokens INTEGER,
  cost_usd DOUBLE PRECISION,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_scoring_calls_turn ON ai_scoring_calls(turn_id);

-- ================================================================
-- AI API CALLS (from proxy — track external API call metrics)
-- ================================================================
CREATE TABLE IF NOT EXISTS ai_api_calls (
  id TEXT PRIMARY KEY,
  session_id TEXT REFERENCES ai_sessions(id) ON DELETE SET NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cache_read_tokens INTEGER DEFAULT 0,
  cache_write_tokens INTEGER DEFAULT 0,
  cost_usd DOUBLE PRECISION NOT NULL DEFAULT 0,
  latency_ms INTEGER,
  status_code INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_api_calls_session ON ai_api_calls(session_id);

-- ================================================================
-- RLS POLICIES
-- ================================================================

-- ai_scoring_calls: accessible via turn -> session -> team membership
ALTER TABLE ai_scoring_calls ENABLE ROW LEVEL SECURITY;

CREATE POLICY ai_scoring_calls_select ON ai_scoring_calls FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM ai_turns t
    JOIN ai_sessions s ON s.id = t.session_id
    WHERE t.id = ai_scoring_calls.turn_id
    AND s.team_id IN (SELECT user_team_ids())
  )
);

CREATE POLICY ai_scoring_calls_insert ON ai_scoring_calls FOR INSERT WITH CHECK (true);

-- ai_api_calls: accessible via session -> team membership
ALTER TABLE ai_api_calls ENABLE ROW LEVEL SECURITY;

CREATE POLICY ai_api_calls_select ON ai_api_calls FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM ai_sessions s
    WHERE s.id = ai_api_calls.session_id
    AND s.team_id IN (SELECT user_team_ids())
  )
);

CREATE POLICY ai_api_calls_insert ON ai_api_calls FOR INSERT WITH CHECK (true);
