import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase-server';
import { normalizeModelId, calculateCost } from '@/lib/pricing';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { homedir } from 'node:os';

/**
 * SHA-256 hash — matches the CLI's hashText() for prompt_hash comparison.
 */
function hashPromptText(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

/**
 * Extract user prompt text from transcript entry content.
 */
function extractUserPromptText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    for (const block of content) {
      if (block?.type === 'text' && typeof block.text === 'string') return block.text;
    }
  }
  return '';
}

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
  return null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const ctx = await getAuthContext();
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const teamId = ctx.teamId;
    const supabase = getSupabaseAdmin();

    let sessionQuery = supabase
      .from('ai_sessions')
      .select('*')
      .eq('id', id);
    if (teamId) sessionQuery = sessionQuery.eq('team_id', teamId);
    const { data: session, error: sessionErr } = await sessionQuery.single();

    if (sessionErr || !session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    // RBAC: Developers can only view their own sessions
    if (ctx.role === 'developer' && session.developer_id !== ctx.memberId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Fetch developer name for back-navigation breadcrumb
    let developerName: string | null = null;
    if (session.developer_id) {
      const { data: memberRow } = await supabase
        .from('team_members')
        .select('name')
        .eq('id', session.developer_id)
        .single();
      developerName = memberRow?.name ?? null;
    }

    const { data: turnsData } = await supabase
      .from('ai_turns')
      .select('*')
      .eq('session_id', id)
      .order('created_at', { ascending: true });

    // Parse analysis — it's JSONB in Supabase so it may already be an object
    let parsedAnalysis = null;
    if (session.analysis != null) {
      if (typeof session.analysis === 'string') {
        try { parsedAnalysis = JSON.parse(session.analysis); } catch { parsedAnalysis = null; }
      } else {
        parsedAnalysis = session.analysis;
      }
    }

    // Fallback: if DB has no token/cost data, try local transcript file.
    // This only works when dashboard runs on the same machine as the CLI
    // (i.e. local dev). In production the CLI writes data to Supabase directly.
    let totalInputTokens = session.total_input_tokens ?? 0;
    let totalOutputTokens = session.total_output_tokens ?? 0;
    let totalCostUsd = session.total_cost_usd ?? 0;
    let sessionModel = session.model ? normalizeModelId(session.model) : null;

    // Per-turn costs parsed from the transcript (actual usage, not estimates).
    // Keyed by DB turn position (1-indexed), matched via prompt_hash to handle
    // interrupted turns that exist in transcript but not in the DB.
    const perTurnCosts: Record<number, number> = {};
    // Per-turn response data extracted from transcript (for enriching turn display)
    const perTurnResponseData: Record<number, { responseTokens: number; toolCalls: string[] }> = {};

    try {
      const transcriptPath = findTranscriptFile(id);
      if (transcriptPath) {
        const content = readFileSync(transcriptPath, 'utf-8');
        const lines = content.trim().split('\n');

        // Parse all entries
        interface TranscriptMsg {
          role: string;
          model?: string;
          content?: Array<{ type: string; text?: string }>;
          usage?: {
            input_tokens?: number;
            output_tokens?: number;
            cache_read_input_tokens?: number;
            cache_creation_input_tokens?: number;
          };
        }
        const entries: TranscriptMsg[] = [];
        for (const line of lines) {
          try {
            const parsed = JSON.parse(line);
            const msg = parsed?.message ?? parsed;
            if (msg?.role) entries.push(msg);
          } catch { continue; }
        }

        // Build a map of prompt_hash → { cost, responseTokens, toolCalls } from transcript
        const transcriptTurnData: Map<string, { cost: number; responseTokens: number; toolCalls: string[] }> = new Map();
        let model = 'unknown';
        let i = 0;
        while (i < entries.length) {
          const entry = entries[i];
          if (entry.role === 'user') {
            const c = entry.content;
            const isToolResult = Array.isArray(c) && c.length > 0 && c[0]?.type === 'tool_result';
            if (!isToolResult) {
              const promptText = extractUserPromptText(c);
              const hash = hashPromptText(promptText);

              // Collect all assistant responses for this turn
              let turnInput = 0, turnOutput = 0, turnCacheRead = 0, turnCacheWrite = 0;
              const turnToolCalls: string[] = [];
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
                      if ((block as Record<string, unknown>)?.type === 'tool_use' && (block as Record<string, unknown>)?.name) {
                        turnToolCalls.push((block as Record<string, string>).name);
                      }
                    }
                  }
                }
                j++;
              }

              const cost = calculateCost(turnInput, turnOutput, model, turnCacheRead, turnCacheWrite);
              transcriptTurnData.set(hash, {
                cost,
                responseTokens: turnOutput,
                toolCalls: [...new Set(turnToolCalls)],
              });
            }
          }
          i++;
        }

        // Map transcript data to DB turn positions via prompt_hash
        const dbTurns = turnsData ?? [];
        for (let idx = 0; idx < dbTurns.length; idx++) {
          const dbTurn = dbTurns[idx];
          const dbHash = dbTurn.prompt_hash as string | null;
          if (dbHash && transcriptTurnData.has(dbHash)) {
            const data = transcriptTurnData.get(dbHash)!;
            perTurnCosts[idx + 1] = data.cost;
            perTurnResponseData[idx + 1] = { responseTokens: data.responseTokens, toolCalls: data.toolCalls };
          }
        }

        // If DB had no cost data, compute totals from transcript
        if (totalCostUsd === 0 && totalInputTokens === 0) {
          let cacheRead = 0, cacheWrite = 0;
          for (const entry of entries) {
            if (entry.role === 'assistant' && entry.usage) {
              totalInputTokens += entry.usage.input_tokens ?? 0;
              totalOutputTokens += entry.usage.output_tokens ?? 0;
              cacheRead += entry.usage.cache_read_input_tokens ?? 0;
              cacheWrite += entry.usage.cache_creation_input_tokens ?? 0;
              if (entry.model) model = normalizeModelId(entry.model);
            }
          }
          totalCostUsd = calculateCost(totalInputTokens, totalOutputTokens, model, cacheRead, cacheWrite);
          if (!sessionModel || sessionModel === 'unknown') {
            sessionModel = model;
          }
        }
      }
    } catch { /* never fail the API */ }

    // Detect stale sessions: no ended_at and no activity for > 30 min.
    // This means the SessionEnd hook likely failed to fire (e.g. Ctrl+C).
    const lastActiveMs = session.last_activity_at
      ? new Date(session.last_activity_at).getTime()
      : (session.started_at ? new Date(session.started_at).getTime() : 0);
    const isStaleSession = !session.ended_at && lastActiveMs > 0
      && (Date.now() - lastActiveMs) > 30 * 60 * 1000;
    const effectiveEndedAt = session.ended_at ?? (isStaleSession ? (session.last_activity_at || session.started_at) : null);

    // Transform session to camelCase
    const sessionOut = {
      id: session.id,
      tool: session.tool,
      model: sessionModel || session.model,
      projectDir: session.project_dir,
      gitRepo: session.git_repo,
      gitBranch: session.git_branch,
      startedAt: session.started_at,
      endedAt: effectiveEndedAt,
      durationMin: effectiveEndedAt && session.started_at
        ? Math.round((new Date(effectiveEndedAt).getTime() - new Date(session.started_at).getTime()) / 60_000)
        : null,
      totalTurns: (turnsData ?? []).length || session.total_turns,
      totalInputTokens,
      totalOutputTokens,
      totalCostUsd,
      totalToolCalls: session.total_tool_calls,
      filesChanged: session.files_changed,
      avgPromptScore: session.avg_prompt_score,
      efficiencyScore: session.efficiency_score,
      tokenWasteRatio: session.token_waste_ratio,
      contextPeakPct: session.context_peak_pct,
      analyzedAt: session.analyzed_at,
      developerId: session.developer_id,
      developerName,
      workSummary: session.work_summary ?? null,
      workTags: session.work_tags ?? [],
      workCategory: session.work_category ?? null,
      matchedTaskId: session.matched_task_id ?? null,
    };

    // Transform turns to camelCase, parse JSONB fields.
    // Use position-based turn numbers (1-indexed) to handle duplicate turn_number values.
    // Enrich with transcript data when DB values are null (response_tokens_est, tool_calls).
    const parsedTurns = (turnsData ?? []).map((t, idx) => {
      const pos = idx + 1;
      const transcriptData = perTurnResponseData[pos];
      return {
        id: t.id,
        turnNumber: pos,
        promptText: t.prompt_text,
        promptHash: t.prompt_hash,
        promptTokensEst: t.prompt_tokens_est,
        heuristicScore: t.heuristic_score,
        antiPatterns: t.anti_patterns ?? [],
        llmScore: t.llm_score,
        scoreBreakdown: t.score_breakdown ?? null,
        suggestionText: t.suggestion_text,
        suggestionAccepted: t.suggestion_accepted == null ? null : Boolean(t.suggestion_accepted),
        tokensSavedEst: t.tokens_saved_est,
        responseTokensEst: t.response_tokens_est ?? transcriptData?.responseTokens ?? null,
        toolCalls: (t.tool_calls && (t.tool_calls as unknown[]).length > 0) ? t.tool_calls : (transcriptData?.toolCalls ?? []),
        latencyMs: t.latency_ms,
        wasRetry: Boolean(t.was_retry),
        contextUsedPct: t.context_used_pct,
        costUsd: perTurnCosts[pos] ?? null,
        createdAt: t.created_at,
      };
    });

    // Tool usage summary from session (computed from transcript at session_end)
    const toolUsageSummary = session.tool_usage_summary ?? {};

    return NextResponse.json({
      session: sessionOut,
      turns: parsedTurns,
      toolUsageSummary,
      analysis: parsedAnalysis,
    });
  } catch (err) {
    console.error('Session detail API error:', err);
    return NextResponse.json({ error: 'Failed to load session' }, { status: 500 });
  }
}
