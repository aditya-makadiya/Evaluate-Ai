-- Migration: Add team_code column to teams table
-- Purpose: Enable join-by-code flow for team membership (replaces invite system)
-- Run in: Supabase SQL Editor

-- Step 1: Add the column
ALTER TABLE teams ADD COLUMN IF NOT EXISTS team_code TEXT UNIQUE;

-- Step 2: Backfill existing teams with generated codes
-- Format: first 4 chars of uppercased name + hyphen + 4 random chars
UPDATE teams
SET team_code = UPPER(
  SUBSTRING(REGEXP_REPLACE(name, '[^a-zA-Z0-9]', '', 'g'), 1, 4)
  || '-'
  || SUBSTRING(gen_random_uuid()::text, 1, 4)
)
WHERE team_code IS NULL;

-- Step 3: Make it NOT NULL after backfill
ALTER TABLE teams ALTER COLUMN team_code SET NOT NULL;

-- Step 4: Create index for fast lookups
CREATE UNIQUE INDEX IF NOT EXISTS idx_teams_team_code ON teams(team_code);
