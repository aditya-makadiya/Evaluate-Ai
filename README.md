# EvaluateAI

**Developer Productivity Intelligence Platform**

EvaluateAI connects the dots between meetings, tasks, code output, and AI usage to give engineering teams full visibility into how developers work with AI tools.

## Two Products, One Platform

### 1. CLI Tool (`evaluateai` on npm)

Hooks into Claude Code to automatically capture every AI interaction:

- Scores prompts in real-time with intent-aware heuristic engine
- Suggests improvements for low-quality prompts before they are sent
- Tracks sessions, tokens, costs, and tool usage
- Syncs all data to Supabase for team-wide visibility

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

```bash
cd packages/dashboard
pnpm install && pnpm dev
# Opens at http://localhost:3000
```

## Key Features

### Meeting-to-Code Tracking
Track how meeting decisions flow into assigned tasks and code output. See which discussions led to which commits.

### GitHub Integration
Connect repositories to see commit activity, pull requests, and code review patterns alongside AI usage data.

### AI Prompt and Response Capture
Every Claude Code interaction is captured automatically via hooks -- prompts, responses, token counts, costs, tool calls, and file changes.

### Developer Activity Timeline
A unified timeline showing meetings, tasks, AI sessions, commits, and code reviews for each developer.

### Daily Auto-Reports and Alerts
Automated daily summaries sent via Slack or email. Alerts for unusual patterns like cost spikes or declining prompt quality.

### Team Management
Managers create teams, developers link their CLI with `evalai init --team <id>`, and all data flows to the shared dashboard.

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                    Developer Machine                      │
│                                                          │
│   Claude Code ──hooks──> evalai CLI ──writes──> Supabase │
│                                                          │
└──────────────────────────────────────────────────────────┘
                                                    │
                                                    ▼
┌──────────────────────────────────────────────────────────┐
│                    Supabase Cloud                         │
│                                                          │
│   PostgreSQL: sessions, turns, tool_events, timeline     │
│   Auth: developer and manager accounts                   │
│   RLS: row-level security per team                       │
│                                                          │
└──────────────────────────────────────────────────────────┘
                                                    │
                                                    ▼
┌──────────────────────────────────────────────────────────┐
│                    Web Dashboard                          │
│                                                          │
│   Next.js 15 ──reads──> Supabase                         │
│                                                          │
│   Pages:                                                 │
│     Overview    — team stats, trends, alerts             │
│     Developers  — per-developer timelines                │
│     Sessions    — browse AI sessions, turn-by-turn       │
│     Analytics   — cost charts, score distribution        │
│     Reports     — daily/weekly auto-generated reports    │
│     Settings    — team config, notifications             │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

## Install

### CLI (for developers)

```bash
npm install -g evaluateai
```

### Dashboard (for managers)

```bash
git clone https://github.com/adityamakadiya/Evaluate-Ai.git
cd Evaluate-Ai
pnpm install
pnpm run build
```

### From Source (full monorepo)

```bash
git clone https://github.com/adityamakadiya/Evaluate-Ai.git
cd Evaluate-Ai
pnpm install
pnpm run build
cd packages/cli && npm link && cd ../..
```

## Setup Flow

### 1. Create a Supabase Project

Create a project at [supabase.com](https://supabase.com), then apply each migration in order from the Supabase SQL Editor:

```bash
packages/dashboard/supabase/migrations/000_initial_schema.sql
packages/dashboard/supabase/migrations/001_add_team_code.sql
packages/dashboard/supabase/migrations/002_add_cli_tokens.sql
# … through the latest 010_platform_roles.sql
```

Only the **dashboard** talks to Supabase. The CLI and `evaluateai-core` don't need Supabase credentials.

### 2. Configure Dashboard Environment

Copy `.env.example` to `packages/dashboard/.env` and fill in the values:

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
ANTHROPIC_API_KEY=sk-ant-...          # optional, for LLM scoring / analysis
GITHUB_OAUTH_CLIENT_ID=...             # optional, for GitHub integration
GITHUB_OAUTH_CLIENT_SECRET=...
```

The CLI does not read these — it authenticates against the dashboard with a CLI token (`eai_...`) generated by `evalai setup`.

### 3. Authenticate and Install Hooks

Use the one-command setup (recommended):

```bash
evalai setup                  # browser OAuth + hook install in one step
evalai setup --token <token>  # zero-browser install for CI/Docker/dashboard one-liner
evalai init --check           # verify hooks + auth status
```

Or run the steps manually if you prefer:

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

### 4. Link to a Team (Optional)

```bash
evalai init --team <team-id>
# or
evalai team link <team-id>
```

### 5. Start Using Claude Code

```bash
claude    # EvaluateAI captures everything automatically
```

### 6. View Results

```bash
evalai stats              # CLI stats
evalai stats --week       # weekly summary
evalai stats --compare    # compare vs previous period
evalai sessions           # browse sessions

# Or start the dashboard
cd packages/dashboard
pnpm dev                  # http://localhost:3000
```

## Screenshots

<!-- Overview Dashboard: team-wide stats, cost trends, score trends, active developer count -->
<!-- Developer Timeline: unified view of meetings, AI sessions, commits, and code reviews -->
<!-- Session Detail: turn-by-turn prompt scores with improvement suggestions -->
<!-- Analytics: cost charts, token usage breakdown, model distribution -->
<!-- Daily Report: auto-generated summary with key metrics and alerts -->

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 20+, TypeScript 5.x, ESM modules |
| Monorepo | pnpm workspaces + Turborepo |
| Database | Supabase PostgreSQL (no local SQLite) |
| Auth | Supabase Auth |
| Frontend | Next.js 15, Tailwind CSS 4, Recharts, lucide-react |
| CLI | Commander.js, chalk, cli-table3 |
| Scoring | Heuristic engine (10 anti-patterns, intent-aware) + Claude Haiku (async) |
| AI | @anthropic-ai/sdk (session analysis) |
| Tokens | tiktoken (cl100k_base) |
| Notifications | Slack API, Resend (email) |

## Project Structure

```
packages/
  core/        — Scoring engine, Supabase data layer, transcript parser, types
  cli/         — CLI commands + Claude Code hook handlers
  dashboard/   — Next.js 15 web dashboard (manager-facing)
  proxy/       — API proxy for non-Claude AI tools (planned)
  mcp-server/  — MCP server for IDE integration (planned)
```

## Contributing

1. Fork the repo
2. Create a feature branch: `git checkout -b feat/my-feature`
3. Install dependencies: `pnpm install`
4. Build: `pnpm run build`
5. Run tests: `pnpm --filter evaluateai-core test`
6. Commit with conventional format: `feat: add new feature`
7. Open a pull request

## License

MIT
