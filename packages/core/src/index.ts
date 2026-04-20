// evaluateai-core — public API
//
// Pure, stateless library: prompt scoring (heuristic + LLM), token estimation,
// model pricing, session analysis, and Claude Code transcript parsing.
//
// No database, no network persistence. Persistence is the caller's concern
// (dashboard API routes → Supabase; CLI hooks → HTTP ingest endpoint).

export * from './types.js';

// Scoring
export { scoreHeuristic } from './scoring/heuristic.js';
export { scoreLLM } from './scoring/llm-scorer.js';
export { calculateEfficiency } from './scoring/efficiency.js';

// Tokens & pricing
export { estimateTokens } from './tokens/estimator.js';
export { getModelPricing, calculateCost, recommendModel, normalizeModelId } from './models/pricing.js';

// Analysis
export { analyzeSession } from './analysis/session-analyzer.js';

// Transcript
export { getLatestResponse, getSessionSummary, getPerTurnSummary } from './transcript/parser.js';
export type { TranscriptEntry, TranscriptUsage, TranscriptResponse, TranscriptSummary, PerTurnData } from './transcript/parser.js';
