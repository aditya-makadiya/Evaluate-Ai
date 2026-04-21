# EvaluateAI

**Developer Productivity Intelligence Platform**

EvaluateAI connects the dots between meetings, tasks, code output, and AI usage to give engineering teams full visibility into how developers work with AI tools.

For architecture, integration internals, and deployment, see [`docs/`](./docs/).

## Two Products, One Platform

### 1. CLI Tool (`evaluateai` on npm)

Hooks into Claude Code to automatically capture every AI interaction:

- Scores prompts in real-time with an intent-aware heuristic engine (7 intents, 10+ anti-patterns)
- Suggests improvements for low-quality prompts before they are sent
- Tracks sessions, tokens, costs, and tool usage — parsed from Claude Code's own transcript files
- Posts events to the dashboard over HTTPS (does not talk to Supabase directly)

```bash
npm install -g evaluateai
evalai setup          # one-command install: auth + Claude Code hooks
```

### 2. Web Dashboard

Manager-facing platform for team productivity insights:

- Developer activity timelines
- AI usage analytics and cost tracking
- Prompt quality trends across the team
- Daily auto-generated reports and alerts
- Per-user third-party integrations (GitHub, Fireflies)

```bash
cd packages/dashboard
pnpm install && pnpm dev
# Opens at http://localhost:3456
```

## Key Features

### AI Prompt & Response Capture
Every Claude Code interaction is captured automatically via hooks — prompts, responses, exact token counts (parsed from the transcript JSONL), costs, tool calls, and file changes.

### Per-user GitHub & Fireflies integrations
Each team member connects their own account. The sync button picks one token per tracked repo (the one with the most rate-limit budget among members with access) and uses ETag conditional fetches so unchanged repos cost zero rate limit. Attribution uses OAuth-provided identity for determinism — typo in onboarding no longer breaks dashboards. Full detail in [`docs/integrations.md`](./docs/integrations.md).

### Developer Activity Timeline
A unified timeline showing AI sessions, commits, PRs, and (when connected) meetings and their extracted tasks — per developer.

### Meeting-to-Code Tracking
When Fireflies is connected, transcripts are ingested and action items are extracted via Claude Haiku. Commits are matched back to tasks by keyword + semantic similarity, so the manager sees "this meeting's decisions shipped as these commits."

### Auto-Reports & Alerts
Automated daily summaries and six alert types (stale task, cost spike, score drop, inactive dev, high performer, low prompt score).

### Team Management
Email + password sign-up or Google OAuth. Owners create teams; developers join via invite code or `evalai init --team <id>` from the CLI.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ Developer Machine                                           │
│                                                             │
│   Claude Code ── hooks ──> evalai CLI ── HTTPS ──┐         │
│                                                   │         │
└───────────────────────────────────────────────────┼─────────┘
                                                    │
                                                    ▼
┌─────────────────────────────────────────────────────────────┐
│ Dashboard (Next.js 16 on Vercel)                            │
│                                                             │
│   /api/cli/ingest  ← CLI events                            │
│   /api/integrations/:provider/sync  ← user-clicked sync    │
│   /auth/callback  ← Supabase session exchange              │
│                                                             │
│   Holds SUPABASE_SERVICE_ROLE_KEY + integration encryption │
│   key. Only component that talks to Supabase.              │
│                                                             │
└───────────────────────────┬─────────────────────────────────┘
                            │ service role (bypasses RLS)
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ Supabase Postgres                                           │
│                                                             │
│   ai_sessions, ai_turns, ai_tool_events  (CLI ingested)    │
│   code_changes, meetings, tasks          (integrations)     │
│   user_integrations (encrypted tokens), team_tracked_repos  │
│   teams, team_members, activity_timeline                    │
│   Row-level security on every team-scoped table             │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

The CLI never touches Supabase directly — it posts to the dashboard, which validates a CLI bearer token (`eai_...`) and writes with the service role. Only one component in the system holds Supabase keys.

## Install

### CLI (for developers)

```bash
npm install -g evaluateai
```

### Dashboard (for managers / self-hosting)

```bash
git clone https://github.com/adityamakadiya/Evaluate-Ai.git
cd Evaluate-Ai
pnpm install
pnpm run build
```

### From source (full monorepo)

```bash
git clone https://github.com/adityamakadiya/Evaluate-Ai.git
cd Evaluate-Ai
pnpm install
pnpm run build
cd packages/cli && npm link && cd ../..
```

## Setup Flow

### 1. Create a Supabase project

Create a project at [supabase.com](https://supabase.com), then apply each migration in order from the Supabase SQL Editor:

```
packages/dashboard/supabase/migrations/
  000_initial_schema.sql
  001_add_team_code.sql
  002_add_cli_tokens.sql
  003_rls_policies.sql
  004_add_scoring_and_api_calls.sql
  005_add_meeting_metadata_and_task_project.sql
  006_phase1_2_enhancements.sql
  007_add_last_activity_at.sql
  008_add_tool_usage_summary.sql
  009_session_intelligence.sql
  010_platform_roles.sql
  011_performance_indexes.sql
  012_per_user_integrations.sql
  013_add_github_user_id.sql
  014_backfill_user_integrations.sql   # optional cutover seed
```

Migrations are idempotent. Only the dashboard talks to Supabase; the CLI does not need Supabase credentials.

### 2. Configure dashboard environment

Copy `.env.example` to `packages/dashboard/.env` and fill in:

```
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_URL=https://your-project.supabase.co     # server-side alias
SUPABASE_ANON_KEY=eyJ...                          # server-side alias
SUPABASE_SERVICE_ROLE_KEY=eyJ...                  # server-only

# AES-256-GCM key for integration tokens. Generate with:
#   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
# Must be identical across all environments (dev / preview / production).
EVALUATEAI_ENCRYPTION_KEY=<32-byte base64>

# Per-user GitHub integration OAuth App (github.com/settings/developers)
GITHUB_OAUTH_CLIENT_ID=...
GITHUB_OAUTH_CLIENT_SECRET=...

# Optional
ANTHROPIC_API_KEY=sk-ant-...     # LLM scoring + meeting task extraction
```

### 3. (Optional) Enable Google OAuth

In Supabase Dashboard → Authentication → Providers → Google:
- Paste a Google Cloud OAuth Client ID + Secret
- Toggle "Allow manual linking" ON under User Signups (for the Connect Google feature on `/profile`)

In Supabase Dashboard → Authentication → URL Configuration:
- Site URL: your dashboard URL (e.g. `http://localhost:3456` for dev)
- Redirect URLs: include `<site>/auth/callback`

Google Cloud Console → OAuth Client:
- Authorized redirect URIs: only `https://<project-ref>.supabase.co/auth/v1/callback`

Full production guide in [`docs/deployment.md`](./docs/deployment.md).

### 4. Authenticate and install CLI hooks

```bash
evalai setup                  # browser OAuth + hook install in one step
evalai setup --token <token>  # zero-browser install for CI/Docker/dashboard one-liner
evalai init --check           # verify hooks + auth status
```

Or run the steps manually:

```bash
evalai login                  # authenticate with your team
evalai init                   # install hooks into Claude Code
evalai init --check           # verify hooks are installed
```

`evalai setup` flags:

| Flag | Purpose |
|------|---------|
| `--token <token>` | Skip the browser; use an API token from your dashboard |
| `--api-url <url>` | Override the API URL (for self-hosted dashboards) |
| `--force` | Re-authenticate even if already logged in |
| `--skip-hooks` | Only authenticate; install Claude Code hooks later with `evalai init` |

### 5. (Optional) Link to a team

```bash
evalai init --team <team-id>
```

### 6. Start using Claude Code

```bash
claude    # EvaluateAI captures everything automatically
```

### 7. View results

```bash
evalai stats              # CLI stats
evalai stats --week       # weekly summary
evalai stats --compare    # compare vs previous period
evalai sessions           # browse sessions
```

Or open the dashboard at `http://localhost:3456` (or your deployed URL).

## Tech Stack

| Layer | Technology |
|-------|------------|
| Runtime | Node.js 20+, TypeScript 5.x, ESM modules |
| Monorepo | pnpm workspaces + Turborepo |
| Database | Supabase PostgreSQL (no local SQLite) |
| Auth | Supabase Auth — email + password, Google OAuth, identity linking |
| Frontend | Next.js 16, React 19, Tailwind CSS 4, Recharts, lucide-react |
| CLI | Commander.js, chalk, cli-table3 |
| Scoring | Heuristic engine (intent-aware, 10+ anti-patterns) + Claude Haiku for session analysis (async) |
| AI | @anthropic-ai/sdk |
| Tokens | tiktoken (cl100k_base) |
| Integration crypto | Node AES-256-GCM (app-held key) |

## Project Structure

```
packages/
  core/        — Scoring engine, pricing, transcript parser, types (pure)
  cli/         — CLI commands + Claude Code hook handlers
  dashboard/   — Next.js 16 web dashboard + API routes + Supabase migrations
  proxy/       — API proxy for non-Claude AI tools (planned)
  mcp-server/  — MCP server for IDE integration (planned)

docs/          — Current architecture, integrations, and deployment references
docs/history/  — Archived planning documents (snapshots, not current truth)
```

## Contributing

1. Fork the repo
2. Create a feature branch: `git checkout -b feat/my-feature`
3. Install dependencies: `pnpm install`
4. Build: `pnpm run build`
5. Run tests:
   - Core: `pnpm --filter evaluateai-core test` (88 tests)
   - Dashboard: `pnpm --filter evaluateai-dashboard exec vitest run` (59 tests)
6. Commit with a descriptive title
7. Open a pull request

## License

MIT
