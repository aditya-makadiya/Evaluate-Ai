# EvaluateAI — Project Intelligence

## What This Project Is

Developer Productivity Intelligence Platform. Connects meeting decisions → assigned tasks → code output → AI usage → delivery verification.

**Two products in one repo:**
1. `evaluateai` npm package — CLI that hooks into Claude Code to capture AI prompts, responses, tokens, costs
2. Web dashboard — Manager-facing platform showing team productivity, AI usage, and developer activity timeline

## Architecture

```
packages/
  core/        — Scoring engine, DB (Supabase), transcript parser, types
  cli/         — CLI commands + Claude Code hook handlers
  dashboard/   — Next.js 15 web dashboard
  proxy/       — API proxy for non-Claude tools (planned)
  mcp-server/  — MCP server (planned)
```

## Tech Stack

- **Runtime**: Node.js 20+, TypeScript 5.x, ESM modules
- **Monorepo**: pnpm workspaces + Turborepo
- **Database**: Supabase PostgreSQL only (no local SQLite)
- **Frontend**: Next.js 15, Tailwind CSS 4, Recharts, lucide-react
- **AI**: @anthropic-ai/sdk (Claude Haiku for analysis)
- **Auth**: Supabase Auth
- **Notifications**: Slack API, Resend (email)

## Key Conventions

### TypeScript
- ESM only — use `.js` extensions in all imports (even for .ts files)
- Strict mode enabled
- Use `interface` for object shapes, `type` for unions/aliases
- No `any` unless absolutely necessary — use `unknown` + type narrowing

### Database
- Supabase PostgreSQL is the ONLY database — no local SQLite
- All reads/writes go directly to Supabase via @supabase/supabase-js
- Dashboard API routes query Supabase directly (not local files)
- CLI hooks write to Supabase directly (not local SQLite)
- All table/column names: snake_case in DB, camelCase in TypeScript
- Requires SUPABASE_URL and SUPABASE_ANON_KEY env vars to function

### CLI Hooks
- Every hook handler MUST exit 0 — never break Claude Code
- Wrap everything in try/catch → exit 0 on error
- Hooks must complete in < 50ms (sync parts)
- LLM calls and Supabase sync are fire-and-forget (async, no await)
- Transcript parsing reads from ~/.claude/projects/

### Scoring Engine
- Intent-aware: classify prompt → apply intent-specific rules
- 7 intents: research, debug, feature, refactor, review, generate, config
- Baseline scores: research=75, debug=65, feature/refactor/config/generate=70, review=75
- Anti-patterns deduct, positive signals add, clamp 0-100

### Testing
- Vitest for unit + integration tests
- Tests in `src/__tests__/` directories
- 152+ tests across 5 test files
- Test with temp SQLite DBs (never touch real data)

## File Naming

```
src/
  db/           — Database client, schema, migrations, Supabase sync
  scoring/      — Heuristic scorer, LLM scorer, efficiency calculator
  analysis/     — Session analyzer
  tokens/       — Token estimation
  models/       — Model pricing
  transcript/   — Claude Code transcript JSONL parser
  hooks/        — Claude Code hook handlers (CLI package)
  commands/     — CLI commands (CLI package)
  components/   — React components (dashboard)
  app/          — Next.js pages and API routes (dashboard)
  lib/          — Shared utilities (dashboard)
```

## Common Commands

```bash
# Build
pnpm run build                        # Build all packages (Turborepo handles dependency order)
pnpm --filter evaluateai-core build   # Build core only
pnpm --filter evaluateai build        # Build CLI only
pnpm --filter evaluateai-dashboard build # Build dashboard only

# Lint
pnpm --filter evaluateai-dashboard exec npx eslint src/ --ext .ts,.tsx  # Lint dashboard

# Test
pnpm --filter evaluateai-core test    # Run core tests

# Dev
pnpm --filter evaluateai-dashboard dev # Start dashboard dev server

# CLI
pnpm install                          # Install all dependencies
evalai init                           # Install Claude Code hooks
evalai stats                          # Show usage stats
```

## Environment Variables

```
SUPABASE_URL=https://xxx.supabase.co    # Supabase project URL
SUPABASE_ANON_KEY=eyJ...               # Supabase anon key
ANTHROPIC_API_KEY=sk-ant-...            # For LLM scoring (optional)
NPM_TOKEN=npm_...                       # For publishing (CI only)
```

Loaded from: `~/.evaluateai-v2/.env` (auto-loaded by CLI via dotenv)

## Dashboard Features

### Analytics Page (`/analytics`)
- **Period selector**: today/week/month/quarter — filters all charts via `?period=` param
- **Intent distribution**: Real data from `ai_turns.intent` — shows research/debug/feature/etc breakdown
- **Token waste**: Computed from `ai_turns.was_retry` — shows retry rate, wasted tokens
- **Model optimization**: Cross-references `ai_sessions.model` with `work_category` intent to recommend cheaper models with dollar savings
- **Cost/score trends**: Area and line charts filtered by selected period
- **Score distribution**: Histogram of prompt quality scores

### Developer Detail Page (`/dashboard/developers/[id]`)
- **5 tabs**: Sessions, Timeline, Work, AI Usage, Insights
- **Coaching tips**: Personalized tips based on top anti-patterns from `heuristic.ts` hints — shows pattern name, count, severity, and actionable advice
- **Session duration**: Computed from `ended_at - started_at`, displayed on session cards

### Tasks Page (`/dashboard/tasks`)
- **AI cost per task**: Shows total AI spend via `ai_sessions.matched_task_id` join — visible in task list and detail panel
- **Auto-status updates**: Tasks auto-transition pending→in_progress→completed based on code changes

### Session Detail (`/sessions/[id]`)
- **Prompt replay**: Side-by-side before/after comparison of original first prompt vs AI-rewritten version from `SessionAnalysis.rewrittenFirstPrompt`
- **Duration**: Computed and displayed in session header and metadata cards

### API Conventions
- `/api/stats?period=today|week|month|quarter` — All stats respect period filter
- `/api/stats` returns: `intentDistribution`, `tokenWaste`, `modelOptimization` alongside existing fields
- `/api/dashboard/developers/[id]` returns: `coachingTips`, `durationMin` per session
- `/api/dashboard/tasks` returns: `aiCost`, `aiSessions` per task
- `/api/sessions/[id]` returns: `durationMin` in session object

## Git Workflow

- Main branch: `main`
- Commit messages: conventional format (feat:, fix:, docs:, refactor:, test:)
- Always run `pnpm run build` before committing
- Run `pnpm --filter evaluateai-core test` to verify tests pass
