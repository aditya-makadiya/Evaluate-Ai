# EvaluateAI CLI

> Developer productivity intelligence for Claude Code. Scores prompts, tracks usage, and syncs to your team dashboard -- all automatically.

EvaluateAI hooks into Claude Code to **score every prompt**, **track costs and tokens**, **suggest improvements**, and **sync data to Supabase** for team-wide visibility.

## Install

```bash
npm install -g evaluateai
```

## Quick Start

```bash
# 1. One-command setup — authenticates and installs Claude Code hooks
evalai setup

# 2. Use Claude Code normally -- EvaluateAI runs automatically
claude

# 3. Check your stats
evalai stats
```

`evalai setup` opens a browser to log in, then installs hooks. For CI/CD or
zero-browser installs, pass a token from your dashboard:

```bash
evalai setup --token <token>
```

Prefer manual steps? See [Commands → Setup](#setup) for `evalai login` +
`evalai init` separately.

After setup, every Claude Code session is tracked automatically. Data flows directly to Supabase.

## What It Does

When you type a prompt in Claude Code:

```
You: "fix the bug"

  [EvaluateAI] Score: 25/100
  Tip: Add: which file, what specific behavior, what error
```

Good prompts pass silently. Low-scoring prompts get a quick tip on stderr.

After your session, check results:

```bash
evalai stats

  Today Stats
  ──────────────────────────────────────────────────
  Sessions:    6          Cost:     $0.84
  Turns:       23         Tokens:   89,400
  Avg Score:   71/100     Efficiency: 68/100

  Top Anti-Patterns
    vague_verb                3x
    no_file_ref               2x

  Tip: Adding file paths to prompts would save ~1,200 tokens today.
```

## How It Works

EvaluateAI uses Claude Code's native **hook system**. After `evalai init`, hooks are registered in `~/.claude/settings.json`. Claude Code calls them automatically on every event:

```
SessionStart      -> POST session_start    to /api/cli/ingest
UserPromptSubmit  -> Score prompt, show suggestion if low, POST prompt_submit
Stop              -> POST session_update   with tokens/cost/tool counts from transcript
SessionEnd        -> POST session_end      with final tool usage summary
```

All events go to the dashboard's `/api/cli/ingest` endpoint over HTTPS, authenticated with a CLI token (`eai_...`). Failed events are queued locally in `~/.evaluateai-v2/queue.jsonl` and replayed on the next hook fire — so brief network outages never lose data.

**Zero overhead.** Hooks run in <50ms. Your Claude Code workflow is unchanged. The CLI doesn't talk to any database itself — it's a thin client for the dashboard API.

## Scoring Guide

Prompts are classified by **intent** and scored with tailored rules:

| Intent | Baseline | Example |
|--------|----------|---------|
| Research | 75 | "how does JWT auth work?" -> **85** |
| Debug | 65 | "Fix null ref in src/auth.ts:47" -> **75** |
| Feature | 70 | "Add pagination to /api/users" -> **80** |
| Refactor | 70 | "Refactor src/auth -- reduce duplication" -> **90** |
| Review | 75 | "Review src/payments.ts for security" -> **95** |
| Generate | 70 | "Write tests for src/utils.ts" -> **80** |
| Config | 70 | "Set up ESLint with Airbnb rules" -> **75** |

**7 intent types**: research, debug, feature, refactor, review, generate, config. Each has its own baseline and relevant rules.

**What makes a good prompt:**
- Include file paths: `src/auth/login.ts`
- Paste exact errors in backticks
- State expected behavior
- Add constraints: "don't change the API contract"

**What lowers your score:**
- Vague: "fix the bug" (-15 pts)
- Too short: "help" (-15 pts)
- Paraphrased errors: "the error says something about null" (-15 pts)
- Retrying same prompt (-15 pts)

## Commands

### Setup

```bash
# One-liner: authenticate + install hooks (recommended)
evalai setup                       # Browser OAuth flow
evalai setup --token <token>       # Use a token (CI/CD, Docker, or dashboard one-liner)
evalai setup --api-url <url>       # Override API URL (self-hosted dashboard)
evalai setup --force               # Re-authenticate even if already logged in
evalai setup --skip-hooks          # Only authenticate, don't install hooks yet

# Or run the steps manually
evalai login                       # Authenticate with your team
evalai logout                      # Clear stored credentials
evalai whoami                      # Show the currently logged-in user

evalai init                        # Install hooks into Claude Code
evalai init --check                # Verify hooks + auth status
evalai init --uninstall            # Remove hooks
evalai init --team <id>            # Link to a team for manager dashboard
```

### Team

```bash
evalai team                  # Show current team info
evalai team members          # List team members
evalai team link <team-id>   # Link this CLI to a team
```

### Stats

```bash
evalai stats                 # Today's summary
evalai stats --week          # This week
evalai stats --month         # This month
evalai stats --compare       # Compare vs previous period
```

### Sessions

```bash
evalai sessions              # List recent sessions
evalai sessions <id>         # Detailed session view
```

### Dashboard

```bash
evalai dashboard             # Open local web dashboard at http://localhost:3456
```

### Configuration

```bash
evalai config                # Show current settings
evalai config set scoring heuristic   # Scoring mode: heuristic | llm
evalai config set threshold 60        # Suggestion threshold (0-100)
```

### Data

```bash
evalai export --csv          # Export sessions to CSV
evalai export --json         # Export as JSON
```

## Team Features

When linked to a team, EvaluateAI posts your session data to your team's dashboard. Managers see:

- Developer activity timelines
- Prompt quality trends across the team
- Cost and token usage per developer
- Daily auto-generated reports and alerts

To link your CLI to a team:

```bash
evalai init --team <team-id>
# or
evalai team link <team-id>
```

Your data is POSTed to the dashboard's `/api/cli/ingest` endpoint, which writes to the team's database with your CLI token as the auth credential.

## Privacy

Data is stored in your team's dashboard database (Supabase on the server side). The CLI keeps nothing persistent locally apart from an offline retry queue.

| Setting | What's Stored |
|---------|--------------|
| `default` | Full prompt text |
| `hash` | Only SHA256 hashes (no readable text) |
| `off` | Only scores and metadata (no prompts) |

Configure with `evalai config set privacy <mode>`.

## Environment Setup

The CLI stores its auth token + dashboard URL in `~/.evaluateai-v2/credentials.json`. That file is created automatically by `evalai setup` / `evalai login` — no manual editing needed, no Supabase keys required.

If you want to override the dashboard URL (e.g. self-hosted):

```bash
evalai setup --api-url https://dashboard.your-company.com
# or once-off for a single command:
EVALUATEAI_API_URL=https://dashboard.your-company.com evalai stats
```

These are required for EvaluateAI to function. All data is stored in Supabase.

## Requirements

- Node.js 20+
- Claude Code CLI installed
- An EvaluateAI dashboard to post events to (self-hosted or team-hosted)
- Anthropic API key (only if using LLM scoring mode)

## Links

- **GitHub**: https://github.com/adityamakadiya/Evaluate-Ai
- **npm**: https://www.npmjs.com/package/evaluateai
- **Core package**: https://www.npmjs.com/package/evaluateai-core

## License

MIT
