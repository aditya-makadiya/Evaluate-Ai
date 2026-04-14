import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase-server';

const ALLOWED_SORT_COLUMNS = new Set([
  'started_at',
  'ended_at',
  'total_turns',
  'total_cost_usd',
  'avg_prompt_score',
  'efficiency_score',
  'model',
  'tool',
]);

export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext();
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const teamId = ctx.teamId;

    // RBAC: Developers can only see their own sessions
    const developerId = ctx.role === 'developer'
      ? ctx.memberId
      : request.nextUrl.searchParams.get('developer_id');

    const supabase = getSupabaseAdmin();
    const { searchParams } = request.nextUrl;

    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') ?? '20', 10), 1), 100);
    const offset = Math.max(parseInt(searchParams.get('offset') ?? '0', 10), 0);
    const sort = ALLOWED_SORT_COLUMNS.has(searchParams.get('sort') ?? '')
      ? searchParams.get('sort')!
      : 'started_at';
    const order = (searchParams.get('order') ?? 'desc').toLowerCase() === 'asc';

    let query = supabase
      .from('ai_sessions')
      .select('id, tool, model, started_at, ended_at, last_activity_at, total_turns, total_input_tokens, total_output_tokens, total_cost_usd, avg_prompt_score, efficiency_score, project_dir, git_branch, developer_id, team_id, work_summary, work_tags, work_category', { count: 'exact' });

    if (teamId) query = query.eq('team_id', teamId);
    if (developerId) query = query.eq('developer_id', developerId);

    const { data, count } = await query
      .order(sort, { ascending: order })
      .range(offset, offset + limit - 1);

    // Fetch first turn prompt text for each session to use as title
    const sessionIds = (data ?? []).map(s => s.id);
    const firstPrompts: Record<string, string> = {};
    if (sessionIds.length > 0) {
      const { data: turnsData } = await supabase
        .from('ai_turns')
        .select('session_id, prompt_text')
        .in('session_id', sessionIds)
        .order('created_at', { ascending: true });

      // Keep only the first turn per session
      for (const t of turnsData ?? []) {
        if (t.prompt_text && !firstPrompts[t.session_id]) {
          firstPrompts[t.session_id] = t.prompt_text;
        }
      }
    }

    const sessions = (data ?? []).map(s => {
      // Detect stale sessions: no ended_at and no activity for > 30 min
      const lastActiveMs = s.last_activity_at
        ? new Date(s.last_activity_at).getTime()
        : (s.started_at ? new Date(s.started_at).getTime() : 0);
      const isStale = !s.ended_at && lastActiveMs > 0 && (Date.now() - lastActiveMs) > 30 * 60 * 1000;
      return {
      id: s.id,
      tool: s.tool,
      model: s.model,
      startedAt: s.started_at,
      endedAt: s.ended_at ?? (isStale ? (s.last_activity_at || s.started_at) : null),
      durationMin: (() => {
        const end = s.ended_at ?? (isStale ? (s.last_activity_at || null) : null);
        if (!end || !s.started_at) return null;
        return Math.round((new Date(end).getTime() - new Date(s.started_at).getTime()) / 60_000);
      })(),
      totalTurns: s.total_turns,
      totalInputTokens: s.total_input_tokens,
      totalOutputTokens: s.total_output_tokens,
      totalCostUsd: s.total_cost_usd,
      avgPromptScore: s.avg_prompt_score,
      efficiencyScore: s.efficiency_score,
      projectDir: s.project_dir,
      gitBranch: s.git_branch,
      firstPrompt: firstPrompts[s.id] ?? null,
      workSummary: s.work_summary ?? null,
      workTags: s.work_tags ?? [],
      workCategory: s.work_category ?? null,
    };
    });

    return NextResponse.json({ sessions, total: count ?? 0 });
  } catch (err) {
    console.error('Sessions API error:', err);
    return NextResponse.json({ sessions: [], total: 0 });
  }
}
