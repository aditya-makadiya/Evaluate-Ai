import { NextResponse } from 'next/server';
import { createHash, randomBytes } from 'node:crypto';
import { getSupabaseAdmin } from '@/lib/supabase-server';
import { matchBranchToTask } from '@/lib/services/task-matcher';
import { summarizeAndMatchSession } from '@/lib/services/session-summarizer';

function generateId(): string {
  return Date.now().toString(36) + randomBytes(8).toString('hex');
}

interface CliTokenContext {
  userId: string;
  teamId: string;
  memberId: string;
}

async function validateCliToken(request: Request): Promise<CliTokenContext | null> {
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');
  if (!token) return null;

  const tokenHash = createHash('sha256').update(token).digest('hex');
  const admin = getSupabaseAdmin();

  const { data: cliToken } = await admin
    .from('cli_tokens')
    .select('user_id, team_id, member_id, revoked_at')
    .eq('token_hash', tokenHash)
    .single();

  if (!cliToken || cliToken.revoked_at) return null;

  // Update last_used_at (fire-and-forget)
  admin.from('cli_tokens')
    .update({ last_used_at: new Date().toISOString() })
    .eq('token_hash', tokenHash)
    .then(() => {});

  return {
    userId: cliToken.user_id,
    teamId: cliToken.team_id,
    memberId: cliToken.member_id,
  };
}

/**
 * Build a partial update object from payload, only including non-null fields.
 */
function pickMetrics(data: Record<string, unknown>): Record<string, unknown> {
  const update: Record<string, unknown> = {};
  if (data.model) update.model = data.model;
  if (data.total_turns != null) update.total_turns = data.total_turns;
  if (data.total_input_tokens != null) update.total_input_tokens = data.total_input_tokens;
  if (data.total_output_tokens != null) update.total_output_tokens = data.total_output_tokens;
  if (data.total_cost_usd != null) update.total_cost_usd = data.total_cost_usd;
  if (data.total_tool_calls != null) update.total_tool_calls = data.total_tool_calls;
  if (data.tool_usage_summary != null) update.tool_usage_summary = data.tool_usage_summary;
  if (data.files_changed != null) update.files_changed = data.files_changed;
  if (data.avg_prompt_score != null) update.avg_prompt_score = data.avg_prompt_score;
  if (data.efficiency_score != null) update.efficiency_score = data.efficiency_score;
  if (data.token_waste_ratio != null) update.token_waste_ratio = data.token_waste_ratio;
  if (data.context_peak_pct != null) update.context_peak_pct = data.context_peak_pct;
  if (data.analysis) update.analysis = data.analysis;
  return update;
}

/**
 * Auto-compute derived fields (avg_prompt_score) from child rows.
 * total_tool_calls is now computed from transcript at session_end by the CLI.
 */
async function computeDerivedMetrics(
  admin: ReturnType<typeof getSupabaseAdmin>,
  sessionId: string,
  update: Record<string, unknown>,
): Promise<void> {
  // Compute avg_prompt_score from turns if not already provided
  if (update.avg_prompt_score == null) {
    try {
      const { data: turns } = await admin
        .from('ai_turns')
        .select('heuristic_score')
        .eq('session_id', sessionId)
        .not('heuristic_score', 'is', null);

      if (turns && turns.length > 0) {
        const avg = turns.reduce((sum: number, t: { heuristic_score: number }) => sum + t.heuristic_score, 0) / turns.length;
        update.avg_prompt_score = Math.round(avg * 10) / 10;
      }
    } catch {
      // non-critical
    }
  }
}

/**
 * POST /api/cli/ingest — Receive hook data from CLI
 * Replaces direct Supabase writes from CLI hooks.
 * Body: { event, ...payload }
 */
export async function POST(request: Request) {
  try {
    const ctx = await validateCliToken(request);
    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await request.json();
    const { event, ...data } = payload;

    if (!event) {
      return NextResponse.json({ error: 'event field is required' }, { status: 400 });
    }

    const admin = getSupabaseAdmin();

    switch (event) {
      case 'session_start': {
        const { error } = await admin.from('ai_sessions').upsert({
          id: data.session_id,
          team_id: ctx.teamId,
          developer_id: ctx.memberId,
          tool: data.tool || 'claude-code',
          model: data.model,
          project_dir: data.project_dir,
          git_repo: data.git_repo,
          git_branch: data.git_branch,
          started_at: data.started_at || new Date().toISOString(),
          total_turns: 0,
          total_input_tokens: 0,
          total_output_tokens: 0,
          total_cost_usd: 0,
          total_tool_calls: 0,
          files_changed: 0,
        }, { onConflict: 'id' });

        if (error) return NextResponse.json({ error: error.message }, { status: 500 });

        // Mark CLI as installed for this member (fire-and-forget, idempotent)
        admin.from('team_members')
          .update({ evaluateai_installed: true })
          .eq('id', ctx.memberId)
          .eq('evaluateai_installed', false)
          .then(() => {});

        // Branch-to-task matching (fire-and-forget)
        if (data.git_branch && data.session_id) {
          (async () => {
            try {
              const matchedTaskId = await matchBranchToTask(data.git_branch, ctx.teamId);
              if (matchedTaskId) {
                await admin.from('ai_sessions')
                  .update({ matched_task_id: matchedTaskId })
                  .eq('id', data.session_id);

                // Auto-move pending task to in_progress
                await admin.from('tasks')
                  .update({ status: 'in_progress', status_updated_at: new Date().toISOString() })
                  .eq('id', matchedTaskId)
                  .eq('status', 'pending');
              }
            } catch {
              // non-critical
            }
          })();
        }

        break;
      }

      case 'prompt_submit': {
        // Auto-assign turn_number by counting existing turns
        const { count } = await admin
          .from('ai_turns')
          .select('id', { count: 'exact', head: true })
          .eq('session_id', data.session_id);
        const turnNumber = (count ?? 0) + 1;

        // Insert turn
        const { error: turnError } = await admin.from('ai_turns').insert({
          id: generateId(),
          session_id: data.session_id,
          team_id: ctx.teamId,
          developer_id: ctx.memberId,
          turn_number: turnNumber,
          prompt_text: data.prompt_text,
          prompt_hash: data.prompt_hash,
          prompt_tokens_est: data.prompt_tokens_est,
          heuristic_score: data.heuristic_score,
          anti_patterns: data.anti_patterns,
          intent: data.intent,
          was_retry: data.was_retry || false,
          created_at: new Date().toISOString(),
        });

        if (turnError) return NextResponse.json({ error: turnError.message }, { status: 500 });

        // Update session turn count
        if (data.session_id) {
          try {
            await admin
              .from('ai_sessions')
              .update({ total_turns: turnNumber })
              .eq('id', data.session_id);
          } catch {
            // non-critical
          }
        }
        break;
      }


      // session_update: mid-session metric refresh (from Stop hook).
      // Updates tokens/cost/turns + last_activity_at but does NOT set ended_at.
      // Also updates per-turn response data (response_tokens_est, tool_calls)
      // when per_turn_data is provided.
      case 'session_update': {
        if (!data.session_id) {
          return NextResponse.json({ error: 'session_id required' }, { status: 400 });
        }

        const updateData = pickMetrics(data);
        // Always track last activity for stale session detection (Ctrl+C)
        updateData.last_activity_at = data.last_activity_at || new Date().toISOString();
        if (Object.keys(updateData).length === 0) break;

        const { error } = await admin
          .from('ai_sessions')
          .update(updateData)
          .eq('id', data.session_id);

        if (error) return NextResponse.json({ error: error.message }, { status: 500 });

        // Update per-turn response data if provided (non-blocking).
        // Each item has { promptHash, responseTokens, toolCalls }.
        const perTurnData = data.per_turn_data;
        if (Array.isArray(perTurnData) && perTurnData.length > 0) {
          (async () => {
            try {
              // Fetch all turns for this session that are missing response data
              const { data: turns } = await admin
                .from('ai_turns')
                .select('id, prompt_hash, response_tokens_est, tool_calls')
                .eq('session_id', data.session_id);

              if (!turns) return;

              // Build hash → turn data map for quick lookup
              const turnMap = new Map<string, { promptHash: string; responseTokens: number; toolCalls: string[] }>();
              for (const item of perTurnData) {
                if (item?.promptHash) {
                  turnMap.set(item.promptHash, item);
                }
              }

              for (const turn of turns) {
                const hash = turn.prompt_hash as string | null;
                if (!hash) continue;

                const transcriptTurn = turnMap.get(hash);
                if (!transcriptTurn) continue;

                // Only update if DB values are missing
                const needsUpdate =
                  turn.response_tokens_est == null ||
                  !turn.tool_calls ||
                  (Array.isArray(turn.tool_calls) && turn.tool_calls.length === 0);

                if (needsUpdate) {
                  const turnUpdate: Record<string, unknown> = {};
                  if (turn.response_tokens_est == null) {
                    turnUpdate.response_tokens_est = transcriptTurn.responseTokens;
                  }
                  if (!turn.tool_calls || (Array.isArray(turn.tool_calls) && turn.tool_calls.length === 0)) {
                    turnUpdate.tool_calls = transcriptTurn.toolCalls;
                  }
                  if (Object.keys(turnUpdate).length > 0) {
                    await admin.from('ai_turns').update(turnUpdate).eq('id', turn.id);
                  }
                }
              }
            } catch {
              // Non-critical — per-turn data update is best-effort
            }
          })().catch(() => {});
        }
        break;
      }

      // session_end: final close. Sets ended_at + final metrics + derived scores.
      case 'session_end': {
        if (!data.session_id) {
          return NextResponse.json({ error: 'session_id required' }, { status: 400 });
        }

        const updateData: Record<string, unknown> = {
          ended_at: data.ended_at || new Date().toISOString(),
          ...pickMetrics(data),
        };

        await computeDerivedMetrics(admin, data.session_id, updateData);

        const { error } = await admin
          .from('ai_sessions')
          .update(updateData)
          .eq('id', data.session_id);

        if (error) return NextResponse.json({ error: error.message }, { status: 500 });

        // Insert enriched activity timeline event (fire-and-forget)
        admin.from('activity_timeline').insert({
          team_id: ctx.teamId,
          developer_id: ctx.memberId,
          event_type: 'ai_session_end',
          title: 'AI session completed',
          description: `${data.total_turns ?? 0} turns, $${(Number(data.total_cost_usd) || 0).toFixed(3)} cost`,
          metadata: {
            session_id: data.session_id,
            total_turns: data.total_turns ?? null,
            total_cost_usd: data.total_cost_usd ?? null,
            avg_prompt_score: updateData.avg_prompt_score ?? null,
            model: data.model ?? null,
          },
          source_id: data.session_id,
          source_table: 'ai_sessions',
          is_ai_assisted: true,
          occurred_at: data.ended_at || new Date().toISOString(),
        }).then(() => {});

        // Fire-and-forget: generate AI work summary + prompt-based task matching
        summarizeAndMatchSession(data.session_id, ctx.teamId, ctx.memberId)
          .catch(() => {}); // non-critical — sessions work fine without summaries

        break;
      }

      case 'activity': {
        const { error } = await admin.from('activity_timeline').insert({
          team_id: ctx.teamId,
          developer_id: ctx.memberId,
          event_type: data.event_type,
          title: data.title,
          description: data.description,
          metadata: data.metadata || {},
          is_ai_assisted: true,
          occurred_at: new Date().toISOString(),
        });

        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        break;
      }

      default:
        return NextResponse.json({ error: `Unknown event: ${event}` }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
