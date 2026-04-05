# EvaluateAI v2 — Implementation Plan

> AI-powered developer intelligence platform that hooks into Claude Code natively to track, score, and optimize how developers use AI.

**Created:** 2026-04-05
**Target:** Solo developers + small teams
**Stack:** TypeScript monorepo (pnpm + Turborepo)

---

## Table of Contents

1. [Problem Statement](#1-problem-statement)
2. [Architecture Overview](#2-architecture-overview)
3. [Integration Strategy](#3-integration-strategy)
4. [Data Model](#4-data-model)
5. [Scoring System](#5-scoring-system)
6. [Session Analysis Engine](#6-session-analysis-engine)
7. [CLI Design](#7-cli-design)
8. [Dashboard Design](#8-dashboard-design)
9. [Project Structure](#9-project-structure)
10. [Tech Stack](#10-tech-stack)
11. [Phase-by-Phase Execution](#11-phase-by-phase-execution)
12. [Business Model](#12-business-model)
13. [Risks & Mitigations](#13-risks--mitigations)
14. [Post-Launch Roadmap](#14-post-launch-roadmap)

---

## 1. Problem Statement

### Real Pain Points

| Problem | Current State | Our Solution |
|---------|---------------|--------------|
| **Invisible spending** | API dashboards show aggregate totals, not per-session or per-task cost | Per-session cost tracking with project attribution |
| **No feedback loop** | A developer who writes "fix the bug" 50 times never learns why it fails | Real-time prompt scoring + concrete suggestions |
| **Wrong model selection** | Developers use Opus for "what is X?" questions that Haiku handles | Model recommendations per task complexity |
| **Context window waste** | Developers hit context limits, conversations get compacted, work is lost | Context pressure tracking + warnings |
| **No ROI data** | Engineering managers approve $5K/month for AI tools but can't measure outcomes | Efficiency scores, trends, ROI dashboard |
| **Team knowledge silos** | Alice discovers great prompting patterns. Bob never learns them. | Shared templates + team analytics (v0.2) |

### Why Existing Tools Fail

| Tool | What It Shows | What's Missing |
|------|---------------|----------------|
| Anthropic Console | API usage, rate limits | No developer-level analytics, no prompt feedback |
| OpenAI Dashboard | Total tokens, cost per day | No per-session breakdown, no optimization |
| LangSmith/LangFuse | LLM app observability | Designed for production apps, not developer CLI workflows |
| Helicone | Request logging, cost | No intelligence layer, no prompt optimization |

### Key Differentiator

We're the **only tool that sits inside the developer's actual workflow** (via native Claude Code hooks) and provides **real-time, actionable feedback** — not just logging.

---

## 2. Architecture Overview

```
┌──────────────────────────────────────────────────────────────┐
│                    DEVELOPER MACHINE                          │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  Claude Code CLI (unmodified)                          │  │
│  │                                                        │  │
│  │  settings.json hooks (installed by `evalai init`):     │  │
│  │                                                        │  │
│  │  SessionStart      → evalai hook session-start         │  │
│  │  UserPromptSubmit  → evalai hook prompt-submit         │  │
│  │  PreToolUse        → evalai hook pre-tool              │  │
│  │  PostToolUse       → evalai hook post-tool             │  │
│  │  Stop              → evalai hook stop                  │  │
│  │  SessionEnd        → evalai hook session-end           │  │
│  └───────────────┬────────────────────────────────────────┘  │
│                  │ JSON events via stdin                      │
│                  ▼                                            │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  evalai CLI                                            │  │
│  │                                                        │  │
│  │  ┌──────────────┐  ┌───────────────┐  ┌────────────┐  │  │
│  │  │ Hook         │  │ Heuristic     │  │ LLM Scorer │  │  │
│  │  │ Handlers     │→ │ Scorer        │→ │ (Haiku,    │  │  │
│  │  │ (6 events)   │  │ (10 anti-     │  │  debounced)│  │  │
│  │  │              │  │  patterns)    │  │            │  │  │
│  │  └──────────────┘  └───────────────┘  └────────────┘  │  │
│  │         │                                     │        │  │
│  │         ▼                                     ▼        │  │
│  │  ┌─────────────────────────────────────────────────┐   │  │
│  │  │  SQLite (~/.evaluateai-v2/db.sqlite)            │   │  │
│  │  │  sessions | turns | scores | analysis           │   │  │
│  │  └──────────────────────┬──────────────────────────┘   │  │
│  │                         │                              │  │
│  │  ┌──────────────────────▼──────────────────────────┐   │  │
│  │  │  Local Dashboard (:3456)                        │   │  │
│  │  │  Next.js — reads SQLite directly via API route  │   │  │
│  │  │  Overview | Sessions | Analytics | Settings     │   │  │
│  │  └─────────────────────────────────────────────────┘   │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

### Key Design Decisions

| Decision | Choice | Reasoning |
|----------|--------|-----------|
| **Integration** | Claude Code hooks (native) | Zero overhead, no proxy/daemon/wrapper needed |
| **No daemon** | Hook handlers are fast CLI commands | Each hook invocation: read stdin → write SQLite → exit. No long-running process. |
| **Suggestions only** | Don't block prompts | Non-intrusive, builds developer trust. Show tip, let them decide. |
| **Local-first** | SQLite on disk, dashboard reads directly | No cloud dependency, works offline, privacy by default |
| **LLM scoring** | Claude Haiku for quality scoring | Real intelligence, not just regex. ~$0.0003 per call. |

### Why Hooks Over Proxy/PTY/Wrapper

| Approach | Overhead | Setup | Reliability | Data Quality |
|----------|----------|-------|-------------|--------------|
| **Hooks (chosen)** | 0ms added to CLI | `evalai init` | Native, maintained by Anthropic | Structured JSON events |
| Proxy | 5ms per request | Env var + daemon | Port conflicts, cert issues | Raw HTTP |
| PTY wrapper | 1-2ms keystroke lag | Shell alias | Terminal escape code parsing | Unstructured text |
| Shell hooks | 0ms | .zshrc edit | Only captures command-level | No streaming data |

---

## 3. Integration Strategy

### Primary: Claude Code Hooks

Claude Code supports 20+ hook events. We use 6:

```jsonc
// Installed into user's Claude Code settings.json by `evalai init`
{
  "hooks": {
    "SessionStart": [{
      "type": "command",
      "command": "evalai hook session-start"
      // Receives: { session_id, cwd, model, timestamp }
      // Action: Create session record in SQLite
    }],
    "UserPromptSubmit": [{
      "type": "command",
      "command": "evalai hook prompt-submit"
      // Receives: { session_id, prompt, timestamp, cwd, model }
      // Action: Score prompt, write turn record, print suggestion to stderr
      // Exit 0 = allow prompt through (always — we don't block)
    }],
    "PreToolUse": [{
      "type": "command",
      "command": "evalai hook pre-tool",
      "matcher": { "toolName": ".*" }
      // Receives: { session_id, tool_name, tool_args }
      // Action: Log tool usage
    }],
    "PostToolUse": [{
      "type": "command",
      "command": "evalai hook post-tool",
      "matcher": { "toolName": ".*" }
      // Receives: { session_id, tool_name, success, output_size }
      // Action: Update turn with tool result metadata
    }],
    "Stop": [{
      "type": "command",
      "command": "evalai hook stop"
      // Receives: { session_id, response_summary, tokens_used }
      // Action: Update turn with response data
    }],
    "SessionEnd": [{
      "type": "command",
      "command": "evalai hook session-end"
      // Receives: { session_id, timestamp }
      // Action: Finalize session aggregates, trigger async analysis
    }]
  }
}
```

### Hook Handler Flow (per event)

```
Claude Code fires event
        │
        ▼
evalai hook <event-name>    (~10-50ms total)
        │
        ├─ Read JSON from stdin
        ├─ Open SQLite connection
        ├─ Write event data
        ├─ If prompt-submit:
        │   ├─ Run heuristic scorer (0ms)
        │   ├─ Queue LLM scoring (async, fire-and-forget)
        │   └─ Print suggestion to stderr if score < threshold
        ├─ If session-end:
        │   ├─ Calculate session aggregates
        │   └─ Spawn background analysis (detached process)
        └─ Exit 0 (allow)
```

### Future: Multi-Tool Support (v0.2)

| Tool | Integration Method |
|------|-------------------|
| Claude Code | Hooks (native) ← **MVP** |
| Codex CLI | API proxy (OPENAI_BASE_URL) |
| Aider | API proxy (OPENAI_BASE_URL) |
| Cursor | Log file watching |
| VS Code Copilot | VS Code extension |

---

## 4. Data Model

### SQLite Schema

```sql
-- Location: ~/.evaluateai-v2/db.sqlite

-- ============================================================
-- SESSIONS: One row per Claude Code conversation
-- ============================================================
CREATE TABLE sessions (
  id                  TEXT PRIMARY KEY,     -- Claude Code session_id
  project_dir         TEXT,                 -- working directory
  git_repo            TEXT,                 -- remote origin URL
  git_branch          TEXT,                 -- current branch
  model               TEXT,                 -- model used (claude-sonnet-4-6, etc.)
  started_at          TEXT NOT NULL,        -- ISO 8601
  ended_at            TEXT,                 -- ISO 8601, null if still active

  -- Aggregates (updated incrementally by hooks, finalized on session-end)
  total_turns         INTEGER DEFAULT 0,
  total_input_tokens  INTEGER DEFAULT 0,    -- estimated
  total_output_tokens INTEGER DEFAULT 0,    -- estimated
  total_cost_usd      REAL DEFAULT 0,       -- estimated from model pricing
  total_tool_calls    INTEGER DEFAULT 0,
  files_changed       INTEGER DEFAULT 0,

  -- Scores (calculated on session-end)
  avg_prompt_score    REAL,                 -- average of turn heuristic_scores
  efficiency_score    REAL,                 -- 0-100 composite
  token_waste_ratio   REAL,                 -- wasted / total tokens
  context_peak_pct    REAL,                 -- max context window usage

  -- LLM Analysis (filled async after session-end)
  analysis            TEXT,                 -- JSON blob from Haiku analysis
  analyzed_at         TEXT                  -- when analysis completed
);

-- ============================================================
-- TURNS: One row per user prompt within a session
-- ============================================================
CREATE TABLE turns (
  id                  TEXT PRIMARY KEY,     -- ULID (time-sortable)
  session_id          TEXT NOT NULL REFERENCES sessions(id),
  turn_number         INTEGER NOT NULL,     -- 1-indexed within session

  -- User prompt data
  prompt_text         TEXT,                 -- nullable (privacy: "off" mode)
  prompt_hash         TEXT NOT NULL,        -- SHA256 for dedup detection
  prompt_tokens_est   INTEGER,             -- tiktoken estimate

  -- Heuristic scoring (instant, always available)
  heuristic_score     REAL,                -- 0-100
  anti_patterns       TEXT,                -- JSON: ["vague_verb", "no_file_ref"]

  -- LLM scoring (async, may be null initially)
  llm_score           REAL,                -- 0-100
  score_breakdown     TEXT,                -- JSON: {specificity, context, clarity, actionability}

  -- Suggestion tracking
  suggestion_text     TEXT,                -- what we suggested (null if score was high)
  suggestion_accepted BOOLEAN,             -- null if no suggestion shown
  tokens_saved_est    INTEGER,             -- estimated tokens saved by suggestion

  -- AI response metadata (filled by Stop hook)
  response_tokens_est INTEGER,
  tool_calls          TEXT,                -- JSON: [{name: "Edit", success: true}, ...]
  latency_ms          INTEGER,

  -- Derived flags
  was_retry           BOOLEAN DEFAULT FALSE, -- prompt_hash matches earlier turn
  context_used_pct    REAL,                  -- estimated % of context window used

  created_at          TEXT NOT NULL         -- ISO 8601
);

-- ============================================================
-- TOOL_EVENTS: Individual tool calls within a turn
-- ============================================================
CREATE TABLE tool_events (
  id                  TEXT PRIMARY KEY,
  session_id          TEXT NOT NULL REFERENCES sessions(id),
  turn_id             TEXT REFERENCES turns(id),
  tool_name           TEXT NOT NULL,        -- "Edit", "Bash", "Read", etc.
  tool_input_summary  TEXT,                 -- first 200 chars of args
  success             BOOLEAN,
  execution_ms        INTEGER,
  created_at          TEXT NOT NULL
);

-- ============================================================
-- SCORING_CALLS: Track cost of our own LLM scoring
-- ============================================================
CREATE TABLE scoring_calls (
  id                  TEXT PRIMARY KEY,
  turn_id             TEXT REFERENCES turns(id),
  model               TEXT NOT NULL,        -- 'claude-haiku-4-5-20251001'
  input_tokens        INTEGER,
  output_tokens       INTEGER,
  cost_usd            REAL,
  response_json       TEXT,                 -- raw scorer response
  created_at          TEXT NOT NULL
);

-- ============================================================
-- CONFIG: User preferences
-- ============================================================
CREATE TABLE config (
  key                 TEXT PRIMARY KEY,
  value               TEXT NOT NULL,
  updated_at          TEXT NOT NULL
);
-- Default config entries:
-- privacy_mode: "local"          (off | local | hash)
-- scoring_mode: "llm"            (heuristic | llm)
-- suggestion_threshold: "50"      (show suggestions below this score)
-- dashboard_port: "3456"

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX idx_sessions_started ON sessions(started_at);
CREATE INDEX idx_sessions_project ON sessions(project_dir);
CREATE INDEX idx_turns_session ON turns(session_id, turn_number);
CREATE INDEX idx_turns_hash ON turns(prompt_hash);
CREATE INDEX idx_turns_created ON turns(created_at);
CREATE INDEX idx_tool_events_session ON tool_events(session_id);
CREATE INDEX idx_tool_events_turn ON tool_events(turn_id);
```

### Data Flow Per Hook

```
SessionStart:
  → INSERT INTO sessions (id, project_dir, git_repo, git_branch, model, started_at)

UserPromptSubmit:
  → INSERT INTO turns (id, session_id, turn_number, prompt_text, prompt_hash,
                        prompt_tokens_est, heuristic_score, anti_patterns, created_at)
  → UPDATE sessions SET total_turns = total_turns + 1
  → Check prompt_hash against prior turns → set was_retry = true if match
  → Async: queue LLM scoring call → UPDATE turns SET llm_score, score_breakdown

PreToolUse:
  → INSERT INTO tool_events (id, session_id, tool_name, tool_input_summary, created_at)
  → UPDATE sessions SET total_tool_calls = total_tool_calls + 1

PostToolUse:
  → UPDATE tool_events SET success, execution_ms WHERE id = matching_pre_tool_event
  → If tool = "Edit" or "Write": UPDATE sessions SET files_changed = files_changed + 1

Stop:
  → UPDATE turns SET response_tokens_est, latency_ms WHERE session_id AND turn_number = latest
  → UPDATE sessions SET total_input_tokens, total_output_tokens, total_cost_usd

SessionEnd:
  → UPDATE sessions SET ended_at, avg_prompt_score, efficiency_score,
                        token_waste_ratio, context_peak_pct
  → Spawn detached: session analysis via Haiku → UPDATE sessions SET analysis, analyzed_at
```

---

## 5. Scoring System

### Layer 1: Heuristic Scorer (0ms, always runs)

**Baseline: 70 points.** Anti-patterns deduct. Positive signals add. Capped at 0-100.

#### Anti-Patterns (deductions)

| ID | Severity | Points | Detection | Fix Hint |
|----|----------|--------|-----------|----------|
| `vague_verb` | HIGH | -15 | `/^(fix\|make\|do\|help\|improve\|change\|update)\b.{0,20}$/i` | "Add: which file, what behavior, what error" |
| `paraphrased_error` | HIGH | -15 | Mentions "error" without code block | "Paste the exact error message in backticks" |
| `too_short` | HIGH | -15 | Word count < 8 | "Add context: file path, function name, expected behavior" |
| `retry_detected` | HIGH | -15 | prompt_hash matches earlier turn in session | "Explain what was wrong with the prior answer" |
| `no_file_ref` | MEDIUM | -10 | Mentions code concepts without file path | "Specify the file path and function name" |
| `multi_question` | MEDIUM | -10 | 3+ question marks | "One question per turn — split into steps" |
| `overlong_prompt` | MEDIUM | -10 | Word count > 500 | "Split into task description + separate context" |
| `no_expected_output` | MEDIUM | -10 | Long prompt without success criteria | "Describe what success looks like" |
| `unanchored_ref` | LOW | -5 | Starts with "it"/"that"/"the issue"/"this" | "Re-state what 'it' refers to — AI may lose context" |
| `filler_words` | LOW | -5 | "please"/"could you"/"would you mind" | "Filler words cost tokens — remove for efficiency" |

#### Positive Signals (bonuses)

| ID | Points | Detection |
|----|--------|-----------|
| `has_file_path` | +10 | Contains `/path/file.ext` pattern |
| `has_code_block` | +10 | Contains triple-backtick code blocks |
| `has_error_msg` | +10 | Code block containing "error"/"exception"/"traceback" |
| `has_constraints` | +10 | Contains "must"/"should not"/"without"/"preserve"/"don't change" |

#### Score Calculation

```
score = 70
      - sum(matched anti_pattern deductions)
      + sum(matched positive_signal bonuses)
score = clamp(score, 0, 100)
```

### Layer 2: LLM Scorer (Haiku, async, cached)

**When:** After heuristic score is computed, fire-and-forget async call to Haiku.
**Cost:** ~$0.0003 per call (~300 input tokens + 200 output tokens).
**Cache:** By SHA256 of prompt text. Same prompt → same score. No duplicate API calls.

#### Scoring Prompt

```
You are a prompt quality scorer for AI coding tools.

Score this developer prompt on 4 dimensions (each 0-25, total 0-100):

1. SPECIFICITY (0-25): Does it name files, functions, line numbers, or specific identifiers?
2. CONTEXT (0-25): Does it include error messages, what was tried, reproduction steps, or why this matters?
3. CLARITY (0-25): Is the expected outcome stated? Is there one clear ask (not multiple)?
4. ACTIONABILITY (0-25): Can the AI act immediately without asking clarifying questions?

Also provide:
- A one-sentence suggestion to improve the prompt
- Whether a cheaper model could handle this task
- Estimated tokens the improved prompt would save

Prompt to score:
"""
{prompt_text}
"""

Project: {project_dir}
Branch: {git_branch}

Respond in JSON only:
{
  "specificity": 0-25,
  "context": 0-25,
  "clarity": 0-25,
  "actionability": 0-25,
  "total": 0-100,
  "suggestion": "one sentence improvement",
  "cheaper_model_viable": true/false,
  "recommended_model": "haiku|sonnet|opus",
  "tokens_saved_est": number
}
```

### Efficiency Score (Per Session, Calculated on SessionEnd)

```
Efficiency = 0.30 × PromptQuality
           + 0.25 × TurnEfficiency
           + 0.20 × CostEfficiency
           + 0.15 × ModelFit
           + 0.10 × OutcomeSignal

Components:
  PromptQuality  = avg(heuristic_scores) / 100                           [0-1]
  TurnEfficiency = min(1, estimated_ideal_turns / actual_turns)           [0-1]
  CostEfficiency = 1 - token_waste_ratio                                  [0-1]
  ModelFit       = cheapest_viable_model_cost / actual_model_cost         [0-1]
  OutcomeSignal  = 1.0 if (files_changed > 0 AND retry_rate < 0.2)       [0-1]
                   0.5 if (files_changed > 0 OR retry_rate < 0.2)
                   0.0 otherwise

Final: round(Efficiency × 100) → 0-100 scale

Token Waste Ratio:
  wasted = retry_tokens + filler_tokens + redundant_context_tokens
  TWR = wasted / (total_input_tokens + total_output_tokens)

Ideal Turns Estimation (heuristic):
  - Simple question (< 50 token prompt, no code references): 1 turn
  - Bug fix with error message: 1-2 turns
  - Feature implementation: 2-4 turns
  - Complex refactoring: 3-6 turns
  - Classification: based on first prompt keywords + token count
```

---

## 6. Session Analysis Engine

### Post-Session LLM Analysis

**Trigger:** SessionEnd hook fires → spawns detached background process.
**Model:** Claude Haiku (cheapest, ~$0.001 per analysis).
**Purpose:** Deep analysis that heuristics can't do — spiral detection, optimal path, personalized tips.

#### Analysis Prompt

```
You are an AI usage efficiency analyst. Analyze this developer's coding session.

Session metadata:
- Tool: Claude Code
- Model: {model}
- Project: {git_repo}:{git_branch}
- Duration: {duration_minutes} minutes
- Total turns: {total_turns}
- Total tokens: {total_input_tokens} in + {total_output_tokens} out
- Estimated cost: ${total_cost_usd}

Turn-by-turn data:
{turns.map(t => `
Turn ${t.turn_number} [Score: ${t.heuristic_score}]
  Prompt (${t.prompt_tokens_est} tokens): ${t.prompt_text?.substring(0, 300) || '[redacted]'}
  Was retry: ${t.was_retry}
  Tool calls: ${t.tool_calls || 'none'}
  Response tokens: ${t.response_tokens_est}
  Latency: ${t.latency_ms}ms
`).join('\n')}

Analyze and return JSON:
{
  "efficiency_score": 0-100,
  "summary": "one sentence: what happened in this session",
  "wasted_turns": [
    {"turn": N, "reason": "why this turn was wasteful", "tokens_wasted": N}
  ],
  "optimal_turn_count": N,
  "spiral_detected": boolean,
  "spiral_start_turn": N or null,
  "model_recommendations": [
    {"turn": N, "used": "sonnet", "recommended": "haiku", "savings_usd": 0.XX}
  ],
  "rewritten_first_prompt": "how the opening prompt should have been written for best results",
  "top_tip": "the single most impactful improvement for this developer"
}
```

#### Analysis Cost Math

| Component | Tokens | Cost (Haiku) |
|-----------|--------|--------------|
| System prompt | ~200 | — |
| Session data (5 turns avg) | ~800 | — |
| Total input | ~1000 | $0.0008 |
| Output | ~500 | $0.0004 |
| **Total per analysis** | **~1500** | **~$0.0012** |
| **Per day (10 sessions)** | | **~$0.012** |
| **Per month** | | **~$0.36** |

Negligible cost. Real intelligence.

---

## 7. CLI Design

### Commands

```bash
# ─── SETUP ───────────────────────────────────────────
evalai init                        # Install hooks into Claude Code settings.json
evalai init --check                # Verify hooks are correctly installed
evalai init --uninstall            # Remove hooks from Claude Code

# ─── HOOK HANDLERS (called by Claude Code, not by user) ──
evalai hook session-start          # Handle SessionStart event
evalai hook prompt-submit          # Handle UserPromptSubmit event
evalai hook pre-tool               # Handle PreToolUse event
evalai hook post-tool              # Handle PostToolUse event
evalai hook stop                   # Handle Stop event
evalai hook session-end            # Handle SessionEnd event

# ─── STATS ───────────────────────────────────────────
evalai stats                       # Today's summary
evalai stats --week                # This week's summary
evalai stats --month               # This month's summary
evalai stats --compare             # Compare current period vs previous

# ─── SESSIONS ────────────────────────────────────────
evalai sessions                    # List recent sessions (last 20)
evalai sessions --all              # List all sessions
evalai sessions <session-id>       # Detailed view of one session

# ─── DASHBOARD ───────────────────────────────────────
evalai dashboard                   # Start local dashboard on :3456
evalai dashboard --port 8080       # Custom port

# ─── CONFIG ──────────────────────────────────────────
evalai config                      # Show current configuration
evalai config set <key> <value>    # Set a config value
evalai config reset                # Reset to defaults

# Keys:
#   privacy       off | local | hash     (default: local)
#   scoring       heuristic | llm        (default: llm)
#   threshold     0-100                   (default: 50, show suggestions below this)
#   dashboard-port 1024-65535            (default: 3456)

# ─── DATA ────────────────────────────────────────────
evalai export --csv                # Export all sessions to CSV
evalai export --json               # Export as JSON
evalai reset                       # Clear all data (with confirmation)
```

### CLI Output Examples

#### `evalai stats`

```
  EvaluateAI — Today (Apr 5, 2026)
  ─────────────────────────────────────────
  Sessions:    6          Cost:     $0.84
  Turns:       23         Tokens:   89,400
  Avg Score:   71/100     Efficiency: 68/100

  vs Yesterday: cost ↓12%  score ↑4pts  turns/session ↓0.8

  Top Issues:
    vague_verb ×3   no_file_ref ×2   retry ×1

  Tip: Adding file paths to your prompts would save ~1,200 tokens today.
```

#### `evalai sessions`

```
  Recent Sessions
  ─────────────────────────────────────────────────────────────
  ID       Task                    Turns  Cost    Score  Time
  a3f9c2   Fix auth middleware       3    $0.02    82   2h ago
  b7e1d4   Add pagination to API    7    $0.09    54   4h ago
  c2a8f6   Write unit tests         2    $0.01    91   6h ago
  d9b3e1   Debug memory leak       11    $0.14    38   yesterday
  ─────────────────────────────────────────────────────────────
  Run `evalai sessions <id>` for details.
```

#### Hook Suggestion Output (shown during Claude Code usage)

When `UserPromptSubmit` hook fires and score < threshold:

```
  [EvaluateAI] Score: 31/100
  Tip: Add the file path and paste the exact error message
  Suggested: "Fix the null reference in src/auth/middleware.ts where
  req.user is undefined after JWT token expiry. Error: TypeError:
  Cannot read properties of undefined (reading 'id')"
```

This appears as hook feedback text. The prompt still goes through (exit 0).

---

## 8. Dashboard Design

### Tech: Next.js 15 + shadcn/ui + Recharts

**Local-only:** Dashboard runs on localhost, reads SQLite directly via API routes.
**Dark theme** by default (developer tool).
**4 pages:** Overview, Sessions, Analytics, Settings.

### Overview Page (/)

```
┌──────────────────────────────────────────────────────────────────┐
│  EvaluateAI                                       [Settings ⚙]  │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌────────┐  │
│  │ $4.20        │ │ 189K         │ │ 73/100       │ │ 14     │  │
│  │ This Week    │ │ Tokens       │ │ Avg Score    │ │Sessions│  │
│  │ ↓18% ✓      │ │ ↓12% ✓      │ │ ↑8pts ✓     │ │        │  │
│  └──────────────┘ └──────────────┘ └──────────────┘ └────────┘  │
│                                                                  │
│  ┌─ Cost Trend (30d) ──────────┐ ┌─ Score Trend (30d) ────────┐ │
│  │ $3│                         │ │ 100│                        │ │
│  │   │▇▇                       │ │    │          ▁▃▅▆▇▇▇      │ │
│  │ $2│  ▇▇▇                    │ │  75│    ▁▃▅▆▇▇             │ │
│  │   │     ▇▇▆▅▃▂▁            │ │  50│▅▇▇                    │ │
│  │ $0└─────────────            │ │  25└─────────────           │ │
│  │    Mar 6    Apr 5           │ │    Mar 6    Apr 5           │ │
│  └─────────────────────────────┘ └─────────────────────────────┘ │
│                                                                  │
│  ┌─ Top Issues ────────────────┐ ┌─ Model Usage ──────────────┐  │
│  │ vague_verb:    8x this week │ │ ████████ Sonnet  55%       │  │
│  │ no_file_ref:   5x           │ │ █████    Haiku   30%       │  │
│  │ retry:         3x           │ │ ███      Opus    15%       │  │
│  └─────────────────────────────┘ └─────────────────────────────┘ │
│                                                                  │
│  ┌─ Recent Sessions ───────────────────────────────────────────┐ │
│  │ Fix auth middleware   │ 3 turns │ $0.02 │ Score: 82  ✓     │ │
│  │ Add pagination        │ 7 turns │ $0.09 │ Score: 54  ⚠     │ │
│  │ Write unit tests      │ 2 turns │ $0.01 │ Score: 91  ✓     │ │
│  │ Debug memory leak     │ 11 turns│ $0.14 │ Score: 38  ✗     │ │
│  └─────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

### Session Browser (/sessions)

- Sortable table: Task, Date, Turns, Cost, Score, Model, Duration
- Filters: date range, score range, model, project
- Search: by prompt text
- Click row → session detail page

### Session Detail (/sessions/[id])

```
┌──────────────────────────────────────────────────────────────────┐
│ ← Sessions   Fix auth middleware · Sonnet · 3 turns · $0.02     │
├────────────────────────────────┬─────────────────────────────────┤
│                                │                                 │
│  TURN TIMELINE                 │  SESSION METRICS                │
│                                │                                 │
│  Turn 1                        │  Efficiency:    82/100          │
│  ┌──────────────────────────┐  │  Token Waste:   12%             │
│  │ Heuristic: 31  LLM: 28  │  │  Context Peak:  34%             │
│  │                          │  │  Cost:          $0.021          │
│  │ "fix the auth bug"       │  │  Duration:      4m 12s          │
│  │                          │  │                                 │
│  │ Suggestion shown:        │  │  COST PER TURN                  │
│  │ "Fix null reference in   │  │  T1: ████████  $0.008          │
│  │  src/auth/middleware.ts   │  │  T2: ██████    $0.007          │
│  │  where req.user is..."   │  │  T3: █████     $0.006          │
│  │                          │  │                                 │
│  │ Anti-patterns:           │  │  CONTEXT USAGE                  │
│  │  vague_verb, too_short   │  │  T1: ██        12%              │
│  └──────────────────────────┘  │  T2: █████     28%              │
│                                │  T3: ██████    34%              │
│  [Response: 2 files modified]  │                                 │
│                                │  MODEL RECOMMENDATION            │
│  Turn 2                        │  Haiku could handle T3           │
│  ┌──────────────────────────┐  │  Savings: $0.003                │
│  │ Score: 71                │  │                                 │
│  │ "The fix works but now   │  │                                 │
│  │  the refresh token..."   │  │                                 │
│  └──────────────────────────┘  │                                 │
│  ...                           │                                 │
│                                │                                 │
├────────────────────────────────┴─────────────────────────────────┤
│  LLM Analysis (by Haiku):                                        │
│  "Good session overall. The weak first prompt caused a           │
│   clarification round. Including the file path and error         │
│   message upfront would have reduced this to 2 turns.            │
│   Estimated savings: $0.007 and ~2 minutes."                     │
│                                                                  │
│  Optimal first prompt: "Fix the null reference in                │
│  src/auth/middleware.ts:47 where req.user is undefined           │
│  after JWT expiry. Error: TypeError: Cannot read..."             │
└──────────────────────────────────────────────────────────────────┘
```

### Analytics Page (/analytics)

- **Cost breakdown:** by day (bar chart), by model (donut), by project (table)
- **Score distribution:** histogram of all prompt scores
- **Anti-pattern ranking:** most frequent issues with trend arrows
- **Efficiency trend:** line chart over 30/60/90 days
- **Token waste:** breakdown of retry/filler/redundant tokens
- **Model usage:** which models used and where cheaper would suffice

### Settings Page (/settings)

- Privacy mode toggle (off / local / hash)
- Scoring mode toggle (heuristic / LLM)
- Suggestion threshold slider (0-100)
- Dashboard port configuration
- Hook status check (green/red per hook)
- Data management: export, reset
- About: version, links

---

## 9. Project Structure

```
evaluateai-v2/
├── packages/
│   ├── core/                           # Shared logic (zero side effects)
│   │   ├── src/
│   │   │   ├── db/
│   │   │   │   ├── schema.ts                   # Drizzle ORM table definitions
│   │   │   │   ├── client.ts                   # SQLite connection factory
│   │   │   │   └── migrations/                 # SQL migration files
│   │   │   │       └── 0001_initial.sql
│   │   │   ├── scoring/
│   │   │   │   ├── heuristic.ts                # 10 anti-patterns + 4 positive signals
│   │   │   │   ├── llm-scorer.ts               # Haiku-based scoring + cache
│   │   │   │   ├── efficiency.ts               # Session efficiency calculator
│   │   │   │   └── types.ts                    # Score interfaces
│   │   │   ├── analysis/
│   │   │   │   └── session-analyzer.ts         # Post-session LLM analysis
│   │   │   ├── models/
│   │   │   │   └── pricing.ts                  # Model cost table + recommender
│   │   │   ├── tokens/
│   │   │   │   └── estimator.ts                # tiktoken-based token estimation
│   │   │   └── types.ts                        # Shared TypeScript types
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── cli/                            # CLI + Hook Handlers
│   │   ├── src/
│   │   │   ├── index.ts                        # Commander.js entry point
│   │   │   ├── commands/
│   │   │   │   ├── init.ts                     # Install/check/uninstall hooks
│   │   │   │   ├── stats.ts                    # Usage statistics
│   │   │   │   ├── sessions.ts                 # Browse/detail sessions
│   │   │   │   ├── dashboard.ts                # Launch local dashboard
│   │   │   │   ├── config.ts                   # Configuration management
│   │   │   │   └── export.ts                   # CSV/JSON export
│   │   │   ├── hooks/                          # Claude Code hook handlers
│   │   │   │   ├── handler.ts                  # Shared hook handler logic
│   │   │   │   ├── session-start.ts
│   │   │   │   ├── prompt-submit.ts            # Score + suggest
│   │   │   │   ├── pre-tool.ts
│   │   │   │   ├── post-tool.ts
│   │   │   │   ├── stop.ts
│   │   │   │   └── session-end.ts              # Finalize + trigger analysis
│   │   │   └── utils/
│   │   │       ├── display.ts                  # chalk-based terminal formatting
│   │   │       └── paths.ts                    # ~/.evaluateai-v2/ path helpers
│   │   ├── bin/
│   │   │   └── evalai.ts                       # #!/usr/bin/env tsx entry
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── dashboard/                      # Local Web UI
│       ├── src/
│       │   ├── app/
│       │   │   ├── layout.tsx                  # Root layout + dark theme
│       │   │   ├── page.tsx                    # Overview page
│       │   │   ├── sessions/
│       │   │   │   ├── page.tsx                # Session browser
│       │   │   │   └── [id]/page.tsx           # Session detail
│       │   │   ├── analytics/
│       │   │   │   └── page.tsx                # Cost + quality charts
│       │   │   ├── settings/
│       │   │   │   └── page.tsx                # Configuration
│       │   │   └── api/                        # API routes (read SQLite)
│       │   │       ├── sessions/route.ts
│       │   │       ├── stats/route.ts
│       │   │       └── config/route.ts
│       │   ├── components/
│       │   │   ├── stats-cards.tsx
│       │   │   ├── cost-chart.tsx
│       │   │   ├── score-trend.tsx
│       │   │   ├── session-table.tsx
│       │   │   ├── turn-timeline.tsx
│       │   │   ├── anti-pattern-list.tsx
│       │   │   ├── model-donut.tsx
│       │   │   ├── context-usage.tsx
│       │   │   └── efficiency-gauge.tsx
│       │   └── lib/
│       │       ├── db.ts                       # SQLite connection for API routes
│       │       └── utils.ts                    # Formatting helpers
│       ├── package.json
│       └── tsconfig.json
│
├── .github/
│   └── workflows/
│       └── ci.yml                              # Build + test on push
│
├── package.json                                # pnpm workspace root
├── pnpm-workspace.yaml
├── turbo.json                                  # Turborepo pipeline config
├── tsconfig.base.json                          # Shared TS config
├── .gitignore
├── .eslintrc.json
├── LICENSE
├── README.md
└── IMPLEMENTATION-PLAN.md                      # This file
```

---

## 10. Tech Stack

| Layer | Technology | Version | Why |
|-------|------------|---------|-----|
| **Runtime** | Node.js | 20+ LTS | Stable, widely available |
| **Language** | TypeScript | 5.x | Type safety across monorepo |
| **Monorepo** | pnpm + Turborepo | latest | Fast, reliable, great caching |
| **Database** | SQLite via better-sqlite3 | 12.x | Zero config, offline-first, fast |
| **ORM** | Drizzle ORM | 0.45+ | Type-safe SQL, great SQLite support |
| **CLI framework** | Commander.js | 12.x | Standard, well-documented |
| **Terminal UI** | chalk + cli-table3 | latest | Colors + tables in terminal |
| **LLM API** | @anthropic-ai/sdk | latest | Official SDK, TypeScript native |
| **Token counting** | js-tiktoken | latest | Offline token estimation |
| **Dashboard** | Next.js | 15.x | SSR, API routes, great DX |
| **UI components** | shadcn/ui | latest | Customizable, dark theme built-in |
| **Charts** | Recharts | 2.x | React-native charting |
| **CSS** | Tailwind CSS | 4.x | Rapid UI development |
| **Testing** | Vitest | latest | Fast, TypeScript-native |
| **Linting** | ESLint + Prettier | latest | Consistent code style |

### No External Services Required (MVP)

- No Docker
- No PostgreSQL
- No Redis
- No cloud services (except Anthropic API for LLM scoring)
- Everything runs locally on developer's machine

---

## 11. Phase-by-Phase Execution

### Phase 1: Foundation (Week 1, Days 1-5)

**Goal:** Core scoring engine working, data model solid.

```
Day 1: Monorepo Setup
├── Initialize pnpm workspace
├── Configure Turborepo (build, dev, test pipelines)
├── Shared tsconfig.base.json
├── ESLint + Prettier config
├── .gitignore
└── CI: GitHub Actions (build + typecheck on push)

Day 2: Core — Database
├── SQLite schema with Drizzle ORM
├── All 5 tables: sessions, turns, tool_events, scoring_calls, config
├── All indexes
├── Migration system
├── DB client with auto-initialization (~/.evaluateai-v2/db.sqlite)
└── Test: create session → insert turns → query back

Day 3: Core — Heuristic Scorer
├── 10 anti-pattern detectors
├── 4 positive signal detectors
├── Score calculation (baseline 70, deductions, bonuses)
├── Return: { score, antiPatterns[], positiveSignals[], quickTip }
└── Test: 20+ test cases covering all patterns

Day 4: Core — Token Estimator + Model Pricing
├── js-tiktoken integration for token estimation
├── Model pricing table (all Claude + GPT models)
├── Cost calculator: (input_tokens, output_tokens, model) → cost_usd
├── Model recommender: (prompt_text, task_complexity) → recommended_model
└── Test: pricing accuracy, token estimation accuracy

Day 5: Core — LLM Scorer
├── @anthropic-ai/sdk integration
├── Haiku scoring prompt
├── Response parsing + validation
├── Cache layer (by prompt SHA256, stored in scoring_calls table)
├── Graceful fallback to heuristic if API fails
└── Test: mock API responses, cache hit/miss
```

**Phase 1 Deliverable:** `import { scorePrompt } from '@evaluateai/core'` works with both heuristic and LLM scoring.

---

### Phase 2: Hook Integration (Week 2, Days 6-10)

**Goal:** Claude Code sessions automatically captured with real-time scoring.

```
Day 6: CLI — Project Setup
├── Commander.js with subcommands
├── bin/evalai.ts entry point
├── npm link for local development
├── Path helpers (~/.evaluateai-v2/)
├── Terminal display utilities (chalk formatting)
└── Test: `evalai --help` works

Day 7: CLI — Init Command
├── `evalai init` — detect Claude Code settings.json location
├── Read existing settings, merge hooks (don't overwrite user config)
├── Write all 6 hook entries
├── `evalai init --check` — verify each hook is installed
├── `evalai init --uninstall` — remove hooks cleanly
└── Test: init on fresh install, init with existing hooks, uninstall

Day 8: Hooks — Session Start + End
├── session-start handler: read stdin JSON, create session record
├── session-end handler: finalize aggregates, calculate scores
├── Git context: extract repo URL, branch from cwd
├── Handle edge cases: missing fields, duplicate sessions
└── Test: mock hook events, verify DB state

Day 9: Hooks — Prompt Submit (THE KEY HOOK)
├── Read prompt from stdin JSON
├── Run heuristic scorer (synchronous, 0ms)
├── Insert turn record into SQLite
├── Detect retry (check prompt_hash against prior turns)
├── If score < threshold: print suggestion to stderr
├── Queue async LLM scoring (fire-and-forget background)
├── Exit 0 (always allow — suggestions only)
└── Test: low score → suggestion shown, high score → silent, retry detection

Day 10: Hooks — Tool Events + Stop
├── pre-tool handler: log tool event to tool_events table
├── post-tool handler: update tool event with success/failure
├── stop handler: update latest turn with response metadata
├── Incremental session aggregate updates
├── Integration test: full session lifecycle through all 6 hooks
└── Test: verify complete data capture for a mock session
```

**Phase 2 Deliverable:** Use Claude Code normally → every session automatically tracked, scored, and stored. Bad prompts get suggestions.

---

### Phase 3: CLI + Analysis (Week 3, Days 11-15)

**Goal:** Full CLI experience + post-session AI analysis.

```
Day 11: CLI — Stats Command
├── `evalai stats` — today's summary from SQLite
├── `evalai stats --week` — this week
├── `evalai stats --month` — this month
├── `evalai stats --compare` — vs previous period
├── Formatted terminal output with colors + trend arrows
└── Test: various time ranges, empty data, edge cases

Day 12: CLI — Sessions Command
├── `evalai sessions` — list recent 20 sessions
├── `evalai sessions --all` — paginated list
├── `evalai sessions <id>` — detailed session view
├── Session detail: turn-by-turn with scores, suggestions, tool calls
├── Formatted table output with cli-table3
└── Test: list with filters, detail view, missing session

Day 13: Core — Session Analyzer
├── Post-session analysis prompt for Haiku
├── Background execution (spawned by session-end hook)
├── Parse and store analysis JSON in sessions.analysis
├── Error handling: timeout, API failure, malformed response
└── Test: mock session data, verify analysis quality

Day 14: Core — Efficiency Calculator
├── All 5 components: PromptQuality, TurnEfficiency, CostEfficiency, ModelFit, OutcomeSignal
├── Token waste ratio calculation
├── Ideal turn estimation heuristic
├── Context pressure tracking (estimate from token counts)
├── Integration with session-end hook
└── Test: various session profiles, edge cases

Day 15: CLI — Config + Export
├── `evalai config` — display current settings
├── `evalai config set` — update settings in config table
├── Privacy modes: off (no prompt text), local (full), hash (SHA256 only)
├── `evalai export --csv` and `--json`
├── `evalai reset` — clear with confirmation prompt
└── Test: config CRUD, export formats, privacy mode enforcement
```

**Phase 3 Deliverable:** Complete CLI tool — capture, score, analyze, report, configure.

---

### Phase 4: Dashboard (Week 4, Days 16-20)

**Goal:** Visual dashboard for all captured data.

```
Day 16: Dashboard — Setup
├── Next.js 15 + Tailwind + shadcn/ui
├── Dark theme configuration
├── Layout: sidebar nav + main content area
├── API routes: /api/stats, /api/sessions, /api/config
├── SQLite connection in API routes (read-only)
├── `evalai dashboard` command to start Next.js dev server
└── Test: dashboard starts, API routes return data

Day 17: Dashboard — Overview Page
├── Stat cards: cost, tokens, avg score, sessions (with trend %)
├── Cost trend line chart (30 days, Recharts)
├── Score trend line chart (30 days)
├── Top anti-patterns list with counts
├── Model usage donut chart
├── Recent sessions list (last 10)
└── Test: renders with real data, empty state

Day 18: Dashboard — Session Browser
├── Sortable data table (shadcn DataTable)
├── Columns: task title, date, turns, cost, score, model, duration
├── Filters: date range, score range, model selector
├── Search by prompt text
├── Pagination
├── Click row → navigate to /sessions/[id]
└── Test: sort, filter, search, pagination

Day 19: Dashboard — Session Detail
├── Turn timeline (left panel): each turn with score, prompt, suggestion
├── Metrics sidebar (right panel): efficiency, waste, context, cost per turn
├── Cost per turn bar chart
├── Context usage progression chart
├── Model recommendation display
├── LLM analysis section at bottom
└── Test: renders complete session, handles missing analysis

Day 20: Dashboard — Analytics + Settings
├── Analytics page:
│   ├── Cost by day bar chart
│   ├── Cost by model donut
│   ├── Score distribution histogram
│   ├── Anti-pattern ranking
│   ├── Efficiency trend line
│   └── Token waste breakdown
├── Settings page:
│   ├── Privacy mode toggle
│   ├── Scoring mode toggle
│   ├── Suggestion threshold slider
│   ├── Hook status indicators
│   └── Data management (export/reset)
└── Test: all charts render, settings persist
```

**Phase 4 Deliverable:** Full local dashboard — overview, session browser, analytics, settings.

---

### Phase 5: Polish + Launch (Week 5, Days 21-25)

**Goal:** Production-ready release.

```
Day 21: Edge Cases + Error Handling
├── Offline mode: LLM scoring gracefully falls back to heuristic
├── No API key: clear error message + instructions
├── Empty state: dashboard shows helpful onboarding
├── Corrupt DB: auto-backup + recovery
├── Hook failures: never break Claude Code (exit 0 on any error)
└── Race conditions: concurrent hook invocations

Day 22: Testing
├── Unit tests: core scoring, pricing, token estimation
├── Integration tests: full hook lifecycle
├── Dashboard: component tests with React Testing Library
├── E2E: `evalai init` → simulated hook events → `evalai stats` verification
└── CI: all tests pass in GitHub Actions

Day 23: Performance
├── Hook handler latency: target < 50ms per invocation
├── SQLite WAL mode for concurrent reads/writes
├── LLM scoring: debounce, cache, background execution
├── Dashboard: static generation where possible
└── Profile and optimize any slow paths

Day 24: Documentation
├── README.md: overview, install, quickstart, screenshots
├── CONTRIBUTING.md: dev setup, architecture, how to add anti-patterns
├── In-app help: `evalai --help` for every command
├── Dashboard empty states with onboarding instructions
└── Landing page copy (for future website)

Day 25: Launch
├── npm publish: @evaluateai/cli as global package
├── GitHub release with changelog
├── Demo video: 2-minute walkthrough
├── HN post: "Show HN: EvaluateAI — AI usage intelligence for developers"
├── Reddit: r/ChatGPTCoding, r/ClaudeAI, r/programming
└── Dev Twitter/Bluesky announcement
```

**Phase 5 Deliverable:** v1.0.0 published to npm. Public launch.

---

## 12. Business Model

### Pricing Tiers

| Tier | Price | Target | Features |
|------|-------|--------|----------|
| **Free** | $0 | Solo devs | Local-only, heuristic scoring, basic stats, 30-day retention |
| **Pro** | $12/mo | Power users | LLM scoring, session analysis, full dashboard, unlimited retention |
| **Team** | $25/user/mo | Eng teams 5-50 | Team dashboard, shared templates, manager view, API |
| **Enterprise** | Custom | Large orgs 50+ | SSO/SAML, audit logs, on-prem, SLA |

### Revenue Path

```
Phase 1 (Month 1-6):   Free + Pro
                        Target: 1,000 free users → 100 Pro ($1,200/mo)

Phase 2 (Month 6-12):  Add Team tier
                        Target: 20 teams × 10 users ($5,000/mo)

Phase 3 (Month 12-24): Enterprise
                        Target: 5 contracts ($50K+ ARR each)
```

### Expansion: Dev tool → Team analytics → Enterprise AI observability

---

## 13. Risks & Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| **Privacy: developers won't log prompts** | HIGH | Default local-only. Cloud sync opt-in. Hash mode available. |
| **Developer resistance ("surveillance")** | HIGH | Position as self-improvement. Team features opt-in. You own your data. |
| **Hook format changes in Claude Code** | MEDIUM | Version-pin hook format. Test against Claude Code releases in CI. |
| **LLM scoring cost spirals** | LOW | Haiku is $0.0003/call. Cache by hash. Daily cap configurable. |
| **Scoring accuracy questioned** | MEDIUM | Score relative to user's own history. Show breakdown. Allow threshold customization. |
| **SQLite concurrency** | LOW | WAL mode. Hooks are fast (< 50ms). Dashboard reads are non-blocking. |
| **Slow hook handlers break Claude Code** | HIGH | Catch all errors → exit 0. Never block. Background async for LLM calls. |

---

## 14. Post-Launch Roadmap (v0.2+)

| Feature | Priority | Effort | Description |
|---------|----------|--------|-------------|
| **API proxy** | High | 1 week | Support Codex, Aider via OPENAI_BASE_URL proxy |
| **MCP server** | High | 3 days | Expose score-prompt, suggest-model as MCP tools |
| **Team sync** | Medium | 2 weeks | Cloud upload, team dashboard, PostgreSQL backend |
| **CLAUDE.md updater** | Medium | 1 week | Auto-update project instructions based on session analysis |
| **Template library** | Medium | 1 week | Promote great prompts to reusable templates |
| **Batch API analysis** | Medium | 3 days | Use Anthropic Batch API (50% cheaper) for session analysis |
| **VS Code extension** | Low | 2 weeks | Inline scoring in VS Code Claude integration |
| **Weekly digest email** | Low | 2 days | Summary of usage + tips sent weekly |
| **CLI auto-update** | Low | 1 day | Check for new versions on `evalai stats` |

---

## Summary

```
EvaluateAI v2: Hook into Claude Code → Score every prompt → Show suggestions →
Track sessions → Analyze efficiency → Display in dashboard → Help developers
get better at AI.

Week 1: Core scoring engine (heuristic + LLM)
Week 2: Hook integration (native Claude Code capture)
Week 3: CLI polish + session analysis
Week 4: Local web dashboard
Week 5: Testing + launch

Zero friction. Zero overhead. Real intelligence.
```

---

*EvaluateAI v2 — Implementation Plan v1.0 — April 5, 2026*
