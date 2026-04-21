# Architecture

## What the platform is

A developer-productivity intelligence platform that links four signal streams for managers:

```
Meeting decisions → Assigned tasks → Code output → AI usage → Delivery verification
```

Every piece of signal ingestion is automatic; developers install a CLI once and forget about it.

## Monorepo layout

```
packages/
  core/        — Scoring engine, token pricing, transcript parser, types (pure, no I/O)
  cli/         — evaluateai npm CLI + Claude Code hook handlers
  dashboard/   — Next.js 15 web app + API routes + Supabase migrations
  proxy/       — (planned) API proxy for non-Claude tools
  mcp-server/  — (planned)
```

The workspace is pnpm + Turborepo. Core has no workspace dependencies; CLI depends on core; dashboard imports core only for types/scoring.

## Stack

- **Runtime**: Node 20+, TypeScript 5.x, ESM
- **Data plane**: Supabase Postgres (single database, no local SQLite)
- **Frontend**: Next.js 16, React 19, Tailwind 4, Recharts, lucide-react
- **Auth**: Supabase Auth (email + password, Google OAuth) with identity linking
- **AI**: `@anthropic-ai/sdk` — Claude Haiku for prompt scoring + meeting-task extraction
- **Encryption at rest**: Node AES-256-GCM for integration tokens (key in env)

## Trust model

Three actors hit the data plane, each with different credentials:

```
┌──────────────────────────┐   ┌─────────────────────────────┐
│ Dashboard (browser/SSR)  │   │ CLI (developer machine)     │
│ - Supabase session       │   │ - CLI token (eai_...)       │
│ - Anon key → RLS-scoped  │   │ - Posts to /api/cli/ingest  │
└───────────┬──────────────┘   └───────────────┬─────────────┘
            │                                  │
            v                                  v
       ┌──────────────────────────────────────────┐
       │ Dashboard Next.js app                    │
       │ - API routes + SSR + background workers  │
       │ - Holds service-role key                 │
       │ - Enforces RBAC + input validation       │
       └───────────────────┬──────────────────────┘
                           │ service role (bypasses RLS)
                           v
                   ┌───────────────────┐
                   │ Supabase Postgres │
                   │ RLS on all tables │
                   └───────────────────┘
```

Only the dashboard holds `SUPABASE_SERVICE_ROLE_KEY`. The CLI does **not** touch Supabase directly — it posts events over HTTPS to `/api/cli/ingest` using a CLI token (`eai_...`) issued by the dashboard.

## How signal flows

### AI usage (CLI → dashboard → Supabase)

```
Developer uses Claude Code
  └─ UserPromptSubmit hook fires (< 50ms)
     └─ Scores the prompt locally (intent-aware heuristic)
        └─ Shows suggestions on stderr
  └─ Stop / SessionEnd hook fires
     └─ Parses ~/.claude/projects/*/*.jsonl for exact tokens
        └─ Fires POST /api/cli/ingest asynchronously
           └─ Dashboard writes to ai_sessions / ai_turns / ai_tool_events
```

Hook guarantees: never crash, always exit 0, sync part < 50ms, LLM calls + ingest are fire-and-forget. Failed ingests are queued locally at `~/.evaluateai-v2/queue.jsonl` and replayed.

### Code changes (per-user GitHub OAuth → dashboard sync)

Legacy flow (team-scoped manager OAuth) has been superseded. See [`integrations.md`](./integrations.md) for the per-user one-repo-one-token flow that replaced it.

### Meetings (per-user Fireflies API key → dashboard sync)

Manual sync button creates a `sync_jobs` row, runs `firefliesAdapter.sync()` via Next.js `after()`, writes to `meetings` + `tasks` (via LLM task extraction).

## Scoring engine (core package)

Intent-first, not one-size-fits-all. Every prompt is classified into one of seven intents:

```
research | debug | feature | refactor | review | generate | config
```

Baseline score per intent (research = 75, debug = 65, feature/refactor/config/generate = 70, review = 75). Anti-patterns (`vague_verb`, `retry_detected`, etc.) deduct. Positive signals add. Final score clamped to 0-100.

Anti-pattern catalog and positive-signal catalog live in `packages/core/src/scoring/`. Adding a new signal is adding a row to an array and the scorer picks it up. Tests are in `packages/core/src/__tests__/scoring.test.ts` — 88 tests, pure, no network.

## File naming

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
  utils/        — Shared CLI utilities

packages/dashboard/
  src/components/       — React components
  src/app/              — Next.js pages and API routes
  src/lib/              — Shared dashboard utilities, Supabase clients, auth
  src/lib/integrations/ — Provider registry, adapters, sync/planner/attribution
  supabase/migrations/  — SQL schema migrations
```

## Database naming conventions

- Tables/columns: `snake_case` in Postgres, `camelCase` in TypeScript, transformed at the API boundary
- Every team-scoped table carries `team_id` + an index on `(team_id, created_at DESC)`
- RLS policies gate by team membership; service-role key is the only bypass (server-side only)
- Timestamps always `TIMESTAMPTZ`

## Key dashboard features

These are the features that exist today, not aspirational:

- **Auth**: email/password + Google OAuth, with identity linking
- **Onboarding**: 5-step wizard (team create/join + invites + GitHub + CLI)
- **Analytics** (`/analytics`): intent distribution, token waste, model-optimization recommendations, cost/score trends — all period-filtered
- **Developer detail** (`/dashboard/developers/[id]`): five tabs (Sessions, Timeline, Work, AI Usage, Insights) + personalized coaching tips
- **Session detail** (`/sessions/[id]`): prompt-replay (before/after AI rewrite), per-turn breakdown, cost
- **Tasks** (`/dashboard/tasks`): auto-status transitions driven by matched commits, AI cost per task
- **Integrations** (`/dashboard/integrations`): per-user OAuth connect, team coverage roster, sync button with live progress, onboarding nudge
- **Profile** (`/profile`): account linking (Connect Google), CLI token management, display name
- **Alerts** (`/dashboard/alerts`): six alert types (stale task, cost spike, score drop, inactive dev, high performer, low prompt score)
- **Reports**: daily + weekly aggregations

## CLI features

- Auto-capture on every prompt + response (no developer action per-prompt)
- Intent-aware suggestions on stderr for low-scoring prompts
- `evalai setup` — one-command install: browser OAuth + Claude Code hook install
- `evalai setup --token <token>` — zero-browser variant for CI/Docker
- `evalai stats [--week|--month|--compare]` — local usage stats
- `evalai sessions [id]` — browse/detail sessions
- `evalai config [set key value]` — configuration
- `evalai export [--csv|--json]` — export data

## Environment boundaries

| Variable | Scope | Purpose |
|---|---|---|
| `SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_URL` | Dashboard (server + client) | Supabase endpoint |
| `SUPABASE_ANON_KEY` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Dashboard (server + client) | Client-safe, RLS-scoped |
| `SUPABASE_SERVICE_ROLE_KEY` | Dashboard (server only) | RLS-bypass; never ship to client |
| `EVALUATEAI_ENCRYPTION_KEY` | Dashboard (server only) | AES-256-GCM for integration token ciphertext. Must be identical across environments. |
| `GITHUB_OAUTH_CLIENT_ID` / `SECRET` | Dashboard (server only) | Per-user GitHub integration OAuth app |
| `ANTHROPIC_API_KEY` | Dashboard (server only) | Optional — prompt LLM scoring + task extraction |

The CLI ships with no provider keys. It reads `EVALUATEAI_API_URL` and `EVALUATEAI_TOKEN` from `~/.evaluateai-v2/credentials.json`.

## Deliberate non-goals

- **No webhooks.** All sync is user-triggered via the dashboard. Simpler threat model, simpler debugging. See [`integrations.md`](./integrations.md).
- **No cron.** Same reasoning — once we add cron we inherit a whole class of "did it run?" problems. Fine for now while manual sync is adequate.
- **No Fathom.** Previously integrated, since removed. The directory and webhook routes are gone; only docs/history mentions it.
- **Multiple databases.** Single Supabase Postgres. No read replicas, no caching layer. Revisit when metrics demand.
