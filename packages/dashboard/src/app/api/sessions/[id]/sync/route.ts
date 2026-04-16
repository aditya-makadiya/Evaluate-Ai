import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase-server';
import { normalizeModelId, calculateCost } from '@/lib/pricing';
import { summarizeAndMatchSession } from '@/lib/services/session-summarizer';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { homedir } from 'node:os';

// --------------- Helpers ---------------

function findTranscriptFile(sessionId: string): string | null {
  const claudeProjectsDir = join(homedir(), '.claude', 'projects');
  if (!existsSync(claudeProjectsDir)) return null;

  try {
    for (const dir of readdirSync(claudeProjectsDir, { withFileTypes: true })) {
      if (!dir.isDirectory()) continue;
      const candidate = join(claudeProjectsDir, dir.name, `${sessionId}.jsonl`);
      if (existsSync(candidate)) return candidate;
    }
  } catch { /* ignore */ }

  try {
    const result = execSync(
      `find "${claudeProjectsDir}" -name "${sessionId}.jsonl" -maxdepth 3 2>/dev/null | head -1`,
      { encoding: 'utf-8', timeout: 2000 }
    ).trim();
    if (result && existsSync(result)) return result;
  } catch { /* ignore */ }

  return null;
}

function hashText(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

function extractUserPromptText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    for (const block of content) {
      if (block?.type === 'text' && typeof block.text === 'string') return block.text;
    }
  }
  return '';
}

interface ParsedEntry {
  role: 'user' | 'assistant';
  model?: string;
  content?: Array<{ type: string; text?: string; name?: string; input?: Record<string, unknown> }>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
}

// --------------- Route Handler ---------------

/**
 * POST /api/sessions/[id]/sync
 *
 * Re-parses the local transcript file and updates session + turn data in Supabase.
 * Fixes: missing metrics for stale sessions, per-turn response data gaps,
 * and session-level aggregates that were never finalized.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const ctx = await getAuthContext();
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = getSupabaseAdmin();

    // Fetch session
    let sessionQuery = supabase.from('ai_sessions').select('*').eq('id', id);
    if (ctx.teamId) sessionQuery = sessionQuery.eq('team_id', ctx.teamId);
    const { data: session, error: sessionErr } = await sessionQuery.single();

    if (sessionErr || !session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    // RBAC
    if (ctx.role === 'developer' && session.developer_id !== ctx.memberId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Find transcript file
    const transcriptPath = findTranscriptFile(id);
    if (!transcriptPath) {
      return NextResponse.json({
        error: 'Transcript file not found. Sync only works when the dashboard runs on the same machine as the CLI.',
      }, { status: 404 });
    }

    // Parse transcript
    const content = readFileSync(transcriptPath, 'utf-8');
    const lines = content.trim().split('\n');
    const entries: ParsedEntry[] = [];
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);
        const msg = parsed.message ?? parsed;
        if (msg.role) entries.push(msg);
      } catch { continue; }
    }

    // Walk transcript to compute per-turn and session-level data
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalCacheRead = 0;
    let totalCacheWrite = 0;
    let totalToolCalls = 0;
    const toolCounts: Record<string, number> = {};
    let model = session.model || 'unknown';
    let userTurnCount = 0;
    // Per-turn data keyed by prompt_hash
    const turnDataByHash: Map<string, {
      responseTokens: number;
      toolCalls: string[];
      costUsd: number;
    }> = new Map();

    let i = 0;
    while (i < entries.length) {
      const entry = entries[i];
      if (entry.role === 'user') {
        const c = entry.content;
        const isToolResult = Array.isArray(c) && c.length > 0 && c[0]?.type === 'tool_result';
        if (!isToolResult) {
          userTurnCount++;
          const promptText = extractUserPromptText(c);
          const hash = hashText(promptText);

          let turnInput = 0, turnOutput = 0, turnCacheRead = 0, turnCacheWrite = 0;
          const turnTools: string[] = [];

          let j = i + 1;
          while (j < entries.length) {
            const e = entries[j];
            if (e.role === 'user') {
              const uc = e.content;
              const isTool = Array.isArray(uc) && uc.length > 0 && uc[0]?.type === 'tool_result';
              if (!isTool) break;
            }
            if (e.role === 'assistant') {
              if (e.model) model = normalizeModelId(e.model);
              if (e.usage) {
                turnInput += e.usage.input_tokens ?? 0;
                turnOutput += e.usage.output_tokens ?? 0;
                turnCacheRead += e.usage.cache_read_input_tokens ?? 0;
                turnCacheWrite += e.usage.cache_creation_input_tokens ?? 0;
              }
              if (Array.isArray(e.content)) {
                for (const block of e.content) {
                  if (block.type === 'tool_use' && block.name) {
                    turnTools.push(block.name);
                    toolCounts[block.name] = (toolCounts[block.name] ?? 0) + 1;
                    totalToolCalls++;
                  }
                }
              }
            }
            j++;
          }

          totalInputTokens += turnInput;
          totalOutputTokens += turnOutput;
          totalCacheRead += turnCacheRead;
          totalCacheWrite += turnCacheWrite;

          const turnCost = calculateCost(turnInput, turnOutput, model, turnCacheRead, turnCacheWrite);
          turnDataByHash.set(hash, {
            responseTokens: turnOutput,
            toolCalls: [...new Set(turnTools)],
            costUsd: turnCost,
          });
        }
      }
      i++;
    }

    const totalCostUsd = calculateCost(totalInputTokens, totalOutputTokens, model, totalCacheRead, totalCacheWrite);

    // Determine if this is a stale session (no ended_at, inactive > 30 min)
    const isStale = !session.ended_at;
    const now = new Date().toISOString();

    // Update session-level metrics
    const sessionUpdate: Record<string, unknown> = {
      model: model !== 'unknown' ? model : session.model,
      total_input_tokens: totalInputTokens,
      total_output_tokens: totalOutputTokens,
      total_cost_usd: totalCostUsd,
      total_turns: userTurnCount,
      total_tool_calls: totalToolCalls,
      tool_usage_summary: toolCounts,
      last_activity_at: now,
    };

    // Close stale sessions
    if (isStale) {
      sessionUpdate.ended_at = session.last_activity_at || now;
    }

    // Compute avg_prompt_score from turns
    const { data: turnScores } = await supabase
      .from('ai_turns')
      .select('heuristic_score')
      .eq('session_id', id)
      .not('heuristic_score', 'is', null);

    if (turnScores && turnScores.length > 0) {
      const avg = turnScores.reduce((sum: number, t: { heuristic_score: number }) => sum + t.heuristic_score, 0) / turnScores.length;
      sessionUpdate.avg_prompt_score = Math.round(avg * 10) / 10;
    }

    // Apply session update
    const { error: updateErr } = await supabase
      .from('ai_sessions')
      .update(sessionUpdate)
      .eq('id', id);

    if (updateErr) {
      console.error('Session sync update error:', updateErr);
      return NextResponse.json({ error: 'Failed to update session' }, { status: 500 });
    }

    // Update per-turn response data (response_tokens_est, tool_calls) where missing
    const { data: dbTurns } = await supabase
      .from('ai_turns')
      .select('id, prompt_hash, response_tokens_est, tool_calls')
      .eq('session_id', id)
      .order('created_at', { ascending: true });

    let turnsUpdated = 0;
    if (dbTurns) {
      for (const dbTurn of dbTurns) {
        const hash = dbTurn.prompt_hash as string | null;
        if (!hash) continue;

        const transcriptTurn = turnDataByHash.get(hash);
        if (!transcriptTurn) continue;

        const needsUpdate =
          dbTurn.response_tokens_est == null ||
          !dbTurn.tool_calls ||
          (Array.isArray(dbTurn.tool_calls) && dbTurn.tool_calls.length === 0);

        if (needsUpdate) {
          const turnUpdate: Record<string, unknown> = {};
          if (dbTurn.response_tokens_est == null) {
            turnUpdate.response_tokens_est = transcriptTurn.responseTokens;
          }
          if (!dbTurn.tool_calls || (Array.isArray(dbTurn.tool_calls) && dbTurn.tool_calls.length === 0)) {
            turnUpdate.tool_calls = transcriptTurn.toolCalls;
          }

          if (Object.keys(turnUpdate).length > 0) {
            await supabase
              .from('ai_turns')
              .update(turnUpdate)
              .eq('id', dbTurn.id);
            turnsUpdated++;
          }
        }
      }
    }

    // Generate work summary if missing (catches sessions where SessionEnd hook
    // failed — Ctrl+C, crash, network error, or stale-closed sessions)
    let summaryGenerated = false;
    if (!session.work_summary && session.developer_id && ctx.teamId && userTurnCount > 0) {
      try {
        await summarizeAndMatchSession(id, ctx.teamId, session.developer_id);
        summaryGenerated = true;
      } catch {
        // Non-critical — sync still succeeds without summary
      }
    }

    return NextResponse.json({
      success: true,
      synced: {
        totalInputTokens,
        totalOutputTokens,
        totalCostUsd: Math.round(totalCostUsd * 1000000) / 1000000,
        totalToolCalls,
        toolUsageSummary: toolCounts,
        model,
        userTurns: userTurnCount,
        turnsUpdated,
        sessionClosed: isStale,
        avgPromptScore: sessionUpdate.avg_prompt_score ?? null,
        summaryGenerated,
      },
    });
  } catch (err) {
    console.error('Session sync error:', err);
    return NextResponse.json({ error: 'Failed to sync session' }, { status: 500 });
  }
}
