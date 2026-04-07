# evaluateai-core

Core scoring engine, Supabase data layer, transcript parser, and analysis tools for [EvaluateAI](https://www.npmjs.com/package/evaluateai).

All data is stored in and read from **Supabase PostgreSQL**. There is no local SQLite database.

## Install

```bash
npm install evaluateai-core
```

## Usage

```typescript
import {
  scoreHeuristic,
  estimateTokens,
  calculateCost,
  recommendModel,
  initSupabase,
  createSession,
  createTurn,
  getStats,
} from 'evaluateai-core';

// Initialize Supabase connection
initSupabase(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);

// Score a prompt (intent-aware)
const result = scoreHeuristic("fix the bug");
console.log(result.score);        // 25
console.log(result.intent);       // "debug"
console.log(result.antiPatterns); // [{ id: "vague_verb", ... }]
console.log(result.quickTip);     // "Add: which file, what behavior, what error"

// Score a research prompt (won't be penalized for missing file paths)
const research = scoreHeuristic("how does JWT authentication work?");
console.log(research.score);   // 85
console.log(research.intent);  // "research"

// Estimate tokens
const tokens = estimateTokens("Hello world");
console.log(tokens); // 2

// Calculate cost
const cost = calculateCost(1000, 500, "claude-sonnet-4-6");
console.log(cost); // 0.0105

// Get model recommendation
const rec = recommendModel("What is a React hook?");
console.log(rec.model.name);  // "Claude Haiku 4.5"
console.log(rec.reason);      // "Simple question — Haiku is sufficient"

// Create a session in Supabase
await createSession({
  id: 'session-id',
  started_at: new Date().toISOString(),
  cwd: '/path/to/project',
});

// Create a turn in Supabase
await createTurn({
  id: 'turn-id',
  session_id: 'session-id',
  prompt_text: 'fix the bug in auth.ts',
  score: 65,
  intent: 'debug',
});

// Get developer stats from Supabase
const stats = await getStats({ period: 'day' });
```

## API

### Supabase Client

#### `initSupabase(url: string, anonKey: string): void`

Initializes the Supabase client. Must be called before any data operations.

#### `getSupabase(): SupabaseClient`

Returns the active Supabase client instance.

#### `checkSupabaseConnection(): Promise<boolean>`

Checks if the Supabase connection is working.

### Data Access (Supabase)

All data operations read from and write to Supabase PostgreSQL.

#### Sessions

- **`createSession(session): Promise<void>`** -- Insert a new session record.
- **`updateSession(id, updates): Promise<void>`** -- Update an existing session.
- **`getSession(id): Promise<Session | null>`** -- Fetch a session by ID.
- **`getSessions(options?): Promise<Session[]>`** -- List sessions with optional filters.

#### Turns

- **`createTurn(turn): Promise<void>`** -- Insert a new turn (prompt + score).
- **`updateTurn(id, updates): Promise<void>`** -- Update a turn record.
- **`getTurnsForSession(sessionId): Promise<Turn[]>`** -- Get all turns for a session.
- **`getTurnByHash(hash): Promise<Turn | null>`** -- Find a turn by prompt hash.

#### Tool Events

- **`createToolEvent(event): Promise<void>`** -- Log a tool use event.
- **`updateToolEvent(id, updates): Promise<void>`** -- Update a tool event.
- **`getToolEventsForSession(sessionId): Promise<ToolEvent[]>`** -- Get tool events for a session.

#### Timeline and Tracking

- **`addTimelineEvent(event): Promise<void>`** -- Add an event to the developer activity timeline.
- **`createScoringCall(call): Promise<void>`** -- Log a scoring call (heuristic or LLM).
- **`createApiCall(call): Promise<void>`** -- Log an external API call.

#### Statistics

- **`getStats(options?): Promise<Stats>`** -- Get aggregate stats (sessions, turns, tokens, cost, scores).
- **`getDeveloperStats(developerId, options?): Promise<DeveloperStats>`** -- Get stats for a specific developer.

### Scoring

#### `scoreHeuristic(text: string, promptHistory?: string[]): HeuristicResult`

Scores a prompt using intent-aware heuristic analysis. Classifies the prompt intent first, then applies intent-specific rules.

**Returns:**
```typescript
{
  score: number;           // 0-100
  intent: string;          // 'research' | 'debug' | 'feature' | ...
  antiPatterns: AntiPattern[];
  positiveSignals: string[];
  quickTip: string | null;
}
```

**Intent types and baselines:**

| Intent | Baseline | Triggered By |
|--------|----------|-------------|
| research | 75 | "how", "what", "explain", "?" |
| debug | 65 | "fix", "error", "bug", "broken" |
| feature | 70 | "add", "create", "implement" |
| refactor | 70 | "refactor", "optimize", "clean up" |
| review | 75 | "review", "check", "audit" |
| generate | 70 | "write tests", "scaffold" |
| config | 70 | "configure", "deploy", "set up" |

#### `scoreLLM(text: string): Promise<LLMResult>`

Scores a prompt using Claude Haiku. Requires `ANTHROPIC_API_KEY`.

#### `scoreLLMAndUpdate(turnId: string, text: string): Promise<void>`

Scores with LLM and updates the turn in Supabase.

#### `calculateEfficiency(session, turns): number`

Calculates session efficiency score (0-100) based on prompt quality and token usage patterns.

### Tokens and Pricing

#### `estimateTokens(text: string): number`

Estimates token count using tiktoken (cl100k_base encoding).

#### `calculateCost(inputTokens, outputTokens, modelId, cacheRead?, cacheWrite?): number`

Calculates exact cost in USD. Supports all Claude and GPT-4 models.

#### `recommendModel(promptText, provider?): { model, reason }`

Recommends the cheapest viable model for a prompt.

#### `getModelPricing(modelId): ModelPricing | null`

Returns pricing info for a model.

### Analysis

#### `analyzeSession(session, turns): Promise<SessionAnalysis | null>`

Analyzes a completed session using Claude Haiku (requires `ANTHROPIC_API_KEY`).

### Transcript Parser

#### `getLatestResponse(transcriptPath): TranscriptResponse | null`

Reads the latest AI response from a Claude Code transcript JSONL file. Returns exact token counts, model used, and response content.

#### `getSessionSummary(transcriptPath): TranscriptSummary | null`

Reads full session summary with exact token counts (input, output, cache read, cache write) from the transcript file.

### Types

All shared types are exported from the package:

```typescript
import type {
  TranscriptEntry,
  TranscriptUsage,
  TranscriptResponse,
  TranscriptSummary,
  Stats,
  DeveloperStats,
} from 'evaluateai-core';
```

## Environment Variables

```
SUPABASE_URL=https://your-project.supabase.co    # Required
SUPABASE_ANON_KEY=your-anon-key                   # Required
ANTHROPIC_API_KEY=sk-ant-...                       # For LLM scoring only
```

## Links

- **CLI tool**: https://www.npmjs.com/package/evaluateai
- **GitHub**: https://github.com/adityamakadiya/Evaluate-Ai

## License

MIT
