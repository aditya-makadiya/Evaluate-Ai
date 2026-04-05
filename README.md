# EvaluateAI v2

AI-powered developer intelligence platform that hooks into Claude Code natively to track, score, and optimize how developers use AI.

## What It Does

- **Tracks** every AI session — turns, tokens, cost, tool calls
- **Scores** every prompt in real-time (heuristic + LLM)
- **Suggests** improvements for weak prompts
- **Analyzes** full sessions post-completion
- **Displays** insights in a local dashboard

## How It Works

EvaluateAI uses [Claude Code hooks](https://docs.anthropic.com/en/docs/claude-code) — native event handlers that fire during your normal workflow. No proxy, no wrapper, no daemon.

```
Claude Code (unmodified)
    │
    ├── SessionStart      → evalai: create session record
    ├── UserPromptSubmit  → evalai: score prompt, show suggestion
    ├── PreToolUse        → evalai: log tool usage
    ├── PostToolUse       → evalai: capture result
    ├── Stop              → evalai: record response metadata
    └── SessionEnd        → evalai: finalize + analyze
```

## Quick Start

```bash
npm install -g @evaluateai/cli
evalai init          # installs hooks into Claude Code
# Use Claude Code normally — everything is tracked automatically
evalai stats         # see your usage
evalai dashboard     # open local web dashboard
```

## Architecture

See [IMPLEMENTATION-PLAN.md](./IMPLEMENTATION-PLAN.md) for the full technical design.

## License

MIT
