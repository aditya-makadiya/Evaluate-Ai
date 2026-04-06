// ============================================================
// Hook: SessionStart
// Fires when a new Claude Code session begins.
// ============================================================

import { ulid } from 'ulid';
import { getDb, sessions } from 'evaluateai-core';
import type { SessionStartEvent } from 'evaluateai-core';
import { readStdinJSON, getGitInfo, safeExit } from './handler.js';

export async function handleSessionStart(): Promise<void> {
  try {
    const event = await readStdinJSON<SessionStartEvent>();

    const sessionId = event.session_id || ulid();
    const cwd = event.cwd || process.cwd();
    const { gitRepo, gitBranch } = getGitInfo(cwd);
    const now = event.timestamp || new Date().toISOString();

    const db = getDb();

    await db.insert(sessions).values({
      id: sessionId,
      tool: 'claude-code',
      integration: 'hooks',
      projectDir: cwd,
      gitRepo,
      gitBranch,
      model: event.model || null,
      startedAt: now,
      endedAt: null,
      totalTurns: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCostUsd: 0,
      totalToolCalls: 0,
      filesChanged: 0,
      avgPromptScore: null,
      efficiencyScore: null,
      tokenWasteRatio: null,
      contextPeakPct: null,
      analysis: null,
      analyzedAt: null,
    });

    safeExit(0);
  } catch {
    safeExit(0);
  }
}
