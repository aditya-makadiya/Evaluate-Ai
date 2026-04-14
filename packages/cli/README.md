# EvaluateAI CLI

> Developer productivity intelligence for Claude Code. Scores prompts, tracks usage, and syncs to your team dashboard -- all automatically.

EvaluateAI hooks into Claude Code to **score every prompt**, **track costs and tokens**, **suggest improvements**, and **sync data to Supabase** for team-wide visibility.

## Install

```bash
npm install -g evaluateai
```

## Quick Start

```bash
# 1. Install hooks into Claude Code
evalai init

# 2. (Optional) Link to your team
evalai init --team <team-id>

# 3. Use Claude Code normally -- EvaluateAI runs automatically
claude

# 4. Check your stats
evalai stats
```

After `evalai init`, every Claude Code session is tracked automatically. Data flows directly to Supabase.

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
SessionStart      -> Create session in Supabase
UserPromptSubmit  -> Score prompt, show suggestion if low, write turn to Supabase
Stop              -> Update tokens/cost/tool counts from transcript
SessionEnd        -> Finalize session with tool usage summary from transcript
```

All data goes directly to Supabase. There is no local SQLite database.

**Zero overhead.** Hooks run in <50ms. Your Claude Code workflow is unchanged.

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
evalai init                  # Install hooks into Claude Code
evalai init --check          # Verify hooks are installed
evalai init --uninstall      # Remove hooks
evalai init --team <id>      # Link to a team for manager dashboard
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

When linked to a team, EvaluateAI sends your session data to the team's Supabase project. This powers the **manager dashboard** where leads can see:

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

Your data flows to the team's Supabase instance. The manager dashboard reads from the same database to show team-wide analytics.

## Privacy

All data is stored in Supabase (your team's cloud database). There is no local SQLite storage.

| Setting | What's Stored |
|---------|--------------|
| `default` | Full prompt text in Supabase |
| `hash` | Only SHA256 hashes (no readable text) |
| `off` | Only scores and metadata (no prompts) |

Configure with `evalai config set privacy <mode>`.

## Environment Setup

Add credentials to `~/.evaluateai-v2/.env`:

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
```

These are required for EvaluateAI to function. All data is stored in Supabase.

## Requirements

- Node.js 18+
- Claude Code CLI installed
- Supabase project with EvaluateAI schema applied
- Anthropic API key (only if using LLM scoring mode)

## Links

- **GitHub**: https://github.com/adityamakadiya/Evaluate-Ai
- **npm**: https://www.npmjs.com/package/evaluateai
- **Core package**: https://www.npmjs.com/package/evaluateai-core

## License

MIT
