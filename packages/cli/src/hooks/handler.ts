// ============================================================
// Shared handler utilities for Claude Code hooks
// ============================================================

import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';

/**
 * Read JSON from stdin (Claude Code sends hook data as JSON on stdin).
 */
export async function readStdinJSON<T = Record<string, unknown>>(): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const chunks: Buffer[] = [];
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk: string | Buffer) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    process.stdin.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8').trim();
        if (!raw) {
          resolve({} as T);
          return;
        }
        resolve(JSON.parse(raw) as T);
      } catch (err) {
        reject(err);
      }
    });
    process.stdin.on('error', reject);

    // If stdin is already ended (piped and closed), force end
    if (process.stdin.readableEnded) {
      resolve({} as T);
    }
  });
}

/**
 * Write JSON response to stdout (for Claude Code to read).
 */
export function writeOutput(data: unknown): void {
  process.stdout.write(JSON.stringify(data) + '\n');
}

/**
 * Extract git repo URL and branch from a directory.
 */
export function getGitInfo(cwd: string): { gitRepo: string | null; gitBranch: string | null } {
  let gitRepo: string | null = null;
  let gitBranch: string | null = null;

  try {
    gitRepo = execSync('git config --get remote.origin.url', {
      cwd,
      timeout: 3000,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
      .toString()
      .trim() || null;
  } catch {
    // Not a git repo or no remote
  }

  try {
    gitBranch = execSync('git rev-parse --abbrev-ref HEAD', {
      cwd,
      timeout: 3000,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
      .toString()
      .trim() || null;
  } catch {
    // Not a git repo
  }

  return { gitRepo, gitBranch };
}

/**
 * SHA-256 hash of text.
 */
export function hashText(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

/**
 * Safe exit: always exit 0 so we never break Claude Code.
 * On any error, still exits 0.
 */
export function safeExit(code: number = 0): never {
  try {
    process.exit(0);
  } catch {
    process.exit(0);
  }
}

/**
 * Route a hook event to the correct handler.
 * Called from bin/evalai.js when `evalai hook <event>` runs.
 * The payload already has stdin parsed and event type set.
 */
export async function handleHookEvent(payload: Record<string, unknown>): Promise<void> {
  const event = String(payload.type || '');

  // Dynamically import handlers to keep startup fast
  switch (event) {
    case 'session-start':
    case 'SessionStart': {
      const { handleSessionStart } = await import('./session-start.js');
      // Re-inject payload into stdin is not needed — handler reads from payload
      // We need to adapt: set process.env with payload data and call handler
      await handleSessionStartWithPayload(payload);
      break;
    }
    case 'prompt-submit':
    case 'UserPromptSubmit': {
      await handlePromptSubmitWithPayload(payload);
      break;
    }
    case 'pre-tool':
    case 'PreToolUse': {
      await handlePreToolWithPayload(payload);
      break;
    }
    case 'post-tool':
    case 'PostToolUse': {
      await handlePostToolWithPayload(payload);
      break;
    }
    case 'stop':
    case 'Stop': {
      await handleStopWithPayload(payload);
      break;
    }
    case 'session-end':
    case 'SessionEnd': {
      await handleSessionEndWithPayload(payload);
      break;
    }
    default:
      // Unknown event — silently ignore
      break;
  }
}

// Payload-based handlers that bypass stdin reading
// (since bin/evalai.js already parsed stdin)

async function handleSessionStartWithPayload(payload: Record<string, unknown>): Promise<void> {
  try {
    const { initDb, sessions } = await import('evaluateai-core');
    const db = initDb();
    const { getGitInfo } = await import('./handler.js');
    const cwd = String(payload.cwd || process.cwd());
    const { gitRepo, gitBranch } = getGitInfo(cwd);

    db.insert(sessions).values({
      id: String(payload.session_id || `session-${Date.now()}`),
      tool: 'claude-code',
      integration: 'hooks',
      projectDir: cwd,
      gitRepo,
      gitBranch,
      model: payload.model ? String(payload.model) : null,
      startedAt: payload.timestamp ? String(payload.timestamp) : new Date().toISOString(),
      totalTurns: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCostUsd: 0,
      totalToolCalls: 0,
      filesChanged: 0,
    }).run();
  } catch {
    // Never fail
  }
}

async function handlePromptSubmitWithPayload(payload: Record<string, unknown>): Promise<void> {
  try {
    const { initDb, sessions, turns, scoreHeuristic, estimateTokens, scoreLLMAndUpdate } = await import('evaluateai-core');
    const { hashText } = await import('./handler.js');
    const { ulid } = await import('ulid');
    const { eq, sql, desc } = await import('drizzle-orm');

    const db = initDb();
    const sessionId = String(payload.session_id || '');
    const promptText = String(payload.prompt || '');
    const cwd = String(payload.cwd || process.cwd());

    if (!sessionId || !promptText) return;

    // Get turn count
    const session = db.select().from(sessions).where(eq(sessions.id, sessionId)).get();
    const turnNumber = (session?.totalTurns ?? 0) + 1;

    // Score
    const promptHash = hashText(promptText);
    const tokenEst = estimateTokens(promptText);

    // Check retry
    const priorHashes = db.select({ hash: turns.promptHash })
      .from(turns)
      .where(eq(turns.sessionId, sessionId))
      .all()
      .map(r => r.hash);
    const wasRetry = priorHashes.includes(promptHash);

    // Get prior prompts for retry detection in heuristic
    const priorPrompts = db.select({ text: turns.promptText })
      .from(turns)
      .where(eq(turns.sessionId, sessionId))
      .all()
      .map(r => r.text)
      .filter((t): t is string => t !== null);

    const heuristic = scoreHeuristic(promptText, priorPrompts);

    const turnId = ulid();
    db.insert(turns).values({
      id: turnId,
      sessionId,
      turnNumber,
      promptText,
      promptHash,
      promptTokensEst: tokenEst,
      heuristicScore: heuristic.score,
      antiPatterns: JSON.stringify(heuristic.antiPatterns.map(a => a.id)),
      wasRetry,
      createdAt: new Date().toISOString(),
    }).run();

    // Update session
    db.update(sessions)
      .set({
        totalTurns: sql`${sessions.totalTurns} + 1`,
        totalInputTokens: sql`${sessions.totalInputTokens} + ${tokenEst}`,
      })
      .where(eq(sessions.id, sessionId))
      .run();

    // Show suggestion if score is low
    const configRow = db.select().from((await import('evaluateai-core')).config)
      .where(eq((await import('evaluateai-core')).config.key, 'threshold')).get();
    const threshold = parseInt(configRow?.value ?? '50', 10);

    if (heuristic.score < threshold && heuristic.quickTip) {
      console.error(`[EvaluateAI] Score: ${heuristic.score}/100`);
      console.error(`Tip: ${heuristic.quickTip}`);
    }

    // Fire-and-forget LLM scoring
    scoreLLMAndUpdate(turnId, promptText, { projectDir: cwd }).catch(() => {});
  } catch {
    // Never fail
  }
}

async function handlePreToolWithPayload(payload: Record<string, unknown>): Promise<void> {
  try {
    const { initDb, sessions, toolEvents } = await import('evaluateai-core');
    const { ulid } = await import('ulid');
    const { eq, sql } = await import('drizzle-orm');

    const db = initDb();
    const sessionId = String(payload.session_id || '');
    if (!sessionId) return;

    db.insert(toolEvents).values({
      id: ulid(),
      sessionId,
      toolName: String(payload.tool_name || 'unknown'),
      toolInputSummary: payload.tool_input ? String(payload.tool_input).substring(0, 200) : null,
      createdAt: new Date().toISOString(),
    }).run();

    db.update(sessions)
      .set({ totalToolCalls: sql`${sessions.totalToolCalls} + 1` })
      .where(eq(sessions.id, sessionId))
      .run();
  } catch {
    // Never fail
  }
}

async function handlePostToolWithPayload(payload: Record<string, unknown>): Promise<void> {
  try {
    const { initDb, sessions, toolEvents } = await import('evaluateai-core');
    const { eq, desc, sql } = await import('drizzle-orm');

    const db = initDb();
    const sessionId = String(payload.session_id || '');
    const toolName = String(payload.tool_name || '');
    if (!sessionId) return;

    // Find most recent matching tool event
    const recent = db.select()
      .from(toolEvents)
      .where(eq(toolEvents.sessionId, sessionId))
      .orderBy(desc(toolEvents.createdAt))
      .limit(1)
      .get();

    if (recent) {
      db.update(toolEvents)
        .set({
          success: payload.success === true,
          executionMs: typeof payload.execution_ms === 'number' ? payload.execution_ms : null,
        })
        .where(eq(toolEvents.id, recent.id))
        .run();
    }

    // Track file changes
    if ((toolName === 'Edit' || toolName === 'Write') && payload.success === true) {
      db.update(sessions)
        .set({ filesChanged: sql`${sessions.filesChanged} + 1` })
        .where(eq(sessions.id, sessionId))
        .run();
    }
  } catch {
    // Never fail
  }
}

async function handleStopWithPayload(payload: Record<string, unknown>): Promise<void> {
  try {
    const { initDb, turns, sessions, getLatestResponse } = await import('evaluateai-core');
    const { eq, desc, sql } = await import('drizzle-orm');

    const db = initDb();
    const sessionId = String(payload.session_id || '');
    if (!sessionId) return;

    const latestTurn = db.select()
      .from(turns)
      .where(eq(turns.sessionId, sessionId))
      .orderBy(desc(turns.turnNumber))
      .limit(1)
      .get();

    if (!latestTurn) return;

    // Try to read EXACT data from transcript file
    const transcriptPath = payload.transcript_path ? String(payload.transcript_path) : null;
    let responseTokens: number | null = null;
    let inputTokens: number | null = null;
    let cacheReadTokens = 0;
    let cacheWriteTokens = 0;
    let turnCost = 0;
    let model = 'claude-sonnet-4-6';

    if (transcriptPath) {
      const response = getLatestResponse(transcriptPath);
      if (response) {
        responseTokens = response.usage.outputTokens;
        inputTokens = response.usage.inputTokens;
        cacheReadTokens = response.usage.cacheReadTokens;
        cacheWriteTokens = response.usage.cacheWriteTokens;
        model = response.usage.model;

        // Calculate EXACT cost from real token counts
        const pricing: Record<string, { i: number; o: number; cr: number; cw: number }> = {
          'claude-opus-4-6': { i: 15, o: 75, cr: 1.5, cw: 18.75 },
          'claude-sonnet-4-6': { i: 3, o: 15, cr: 0.3, cw: 3.75 },
          'claude-haiku-4-5-20251001': { i: 0.8, o: 4, cr: 0.08, cw: 1 },
        };
        const p = pricing[model] ?? pricing['claude-sonnet-4-6'];
        turnCost = (
          inputTokens * p.i +
          responseTokens * p.o +
          cacheReadTokens * p.cr +
          cacheWriteTokens * p.cw
        ) / 1_000_000;
      }
    }

    // Fallback to payload data if transcript not available
    if (responseTokens === null) {
      responseTokens = typeof payload.response_tokens === 'number' ? payload.response_tokens : null;
      if (responseTokens) {
        const session = db.select().from(sessions).where(eq(sessions.id, sessionId)).get();
        model = session?.model || 'claude-sonnet-4-6';
        const { calculateCost } = await import('evaluateai-core');
        turnCost = calculateCost(latestTurn.promptTokensEst || 0, responseTokens, model);
      }
    }

    const latencyMs = typeof payload.latency_ms === 'number' ? payload.latency_ms : null;

    // Update turn with exact data
    db.update(turns)
      .set({
        responseTokensEst: responseTokens,
        latencyMs,
      })
      .where(eq(turns.id, latestTurn.id))
      .run();

    // Update session with exact cost
    if (responseTokens) {
      db.update(sessions)
        .set({
          model: model,
          totalOutputTokens: sql`${sessions.totalOutputTokens} + ${responseTokens}`,
          totalCostUsd: sql`${sessions.totalCostUsd} + ${turnCost}`,
        })
        .where(eq(sessions.id, sessionId))
        .run();
    }

    // Fire-and-forget: sync to Supabase
    const { syncToSupabase, isSupabaseConfigured } = await import('evaluateai-core');
    if (isSupabaseConfigured()) {
      syncToSupabase().catch(() => {});
    }
  } catch {
    // Never fail
  }
}

async function handleSessionEndWithPayload(payload: Record<string, unknown>): Promise<void> {
  try {
    const { initDb, sessions, turns, calculateEfficiency, analyzeSession, getSessionSummary } = await import('evaluateai-core');
    const { eq } = await import('drizzle-orm');

    const db = initDb();
    const sessionId = String(payload.session_id || '');
    if (!sessionId) return;

    const now = payload.timestamp ? String(payload.timestamp) : new Date().toISOString();

    // Get EXACT session totals from transcript (if available)
    const transcriptPath = payload.transcript_path ? String(payload.transcript_path) : null;
    if (transcriptPath) {
      const summary = getSessionSummary(transcriptPath);
      if (summary) {
        // Override estimated data with exact transcript data
        db.update(sessions)
          .set({
            model: summary.model,
            totalInputTokens: summary.totalInputTokens,
            totalOutputTokens: summary.totalOutputTokens,
            totalCostUsd: summary.totalCostUsd,
          })
          .where(eq(sessions.id, sessionId))
          .run();
      }
    }

    // Re-read session with updated data
    const session = db.select().from(sessions).where(eq(sessions.id, sessionId)).get();
    if (!session) return;

    const sessionTurns = db.select().from(turns).where(eq(turns.sessionId, sessionId)).all();

    // Calculate scores
    const scores = sessionTurns
      .map(t => t.heuristicScore ?? t.llmScore)
      .filter((s): s is number => s !== null);
    const avgScore = scores.length > 0
      ? scores.reduce((a, b) => a + b, 0) / scores.length
      : null;

    // Calculate efficiency
    const efficiency = calculateEfficiency({
      session: session as any,
      turns: sessionTurns as any[],
    });

    db.update(sessions)
      .set({
        endedAt: now,
        avgPromptScore: avgScore ? Math.round(avgScore * 10) / 10 : null,
        efficiencyScore: efficiency.score,
        tokenWasteRatio: efficiency.tokenWasteRatio,
        contextPeakPct: efficiency.contextPeakPct,
      })
      .where(eq(sessions.id, sessionId))
      .run();

    // Fire-and-forget: analyze session with LLM
    analyzeSession(session as any, sessionTurns as any[]).catch(() => {});

    // Fire-and-forget: auto-sync to Supabase
    const { syncToSupabase, isSupabaseConfigured } = await import('evaluateai-core');
    if (isSupabaseConfigured()) {
      syncToSupabase().catch(() => {});
    }
  } catch {
    // Never fail
  }
}
