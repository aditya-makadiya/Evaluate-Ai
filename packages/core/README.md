# evaluateai-core

Shared scoring engine, token estimation, model pricing, session analysis, and Claude Code transcript parsing for [EvaluateAI](https://www.npmjs.com/package/evaluateai).

**Pure library**: no database, no network persistence, no environment state. Callers own persistence.

## Install

```bash
npm install evaluateai-core
```

## Usage

```typescript
import {
  scoreHeuristic,
  scoreLLM,
  estimateTokens,
  calculateCost,
  recommendModel,
  analyzeSession,
  getSessionSummary,
} from 'evaluateai-core';

// Intent-aware heuristic scoring
const result = scoreHeuristic('fix the bug');
console.log(result.score);        // 25
console.log(result.intent);       // 'debug'
console.log(result.antiPatterns); // [{ id: 'vague_verb', ... }]
console.log(result.quickTip);     // 'Add: which file, what behavior, what error'

// Research prompts aren't penalised for missing file paths
const research = scoreHeuristic('how does JWT authentication work?');
console.log(research.score);   // 85
console.log(research.intent);  // 'research'

// LLM-based scoring (requires ANTHROPIC_API_KEY)
const llm = await scoreLLM('add retry on 429 errors in src/api/client.ts');
// → { specificity, context, clarity, actionability, total, suggestion, ... }

// Token & cost estimation
estimateTokens('Hello world');                           // 2
calculateCost(1000, 500, 'claude-sonnet-4-6');           // 0.0105
recommendModel('What is a React hook?').model.name;      // 'Claude Haiku 4.5'

// Transcript parsing (Claude Code JSONL)
const summary = getSessionSummary('/path/to/session.jsonl');
// → exact input/output/cache tokens, model used, per-response data
```

## API

### Scoring

#### `scoreHeuristic(text: string, promptHistory?: string[]): HeuristicResult`

Classifies prompt intent, then applies intent-specific rules.

```typescript
{
  score: number;           // 0–100
  intent: string;          // 'research' | 'debug' | 'feature' | ...
  antiPatterns: AntiPattern[];
  positiveSignals: string[];
  quickTip: string | null;
}
```

| Intent | Baseline | Triggered by |
|--------|----------|--------------|
| research | 75 | `how`, `what`, `explain`, `?` |
| debug | 65 | `fix`, `error`, `bug`, `broken` |
| feature | 70 | `add`, `create`, `implement` |
| refactor | 70 | `refactor`, `optimize`, `clean up` |
| review | 75 | `review`, `check`, `audit` |
| generate | 70 | `write tests`, `scaffold` |
| config | 70 | `configure`, `deploy`, `set up` |

#### `scoreLLM(text, context?): Promise<LLMScoreBreakdown | null>`

Scores a prompt using Claude Haiku on 4 dimensions (specificity, context, clarity, actionability). Requires `ANTHROPIC_API_KEY`. Returns `null` on failure — callers decide whether to retry or fall back to heuristic scoring. No caching or persistence side effects; the caller owns both.

#### `calculateEfficiency(session, turns): number`

0–100 session efficiency score derived from prompt quality and token-use patterns.

### Tokens & pricing

- **`estimateTokens(text)`** — tiktoken-backed estimate (cl100k_base).
- **`calculateCost(inputTokens, outputTokens, modelId, cacheRead?, cacheWrite?)`** — exact USD cost; supports all Claude + GPT-4 models.
- **`recommendModel(text, provider?)`** — cheapest viable model for the prompt.
- **`getModelPricing(modelId)`** — raw pricing info.
- **`normalizeModelId(id)`** — strip suffixes like `[1m]` before pricing lookup.

### Analysis

#### `analyzeSession(session, turns): Promise<SessionAnalysis | null>`

LLM-driven efficiency analysis (Claude Haiku). Returns the analysis; the caller decides whether to persist. Requires `ANTHROPIC_API_KEY`.

### Transcript parser

- **`getLatestResponse(path)`** — last AI response in a Claude Code `.jsonl` transcript.
- **`getSessionSummary(path)`** — exact totals (input/output/cache tokens), model, responses.
- **`getPerTurnSummary(path)`** — per-turn response data keyed by prompt hash.

### Types

All shared types (`Session`, `Turn`, `ToolEvent`, `HeuristicResult`, `LLMScoreBreakdown`, `SessionAnalysis`, `ModelPricing`, `TranscriptSummary`, etc.) are exported from the package root:

```typescript
import type {
  Session, Turn, ToolEvent,
  HeuristicResult, LLMScoreBreakdown, SessionAnalysis,
  TranscriptSummary, ModelPricing,
} from 'evaluateai-core';
```

## Environment variables

| Variable | Required for | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | `scoreLLM`, `analyzeSession` | Claude Haiku access |

No Supabase variables. Persistence is the caller's responsibility — see the dashboard package for how the platform persists scored/analysed data.

## Links

- CLI tool: <https://www.npmjs.com/package/evaluateai>
- GitHub: <https://github.com/adityamakadiya/Evaluate-Ai>

## License

MIT
