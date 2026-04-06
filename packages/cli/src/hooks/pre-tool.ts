// ============================================================
// Hook: PreToolUse
// Fires before a tool is invoked by Claude Code.
// ============================================================

import { ulid } from 'ulid';
import { getDb, sessions, toolEvents } from 'evaluateai-core';
import type { PreToolUseEvent } from 'evaluateai-core';
import { eq, sql } from 'drizzle-orm';
import { readStdinJSON, safeExit } from './handler.js';

export async function handlePreTool(): Promise<void> {
  try {
    const event = await readStdinJSON<PreToolUseEvent>();

    const sessionId = event.session_id;
    const toolName = event.tool_name || 'unknown';
    const toolInput = event.tool_input || null;

    if (!sessionId) {
      safeExit(0);
    }

    const db = getDb();
    const now = new Date().toISOString();

    // INSERT into tool_events
    await db.insert(toolEvents).values({
      id: ulid(),
      sessionId,
      turnId: null,
      toolName,
      toolInputSummary: toolInput ? String(toolInput).substring(0, 500) : null,
      success: null,
      executionMs: null,
      createdAt: now,
    });

    // UPDATE session tool call count
    await db
      .update(sessions)
      .set({
        totalToolCalls: sql`${sessions.totalToolCalls} + 1`,
      })
      .where(eq(sessions.id, sessionId));

    safeExit(0);
  } catch {
    safeExit(0);
  }
}
