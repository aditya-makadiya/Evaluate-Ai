import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase-server';

export async function GET(req: NextRequest) {
  try {
    const ctx = await getAuthContext();
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = getSupabaseAdmin();
    const { searchParams } = new URL(req.url);
    const teamId = ctx.teamId;
    const date = searchParams.get('date');
    const developerId = searchParams.get('developer_id');

    let query = supabase
      .from('daily_reports')
      .select('*')
      .eq('team_id', teamId)
      .order('date', { ascending: false });

    if (date) {
      query = query.eq('date', date);
    }

    if (developerId) {
      query = query.eq('developer_id', developerId);
    }

    if (!date) {
      query = query.limit(50);
    }

    const { data: reports, error } = await query;

    if (error) {
      console.error('Daily reports fetch error:', error);
      return NextResponse.json({ reports: [] });
    }

    // Get developer names
    const developerIds = [...new Set((reports ?? []).map(r => r.developer_id).filter(Boolean))];
    let developerMap: Record<string, string> = {};

    if (developerIds.length > 0) {
      const { data: developers } = await supabase
        .from('team_members')
        .select('id, name')
        .in('id', developerIds);

      developerMap = (developers ?? []).reduce((map, d) => {
        map[d.id] = d.name;
        return map;
      }, {} as Record<string, string>);
    }

    const result = (reports ?? []).map(r => ({
      id: r.id,
      teamId: r.team_id,
      developerId: r.developer_id,
      developerName: r.developer_id ? (developerMap[r.developer_id] ?? 'Unknown') : 'Unknown',
      date: r.date,
      commitsCount: r.commits_count ?? 0,
      prsOpened: r.prs_opened ?? 0,
      prsMerged: r.prs_merged ?? 0,
      reviewsGiven: r.reviews_given ?? 0,
      linesAdded: r.lines_added ?? 0,
      linesRemoved: r.lines_removed ?? 0,
      aiSummary: r.ai_summary,
      tasksAssigned: r.tasks_assigned ?? 0,
      tasksCompleted: r.tasks_completed ?? 0,
      plannedCommits: r.planned_commits ?? 0,
      unplannedCommits: r.unplanned_commits ?? 0,
      alignmentScore: r.alignment_score,
      aiSessionsCount: r.ai_sessions_count ?? 0,
      aiTotalCost: r.ai_total_cost ?? 0,
      aiAvgPromptScore: r.ai_avg_prompt_score,
      aiTokensUsed: r.ai_tokens_used ?? 0,
      aiModelBreakdown: r.ai_model_breakdown ?? {},
      generatedAt: r.generated_at,
    }));

    return NextResponse.json({ reports: result });
  } catch (err) {
    console.error('Daily reports API error:', err);
    return NextResponse.json({ reports: [] });
  }
}
