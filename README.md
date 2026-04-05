# EvaluateAI v2

AI-powered developer intelligence platform that hooks into Claude Code to track, score, and optimize how developers use AI.

## What It Does

- **Scores** every prompt in real-time (0ms heuristic + async LLM)
- **Suggests** improvements for weak prompts before they're sent
- **Tracks** sessions, tokens, cost, tool calls automatically
- **Analyzes** full sessions post-completion with AI
- **Displays** insights in a local web dashboard
- **Syncs** to Supabase for cloud storage

## How It Works

EvaluateAI uses Claude Code's native hook system. After setup, it runs automatically — you change nothing about your workflow.

```
You type a prompt in Claude Code
    → EvaluateAI scores it instantly
    → Shows tip if score is low
    → Saves everything to local DB
    → You see stats in CLI or dashboard
```

## Install

```bash
git clone https://github.com/adityamakadiya/Evaluate-Ai.git
cd Evaluate-Ai
pnpm install
pnpm run build
cd packages/cli && npm link && cd ../..
```

Or one command:

```bash
git clone https://github.com/adityamakadiya/Evaluate-Ai.git
cd Evaluate-Ai && pnpm run setup
```

## Setup

```bash
# Install hooks into Claude Code
evalai init

# Verify hooks are installed
evalai init --check
```

That's it. Now use Claude Code normally — EvaluateAI captures everything automatically.

## Usage

```bash
# View your stats
evalai stats              # today
evalai stats --week       # this week
evalai stats --compare    # vs previous period

# Browse sessions
evalai sessions           # list all
evalai sessions <id>      # detail view

# Open web dashboard
evalai dashboard          # http://localhost:3456

# Configuration
evalai config             # show settings
evalai config set threshold 60   # adjust suggestion threshold

# Cloud sync (optional)
evalai sync               # push to Supabase
```

## Dashboard

Start the dashboard:

```bash
cd Evaluate-Ai
pnpm --filter @evaluateai/dashboard dev
# Opens at http://localhost:3456
```

Pages:
- **Overview** — stat cards, cost/score trends, anti-patterns, model usage
- **Sessions** — browse all sessions, click for turn-by-turn detail
- **Analytics** — cost charts, score distribution, efficiency trends
- **Settings** — privacy, scoring mode, suggestion threshold

## Supabase Cloud Sync (Optional)

1. Create a Supabase project at https://supabase.com
2. Run the SQL schema: `packages/core/src/db/supabase-schema.sql`
3. Run the RLS fix: `packages/core/src/db/fix-rls.sql`
4. Add credentials to `~/.evaluateai-v2/.env`:

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
```

5. Sync: `evalai sync`

## Scoring Guide

| Score | Meaning |
|-------|---------|
| 80-100 | Excellent — file paths, error messages, constraints |
| 60-79 | Good — minor improvements possible |
| 40-59 | Needs work — missing context |
| 0-39 | Poor — vague, too short, or retry |

**How to improve:**
- Include file paths: `src/auth/login.ts`
- Paste exact errors in backticks
- State expected behavior
- Add constraints: "don't change the API"
- Avoid: "fix it", "help", "make it work"

## Tech Stack

- **Core**: TypeScript, SQLite (better-sqlite3), Drizzle ORM
- **CLI**: Commander.js, chalk
- **Scoring**: Heuristic (10 patterns) + Claude Haiku (async)
- **Dashboard**: Next.js 15, Tailwind CSS, Recharts
- **Cloud**: Supabase (PostgreSQL)

## Project Structure

```
packages/
  core/        — DB, scoring engine, token estimation, analysis
  cli/         — CLI commands + Claude Code hook handlers
  dashboard/   — Next.js web dashboard
  proxy/       — API proxy for non-Claude tools (planned)
  mcp-server/  — MCP server for IDE integration (planned)
```

## License

MIT
