import Anthropic from '@anthropic-ai/sdk';
import type { Session, Turn, SessionAnalysis } from '../types.js';

const ANALYSIS_MODEL = 'claude-haiku-4-5-20251001';

const ANALYSIS_SYSTEM = `You are an AI usage efficiency analyst. Analyze developer sessions with AI coding tools and return structured JSON insights.

Always return valid JSON with no markdown fences.`;

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic();
  }
  return client;
}

/**
 * Analyze a completed session using Haiku.
 *
 * Pure function: returns the analysis result; the caller decides whether and
 * where to persist it. Returns null on failure so callers can fall back.
 */
export async function analyzeSession(
  session: Session,
  sessionTurns: Turn[]
): Promise<SessionAnalysis | null> {
  try {
    if (sessionTurns.length === 0) return null;

    const turnsFormatted = sessionTurns.map(t => {
      const prompt = t.promptText?.substring(0, 300) ?? '[redacted]';
      return `Turn ${t.turnNumber} [Score: ${t.heuristicScore ?? '?'}]
  Prompt (${t.promptTokensEst ?? '?'} tokens): ${prompt}
  Was retry: ${t.wasRetry}
  Tool calls: ${t.toolCalls ?? 'none'}
  Response tokens: ${t.responseTokensEst ?? '?'}
  Latency: ${t.latencyMs ?? '?'}ms`;
    }).join('\n\n');

    const totalTokens = session.totalInputTokens + session.totalOutputTokens;
    const durationMs = session.endedAt && session.startedAt
      ? new Date(session.endedAt).getTime() - new Date(session.startedAt).getTime()
      : 0;
    const durationMin = Math.round(durationMs / 60_000);

    const userMessage = `Analyze this AI coding session for efficiency:

Session: ${session.tool} on ${session.gitRepo ?? 'unknown'}:${session.gitBranch ?? 'unknown'}
Model: ${session.model ?? 'unknown'}
Turns: ${session.totalTurns} | Tokens: ${totalTokens} | Cost: $${session.totalCostUsd.toFixed(4)}
Duration: ${durationMin}min

Turn-by-turn data:
${turnsFormatted}

Return JSON:
{
  "efficiency_score": 0-100,
  "summary": "one sentence summary",
  "wasted_turns": [{"turn": N, "reason": "why wasteful"}],
  "optimal_turn_count": N,
  "spiral_detected": boolean,
  "spiral_start_turn": N or null,
  "model_recommendations": [{"turn": N, "used": "model", "recommended": "model", "savings_usd": 0.XX}],
  "rewritten_first_prompt": "improved version of the first prompt",
  "top_tip": "most impactful improvement"
}`;

    const response = await getClient().messages.create({
      model: ANALYSIS_MODEL,
      max_tokens: 1024,
      system: ANALYSIS_SYSTEM,
      messages: [{ role: 'user', content: userMessage }],
    });

    const text = response.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('');

    const parsed = JSON.parse(text);
    return {
      efficiencyScore: parsed.efficiency_score ?? 0,
      summary: parsed.summary ?? '',
      wastedTurns: parsed.wasted_turns ?? [],
      optimalTurnCount: parsed.optimal_turn_count ?? session.totalTurns,
      spiralDetected: parsed.spiral_detected ?? false,
      spiralStartTurn: parsed.spiral_start_turn ?? null,
      modelRecommendations: parsed.model_recommendations ?? [],
      rewrittenFirstPrompt: parsed.rewritten_first_prompt ?? '',
      topTip: parsed.top_tip ?? '',
    };
  } catch {
    // Analysis failure is non-critical
    return null;
  }
}
