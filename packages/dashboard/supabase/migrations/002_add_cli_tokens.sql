-- Migration: Add cli_tokens table for CLI authentication
-- Purpose: Store hashed API tokens for CLI → Dashboard communication
-- Run in: Supabase SQL Editor

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

CREATE INDEX IF NOT EXISTS idx_cli_tokens_hash ON cli_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_cli_tokens_user ON cli_tokens(user_id);
