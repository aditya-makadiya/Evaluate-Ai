# CLI Package — Development Rules

## What This Package Does

The `evaluateai` npm package — a CLI tool that:
1. Installs Claude Code hooks to capture prompts/responses
2. Scores prompts with intent-aware heuristic engine
3. Shows suggestions for low-scoring prompts
4. Syncs data to Supabase for manager dashboard
5. Provides stats/sessions/config commands

## Binary

Entry point: `bin/evalai.js` (JavaScript, not TypeScript — runs directly via `#!/usr/bin/env node`)
- Loads .env from `~/.evaluateai-v2/.env` via dotenv
- Registers all Commander commands
- Routes `evalai hook <event>` to hook handlers

## Hook Handler Rules — CRITICAL

Hooks are called by Claude Code on every prompt/response. They MUST:

1. **NEVER crash** — wrap everything in try/catch → exit 0
2. **NEVER block** — complete sync work in < 50ms
3. **NEVER output to stdout** unless returning JSON to Claude Code
4. **Use stderr** for user-visible feedback (suggestions, tips)
5. **Exit 0 always** — exit code 2 blocks the prompt (we don't do this)
6. **Fire-and-forget** for async work (LLM scoring, Supabase sync)

### Hook Format in settings.json

Claude Code expects this exact structure:
```json
{
  "hooks": {
    "SessionStart": [{
      "hooks": [{
        "type": "command",
        "command": "evalai hook SessionStart",
        "timeout": 10000
      }]
    }]
  }
}
```

Three levels of nesting: `event → array → { hooks: [{ type, command }] }`

### Hook Event Payloads

Hooks receive JSON on stdin. Key fields:
- `session_id` — Claude Code session UUID
- `transcript_path` — path to session JSONL file (use for exact token data)
- `cwd` — working directory
- `prompt` — user's prompt text (UserPromptSubmit only)

### Transcript Parsing

The `transcript_path` field points to `~/.claude/projects/<slug>/<session-id>.jsonl`.
This file contains exact API response data:
- `usage.input_tokens`, `usage.output_tokens`
- `usage.cache_read_input_tokens`, `usage.cache_creation_input_tokens`
- Full response content (text + tool_use blocks)
- Model used per response

Always prefer transcript data over estimates.

### Database
- All data writes go directly to Supabase — no local SQLite
- Hooks write to Supabase on every event (session-start, prompt-submit, stop, session-end)
- Tool usage is computed from transcript at Stop/SessionEnd (no per-tool API calls)
- If Supabase is unreachable, log error but never crash (exit 0)
- Requires SUPABASE_URL and SUPABASE_ANON_KEY in ~/.evaluateai-v2/.env

## Commands

- `evalai setup` — One-command onboarding: authenticate (browser OAuth or `--token`) and install Claude Code hooks
  - Flags: `--token <token>`, `--api-url <url>`, `--force`, `--skip-hooks`
  - Implementation: `src/commands/setup.ts` — chains `runLogin()` + `runInit()`; both expose programmatic APIs for this reason
- `evalai login [--token <t>] [--api-url <u>] [--force]` — Authenticate only
- `evalai logout` — Clear stored credentials
- `evalai whoami` — Show the currently logged-in user + team
- `evalai init` — Install hooks, create data dir (does not authenticate)
- `evalai init --check` — Verify hooks + auth status
- `evalai init --uninstall` — Remove hooks
- `evalai init --team <id>` — Associate with a team (planned)
- `evalai stats [--week|--month|--compare]` — Usage stats (reads `/api/stats?period=today|week|month`)
- `evalai sessions [id]` — Browse/detail sessions
- `evalai config [set key value]` — Configuration
- `evalai export [--csv|--json]` — Export data

## Import Convention

- Import from `evaluateai-core` (npm package name, not workspace path)
- In workspace dev: `"evaluateai-core": "workspace:*"` in package.json
- For npm publish: change to `"evaluateai-core": "^1.1.0"` before `npm publish`

## Publishing

```bash
# 1. Bump version in both packages
# 2. Build
pnpm run build
# 3. Publish core first
cd packages/core && npm publish --access public
# 4. Update CLI dependency to npm version
cd packages/cli && sed -i '' 's/workspace:\*/^X.Y.Z/' package.json
npm publish --access public
# 5. Restore workspace reference
sed -i '' 's/"evaluateai-core": "\^X.Y.Z"/"evaluateai-core": "workspace:*"/' package.json
```
