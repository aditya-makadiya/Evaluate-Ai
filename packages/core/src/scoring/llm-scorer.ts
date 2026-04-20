import Anthropic from '@anthropic-ai/sdk';
import type { LLMScoreBreakdown } from '../types.js';

const SCORING_MODEL = 'claude-haiku-4-5-20251001';

const SCORING_PROMPT = `You are a prompt quality scorer for AI coding tools.

Score this developer prompt on 4 dimensions (each 0-25, total 0-100):

1. SPECIFICITY (0-25): Does it name files, functions, line numbers, or specific identifiers?
2. CONTEXT (0-25): Does it include error messages, what was tried, reproduction steps, or why this matters?
3. CLARITY (0-25): Is the expected outcome stated? Is there one clear ask (not multiple)?
4. ACTIONABILITY (0-25): Can the AI act immediately without asking clarifying questions?

Also provide:
- A one-sentence suggestion to improve the prompt
- Whether a cheaper model (Haiku) could handle this task
- Estimated tokens the improved prompt would save

Respond in JSON only, no markdown fences:
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
}`;

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic();
  }
  return client;
}

/**
 * Score a prompt using Claude Haiku.
 *
 * Pure function: no caching, no persistence. The caller is responsible for
 * caching results by prompt hash and storing them if desired. Returns null on
 * any failure so callers (e.g. hook handlers) can continue without breaking.
 */
export async function scoreLLM(
  promptText: string,
  context?: { projectDir?: string; gitBranch?: string }
): Promise<LLMScoreBreakdown | null> {
  try {
    const userMessage = `Prompt to score:
"""
${promptText}
"""

${context?.projectDir ? `Project: ${context.projectDir}` : ''}
${context?.gitBranch ? `Branch: ${context.gitBranch}` : ''}`.trim();

    const response = await getClient().messages.create({
      model: SCORING_MODEL,
      max_tokens: 512,
      system: SCORING_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    });

    const text = response.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('');

    const parsed = JSON.parse(text);
    return {
      specificity: clamp(parsed.specificity, 0, 25),
      context: clamp(parsed.context, 0, 25),
      clarity: clamp(parsed.clarity, 0, 25),
      actionability: clamp(parsed.actionability, 0, 25),
      total: clamp(parsed.total, 0, 100),
      suggestion: parsed.suggestion ?? '',
      cheaperModelViable: parsed.cheaper_model_viable ?? false,
      recommendedModel: parsed.recommended_model ?? 'sonnet',
      tokensSavedEst: parsed.tokens_saved_est ?? 0,
    };
  } catch {
    return null;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
