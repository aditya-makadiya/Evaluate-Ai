-- Platform-level admin roles (not per-team)
-- Used by the internal admin panel at /admin/*

CREATE TABLE platform_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('admin', 'super_admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  UNIQUE(user_id)
);

-- RLS enabled with NO policies = only service_role key can read/write
ALTER TABLE platform_roles ENABLE ROW LEVEL SECURITY;

-- Index for fast lookup by user_id
CREATE INDEX idx_platform_roles_user ON platform_roles (user_id);
