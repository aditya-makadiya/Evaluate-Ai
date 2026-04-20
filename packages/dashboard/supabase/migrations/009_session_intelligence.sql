-- Migration 009: Session Intelligence
-- Adds work summary fields to ai_sessions for AI-generated session descriptions
-- and prompt-based task matching.

-- Work summary: human-readable description of what the session accomplished
ALTER TABLE ai_sessions ADD COLUMN IF NOT EXISTS work_summary TEXT;

-- Work tags: keyword tags extracted from session content (e.g., ['auth', 'jwt', 'login'])
ALTER TABLE ai_sessions ADD COLUMN IF NOT EXISTS work_tags TEXT[];

-- Work category: primary work type (feature, debug, refactor, research, review, config, general)
ALTER TABLE ai_sessions ADD COLUMN IF NOT EXISTS work_category TEXT;

-- Timestamp of when the summary was generated
ALTER TABLE ai_sessions ADD COLUMN IF NOT EXISTS summarized_at TIMESTAMPTZ;

-- Index for searching sessions by work summary text
CREATE INDEX IF NOT EXISTS idx_ai_sessions_work_summary
  ON ai_sessions USING gin (to_tsvector('english', COALESCE(work_summary, '')));

-- Index for filtering sessions by tags
CREATE INDEX IF NOT EXISTS idx_ai_sessions_work_tags
  ON ai_sessions USING gin (work_tags);

-- Index for filtering sessions by category
CREATE INDEX IF NOT EXISTS idx_ai_sessions_work_category
  ON ai_sessions (work_category) WHERE work_category IS NOT NULL;
