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
    const weekStart = searchParams.get('week_start');

    // Default to current week's Monday
    let startDate: string;
    if (weekStart) {
      startDate = weekStart;
    } else {
      const now = new Date();
      const dayOfWeek = now.getDay() || 7;
      const monday = new Date(now);
      monday.setDate(now.getDate() - dayOfWeek + 1);
      startDate = monday.toISOString().slice(0, 10);
    }

    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 7);
    const endDateStr = endDate.toISOString().slice(0, 10);

    // Get daily reports for the week
    const { data: reports } = await supabase
      .from('daily_reports')
      .select('*')
      .eq('team_id', teamId)
      .gte('date', startDate)
      .lt('date', endDateStr)
      .order('date', { ascending: true });

    const allReports = reports ?? [];

    // Get developer names
    const developerIds = [...new Set(allReports.map(r => r.developer_id).filter(Boolean))];
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

    // Aggregate team stats
    const teamStats = {
      weekStart: startDate,
      weekEnd: endDateStr,
      totalCommits: allReports.reduce((s, r) => s + (r.commits_count ?? 0), 0),
      totalPrsOpened: allReports.reduce((s, r) => s + (r.prs_opened ?? 0), 0),
      totalPrsMerged: allReports.reduce((s, r) => s + (r.prs_merged ?? 0), 0),
      totalReviews: allReports.reduce((s, r) => s + (r.reviews_given ?? 0), 0),
      totalLinesAdded: allReports.reduce((s, r) => s + (r.lines_added ?? 0), 0),
      totalLinesRemoved: allReports.reduce((s, r) => s + (r.lines_removed ?? 0), 0),
      totalAiSessions: allReports.reduce((s, r) => s + (r.ai_sessions_count ?? 0), 0),
      totalAiCost: allReports.reduce((s, r) => s + (r.ai_total_cost ?? 0), 0),
      totalTasksCompleted: allReports.reduce((s, r) => s + (r.tasks_completed ?? 0), 0),
      activeDevelopers: developerIds.length,
    };

    // Per-developer aggregation
    const devAgg: Record<string, {
      developerId: string;
      developerName: string;
      commits: number;
      prsOpened: number;
      prsMerged: number;
      reviews: number;
      linesAdded: number;
      linesRemoved: number;
      aiSessions: number;
      aiCost: number;
      aiAvgScore: number[];
      tasksCompleted: number;
      tasksAssigned: number;
      daysActive: number;
    }> = {};

    for (const r of allReports) {
      const devId = r.developer_id;
      if (!devId) continue;
      if (!devAgg[devId]) {
        devAgg[devId] = {
          developerId: devId,
          developerName: developerMap[devId] ?? 'Unknown',
          commits: 0,
          prsOpened: 0,
          prsMerged: 0,
          reviews: 0,
          linesAdded: 0,
          linesRemoved: 0,
          aiSessions: 0,
          aiCost: 0,
          aiAvgScore: [],
          tasksCompleted: 0,
          tasksAssigned: 0,
          daysActive: 0,
        };
      }
      const d = devAgg[devId];
      d.commits += r.commits_count ?? 0;
      d.prsOpened += r.prs_opened ?? 0;
      d.prsMerged += r.prs_merged ?? 0;
      d.reviews += r.reviews_given ?? 0;
      d.linesAdded += r.lines_added ?? 0;
      d.linesRemoved += r.lines_removed ?? 0;
      d.aiSessions += r.ai_sessions_count ?? 0;
      d.aiCost += r.ai_total_cost ?? 0;
      d.tasksCompleted += r.tasks_completed ?? 0;
      d.tasksAssigned += r.tasks_assigned ?? 0;
      if (r.ai_avg_prompt_score != null) d.aiAvgScore.push(r.ai_avg_prompt_score);
      if ((r.commits_count ?? 0) > 0 || (r.ai_sessions_count ?? 0) > 0) d.daysActive++;
    }

    const developerStats = Object.values(devAgg).map(d => ({
      developerId: d.developerId,
      developerName: d.developerName,
      commits: d.commits,
      prsOpened: d.prsOpened,
      prsMerged: d.prsMerged,
      reviews: d.reviews,
      linesAdded: d.linesAdded,
      linesRemoved: d.linesRemoved,
      aiSessions: d.aiSessions,
      aiCost: d.aiCost,
      aiAvgPromptScore: d.aiAvgScore.length > 0
        ? Math.round(d.aiAvgScore.reduce((a, b) => a + b, 0) / d.aiAvgScore.length)
        : null,
      tasksCompleted: d.tasksCompleted,
      tasksAssigned: d.tasksAssigned,
      daysActive: d.daysActive,
    }));

    // Top insights
    const topInsights: string[] = [];
    if (teamStats.totalCommits > 0) {
      topInsights.push(`${teamStats.totalCommits} commits across ${developerStats.length} developers`);
    }
    if (teamStats.totalAiCost > 0) {
      topInsights.push(`$${teamStats.totalAiCost.toFixed(2)} total AI spend this week`);
    }
    const topDev = developerStats.sort((a, b) => b.commits - a.commits)[0];
    if (topDev && topDev.commits > 0) {
      topInsights.push(`${topDev.developerName} led with ${topDev.commits} commits`);
    }
    if (teamStats.totalTasksCompleted > 0) {
      topInsights.push(`${teamStats.totalTasksCompleted} tasks completed this week`);
    }

    // Get alerts for the week
    const { data: weekAlerts } = await supabase
      .from('alerts')
      .select('id, type, severity, title, description, developer_id, created_at')
      .eq('team_id', teamId)
      .gte('created_at', startDate)
      .lt('created_at', endDateStr)
      .order('created_at', { ascending: false })
      .limit(20);

    const alerts = (weekAlerts ?? []).map(a => ({
      id: a.id,
      type: a.type,
      severity: a.severity,
      title: a.title,
      description: a.description,
      developerId: a.developer_id,
      developerName: a.developer_id ? (developerMap[a.developer_id] ?? null) : null,
      createdAt: a.created_at,
    }));

    return NextResponse.json({
      teamStats,
      developerStats,
      topInsights,
      alerts,
    });
  } catch (err) {
    console.error('Weekly reports API error:', err);
    return NextResponse.json({
      teamStats: {},
      developerStats: [],
      topInsights: [],
      alerts: [],
    });
  }
}
