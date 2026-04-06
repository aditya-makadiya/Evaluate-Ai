// ============================================================
// Hook: SessionEnd
// Fires when a Claude Code session ends.
// Calculates final metrics and spawns background analysis.
// ============================================================

import {
  getDb,
  sessions,
  turns,
  calculateEfficiency,
  analyzeSession,
} from 'evaluateai-core';
import type { SessionEndEvent, Session, Turn } from 'evaluateai-core';
import { eq, desc } from 'drizzle-orm';
import { readStdinJSON, safeExit } from './handler.js';

export async function handleSessionEnd(): Promise<void> {
  try {
    const event = await readStdinJSON<SessionEndEvent>();

    const sessionId = event.session_id;
    const endedAt = event.timestamp || new Date().toISOString();

    if (!sessionId) {
      safeExit(0);
    }

    const db = getDb();

    // UPDATE session ended_at
    await db
      .update(sessions)
      .set({ endedAt })
      .where(eq(sessions.id, sessionId));

    // Fetch session data
    const sessionRows = await db
      .select()
      .from(sessions)
      .where(eq(sessions.id, sessionId))
      .limit(1);

    if (sessionRows.length === 0) {
      safeExit(0);
    }

    const session = sessionRows[0] as Session;

    // Fetch all turns for this session
    const sessionTurns = (await db
      .select()
      .from(turns)
      .where(eq(turns.sessionId, sessionId))
      .orderBy(turns.turnNumber)) as Turn[];

    // Calculate average prompt score from turns
    const scores = sessionTurns
      .map(t => t.heuristicScore ?? t.llmScore)
      .filter((s): s is number => s !== null);
    const avgPromptScore =
      scores.length > 0
        ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10
        : null;

    // Calculate efficiency score
    const efficiencyResult = calculateEfficiency({
      session,
      turns: sessionTurns,
    });

    // Calculate token waste ratio
    const tokenWasteRatio = efficiencyResult.tokenWasteRatio;
    const contextPeakPct = efficiencyResult.contextPeakPct;

    // UPDATE session with calculated fields
    await db
      .update(sessions)
      .set({
        avgPromptScore,
        efficiencyScore: efficiencyResult.score,
        tokenWasteRatio,
        contextPeakPct,
      })
      .where(eq(sessions.id, sessionId));

    // Fire-and-forget: background session analysis
    // Re-read session with updated fields for analysis
    const updatedSessionRows = await db
      .select()
      .from(sessions)
      .where(eq(sessions.id, sessionId))
      .limit(1);

    if (updatedSessionRows.length > 0) {
      const updatedSession = updatedSessionRows[0] as Session;
      analyzeSession(updatedSession, sessionTurns).catch(() => {
        // Non-critical — silently ignore
      });
    }

    safeExit(0);
  } catch {
    safeExit(0);
  }
}
