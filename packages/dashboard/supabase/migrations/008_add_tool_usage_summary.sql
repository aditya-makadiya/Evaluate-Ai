-- Migration 008: Add tool_usage_summary JSONB to ai_sessions
--
-- Replaces per-event tool tracking (ai_tool_events writes on every PreToolUse/PostToolUse)
-- with a single aggregated summary computed from transcript at session_end.
-- This eliminates ~70% of CLI→API calls per session.
--
-- The column stores: { "Read": 15, "Edit": 8, "Bash": 5, ... }

ALTER TABLE ai_sessions
  ADD COLUMN IF NOT EXISTS tool_usage_summary JSONB DEFAULT NULL;

COMMENT ON COLUMN ai_sessions.tool_usage_summary IS
  'Aggregated tool call counts per tool name, computed from transcript at session end. Replaces per-event ai_tool_events tracking.';
