// @evaluateai/core — public API

export * from './types.js';
export { getDb, initDb } from './db/client.js';
export { sessions, turns, toolEvents, apiCalls, scoringCalls, config } from './db/schema.js';
export { scoreHeuristic } from './scoring/heuristic.js';
export { scoreLLM, scoreLLMAndUpdate } from './scoring/llm-scorer.js';
export { calculateEfficiency } from './scoring/efficiency.js';
export { estimateTokens } from './tokens/estimator.js';
export { getModelPricing, calculateCost, recommendModel } from './models/pricing.js';
export { analyzeSession } from './analysis/session-analyzer.js';
export {
  initSupabase,
  getSupabase,
  isSupabaseConfigured,
  syncToSupabase,
  checkSupabaseConnection,
} from './db/supabase.js';
export type { SupabaseConfig, SyncResult } from './db/supabase.js';
export { getLatestResponse, getSessionSummary } from './transcript/parser.js';
export type { TranscriptEntry, TranscriptUsage, TranscriptResponse, TranscriptSummary } from './transcript/parser.js';
