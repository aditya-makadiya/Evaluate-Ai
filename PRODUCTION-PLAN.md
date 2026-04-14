# EvaluateAI — Production SaaS Readiness Plan

> Covers: Authentication, Team Management, Role-Based Access, CLI Auth for npm Distribution, and Database Security.
> Based on full codebase audit as of April 2025.

---

## Table of Contents

1. [Current State Summary](#1-current-state-summary)
2. [Architecture: Current vs Production](#2-architecture-current-vs-production)
3. [Phase 1 — Authentication & Session Management](#3-phase-1--authentication--session-management)
4. [Phase 2 — Team Management & Join Flow](#4-phase-2--team-management--join-flow)
5. [Phase 3 — Role-Based Access Control (RBAC)](#5-phase-3--role-based-access-control-rbac)
6. [Phase 4 — CLI Production Auth (npm Distribution)](#6-phase-4--cli-production-auth-npm-distribution)
7. [Phase 5 — Database Security (RLS)](#7-phase-5--database-security-rls)
8. [Phase 6 — Team Settings & Dashboard UI](#8-phase-6--team-settings--dashboard-ui)
9. [User Flow: End-to-End (After All Phases)](#9-user-flow-end-to-end-after-all-phases)
10. [Database Schema Changes](#10-database-schema-changes)
11. [API Endpoints to Add/Modify](#11-api-endpoints-to-addmodify)
12. [CLI Commands to Add/Modify](#12-cli-commands-to-addmodify)
13. [File-by-File Change Map](#13-file-by-file-change-map)
14. [Implementation Priority & Dependencies](#14-implementation-priority--dependencies)

---

## 1. Current State Summary

### What Works
- Supabase Auth (signUp/signIn) is called on signup/login
- Teams are created on signup with the creator as `owner`
- CLI hooks write AI session data to Supabase
- Dashboard displays team data filtered by `team_id`
- Onboarding flow creates team + invites members (step 2)
- CLI `evalai init --team <id>` links a developer to a team

### What's Broken or Missing

| Area | Problem |
|------|---------|
| **Auth** | Supabase returns tokens but they're never validated. API routes use admin client, not user tokens. Anyone can set localStorage and access any team's data. |
| **Team Joining** | Every signup creates a new team. No invite link, no join flow, no way for developer to join an existing team from the dashboard. |
| **Member Management** | No UI to add/remove members after onboarding. No role editing. Backend APIs exist but are unused. |
| **RBAC** | Roles exist in DB (`owner`, `manager`, `developer`) but are never checked. Every user can do everything. |
| **CLI Auth** | Users must manually set `SUPABASE_URL` and `SUPABASE_ANON_KEY` in `~/.evaluateai-v2/.env`. Not viable for npm distribution. |
| **Data Isolation** | No Supabase RLS policies. Any authenticated user (or unauthenticated user with the anon key) can read/write any team's data. |
| **Team ID Visibility** | Team ID is never shown in the dashboard. Developers have no way to get it for CLI setup. |

---

## 2. Architecture: Current vs Production

### Current (MVP)

```
Dashboard (Browser)
  └─ localStorage: { user, session, team }
  └─ API routes use x-user-id header (from localStorage, unverified)
  └─ API routes use Supabase ADMIN client (bypasses all security)

CLI (Developer Machine)
  └─ ~/.evaluateai-v2/.env: SUPABASE_URL, SUPABASE_ANON_KEY, TEAM_ID
  └─ Direct Supabase writes with anon key (no auth, no user identity)
```

### Production Target

```
Dashboard (Browser)
  └─ Supabase Auth session (httpOnly cookie or secure token)
  └─ API routes validate JWT from request
  └─ API routes use Supabase client with user's JWT (RLS enforced)
  └─ Role checked before mutations

CLI (Developer Machine)
  └─ `evalai login` → browser OAuth → receives CLI token
  └─ ~/.evaluateai-v2/credentials.json: { token, teamId, userId }
  └─ CLI calls YOUR API proxy (not Supabase directly)
  └─ API proxy validates CLI token → writes to Supabase with service key
```

---

## 3. Phase 1 — Authentication & Session Management

### Goal
Replace localStorage-only auth with real Supabase Auth session handling.

### 3.1 Dashboard Auth (Supabase SSR)

**Use `@supabase/ssr`** (official Supabase package for Next.js):

```
npm install @supabase/ssr
```

This replaces the current manual localStorage approach with cookie-based sessions that work on both client and server.

**Key changes:**

#### A. Create Supabase browser client (replaces current `supabase.ts`)

```typescript
// packages/dashboard/src/lib/supabase-browser.ts
import { createBrowserClient } from '@supabase/ssr';

export function getSupabaseBrowser() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

#### B. Create Supabase server client (for API routes & server components)

```typescript
// packages/dashboard/src/lib/supabase-ssr.ts
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function getSupabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        },
      },
    }
  );
}
```

#### C. Middleware for auth guard (replaces layout.tsx localStorage check)

```typescript
// packages/dashboard/src/middleware.ts
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const PUBLIC_ROUTES = ['/auth/login', '/auth/signup', '/auth/callback'];

export async function middleware(request: NextRequest) {
  const response = NextResponse.next();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  if (!user && !PUBLIC_ROUTES.includes(request.nextUrl.pathname)) {
    return NextResponse.redirect(new URL('/auth/login', request.url));
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/cli/).*)'],
};
```

#### D. API routes get user from session (not headers)

```typescript
// In every API route:
const supabase = await getSupabaseServer();
const { data: { user } } = await supabase.auth.getUser();
if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

// Then query with user context (RLS will enforce team isolation)
```

#### E. Remove from layout.tsx
- Remove the entire `useEffect` block that checks localStorage
- Remove the redirect-to-login logic (middleware handles it now)
- Keep theme logic and sidebar navigation

### 3.2 Login Page Changes

```typescript
// packages/dashboard/src/app/auth/login/page.tsx
const supabase = getSupabaseBrowser();

const handleLogin = async () => {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) { setError(error.message); return; }
  router.push('/dashboard');
  router.refresh(); // triggers middleware re-check
};
```

No more `localStorage.setItem`. The `@supabase/ssr` package handles cookie storage automatically.

### 3.3 Signup Page Changes

Move team creation logic from the API route into a post-signup step:

```
Signup → creates auth user only → redirect to /onboarding → create team there
```

This separates account creation from team creation, enabling the "join existing team" flow later.

---

## 4. Phase 2 — Team Management & Join Flow

### Goal
Allow team owners/managers to share a team code, and allow developers to join existing teams using that code.

### 4.1 Team Code System (Minimal Approach)

Instead of a full invitation system with emails, we use a simple **team code** — a unique, short, shareable code on each team. Developers enter this code to join.

#### Schema change: Add `team_code` to `teams` table

```sql
-- Add a unique team_code to teams (auto-generated on team creation)
ALTER TABLE teams ADD COLUMN team_code TEXT UNIQUE NOT NULL DEFAULT gen_random_uuid()::text;

-- Create a short, readable code (e.g., 'ACME-7X3K')
-- Generated in app code: `${slugify(teamName)}-${random4chars}` or a random 8-char alphanumeric
CREATE UNIQUE INDEX idx_teams_team_code ON teams(team_code);
```

**No new tables needed.** No `team_invites` table, no invite statuses, no expiry tracking.

#### How it works

| Action | Flow |
|--------|------|
| **Owner creates team** | Team code auto-generated (e.g., `ACME-7X3K`) |
| **Owner shares code** | Copy from dashboard → share via Slack, email, verbally |
| **Developer joins** | Enters team code during signup/onboarding → looked up → added to `team_members` |
| **Owner regenerates code** | Old code invalidated, new code generated (if team is compromised) |
| **CLI join** | `evalai login` → browser flow → enter team code if not already in a team |

#### API endpoints

```
GET    /api/teams/join?code=ACME-7X3K     — Look up team by code (returns team name for confirmation)
POST   /api/teams/join                     — Join team by code (logged-in user, adds to team_members as developer)
POST   /api/teams/[id]/regenerate-code    — Regenerate team code (owner/manager only)
```

#### Join flow

```
Developer has team code (shared via Slack, email, etc.)
                    ↓
         Signs up or logs in
                    ↓
         /onboarding → "Join existing team" → Enter team code
                    ↓
         Shows: "Join <Team Name>?" → Confirm → Added to team_members as developer
```

### 4.2 Signup Flow Changes

**Current:** Signup always creates a new team.
**New:** Signup creates account only. Team join/create happens separately.

```
FLOW A: New team (manager/owner)
  Signup → /onboarding → "Create team" → Create team + become owner → team_code auto-generated

FLOW B: Join existing team
  Signup → /onboarding → "Join team" → Enter team code → Confirm → Added as developer

FLOW C: Join via CLI
  `evalai login` → browser flow → if no team, prompted to enter team code or create team
```

**Changes to `/api/auth/signup/route.ts`:**
- Remove team creation from signup
- Only create auth user
- Return user data (no team)
- Redirect to `/onboarding` where user chooses: create team OR join with team code

---

## 5. Phase 3 — Role-Based Access Control (RBAC)

### Role Definitions

| Role | Who | Permissions |
|------|-----|------------|
| **owner** | Person who created the team | Everything + delete team + manage billing + transfer ownership |
| **manager** | Engineering managers | View all data + manage members + manage integrations + configure settings + view reports |
| **developer** | Individual contributors | View own data + view team aggregates (no individual peer data) + manage own CLI |

### 5.1 Permission Matrix

| Action | Owner | Manager | Developer |
|--------|-------|---------|-----------|
| View team dashboard (aggregates) | Yes | Yes | Yes |
| View individual developer details | Yes | Yes | Own only |
| View AI sessions/turns | Yes | Yes | Own only |
| Invite members | Yes | Yes | No |
| Remove members | Yes | Yes (not owner) | No |
| Change member roles | Yes | No | No |
| Edit team settings | Yes | Yes | No |
| Manage integrations (GitHub, etc.) | Yes | Yes | No |
| Configure alerts | Yes | Yes | No |
| View reports | Yes | Yes | Summary only |
| Delete team | Yes | No | No |
| Generate CLI tokens | Yes | Yes | Own only |
| Export data | Yes | Yes | Own only |

### 5.2 Implementation

#### A. Server-side helper

```typescript
// packages/dashboard/src/lib/auth.ts
import { getSupabaseServer } from './supabase-ssr';

export type TeamRole = 'owner' | 'manager' | 'developer';

interface AuthContext {
  userId: string;
  teamId: string;
  role: TeamRole;
  memberId: string;
}

export async function getAuthContext(teamId?: string): Promise<AuthContext | null> {
  const supabase = await getSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  // If teamId not provided, get from user's primary team
  const resolvedTeamId = teamId || await getPrimaryTeamId(user.id);
  if (!resolvedTeamId) return null;

  const { data: member } = await supabase
    .from('team_members')
    .select('id, role')
    .eq('team_id', resolvedTeamId)
    .eq('user_id', user.id)
    .single();

  if (!member) return null;

  return {
    userId: user.id,
    teamId: resolvedTeamId,
    role: member.role as TeamRole,
    memberId: member.id,
  };
}

export function requireRole(ctx: AuthContext, ...allowed: TeamRole[]): boolean {
  return allowed.includes(ctx.role);
}
```

#### B. Use in API routes

```typescript
// Example: GET /api/dashboard/developers/[id]
export async function GET(request: Request, { params }) {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  // Developers can only view their own data
  if (ctx.role === 'developer' && id !== ctx.memberId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // ... fetch and return data
}
```

#### C. Frontend role context

```typescript
// packages/dashboard/src/hooks/useAuth.ts
'use client';
import { createContext, useContext } from 'react';

interface AuthUser {
  id: string;
  email: string;
  name: string;
  teamId: string;
  teamName: string;
  role: 'owner' | 'manager' | 'developer';
  memberId: string;
}

const AuthContext = createContext<AuthUser | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
}

export function useCanAccess(...roles: string[]) {
  const { role } = useAuth();
  return roles.includes(role);
}
```

#### D. Conditional UI rendering

```tsx
// In sidebar or page components:
const canManageTeam = useCanAccess('owner', 'manager');

{canManageTeam && <NavLink href="/settings">Settings</NavLink>}
{canManageTeam && <NavLink href="/dashboard/alerts">Alerts</NavLink>}
```

---

## 6. Phase 4 — CLI Production Auth (npm Distribution)

### Goal
After `npm install -g evaluateai`, a developer should be able to run `evalai login` and be fully set up. No manual env vars, no Supabase credentials.

### 6.1 How Other Production Tools Do It

| Tool | Auth method | Token storage |
|------|------------|---------------|
| **Vercel CLI** | `vercel login` → browser OAuth → token | `~/.vercel/auth.json` |
| **Supabase CLI** | `supabase login` → browser OAuth → token | `~/.supabase/access-token` |
| **Netlify CLI** | `netlify login` → browser OAuth → token | `~/.netlify/config.json` |
| **Railway CLI** | `railway login` → browser OAuth → token | `~/.railway/config.json` |
| **Sentry CLI** | `sentry-cli login` → auth token from dashboard | `~/.sentryclirc` |
| **Datadog CLI** | API key + App key from dashboard | env vars or config file |
| **Fly.io** | `fly auth login` → browser OAuth → token | `~/.fly/config.yml` |

**Every serious SaaS CLI uses browser-based login.** The pattern is:

```
1. CLI starts localhost server on random port
2. Opens browser to https://app.example.com/cli/auth?port=XXXX
3. User logs in via web (if not already)
4. Dashboard generates a CLI-specific API token
5. Dashboard redirects to http://localhost:XXXX/callback?token=xxx
6. CLI receives token, saves to config file
7. CLI uses token for all future API calls
```

### 6.2 New Table: `cli_tokens`

```sql
CREATE TABLE cli_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,       -- SHA-256 of the actual token
  token_prefix TEXT NOT NULL,            -- first 8 chars for identification (eai_xxxx)
  name TEXT DEFAULT 'CLI',               -- user-friendly label
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,                -- NULL = never expires
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_cli_tokens_hash ON cli_tokens(token_hash);
CREATE INDEX idx_cli_tokens_user ON cli_tokens(user_id);
```

**Token format:** `eai_` + 48 random alphanumeric chars (e.g., `eai_a1b2c3d4e5f6...`)

We store only the SHA-256 hash in the database. The plaintext token is shown to the user exactly once (during `evalai login` or when generated in the dashboard).

### 6.3 CLI Login Flow

#### A. `evalai login` command

```typescript
// packages/cli/src/commands/login.ts

import { createServer } from 'node:http';
import { execSync } from 'node:child_process';
import open from 'open';  // cross-platform browser opener
import crypto from 'node:crypto';

const API_URL = 'https://app.evaluateai.com'; // hardcoded in published CLI

export async function loginCommand() {
  // 1. Start temporary localhost server
  const port = await findOpenPort(9876, 9900);
  const state = crypto.randomBytes(16).toString('hex'); // CSRF protection

  return new Promise((resolve) => {
    const server = createServer(async (req, res) => {
      const url = new URL(req.url!, `http://localhost:${port}`);

      if (url.pathname === '/callback') {
        const token = url.searchParams.get('token');
        const returnedState = url.searchParams.get('state');

        if (returnedState !== state) {
          res.writeHead(400);
          res.end('Invalid state. Please try again.');
          return;
        }

        // 2. Save credentials
        saveCredentials(token);

        // 3. Show success page in browser
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<html><body><h1>Logged in!</h1><p>You can close this tab.</p></body></html>');

        server.close();
        resolve(true);
      }
    });

    server.listen(port, () => {
      const authUrl = `${API_URL}/cli/auth?port=${port}&state=${state}`;
      console.log(`Opening browser to login...`);
      console.log(`If browser doesn't open, visit: ${authUrl}`);
      open(authUrl);
    });

    // Timeout after 5 minutes
    setTimeout(() => { server.close(); resolve(false); }, 300000);
  });
}
```

#### B. Dashboard auth page for CLI

```typescript
// packages/dashboard/src/app/cli/auth/page.tsx
// This page:
// 1. Checks if user is logged in (redirect to login if not)
// 2. Shows "Authorize CLI?" confirmation with team selector
// 3. On confirm: generates token via /api/cli/tokens
// 4. Redirects to http://localhost:{port}/callback?token=xxx&state=xxx
```

#### C. API endpoint to generate CLI token

```typescript
// packages/dashboard/src/app/api/cli/tokens/route.ts
export async function POST(request: Request) {
  const ctx = await getAuthContext();
  if (!ctx) return unauthorized();

  const token = 'eai_' + crypto.randomBytes(36).toString('base64url');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  await supabase.from('cli_tokens').insert({
    user_id: ctx.userId,
    team_id: ctx.teamId,
    member_id: ctx.memberId,
    token_hash: tokenHash,
    token_prefix: token.slice(0, 12),
    name: 'CLI',
  });

  return NextResponse.json({ token }); // only time plaintext is returned
}
```

### 6.4 CLI Credential Storage

```
~/.evaluateai-v2/
├── credentials.json   — { "token": "eai_xxx", "apiUrl": "https://app.evaluateai.com" }
├── config.json        — { "privacy": "full", "scoring": "heuristic" }
└── logs/              — error logs
```

**No more `.env` file with Supabase credentials.**

The `credentials.json` file should have `0600` permissions (readable only by owner):

```typescript
import { writeFileSync, chmodSync } from 'node:fs';

function saveCredentials(token: string) {
  const credPath = join(DATA_DIR, 'credentials.json');
  writeFileSync(credPath, JSON.stringify({
    token,
    apiUrl: API_URL,
    createdAt: new Date().toISOString(),
  }, null, 2));
  chmodSync(credPath, 0o600);
}
```

### 6.5 CLI API Proxy

**All CLI writes now go through your API, not directly to Supabase.**

```typescript
// packages/dashboard/src/app/api/cli/ingest/route.ts
// This is the new endpoint that CLI hooks call instead of Supabase directly

export async function POST(request: Request) {
  // 1. Validate CLI token
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');
  if (!token) return unauthorized();

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const { data: cliToken } = await admin
    .from('cli_tokens')
    .select('user_id, team_id, member_id, revoked_at')
    .eq('token_hash', tokenHash)
    .single();

  if (!cliToken || cliToken.revoked_at) return unauthorized();

  // 2. Update last_used_at
  await admin.from('cli_tokens').update({ last_used_at: new Date().toISOString() })
    .eq('token_hash', tokenHash);

  // 3. Process the hook payload
  const payload = await request.json();
  // ... write to Supabase using admin client with team_id/member_id from token

  return NextResponse.json({ ok: true });
}
```

### 6.6 CLI Hook Handler Changes

```typescript
// packages/cli/src/hooks/handler.ts — CHANGED
// Before: const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
// After:

import { readCredentials } from '../utils/credentials.js';

async function sendToApi(event: string, payload: unknown) {
  const creds = readCredentials();
  if (!creds?.token) return; // silently skip if not logged in

  await fetch(`${creds.apiUrl}/api/cli/ingest`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${creds.token}`,
    },
    body: JSON.stringify({ event, ...payload }),
  });
}
```

### 6.7 `evalai init` Changes (Simplified)

```
CURRENT:
  evalai init
  → Install hooks
  → Need SUPABASE_URL + SUPABASE_ANON_KEY
  → Need --team <team-id>

NEW:
  evalai login          → Browser OAuth → saves token (includes team context)
  evalai init           → Install hooks only (no Supabase config needed)
  evalai status         → Show: logged in as X, team Y, hooks installed
```

The `--team` flag is no longer needed because the team is selected during the browser login flow.

### 6.8 Fallback: API Key from Dashboard

For CI/CD environments or headless setups where browser login isn't possible:

```
Dashboard → Settings → CLI & API Keys → Generate API Key
  → Shows: eai_xxxxxxxxx (copy once)
  → User runs: evalai login --token eai_xxxxxxxxx
```

```typescript
// evalai login --token <token>
export async function loginWithToken(token: string) {
  // Validate token by calling the API
  const res = await fetch(`${API_URL}/api/cli/verify`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    console.error('Invalid token');
    return false;
  }

  saveCredentials(token);
  console.log('Logged in successfully');
  return true;
}
```

### 6.9 Environment Variable for API URL

The API URL is **hardcoded** in the published npm package but can be overridden:

```typescript
const API_URL = process.env.EVALUATEAI_API_URL || 'https://app.evaluateai.com';
```

This allows:
- **Production users:** Just works, no config needed
- **Self-hosted:** Set `EVALUATEAI_API_URL` to their own instance
- **Development:** Set to `http://localhost:3000`

---

## 7. Phase 5 — Database Security (RLS)

### Goal
Ensure no user can access another team's data, even with direct Supabase access.

### 7.1 Enable RLS on All Tables

```sql
-- Enable RLS
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_turns ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_tool_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE code_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE config ENABLE ROW LEVEL SECURITY;
ALTER TABLE cli_tokens ENABLE ROW LEVEL SECURITY;
-- (team_invites table removed — using team_code on teams table instead)
```

### 7.2 Core RLS Policies

```sql
-- Users can only see teams they belong to
CREATE POLICY "team_member_access" ON teams
  FOR SELECT USING (
    id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid())
  );

-- Users can only see their own team's members
CREATE POLICY "team_member_read" ON team_members
  FOR SELECT USING (
    team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid())
  );

-- AI sessions: team-scoped
CREATE POLICY "ai_sessions_team" ON ai_sessions
  FOR ALL USING (
    team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid())
  );

-- CLI tokens: users can only see their own
CREATE POLICY "cli_tokens_own" ON cli_tokens
  FOR ALL USING (user_id = auth.uid());
```

### 7.3 Service Role for API Proxy

The CLI ingest endpoint and admin operations use the service role key (which bypasses RLS). This is correct — the API proxy validates the CLI token and applies team scoping in application code.

```
Dashboard API routes → Supabase with user JWT (RLS enforced)
CLI ingest endpoint  → Supabase with service role (RLS bypassed, app-level auth)
```

---

## 8. Phase 6 — Team Settings & Dashboard UI

### 8.1 New Dashboard Pages

#### A. Team Management Page (`/dashboard/team`)

```
┌─────────────────────────────────────────────────────┐
│ Team: Acme Engineering                    [Edit Name]│
│ Team Code: ACME-7X3K                [Copy] [Regen]  │
│ Created: Jan 15, 2025                               │
├─────────────────────────────────────────────────────┤
│ Members (5)                                         │
│                                                     │
│ Name            Email              Role    CLI  ⋮   │
│ ─────────────────────────────────────────────────── │
│ Aditya M.       aditya@acme.dev    Owner   ✓       │
│ Priya S.        priya@acme.dev     Manager ✓    ⋮  │
│ Jake W.         jake@acme.dev      Dev     ✓    ⋮  │
│ Sara C.         sara@acme.dev      Dev     ✗    ⋮  │
│ Rob K.          rob@acme.dev       Dev     ✗    ⋮  │
├─────────────────────────────────────────────────────┤
│ Add Team Members                                    │
│                                                     │
│ Share this team code with developers:               │
│ ┌─────────────────────────────────────────────┐     │
│ │ ACME-7X3K                                   │ [Copy]│
│ └─────────────────────────────────────────────┘     │
│                                                     │
│ They can join by entering this code during signup   │
│ or in the onboarding flow.                          │
│                                                     │
│ CLI Setup:                                          │
│ ┌─────────────────────────────────────────────┐     │
│ │ npm install -g evaluateai && evalai login    │ [Copy]│
│ └─────────────────────────────────────────────┘     │
├─────────────────────────────────────────────────────┤
│ API Keys                                            │
│                                                     │
│ CLI (Aditya's MacBook) — eai_a1b2...  Last: 2h ago  │
│ CI/CD Pipeline         — eai_c3d4...  Last: 1d ago  │
│                                   [Generate New Key] │
└─────────────────────────────────────────────────────┘
```

#### B. Member Actions Menu (⋮)

| Action | Available to |
|--------|-------------|
| Change role | Owner only |
| Remove from team | Owner, Manager (not self, not owner) |

### 8.2 Settings Page Additions

Add a "CLI & API" tab to the existing settings page:

```
Settings
├── General (existing: privacy, scoring, threshold)
├── Integrations (existing: GitHub)
└── CLI & API (NEW)
    ├── Team ID: xxx [Copy]
    ├── API Keys: [list + generate]
    └── CLI Install Command: [copy block]
```

---

## 9. User Flow: End-to-End (After All Phases)

### Flow A: Manager Sets Up Team

```
1. Manager visits app.evaluateai.com
2. Signs up: name, email, password
3. Redirected to /onboarding
4. Step 1: Create team → "Acme Engineering" → team_code auto-generated (e.g., ACME-7X3K)
5. Step 2: Shows team code to share with developers [Copy button]
6. Step 3: Connect GitHub → OAuth flow
7. Step 4: Shows CLI install command for developers
8. Step 5: Go to Dashboard
```

### Flow B: Developer Joins via Team Code

```
1. Manager shares team code (e.g., ACME-7X3K) via Slack, email, verbally
2. Developer visits app.evaluateai.com → Signs up
3. Redirected to /onboarding → "Join existing team" → Enters team code
4. Shows: "Join Acme Engineering?" → Confirm → Added as developer
5. Sees dashboard (own data only)
```

### Flow C: Developer Sets Up CLI

```
1. Developer runs: npm install -g evaluateai
2. Runs: evalai login
   → Browser opens → log in (or already logged in)
   → If no team: prompted to enter team code or create team
   → "Authorize CLI for Acme Engineering?" → Confirm
   → Browser shows "Success! You can close this tab."
   → CLI shows "✓ Logged in as jake@acme.dev (Acme Engineering)"
3. Runs: evalai init
   → "✓ 4 hooks installed into Claude Code"
   → "✓ Ready. Your AI usage will sync automatically."
4. Uses Claude Code normally — hooks fire in background
```

### Flow D: Developer Joins via CLI (No Dashboard)

```
1. Manager shares team code (ACME-7X3K) in Slack
2. Developer runs: npm install -g evaluateai
3. Runs: evalai login
   → Browser opens → signup/login → enter team code → joins team
   → CLI receives token
4. Runs: evalai init → hooks installed
```

---

## 10. Database Schema Changes

### New Tables

```sql
-- No team_invites table needed — using team_code on teams table instead (see Phase 2)

-- CLI authentication tokens
CREATE TABLE cli_tokens (
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
```

### Modifications to Existing Tables

```sql
-- teams: add owner_id link (may already exist in schema)
ALTER TABLE teams ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES auth.users(id);

-- teams: add team_code for join-by-code flow
ALTER TABLE teams ADD COLUMN IF NOT EXISTS team_code TEXT UNIQUE;
-- Backfill existing teams with generated codes
UPDATE teams SET team_code = UPPER(SUBSTRING(REPLACE(name, ' ', ''), 1, 4) || '-' || SUBSTRING(gen_random_uuid()::text, 1, 4)) WHERE team_code IS NULL;
ALTER TABLE teams ALTER COLUMN team_code SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_teams_team_code ON teams(team_code);
```

---

## 11. API Endpoints to Add/Modify

### New Endpoints

| Method | Path | Purpose | Auth |
|--------|------|---------|------|
| POST | `/api/cli/tokens` | Generate CLI token | Dashboard session |
| GET | `/api/cli/verify` | Verify CLI token is valid | CLI token |
| POST | `/api/cli/ingest` | Receive hook data from CLI | CLI token |
| GET | `/api/teams/join?code=XXX` | Look up team by code (returns team name) | None (public) |
| POST | `/api/teams/join` | Join team by code | Logged in user |
| POST | `/api/teams/[id]/regenerate-code` | Regenerate team code | Owner/Manager |
| DELETE | `/api/teams/[id]/members/[memberId]` | Remove member | Owner/Manager |
| PATCH | `/api/teams/[id]/members/[memberId]` | Update role | Owner |

### Modified Endpoints

| Endpoint | Change |
|----------|--------|
| `POST /api/auth/signup` | Remove team creation. Account only. |
| All `/api/dashboard/*` | Replace `x-user-id` header with Supabase session auth |
| All `/api/*` | Add role checking via `getAuthContext()` |

---

## 12. CLI Commands to Add/Modify

### New Commands

| Command | Description |
|---------|-------------|
| `evalai login` | Browser OAuth login → saves CLI token |
| `evalai login --token <token>` | Login with API key (for CI/CD) |
| `evalai logout` | Remove saved credentials |
| `evalai whoami` | Show logged-in user, team, role |

### Modified Commands

| Command | Change |
|---------|--------|
| `evalai init` | No longer needs `--team` or Supabase env vars. Just installs hooks. |
| `evalai init --check` | Check hooks + CLI auth status (not Supabase directly) |
| `evalai team` | Uses CLI token API instead of direct Supabase |
| `evalai team link` | Deprecated (team is set during `evalai login`) |

### Removed Requirements

| What | Why |
|------|-----|
| `SUPABASE_URL` env var | CLI no longer talks to Supabase directly |
| `SUPABASE_ANON_KEY` env var | CLI no longer talks to Supabase directly |
| `EVALUATEAI_TEAM_ID` env var | Team comes from CLI token |
| `evalai init --supabase` | No longer needed |

---

## 13. File-by-File Change Map

### Dashboard Package (`packages/dashboard/`)

```
NEW FILES:
  src/lib/supabase-browser.ts           — Browser Supabase client (@supabase/ssr)
  src/lib/supabase-ssr.ts               — Server Supabase client (@supabase/ssr)
  src/lib/auth.ts                       — getAuthContext(), requireRole()
  src/hooks/useAuth.ts                  — React auth context + useCanAccess()
  src/middleware.ts                      — Next.js auth middleware
  src/app/cli/auth/page.tsx             — CLI OAuth authorization page
  src/app/join/page.tsx                 — Join team by code page
  src/app/dashboard/team/page.tsx       — Team management page
  src/app/api/cli/tokens/route.ts       — Generate/list/revoke CLI tokens
  src/app/api/cli/verify/route.ts       — Verify CLI token
  src/app/api/cli/ingest/route.ts       — Receive CLI hook data
  src/app/api/teams/join/route.ts       — Look up & join team by code
  src/app/api/teams/[id]/regenerate-code/route.ts — Regenerate team code
  src/app/api/teams/[id]/members/[mid]/route.ts — Update/remove member

MODIFIED FILES:
  src/lib/supabase.ts                   — Deprecate, migrate to supabase-browser.ts
  src/lib/supabase-server.ts            — Keep for admin operations only
  src/app/layout.tsx                    — Remove localStorage auth check, add AuthProvider
  src/app/auth/login/page.tsx           — Use @supabase/ssr, remove localStorage writes
  src/app/auth/signup/page.tsx          — Remove team creation, redirect to /onboarding
  src/app/api/auth/signup/route.ts      — Account creation only, no team
  src/app/onboarding/page.tsx           — Handle both "create team" and "join team by code" flows
  src/app/settings/page.tsx             — Add CLI & API Keys tab
  src/app/dashboard/page.tsx            — Use auth context instead of localStorage
  src/app/dashboard/developers/*        — Add role-based filtering
  src/app/api/dashboard/**              — Replace x-user-id with session auth + RBAC
  (all dashboard pages)                 — Replace localStorage team reads with auth context
```

### CLI Package (`packages/cli/`)

```
NEW FILES:
  src/commands/login.ts                 — Browser OAuth + token login
  src/commands/logout.ts                — Remove credentials
  src/commands/whoami.ts                — Show auth status
  src/utils/credentials.ts             — Read/write credentials.json
  src/utils/api.ts                     — HTTP client with auth headers

MODIFIED FILES:
  bin/evalai.js                         — Remove dotenv Supabase loading, add login/logout commands
  src/commands/init.ts                  — Simplify: hooks only, remove --supabase/--team
  src/commands/team.ts                  — Use API proxy instead of direct Supabase
  src/hooks/handler.ts                  — Send to API proxy instead of Supabase directly
  src/utils/paths.ts                    — Add CREDENTIALS_PATH
```

### Core Package (`packages/core/`)

```
MODIFIED FILES:
  src/db/supabase-schema.sql            — Add team_code to teams, cli_tokens table + RLS policies
```

---

## 14. Implementation Priority & Dependencies

```
Phase 1: Auth (MUST DO FIRST — everything depends on this)
  ├── 1a. @supabase/ssr setup + middleware          (2-3 days)
  ├── 1b. Migrate all API routes from x-user-id     (2-3 days)
  ├── 1c. Migrate all pages from localStorage        (1-2 days)
  └── 1d. Update login/signup pages                  (1 day)

Phase 2: Team Join Flow (enables multi-user teams)
  ├── 2a. Add team_code column to teams + API endpoints  (1 day)
  ├── 2b. Join team by code page (/join)                 (1 day)
  └── 2c. Modify signup to separate from team create     (1 day)

Phase 3: RBAC (enables proper multi-tenant security)
  ├── 3a. getAuthContext + requireRole helpers        (1 day)
  ├── 3b. Apply to all API routes                    (2 days)
  ├── 3c. Frontend role context + conditional UI     (1-2 days)
  └── 3d. Developer data isolation                   (1 day)

Phase 4: CLI Production Auth (enables npm publish)
  ├── 4a. cli_tokens table + API endpoints           (1 day)
  ├── 4b. evalai login command (browser flow)        (2 days)
  ├── 4c. CLI ingest API proxy                       (2 days)
  ├── 4d. Migrate hooks from direct Supabase to API  (1-2 days)
  └── 4e. evalai login --token for CI/CD             (1 day)

Phase 5: RLS (database-level security)
  ├── 5a. Write and test all RLS policies            (2 days)
  └── 5b. Verify no broken queries                   (1 day)

Phase 6: Team Management UI
  ├── 6a. /dashboard/team page                       (2-3 days)
  ├── 6b. Team code display + member actions          (1-2 days)
  └── 6c. Settings → CLI & API Keys tab              (1 day)
```

### Dependency Graph

```
Phase 1 (Auth)
    ↓
Phase 2 (Team Join) ──→ Phase 6 (Team UI)
    ↓
Phase 3 (RBAC) ──→ Phase 5 (RLS)
    ↓
Phase 4 (CLI Auth)
```

**Total estimated effort: 4-6 weeks for one developer.**

### What You Can Ship Incrementally

| Milestone | What users get | Phases needed |
|-----------|---------------|---------------|
| **M1: Secure Auth** | Real login sessions, no localStorage hacks | Phase 1 |
| **M2: Team Join** | Developers can join teams via team code | Phase 1 + 2 |
| **M3: CLI on npm** | `npm install -g evaluateai && evalai login` works | Phase 1 + 2 + 4 |
| **M4: Full RBAC** | Developers see own data only, managers see all | Phase 1 + 3 |
| **M5: Production-ready** | RLS, team management UI, complete flows | All phases |

---

## Appendix: Environment Variables (Production)

### Dashboard (Vercel/server)

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...          # server-only, never exposed
NEXT_PUBLIC_APP_URL=https://app.evaluateai.com
```

### CLI (user machine) — NO ENV VARS NEEDED

```
~/.evaluateai-v2/credentials.json
{
  "token": "eai_...",
  "apiUrl": "https://app.evaluateai.com"
}
```

### CLI (CI/CD)

```env
EVALUATEAI_TOKEN=eai_...                  # generated from dashboard
EVALUATEAI_API_URL=https://app.evaluateai.com  # optional override
```
