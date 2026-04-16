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

    const admin = getSupabaseAdmin();
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

    // Build team-filtered queries
    let teamsQuery = admin.from('teams').select('id', { count: 'exact', head: true });
    let usersQuery = admin.from('team_members').select('id', { count: 'exact', head: true });
    let activeQuery = admin.from('ai_sessions').select('developer_id').gte('started_at', todayStart);
    let reposQuery = admin.from('integrations').select('id', { count: 'exact', head: true }).eq('provider', 'github').eq('status', 'active');
    let sessionsQuery = admin.from('ai_sessions').select('id', { count: 'exact', head: true }).gte('started_at', todayStart);
    let monthlyCostQuery = admin.from('ai_sessions').select('total_cost_usd').gte('started_at', monthStart);
    let dailyTrendQuery = admin.from('ai_sessions').select('started_at, total_cost_usd, model, developer_id').gte('started_at', thirtyDaysAgo).order('started_at', { ascending: true });
    let recentSessionsQuery = admin.from('ai_sessions').select('id, developer_id, model, total_cost_usd, total_turns, avg_prompt_score, work_summary, work_category, started_at, ended_at').order('started_at', { ascending: false }).limit(10);

    if (teamId) {
      teamsQuery = teamsQuery.eq('id', teamId);
      usersQuery = usersQuery.eq('team_id', teamId);
      activeQuery = activeQuery.eq('team_id', teamId);
      reposQuery = reposQuery.eq('team_id', teamId);
      sessionsQuery = sessionsQuery.eq('team_id', teamId);
      monthlyCostQuery = monthlyCostQuery.eq('team_id', teamId);
      dailyTrendQuery = dailyTrendQuery.eq('team_id', teamId);
      recentSessionsQuery = recentSessionsQuery.eq('team_id', teamId);
    }

    const [teamsRes, usersRes, activeUsersRes, reposRes, sessionsRes, monthlyCostRes, dailyTrendRes, recentSessionsRes] = await Promise.all([
      teamsQuery, usersQuery, activeQuery, reposQuery, sessionsQuery, monthlyCostQuery, dailyTrendQuery, recentSessionsQuery,
    ]);

    // Active developers today
    const activeDevIds = new Set(
      (activeUsersRes.data ?? []).map((s: { developer_id: string }) => s.developer_id)
    );

    // Monthly cost
    const monthlyCost = (monthlyCostRes.data ?? []).reduce(
      (sum: number, s: { total_cost_usd: number | null }) => sum + (s.total_cost_usd ?? 0), 0
    );

    // Daily trend
    const dailyMap = new Map<string, { sessions: number; cost: number }>();
    for (const s of dailyTrendRes.data ?? []) {
      const day = (s as { started_at: string }).started_at.slice(0, 10);
      const entry = dailyMap.get(day) ?? { sessions: 0, cost: 0 };
      entry.sessions += 1;
      entry.cost += (s as { total_cost_usd: number | null }).total_cost_usd ?? 0;
      dailyMap.set(day, entry);
    }
    const dailyTrend = Array.from(dailyMap.entries())
      .map(([date, stats]) => ({ date, ...stats }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Model breakdown from trend data
    const modelMap = new Map<string, { count: number; cost: number }>();
    for (const s of dailyTrendRes.data ?? []) {
      const model = (s as { model: string | null }).model ?? 'unknown';
      const entry = modelMap.get(model) ?? { count: 0, cost: 0 };
      entry.count += 1;
      entry.cost += (s as { total_cost_usd: number | null }).total_cost_usd ?? 0;
      modelMap.set(model, entry);
    }
    const modelBreakdown = Array.from(modelMap.entries())
      .map(([model, stats]) => ({ model, ...stats }))
      .sort((a, b) => b.count - a.count);

    // Recent sessions with developer names
    const recentSessions = recentSessionsRes.data ?? [];
    const devIds = [...new Set(recentSessions.map((s: { developer_id: string }) => s.developer_id).filter(Boolean))];
    const devNames = new Map<string, string>();
    if (devIds.length > 0) {
      const { data: members } = await admin.from('team_members').select('id, name, email').in('id', devIds);
      for (const m of members ?? []) {
        devNames.set(m.id, m.name || m.email || m.id);
      }
    }

    const sessions = recentSessions.map((s: Record<string, unknown>) => ({
      id: s.id,
      developerName: devNames.get(s.developer_id as string) ?? 'Unknown',
      model: s.model ?? 'unknown',
      cost: s.total_cost_usd ?? 0,
      turns: s.total_turns ?? 0,
      score: s.avg_prompt_score,
      workSummary: s.work_summary,
      workCategory: s.work_category,
      startedAt: s.started_at,
      endedAt: s.ended_at,
    }));

    // Recent teams (only when not filtering by team)
    let recentTeams: { id: string; name: string; slug: string; created_at: string; memberCount: number }[] = [];
    if (!teamId) {
      const { data: teamsData } = await admin.from('teams').select('id, name, slug, created_at').order('created_at', { ascending: false }).limit(5);
      for (const team of teamsData ?? []) {
        const { count } = await admin.from('team_members').select('id', { count: 'exact', head: true }).eq('team_id', team.id);
        recentTeams.push({ ...team, memberCount: count ?? 0 });
      }
    }

    return NextResponse.json({
      totalTeams: teamsRes.count ?? 0,
      totalUsers: usersRes.count ?? 0,
      activeUsersToday: activeDevIds.size,
      connectedRepos: reposRes.count ?? 0,
      sessionsToday: sessionsRes.count ?? 0,
      monthlySpend: monthlyCost,
      dailyTrend,
      modelBreakdown,
      recentSessions: sessions,
      recentTeams,
    });
  } catch (error) {
    console.error('Admin overview error:', error);
    return NextResponse.json({
      totalTeams: 0, totalUsers: 0, activeUsersToday: 0, connectedRepos: 0,
      sessionsToday: 0, monthlySpend: 0, dailyTrend: [], modelBreakdown: [],
      recentSessions: [], recentTeams: [],
    });
  }
}
