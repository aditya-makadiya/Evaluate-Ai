# EvaluateAI — Project Intelligence

## What This Project Is

Developer Productivity Intelligence Platform. Connects meeting decisions → assigned tasks → code output → AI usage → delivery verification.

**Two products in one repo:**
1. `evaluateai` npm package — CLI that hooks into Claude Code to capture AI prompts, responses, tokens, costs
2. Web dashboard — Manager-facing platform showing team productivity, AI usage, and developer activity timeline

For current architecture deep dives see [`docs/`](./docs/) — specifically `docs/architecture.md`, `docs/integrations.md`, `docs/deployment.md`.

## Architecture

```
packages/
  core/        — Scoring engine, pricing, transcript parser, types (pure, no I/O)
  cli/         — CLI commands + Claude Code hook handlers
  dashboard/   — Next.js 16 web dashboard + API routes + Supabase migrations
  proxy/       — API proxy for non-Claude tools (planned)
  mcp-server/  — MCP server (planned)
```

## Tech Stack

- **Runtime**: Node.js 20+, TypeScript 5.x, ESM modules
- **Monorepo**: pnpm workspaces + Turborepo
- **Database**: Supabase PostgreSQL only (no local SQLite)
- **Frontend**: Next.js 16, React 19, Tailwind CSS 4, Recharts, lucide-react
- **Auth**: Supabase Auth — email + password, Google OAuth, identity linking via `supabase.auth.linkIdentity()`
- **AI**: `@anthropic-ai/sdk` — Claude Haiku for prompt scoring and meeting-task extraction
- **Encryption at rest**: Node AES-256-GCM for integration tokens (`src/lib/integrations/crypto.ts`)

## Key Conventions

### TypeScript
- ESM only — use `.js` extensions in imports (even for `.ts` files)
- Strict mode enabled
- Use `interface` for object shapes, `type` for unions/aliases
- No `any` unless absolutely necessary — use `unknown` + type narrowing

### Database
- Supabase PostgreSQL is the ONLY database — no local SQLite.
- **Only the dashboard** talks to Supabase (via `packages/dashboard/src/lib/supabase-*.ts`).
- Dashboard API routes query Supabase directly using the service-role key.
- The **CLI** posts events to the dashboard's `/api/cli/ingest` endpoint over HTTPS — it does **not** hold Supabase credentials.
- The **core** package is pure/stateless — no Supabase client, no persistence.
- Schema lives in `packages/dashboard/supabase/migrations/*.sql` (currently through `014`).
- All table/column names: snake_case in DB, camelCase in TypeScript (transformed at the API boundary).

### CLI Hooks
- Every hook handler MUST exit 0 — never break Claude Code.
- Wrap everything in try/catch → exit 0 on error.
- Hooks must complete in < 50ms (sync parts).
- LLM calls and API ingest are fire-and-forget (async, no await).
- Failed ingest events are appended to `~/.evaluateai-v2/queue.jsonl` and replayed on the next hook fire.
- Transcript parsing reads from `~/.claude/projects/`.

### Integrations (per-user flow)

Per-user OAuth for GitHub + Fireflies. Every team member connects their own account; sync picks one token per tracked repo, preferring the member with the most rate-limit budget. ETag-cached conditional fetches mean unchanged repos cost zero rate limit.

- Adapters live in `src/lib/integrations/providers/{github,fireflies}.ts` behind a common `ProviderAdapter` interface
- Sync is button-driven only — no cron, no webhooks. Button → `POST /api/integrations/:provider/sync` returns 202 + `jobId`; work runs via Next.js `after()` and the frontend polls `/sync-jobs/[jobId]`
- Feature flag: `teams.settings.multi_user_integrations_enabled` (default **true**; only explicit `false` opts out to the legacy flow which is still in the codebase but receives no new traffic)
- Full spec + runbook in [`docs/integrations.md`](./docs/integrations.md)

### Scoring Engine
- Intent-aware: classify prompt → apply intent-specific rules
- 7 intents: research, debug, feature, refactor, review, generate, config
- Baseline scores: research=75, debug=65, feature/refactor/config/generate=70, review=75
- Anti-patterns deduct, positive signals add, clamp 0-100

### Testing
- Vitest for unit tests
- Core: `packages/core/src/__tests__/` — 88 tests across 3 files (scoring, pricing, tokens). Pure — no network, no DB, no env vars.
- Dashboard: `packages/dashboard/src/lib/integrations/__tests__/` — 59 tests across 7 files (crypto, oauth-state, planner, attribution, sync-jobs, feature-flag, time-ago)
- Run core: `pnpm --filter evaluateai-core test`
- Run dashboard: `pnpm --filter evaluateai-dashboard exec vitest run`

## File Naming

```
packages/core/src/
  scoring/      — Heuristic scorer, LLM scorer, efficiency calculator
  analysis/     — Session analyzer
  tokens/       — Token estimation
  models/       — Model pricing
  transcript/   — Claude Code transcript JSONL parser

packages/cli/src/
  commands/     — CLI commands (setup, login, init, stats, etc.)
  hooks/        — Claude Code hook handlers
  utils/        — Shared CLI utilities (paths, credentials, api client, display)

packages/dashboard/
  src/components/       — React components
  src/components/auth/  — Google sign-in button, linked-identities section
  src/components/integrations/ — Integration cards, sync progress, coverage roster, onboarding nudge
  src/app/              — Next.js pages and API routes
  src/lib/              — Shared dashboard utilities
  src/lib/integrations/ — Provider registry, adapters, sync planner, crypto, attribution, feature flag
  supabase/migrations/  — SQL schema migrations (000 through 014)
```

## Common Commands

```bash
# Build
pnpm run build                           # Build all packages (Turborepo handles dependency order)
pnpm --filter evaluateai-core build      # Build core only
pnpm --filter evaluateai build           # Build CLI only
pnpm --filter evaluateai-dashboard build # Build dashboard only

# Lint
pnpm --filter evaluateai-dashboard exec npx eslint src/ --ext .ts,.tsx  # Lint dashboard

# Test
pnpm --filter evaluateai-core test       # 88 core tests
pnpm --filter evaluateai-dashboard exec vitest run  # 59 dashboard tests

# Dev
pnpm --filter evaluateai-dashboard dev   # Start dashboard dev server on :3456

# CLI
pnpm install                          # Install all dependencies
evalai setup                          # One-command install: auth + Claude Code hooks
evalai setup --token <token>          # Same, but zero-browser (CI/Docker/dashboard one-liner)
evalai init                           # Install Claude Code hooks only (requires prior `evalai login`)
evalai stats                          # Show usage stats
```

## Environment Variables

**Dashboard** (`packages/dashboard/.env`):

```
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co         # Client + server
SUPABASE_URL=https://xxx.supabase.co                     # Server alias (some routes read this)
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...                     # Client-safe, RLS-scoped
SUPABASE_ANON_KEY=eyJ...                                 # Server alias
SUPABASE_SERVICE_ROLE_KEY=eyJ...                         # Server-only, RLS-bypass — NEVER prefix with NEXT_PUBLIC_

# Integration tokens are encrypted with AES-256-GCM. Must be identical
# across environments (dev / preview / production) or stored tokens are
# unreadable. Generate: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
EVALUATEAI_ENCRYPTION_KEY=<32-byte-base64-string>

# Per-user GitHub integration OAuth App
GITHUB_OAUTH_CLIENT_ID=...
GITHUB_OAUTH_CLIENT_SECRET=...

# Optional
ANTHROPIC_API_KEY=sk-ant-...                  # LLM scoring + session analysis
NPM_TOKEN=npm_...                             # Publishing (CI only)
```

**CLI** (no `.env` required): the CLI stores its auth in `~/.evaluateai-v2/credentials.json` (written by `evalai setup` / `evalai login`). No Supabase keys. Optional overrides:

```
EVALUATEAI_API_URL=https://dashboard.your-company.com   # override stored dashboard URL
EVALUATEAI_TOKEN=eai_...                                # override stored CLI token
EVALUATEAI_TEAM_ID=...                                  # user-level preference in ~/.evaluateai-v2/.env
```

## Dashboard Features

### Auth (`/auth/login`, `/auth/signup`)
- Email + password (with email confirmation)
- Google OAuth — button on both login and signup; callback at `/auth/callback`
- Friendly error when a Google-origin user tries password login
- `/auth/callback` routes new users (no `team_members` row) to `/onboarding` regardless of requested redirect

### Profile (`/profile`)
- Change display name, change password, manage CLI tokens
- **Connected Accounts** section lists linked auth identities via `supabase.auth.getUserIdentities()`; users can add Google via `linkIdentity()` or unlink via `unlinkIdentity()` (Supabase server-side prevents unlinking the last identity)

### Integrations (`/dashboard/integrations`)
- Per-user card per provider: Connect / Sync / Disconnect (developers) or Connect / Sync / Manage (managers+owners)
- **Onboarding nudge** banner when current user hasn't connected a provider
- **Sync in progress** banner with live counts from `sync_jobs` polling when a sync is running
- **Team coverage roster** (managers+owners only) — per-provider member list with status, handle, repo count, last-sync badge, revoke button

### Analytics (`/analytics`)
- **Period selector**: today/week/month/quarter — filters all charts via `?period=` param
- **Intent distribution**: Real data from `ai_turns.intent`
- **Token waste**: Computed from `ai_turns.was_retry`
- **Model optimization**: Cross-references `ai_sessions.model` with `work_category` intent to recommend cheaper models with dollar savings
- **Cost/score trends**: Area and line charts filtered by selected period
- **Score distribution**: Histogram of prompt quality scores

### Developer Detail (`/dashboard/developers/[id]`)
- **5 tabs**: Sessions, Timeline, Work, AI Usage, Insights
- **Coaching tips**: Personalized tips based on top anti-patterns from `heuristic.ts` hints
- **Session duration**: Computed from `ended_at - started_at`

### Tasks (`/dashboard/tasks`)
- **AI cost per task**: Total AI spend via `ai_sessions.matched_task_id` join
- **Auto-status updates**: Tasks auto-transition pending→in_progress→completed when matched commits land

### Session Detail (`/sessions/[id]`)
- **Prompt replay**: Side-by-side before/after comparison of original first prompt vs AI-rewritten version from `SessionAnalysis.rewrittenFirstPrompt`
- **Duration**: Computed and displayed in session header and metadata cards

### API Conventions
- `/api/stats?period=today|week|month|quarter` — All stats respect period filter
- `/api/stats` returns: `intentDistribution`, `tokenWaste`, `modelOptimization` alongside existing fields
- `/api/dashboard/developers/[id]` returns: `coachingTips`, `durationMin` per session
- `/api/dashboard/tasks` returns: `aiCost`, `aiSessions` per task
- `/api/sessions/[id]` returns: `durationMin` in session object
- `/api/integrations/status?team_id=…` returns `{ flow: 'v2' | 'legacy', providers: {...} }` — frontend branches on `flow`
- `/api/integrations/:provider/sync` returns 202 + `{ jobId }`; poll `/api/integrations/sync-jobs/[jobId]` for progress

## Git Workflow

- Main branch: `main`
- Commit messages: descriptive titles (not strictly conventional-commits). Recent examples:
  - `Add per-user integrations flow and Google OAuth sign-in`
  - `Consolidate root planning docs into docs/`
- Always run `pnpm run build` before committing
- Run tests: `pnpm --filter evaluateai-core test` + `pnpm --filter evaluateai-dashboard exec vitest run`

## Deliberate non-goals

Listed here so a future contributor doesn't reintroduce removed features:

- **No webhooks** — all sync is user-triggered. `github/webhook` and `fireflies/webhook` routes were deleted in the per-user integrations rework.
- **No cron** — sync is manual-button-only. If freshness becomes a problem, add cron to the adapter loop, not to the user-initiated flow.
- **No Fathom** — previously integrated, removed. Don't resurrect without product discussion.
- **Multiple databases** — single Supabase Postgres. No read replicas, no caching layer. Revisit when metrics demand.
