import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuthContext } from '@/lib/admin-auth';
import { getSupabaseAdmin } from '@/lib/supabase-server';

function getPeriodStart(period: string): string {
  const now = new Date();
  switch (period) {
    case 'week': {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      return d.toISOString();
    }
    case 'quarter': {
      const d = new Date(now);
      d.setMonth(d.getMonth() - 3);
      return d.toISOString();
    }
    case 'month':
    default: {
      const d = new Date(now);
      d.setMonth(d.getMonth() - 1);
      return d.toISOString();
    }
  }
}

export async function GET(request: NextRequest) {
  const ctx = await getAdminAuthContext();
  if (!ctx) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') ?? 'month';
    const teamId = searchParams.get('teamId') ?? '';
    const since = getPeriodStart(period);

    const admin = getSupabaseAdmin();

    let sessionsQuery = admin
      .from('ai_sessions')
      .select('id, team_id, developer_id, model, total_cost_usd, total_input_tokens, total_output_tokens, started_at')
      .gte('started_at', since);

    let apiCallsQuery = admin
      .from('ai_api_calls')
      .select('cost_usd, cache_read_tokens, cache_write_tokens, input_tokens, output_tokens, session_id')
      .gte('created_at', since);

    if (teamId) {
      sessionsQuery = sessionsQuery.eq('team_id', teamId);
      // api_calls don't have team_id directly, filter after join
    }

    const [sessionsRes, apiCallsRes] = await Promise.all([sessionsQuery, apiCallsQuery]);

    // If filtering by team, also filter api_calls by session IDs
    let apiCalls = apiCallsRes.data ?? [];
    if (teamId && sessionsRes.data) {
      const sessionIds = new Set(sessionsRes.data.map((s: { id: string }) => s.id));
      apiCalls = apiCalls.filter((c: { session_id: string | null }) => c.session_id && sessionIds.has(c.session_id));
    }

    const sessions = sessionsRes.data ?? [];

    // Totals
    const totalSpend = sessions.reduce((sum, s) => sum + (s.total_cost_usd ?? 0), 0);
    const totalTokens = sessions.reduce(
      (sum, s) => sum + (s.total_input_tokens ?? 0) + (s.total_output_tokens ?? 0),
      0
    );
    const avgCostPerSession = sessions.length > 0 ? totalSpend / sessions.length : 0;

    // Cache hit rate from API calls
    const totalApiInput = apiCalls.reduce((sum, c) => sum + (c.input_tokens ?? 0), 0);
    const totalCacheRead = apiCalls.reduce((sum, c) => sum + (c.cache_read_tokens ?? 0), 0);
    const cacheHitRate = totalApiInput > 0 ? (totalCacheRead / totalApiInput) * 100 : 0;

    // Cost by team
    const teamMap = new Map<string, { cost: number; sessions: number }>();
    for (const s of sessions) {
      const entry = teamMap.get(s.team_id) ?? { cost: 0, sessions: 0 };
      entry.cost += s.total_cost_usd ?? 0;
      entry.sessions += 1;
      teamMap.set(s.team_id, entry);
    }

    // Resolve team names
    const teamIds = Array.from(teamMap.keys());
    const teamNames = new Map<string, string>();
    if (teamIds.length > 0) {
      const { data: teams } = await admin
        .from('teams')
        .select('id, name')
        .in('id', teamIds);
      for (const t of teams ?? []) {
        teamNames.set(t.id, t.name);
      }
    }

    const costByTeam = Array.from(teamMap.entries())
      .map(([id, stats]) => ({
        teamId: id,
        teamName: teamNames.get(id) ?? id,
        ...stats,
      }))
      .sort((a, b) => b.cost - a.cost);

    // Cost by model
    const modelMap = new Map<string, { cost: number; sessions: number }>();
    for (const s of sessions) {
      const model = s.model ?? 'unknown';
      const entry = modelMap.get(model) ?? { cost: 0, sessions: 0 };
      entry.cost += s.total_cost_usd ?? 0;
      entry.sessions += 1;
      modelMap.set(model, entry);
    }
    const costByModel = Array.from(modelMap.entries())
      .map(([model, stats]) => ({ model, ...stats }))
      .sort((a, b) => b.cost - a.cost);

    // Cost by developer
    const devMap = new Map<string, { cost: number; sessions: number; tokens: number }>();
    for (const s of sessions) {
      if (!s.developer_id) continue;
      const entry = devMap.get(s.developer_id) ?? { cost: 0, sessions: 0, tokens: 0 };
      entry.cost += s.total_cost_usd ?? 0;
      entry.sessions += 1;
      entry.tokens += (s.total_input_tokens ?? 0) + (s.total_output_tokens ?? 0);
      devMap.set(s.developer_id, entry);
    }

    const devIds = Array.from(devMap.keys());
    const devNames = new Map<string, string>();
    if (devIds.length > 0) {
      const { data: members } = await admin
        .from('team_members')
        .select('id, name, email')
        .in('id', devIds);
      for (const m of members ?? []) {
        devNames.set(m.id, m.name || m.email || m.id);
      }
    }

    const costByDeveloper = Array.from(devMap.entries())
      .map(([id, stats]) => ({
        developerId: id,
        name: devNames.get(id) ?? id,
        ...stats,
      }))
      .sort((a, b) => b.cost - a.cost)
      .slice(0, 20);

    // Daily cost trend
    const dailyMap = new Map<string, { cost: number; sessions: number }>();
    for (const s of sessions) {
      const day = s.started_at.slice(0, 10);
      const entry = dailyMap.get(day) ?? { cost: 0, sessions: 0 };
      entry.cost += s.total_cost_usd ?? 0;
      entry.sessions += 1;
      dailyMap.set(day, entry);
    }
    const dailyTrend = Array.from(dailyMap.entries())
      .map(([date, stats]) => ({ date, ...stats }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return NextResponse.json({
      totalSpend,
      totalTokens,
      avgCostPerSession,
      cacheHitRate,
      totalSessions: sessions.length,
      costByTeam,
      costByModel,
      costByDeveloper,
      dailyTrend,
    });
  } catch (error) {
    console.error('Admin costs error:', error);
    return NextResponse.json({
      totalSpend: 0,
      totalTokens: 0,
      avgCostPerSession: 0,
      cacheHitRate: 0,
      totalSessions: 0,
      costByTeam: [],
      costByModel: [],
      costByDeveloper: [],
      dailyTrend: [],
    });
  }
}
