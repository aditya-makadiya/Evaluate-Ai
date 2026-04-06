// ============================================================
// Hook: PostToolUse
// Fires after a tool completes in Claude Code.
// ============================================================

import { getDb, sessions, toolEvents } from 'evaluateai-core';
import type { PostToolUseEvent } from 'evaluateai-core';
import { eq, and, desc, sql } from 'drizzle-orm';
import { readStdinJSON, safeExit } from './handler.js';

export async function handlePostTool(): Promise<void> {
  try {
    const event = await readStdinJSON<PostToolUseEvent>();

    const sessionId = event.session_id;
    const toolName = event.tool_name || 'unknown';
    const success = event.success ?? null;
    const outputSize = event.output_size ?? null;

    if (!sessionId) {
      safeExit(0);
    }

    const db = getDb();

    // Find most recent tool_event for this session with matching tool_name
    const recentEvents = await db
      .select({ id: toolEvents.id, createdAt: toolEvents.createdAt })
      .from(toolEvents)
      .where(
        and(
          eq(toolEvents.sessionId, sessionId),
          eq(toolEvents.toolName, toolName),
        ),
      )
      .orderBy(desc(toolEvents.createdAt))
      .limit(1);

    if (recentEvents.length > 0) {
      const eventId = recentEvents[0].id;
      const startTime = new Date(recentEvents[0].createdAt).getTime();
      const executionMs = Date.now() - startTime;

      // UPDATE tool_events with result
      await db
        .update(toolEvents)
        .set({
          success: success,
          executionMs: executionMs > 0 ? executionMs : null,
        })
        .where(eq(toolEvents.id, eventId));
    }

    // If tool is "Edit" or "Write" and success: increment files_changed
    if ((toolName === 'Edit' || toolName === 'Write') && success) {
      await db
        .update(sessions)
        .set({
          filesChanged: sql`${sessions.filesChanged} + 1`,
        })
        .where(eq(sessions.id, sessionId));
    }

    safeExit(0);
  } catch {
    safeExit(0);
  }
}
