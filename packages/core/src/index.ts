// @evaluateai/core — public API

export * from './types.js';

// Supabase client
export { getSupabase, initSupabase } from './db/client.js';

// Data access layer
export {
  createSession,
  updateSession,
  getSession,
  getSessions,
  createTurn,
  updateTurn,
  getTurnsForSession,
  getTurnByHash,
  createToolEvent,
  updateToolEvent,
  getToolEventsForSession,
  addTimelineEvent,
  createScoringCall,
  createApiCall,
  getStats,
  getDeveloperStats,
  checkSupabaseConnection,
} from './db/supabase.js';
export type { Stats, DeveloperStats } from './db/supabase.js';

// Scoring
export { scoreHeuristic } from './scoring/heuristic.js';
export { scoreLLM, scoreLLMAndUpdate } from './scoring/llm-scorer.js';
export { calculateEfficiency } from './scoring/efficiency.js';

// Tokens & pricing
export { estimateTokens } from './tokens/estimator.js';
export { getModelPricing, calculateCost, recommendModel, normalizeModelId } from './models/pricing.js';

// Analysis
export { analyzeSession } from './analysis/session-analyzer.js';

// Transcript
export { getLatestResponse, getSessionSummary, getPerTurnSummary } from './transcript/parser.js';
export type { TranscriptEntry, TranscriptUsage, TranscriptResponse, TranscriptSummary, PerTurnData } from './transcript/parser.js';
