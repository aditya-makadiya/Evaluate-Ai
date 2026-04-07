// ============================================================
// Shared handler utilities for Claude Code hooks
// All data writes go directly to Supabase — no local SQLite.
// ============================================================

import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// ── Supabase client ──────────────────────────────────────────

function getSupabase(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

// ── Team context (cached per process) ────────────────────────

let _teamId: string | null = null;
let _developerId: string | null = null;
let _teamContextResolved = false;

async function getTeamContext(supabase: SupabaseClient): Promise<{ teamId: string | null; developerId: string | null }> {
  if (_teamContextResolved) return { teamId: _teamId, developerId: _developerId };
  _teamContextResolved = true;

  _teamId = process.env.EVALUATEAI_TEAM_ID || null;
  if (!_teamId) return { teamId: null, developerId: null };

  // Try to find developer by git email
  try {
    const email = execSync('git config user.email', { encoding: 'utf-8', timeout: 2000 }).trim();
    if (email) {
      const { data } = await supabase
        .from('team_members')
        .select('id')
        .eq('team_id', _teamId)
        .eq('email', email)
        .single();
      _developerId = data?.id || null;
    }

    // Fallback: try by git username
    if (!_developerId) {
      const username = execSync('git config user.name', { encoding: 'utf-8', timeout: 2000 }).trim();
      if (username) {
        const { data } = await supabase
          .from('team_members')
          .select('id')
          .eq('team_id', _teamId)
          .eq('github_username', username)
          .single();
        _developerId = data?.id || null;
      }
    }
  } catch {
    // Graceful fallback — team context is optional
  }

  return { teamId: _teamId, developerId: _developerId };
}

// ── Shared utilities ─────────────────────────────────────────

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

// ── Hook event router ────────────────────────────────────────

/**
 * Route a hook event to the correct handler.
 * Called from bin/evalai.js when `evalai hook <event>` runs.
 * The payload already has stdin parsed and event type set.
 */
export async function handleHookEvent(payload: Record<string, unknown>): Promise<void> {
  const event = String(payload.type || '');

  switch (event) {
    case 'session-start':
    case 'SessionStart': {
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

// ── Payload-based handlers (Supabase) ────────────────────────

async function handleSessionStartWithPayload(payload: Record<string, unknown>): Promise<void> {
  try {
    const supabase = getSupabase();
    if (!supabase) return;

    const { teamId, developerId } = await getTeamContext(supabase);

    const cwd = String(payload.cwd || process.cwd());
    const { gitRepo, gitBranch } = getGitInfo(cwd);

    const sessionId = String(payload.session_id || `session-${Date.now()}`);
    const now = payload.timestamp ? String(payload.timestamp) : new Date().toISOString();

    await supabase.from('ai_sessions').upsert({
      id: sessionId,
      tool: 'claude-code',
      model: payload.model ? String(payload.model) : null,
      project_dir: cwd,
      git_repo: gitRepo,
      git_branch: gitBranch,
      started_at: now,
      total_turns: 0,
      total_input_tokens: 0,
      total_output_tokens: 0,
      total_cost_usd: 0,
      total_tool_calls: 0,
      files_changed: 0,
      ...(teamId ? { team_id: teamId } : {}),
      ...(developerId ? { developer_id: developerId } : {}),
    }, { onConflict: 'id' });

    // Insert activity timeline event (fire-and-forget)
    supabase.from('activity_timeline').insert({
      event_type: 'ai_session_start',
      title: 'AI session started',
      description: `Claude Code session in ${cwd.split('/').pop() || cwd}`,
      metadata: { session_id: sessionId, project_dir: cwd, git_branch: gitBranch },
      source_id: sessionId,
      source_table: 'ai_sessions',
      is_ai_assisted: true,
      occurred_at: now,
      ...(teamId ? { team_id: teamId } : {}),
      ...(developerId ? { developer_id: developerId } : {}),
    }).then(() => {}, () => {});
  } catch {
    // Never fail
  }
}

async function handlePromptSubmitWithPayload(payload: Record<string, unknown>): Promise<void> {
  try {
    const supabase = getSupabase();
    if (!supabase) return;

    const { teamId, developerId } = await getTeamContext(supabase);

    const { scoreHeuristic, estimateTokens, scoreLLMAndUpdate } = await import('evaluateai-core');
    const { ulid } = await import('ulid');

    const sessionId = String(payload.session_id || '');
    const promptText = String(payload.prompt || '');
    const cwd = String(payload.cwd || process.cwd());

    if (!sessionId || !promptText) return;

    // Get current session to determine turn count
    const { data: session } = await supabase
      .from('ai_sessions')
      .select('total_turns')
      .eq('id', sessionId)
      .single();

    const turnNumber = (session?.total_turns ?? 0) + 1;

    // Score
    const promptHash = hashText(promptText);
    const tokenEst = estimateTokens(promptText);

    // Check for retries by looking at prior prompt hashes
    const { data: priorTurns } = await supabase
      .from('ai_turns')
      .select('prompt_hash, prompt_text')
      .eq('session_id', sessionId);

    const priorHashes = (priorTurns ?? []).map(r => r.prompt_hash);
    const wasRetry = priorHashes.includes(promptHash);

    const priorPrompts = (priorTurns ?? [])
      .map(r => r.prompt_text)
      .filter((t): t is string => t !== null);

    const heuristic = scoreHeuristic(promptText, priorPrompts);

    const turnId = ulid();
    await supabase.from('ai_turns').insert({
      id: turnId,
      session_id: sessionId,
      turn_number: turnNumber,
      prompt_text: promptText,
      prompt_hash: promptHash,
      prompt_tokens_est: tokenEst,
      heuristic_score: heuristic.score,
      anti_patterns: JSON.stringify(heuristic.antiPatterns.map(a => a.id)),
      intent: heuristic.intent ?? null,
      was_retry: wasRetry,
      created_at: new Date().toISOString(),
      ...(teamId ? { team_id: teamId } : {}),
      ...(developerId ? { developer_id: developerId } : {}),
    });

    // Update session turn count and tokens
    await supabase
      .from('ai_sessions')
      .update({
        total_turns: turnNumber,
        total_input_tokens: (session?.total_turns != null)
          ? undefined  // will use RPC below
          : tokenEst,
      })
      .eq('id', sessionId);

    // Increment total_input_tokens via RPC-style update
    await supabase.rpc('increment_session_input_tokens', {
      sid: sessionId,
      tokens: tokenEst,
    }).then(() => {}, async () => {
      // Fallback: re-read and set if RPC not available
      try {
        const { data: s } = await supabase!
          .from('ai_sessions')
          .select('total_input_tokens, total_turns')
          .eq('id', sessionId)
          .single();
        if (s) {
          await supabase!.from('ai_sessions').update({
            total_turns: turnNumber,
            total_input_tokens: (s.total_input_tokens ?? 0) + tokenEst,
          }).eq('id', sessionId);
        }
      } catch {
        // ignore
      }
    });

    // Insert activity timeline event
    supabase.from('activity_timeline').insert({
      event_type: 'ai_prompt',
      title: 'AI prompt submitted',
      description: promptText.length > 100 ? promptText.slice(0, 97) + '...' : promptText,
      metadata: { session_id: sessionId, turn_id: turnId, score: heuristic.score, intent: heuristic.intent },
      source_id: turnId,
      source_table: 'ai_turns',
      is_ai_assisted: true,
      occurred_at: new Date().toISOString(),
      ...(teamId ? { team_id: teamId } : {}),
      ...(developerId ? { developer_id: developerId } : {}),
    }).then(() => {}, () => {});

    // Show suggestion if score is low
    const { data: configRow } = await supabase
      .from('config')
      .select('value')
      .eq('key', 'threshold')
      .maybeSingle();

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
    const supabase = getSupabase();
    if (!supabase) return;

    const { ulid } = await import('ulid');

    const sessionId = String(payload.session_id || '');
    if (!sessionId) return;

    const eventId = ulid();
    await supabase.from('ai_tool_events').insert({
      id: eventId,
      session_id: sessionId,
      tool_name: String(payload.tool_name || 'unknown'),
      tool_input_summary: payload.tool_input ? String(payload.tool_input).substring(0, 200) : null,
      created_at: new Date().toISOString(),
    });

    // Increment tool call count — read-then-write fallback
    const { data: s } = await supabase
      .from('ai_sessions')
      .select('total_tool_calls')
      .eq('id', sessionId)
      .single();

    if (s) {
      await supabase.from('ai_sessions').update({
        total_tool_calls: (s.total_tool_calls ?? 0) + 1,
      }).eq('id', sessionId);
    }
  } catch {
    // Never fail
  }
}

async function handlePostToolWithPayload(payload: Record<string, unknown>): Promise<void> {
  try {
    const supabase = getSupabase();
    if (!supabase) return;

    const sessionId = String(payload.session_id || '');
    const toolName = String(payload.tool_name || '');
    if (!sessionId) return;

    // Find most recent tool event for this session
    const { data: recent } = await supabase
      .from('ai_tool_events')
      .select('id')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (recent) {
      await supabase.from('ai_tool_events').update({
        success: payload.success === true,
        execution_ms: typeof payload.execution_ms === 'number' ? payload.execution_ms : null,
      }).eq('id', recent.id);
    }

    // Track file changes
    if ((toolName === 'Edit' || toolName === 'Write') && payload.success === true) {
      const { data: s } = await supabase
        .from('ai_sessions')
        .select('files_changed')
        .eq('id', sessionId)
        .single();

      if (s) {
        await supabase.from('ai_sessions').update({
          files_changed: (s.files_changed ?? 0) + 1,
        }).eq('id', sessionId);
      }
    }
  } catch {
    // Never fail
  }
}

async function handleStopWithPayload(payload: Record<string, unknown>): Promise<void> {
  try {
    const supabase = getSupabase();
    if (!supabase) return;

    const { getLatestResponse, calculateCost } = await import('evaluateai-core');

    const sessionId = String(payload.session_id || '');
    if (!sessionId) return;

    // Get the latest turn for this session
    const { data: latestTurn } = await supabase
      .from('ai_turns')
      .select('id, prompt_tokens_est')
      .eq('session_id', sessionId)
      .order('turn_number', { ascending: false })
      .limit(1)
      .single();

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
        const { data: sess } = await supabase
          .from('ai_sessions')
          .select('model')
          .eq('id', sessionId)
          .single();
        model = sess?.model || 'claude-sonnet-4-6';
        turnCost = calculateCost(latestTurn.prompt_tokens_est || 0, responseTokens, model);
      }
    }

    const latencyMs = typeof payload.latency_ms === 'number' ? payload.latency_ms : null;

    // Update turn with exact data
    await supabase.from('ai_turns').update({
      response_tokens_est: responseTokens,
      latency_ms: latencyMs,
    }).eq('id', latestTurn.id);

    // Update session with exact cost
    if (responseTokens) {
      const { data: s } = await supabase
        .from('ai_sessions')
        .select('total_output_tokens, total_cost_usd')
        .eq('id', sessionId)
        .single();

      if (s) {
        await supabase.from('ai_sessions').update({
          model,
          total_output_tokens: (s.total_output_tokens ?? 0) + responseTokens,
          total_cost_usd: (s.total_cost_usd ?? 0) + turnCost,
        }).eq('id', sessionId);
      }
    }
  } catch {
    // Never fail
  }
}

async function handleSessionEndWithPayload(payload: Record<string, unknown>): Promise<void> {
  try {
    const supabase = getSupabase();
    if (!supabase) return;

    const { teamId, developerId } = await getTeamContext(supabase);

    const { calculateEfficiency, getSessionSummary, analyzeSession } = await import('evaluateai-core');

    const sessionId = String(payload.session_id || '');
    if (!sessionId) return;

    const now = payload.timestamp ? String(payload.timestamp) : new Date().toISOString();

    // Get EXACT session totals from transcript (if available)
    const transcriptPath = payload.transcript_path ? String(payload.transcript_path) : null;
    if (transcriptPath) {
      const summary = getSessionSummary(transcriptPath);
      if (summary) {
        // Override estimated data with exact transcript data
        await supabase.from('ai_sessions').update({
          model: summary.model,
          total_input_tokens: summary.totalInputTokens,
          total_output_tokens: summary.totalOutputTokens,
          total_cost_usd: summary.totalCostUsd,
        }).eq('id', sessionId);
      }
    }

    // Re-read session with updated data
    const { data: session } = await supabase
      .from('ai_sessions')
      .select('*')
      .eq('id', sessionId)
      .single();

    if (!session) return;

    // Get all turns for scoring
    const { data: sessionTurns } = await supabase
      .from('ai_turns')
      .select('*')
      .eq('session_id', sessionId)
      .order('turn_number', { ascending: true });

    const turnsArr = sessionTurns ?? [];

    // Calculate average scores
    const scores = turnsArr
      .map(t => t.heuristic_score ?? t.llm_score)
      .filter((s): s is number => s !== null);
    const avgScore = scores.length > 0
      ? scores.reduce((a, b) => a + b, 0) / scores.length
      : null;

    // Calculate efficiency — map Supabase row to the shape expected by calculateEfficiency
    const sessionForCalc = {
      id: session.id,
      tool: session.tool,
      integration: 'hooks' as const,
      projectDir: session.project_dir,
      gitRepo: session.git_repo,
      gitBranch: session.git_branch,
      model: session.model,
      startedAt: session.started_at,
      endedAt: session.ended_at,
      totalTurns: session.total_turns,
      totalInputTokens: session.total_input_tokens,
      totalOutputTokens: session.total_output_tokens,
      totalCostUsd: session.total_cost_usd,
      totalToolCalls: session.total_tool_calls,
      filesChanged: session.files_changed,
      avgPromptScore: session.avg_prompt_score,
      efficiencyScore: session.efficiency_score,
      tokenWasteRatio: session.token_waste_ratio,
      contextPeakPct: session.context_peak_pct,
      analysis: session.analysis ? JSON.stringify(session.analysis) : null,
      analyzedAt: session.analyzed_at,
    };

    const turnsForCalc = turnsArr.map(t => ({
      id: t.id,
      sessionId: t.session_id,
      turnNumber: t.turn_number,
      promptText: t.prompt_text,
      promptHash: t.prompt_hash,
      promptTokensEst: t.prompt_tokens_est,
      heuristicScore: t.heuristic_score,
      antiPatterns: t.anti_patterns ? (typeof t.anti_patterns === 'string' ? t.anti_patterns : JSON.stringify(t.anti_patterns)) : null,
      llmScore: t.llm_score,
      scoreBreakdown: t.score_breakdown ? (typeof t.score_breakdown === 'string' ? t.score_breakdown : JSON.stringify(t.score_breakdown)) : null,
      suggestionText: t.suggestion_text,
      suggestionAccepted: t.suggestion_accepted,
      tokensSavedEst: t.tokens_saved_est,
      responseTokensEst: t.response_tokens_est,
      toolCalls: t.tool_calls ? (typeof t.tool_calls === 'string' ? t.tool_calls : JSON.stringify(t.tool_calls)) : null,
      latencyMs: t.latency_ms,
      wasRetry: t.was_retry,
      contextUsedPct: t.context_used_pct,
      createdAt: t.created_at,
    }));

    const efficiency = calculateEfficiency({
      session: sessionForCalc as any,
      turns: turnsForCalc as any[],
    });

    await supabase.from('ai_sessions').update({
      ended_at: now,
      avg_prompt_score: avgScore ? Math.round(avgScore * 10) / 10 : null,
      efficiency_score: efficiency.score,
      token_waste_ratio: efficiency.tokenWasteRatio,
      context_peak_pct: efficiency.contextPeakPct,
    }).eq('id', sessionId);

    // Insert activity timeline event for session end
    supabase.from('activity_timeline').insert({
      event_type: 'ai_session_end',
      title: 'AI session ended',
      description: `${turnsArr.length} turns, score ${avgScore ? Math.round(avgScore) : '--'}`,
      metadata: {
        session_id: sessionId,
        total_turns: session.total_turns,
        total_cost_usd: session.total_cost_usd,
        avg_score: avgScore,
        efficiency_score: efficiency.score,
      },
      source_id: sessionId,
      source_table: 'ai_sessions',
      is_ai_assisted: true,
      occurred_at: now,
      ...(teamId ? { team_id: teamId } : {}),
      ...(developerId ? { developer_id: developerId } : {}),
    }).then(() => {}, () => {});

    // Fire-and-forget: analyze session with LLM
    analyzeSession(sessionForCalc as any, turnsForCalc as any[]).catch(() => {});
  } catch {
    // Never fail
  }
}
