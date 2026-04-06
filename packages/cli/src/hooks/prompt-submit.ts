// ============================================================
// Hook: PromptSubmit (UserPromptSubmit)
// THE KEY HOOK. Fires when user submits a prompt.
// Scores the prompt, inserts a turn, and fires LLM scoring.
// ============================================================

import { ulid } from 'ulid';
import {
  getDb,
  sessions,
  turns,
  config,
  scoreHeuristic,
  estimateTokens,
} from 'evaluateai-core';
import type { PromptSubmitEvent } from 'evaluateai-core';
import { eq, desc, sql } from 'drizzle-orm';
import { readStdinJSON, hashText, safeExit } from './handler.js';

// Dynamic import for LLM scorer (fire-and-forget)
async function fireLLMScoring(turnId: string, promptText: string, context?: { projectDir?: string; gitBranch?: string }): Promise<void> {
  try {
    const { scoreLLMAndUpdate } = await import('evaluateai-core');
    await scoreLLMAndUpdate(turnId, promptText, context);
  } catch {
    // Non-critical — silently ignore
  }
}

export async function handlePromptSubmit(): Promise<void> {
  try {
    const event = await readStdinJSON<PromptSubmitEvent>();

    const sessionId = event.session_id;
    const prompt = event.prompt || '';
    const cwd = event.cwd || process.cwd();
    const now = event.timestamp || new Date().toISOString();

    if (!sessionId || !prompt) {
      safeExit(0);
    }

    const db = getDb();

    // Get current turn count for session
    const sessionRows = await db
      .select({ totalTurns: sessions.totalTurns, projectDir: sessions.projectDir, gitBranch: sessions.gitBranch })
      .from(sessions)
      .where(eq(sessions.id, sessionId))
      .limit(1);

    const currentTurns = sessionRows.length > 0 ? sessionRows[0].totalTurns : 0;
    const turnNumber = currentTurns + 1;
    const projectDir = sessionRows.length > 0 ? sessionRows[0].projectDir : cwd;
    const gitBranch = sessionRows.length > 0 ? sessionRows[0].gitBranch : null;

    // Compute prompt hash
    const promptHash = hashText(prompt);

    // Check if retry: hash matches any previous turn in this session
    const previousTurns = await db
      .select({ promptHash: turns.promptHash, promptText: turns.promptText })
      .from(turns)
      .where(eq(turns.sessionId, sessionId))
      .orderBy(desc(turns.turnNumber));

    const wasRetry = previousTurns.some(t => t.promptHash === promptHash);

    // Get prompt history for heuristic scoring retry detection
    const promptHistory = previousTurns
      .map(t => t.promptText)
      .filter((t): t is string => t !== null);

    // Run heuristic scorer
    const heuristicResult = scoreHeuristic(prompt, promptHistory);

    // Estimate tokens
    const promptTokensEst = estimateTokens(prompt);

    // Generate turn ID
    const turnId = ulid();

    // INSERT into turns
    await db.insert(turns).values({
      id: turnId,
      sessionId,
      turnNumber,
      promptText: prompt,
      promptHash,
      promptTokensEst,
      heuristicScore: heuristicResult.score,
      antiPatterns: JSON.stringify(heuristicResult.antiPatterns),
      llmScore: null,
      scoreBreakdown: null,
      suggestionText: heuristicResult.quickTip,
      suggestionAccepted: null,
      tokensSavedEst: null,
      responseTokensEst: null,
      toolCalls: null,
      latencyMs: null,
      wasRetry,
      contextUsedPct: null,
      createdAt: now,
    });

    // UPDATE session turn count and input tokens
    await db
      .update(sessions)
      .set({
        totalTurns: sql`${sessions.totalTurns} + 1`,
        totalInputTokens: sql`${sessions.totalInputTokens} + ${promptTokensEst}`,
      })
      .where(eq(sessions.id, sessionId));

    // Read threshold from config (default 50)
    let threshold = 50;
    try {
      const configRows = await db
        .select({ value: config.value })
        .from(config)
        .where(eq(config.key, 'threshold'))
        .limit(1);
      if (configRows.length > 0) {
        threshold = parseInt(configRows[0].value, 10) || 50;
      }
    } catch {
      // Use default
    }

    // If score is below threshold, output feedback to stderr
    if (heuristicResult.score < threshold) {
      const lines = [`[EvaluateAI] Score: ${heuristicResult.score}/100`];
      if (heuristicResult.quickTip) {
        lines.push(`Tip: ${heuristicResult.quickTip}`);
      }
      if (heuristicResult.antiPatterns.length > 0) {
        const suggestion = heuristicResult.antiPatterns
          .map(ap => ap.hint)
          .join('; ');
        lines.push(`Suggested: ${suggestion}`);
      }
      process.stderr.write(lines.join('\n') + '\n');
    }

    // Fire-and-forget: LLM scoring in background
    fireLLMScoring(turnId, prompt, {
      projectDir: projectDir || undefined,
      gitBranch: gitBranch || undefined,
    }).catch(() => {
      // Silently ignore — never block
    });

    safeExit(0);
  } catch {
    safeExit(0);
  }
}
