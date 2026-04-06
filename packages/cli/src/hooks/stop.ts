// ============================================================
// Hook: Stop
// Fires when Claude Code finishes generating a response.
// ============================================================

import {
  getDb,
  sessions,
  turns,
  calculateCost,
} from 'evaluateai-core';
import type { StopEvent } from 'evaluateai-core';
import { eq, desc, sql } from 'drizzle-orm';
import { readStdinJSON, safeExit } from './handler.js';

export async function handleStop(): Promise<void> {
  try {
    const event = await readStdinJSON<StopEvent>();

    const sessionId = event.session_id;
    const responseTokens = event.response_tokens ?? null;
    const latencyMs = event.latency_ms ?? null;

    if (!sessionId) {
      safeExit(0);
    }

    const db = getDb();

    // Find latest turn for this session
    const latestTurns = await db
      .select({ id: turns.id, promptTokensEst: turns.promptTokensEst })
      .from(turns)
      .where(eq(turns.sessionId, sessionId))
      .orderBy(desc(turns.turnNumber))
      .limit(1);

    if (latestTurns.length > 0) {
      const turnId = latestTurns[0].id;
      const promptTokens = latestTurns[0].promptTokensEst ?? 0;

      // UPDATE turns with response info
      await db
        .update(turns)
        .set({
          responseTokensEst: responseTokens,
          latencyMs: latencyMs,
        })
        .where(eq(turns.id, turnId));

      // Estimate cost for this turn and update session aggregates
      if (responseTokens !== null) {
        // Get session model for cost calculation
        const sessionRows = await db
          .select({ model: sessions.model })
          .from(sessions)
          .where(eq(sessions.id, sessionId))
          .limit(1);

        const model = sessionRows.length > 0 ? sessionRows[0].model || 'claude-sonnet-4-6' : 'claude-sonnet-4-6';
        const turnCost = calculateCost(promptTokens, responseTokens, model);

        await db
          .update(sessions)
          .set({
            totalOutputTokens: sql`${sessions.totalOutputTokens} + ${responseTokens}`,
            totalCostUsd: sql`${sessions.totalCostUsd} + ${turnCost}`,
          })
          .where(eq(sessions.id, sessionId));
      }
    }

    safeExit(0);
  } catch {
    safeExit(0);
  }
}
