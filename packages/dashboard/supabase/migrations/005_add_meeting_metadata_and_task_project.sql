-- Add metadata JSONB column to meetings for keywords, short_summary, fireflies action items
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS metadata JSONB;

-- Add project column to tasks for project/module context from meetings
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS project TEXT;

-- Index for filtering tasks by project
CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project) WHERE project IS NOT NULL;
