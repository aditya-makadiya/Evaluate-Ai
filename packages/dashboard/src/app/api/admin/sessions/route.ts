import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuthContext } from '@/lib/admin-auth';
import { getSupabaseAdmin } from '@/lib/supabase-server';

export async function GET(request: NextRequest) {
  const ctx = await getAdminAuthContext();
  if (!ctx) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const teamId = searchParams.get('teamId') ?? '';
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '50', 10), 100);
    const offset = parseInt(searchParams.get('offset') ?? '0', 10);
    const sort = searchParams.get('sort') ?? 'started_at';
    const order = searchParams.get('order') ?? 'desc';

    const ALLOWED_SORTS = ['started_at', 'total_cost_usd', 'total_turns', 'avg_prompt_score'];
    const sortCol = ALLOWED_SORTS.includes(sort) ? sort : 'started_at';

    const admin = getSupabaseAdmin();

    let query = admin
      .from('ai_sessions')
      .select('id, team_id, developer_id, tool, model, git_repo, git_branch, started_at, ended_at, total_turns, total_input_tokens, total_output_tokens, total_cost_usd, avg_prompt_score, efficiency_score, work_summary, work_category, work_tags, total_tool_calls, files_changed', { count: 'exact' });

    if (teamId) {
      query = query.eq('team_id', teamId);
    }

    query = query.order(sortCol, { ascending: order === 'asc' }).range(offset, offset + limit - 1);

    const { data: sessions, count } = await query;
    const allSessions = sessions ?? [];

    // Resolve developer and team names
    const devIds = [...new Set(allSessions.map((s) => s.developer_id).filter(Boolean))];
    const teamIds = [...new Set(allSessions.map((s) => s.team_id).filter(Boolean))];

    const devNames = new Map<string, string>();
    const teamNames = new Map<string, string>();

    if (devIds.length > 0) {
      const { data: members } = await admin.from('team_members').select('id, name, email').in('id', devIds);
      for (const m of members ?? []) devNames.set(m.id, m.name || m.email || m.id);
    }

    if (teamIds.length > 0) {
      const { data: teams } = await admin.from('teams').select('id, name').in('id', teamIds);
      for (const t of teams ?? []) teamNames.set(t.id, t.name);
    }

    const sessionList = allSessions.map((s) => {
      const durationMin = s.started_at && s.ended_at
        ? Math.round((new Date(s.ended_at).getTime() - new Date(s.started_at).getTime()) / 60000)
        : null;

      return {
        id: s.id,
        teamId: s.team_id,
        teamName: teamNames.get(s.team_id) ?? s.team_id,
        developerName: devNames.get(s.developer_id) ?? 'Unknown',
        tool: s.tool,
        model: s.model,
        gitRepo: s.git_repo,
        gitBranch: s.git_branch,
        startedAt: s.started_at,
        endedAt: s.ended_at,
        durationMin,
        totalTurns: s.total_turns,
        totalInputTokens: s.total_input_tokens,
        totalOutputTokens: s.total_output_tokens,
        totalCost: s.total_cost_usd,
        avgScore: s.avg_prompt_score,
        efficiencyScore: s.efficiency_score,
        workSummary: s.work_summary,
        workCategory: s.work_category,
        workTags: s.work_tags,
        toolCalls: s.total_tool_calls,
        filesChanged: s.files_changed,
      };
    });

    return NextResponse.json({
      sessions: sessionList,
      total: count ?? 0,
      limit,
      offset,
    });
  } catch (error) {
    console.error('Admin sessions error:', error);
    return NextResponse.json({ sessions: [], total: 0, limit: 50, offset: 0 });
  }
}
