# Core Package — Development Rules

## What This Package Does

Pure, stateless shared library used by the CLI (and anyone else who consumes `evaluateai-core` from npm):

- Heuristic scoring engine (intent-aware, 10 anti-patterns, 4+ signals)
- LLM scorer (Claude Haiku)
- Token estimation (tiktoken)
- Model pricing (7 models)
- Efficiency calculator
- Session analyser (Claude Haiku)
- Transcript parser (reads Claude Code JSONL)

## Rules

### No persistence layer

Core does **not** talk to any database. It used to ship a Supabase client + data-access layer; that was removed in v3. Persistence is the caller's concern:

- The **CLI** posts events to the dashboard's `/api/cli/ingest` endpoint.
- The **dashboard** writes directly to Supabase from its own server-side client (`packages/dashboard/src/lib/supabase-server.ts`).

If you're tempted to add a `fetch()` call, a database client, or an env-var read inside a core function — don't. Export a pure function instead and let the caller compose it.

### Exports

- All public API goes through `src/index.ts`.
- Every new function/type must be exported from `index.ts`.
- Use named exports only (no default exports).

### Scoring

- Scorer lives in `src/scoring/heuristic.ts`.
- ALWAYS classify intent first, then apply intent-specific rules.
- Never penalise research prompts for missing file paths/errors.
- Baseline scores: research=75, debug=65, others=70.
- Anti-pattern points: high=-15, medium=-8 to -10, low=-3 to -5.
- Positive signal points: +5 to +10.
- Always clamp final score to 0–100.
- Return `intent` field in `HeuristicResult`.

### Analysis

- `scoreLLM` and `analyzeSession` are **pure functions**: they call Anthropic, return a result or `null`, and do not persist anything.
- On failure they return `null` — callers must handle that (hook handlers should never break).

### Testing

- Tests in `src/__tests__/`.
- Use vitest.
- No external API calls in tests (LLM scorer/analyser are not tested directly — would require mocking Anthropic).
- Test both happy path and edge cases.
- Currently 88 tests across 3 files — don't reduce this number.

### Types

- All shared types in `src/types.ts`.
- Use interfaces for objects, types for unions.

### Adding new features

1. Add types to `src/types.ts`.
2. Add implementation in the appropriate directory (`scoring/`, `tokens/`, `models/`, `analysis/`, `transcript/`).
3. Export from `src/index.ts`.
4. Add tests in `src/__tests__/`.
5. Run `pnpm --filter evaluateai-core test` before committing.
6. Run `pnpm --filter evaluateai-core build` to verify TypeScript compiles.

## Runtime dependencies

Only two at the time of writing:

- `@anthropic-ai/sdk` — Claude Haiku for LLM scoring and session analysis.
- `js-tiktoken` — pure-JS token counting (avoids native bindings).

Keep it lean. If a new dependency shows up, ask whether the caller could provide it instead.
