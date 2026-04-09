import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase-server';

interface PeriodStats {
  sessions: number;
  turns: number;
  tokens: number;
  cost: number;
  avgScore: number | null;
  efficiency: number | null;
}

async function periodStats(teamId: string, fromDate: string, toDate: string): Promise<PeriodStats> {
  const supabase = getSupabaseAdmin();

  const query = supabase
    .from('ai_sessions')
    .select('total_turns, total_input_tokens, total_output_tokens, total_cost_usd, avg_prompt_score, efficiency_score')
    .eq('team_id', teamId)
    .gte('started_at', fromDate)
    .lt('started_at', toDate);

  const { data } = await query;

  if (!data || data.length === 0) {
    return { sessions: 0, turns: 0, tokens: 0, cost: 0, avgScore: null, efficiency: null };
  }

  let turns = 0, tokens = 0, cost = 0;
  let scoreSum = 0, scoreCount = 0;
  let effSum = 0, effCount = 0;

  for (const row of data) {
    turns += row.total_turns ?? 0;
    tokens += (row.total_input_tokens ?? 0) + (row.total_output_tokens ?? 0);
    cost += row.total_cost_usd ?? 0;
    if (row.avg_prompt_score != null) { scoreSum += row.avg_prompt_score; scoreCount++; }
    if (row.efficiency_score != null) { effSum += row.efficiency_score; effCount++; }
  }

  return {
    sessions: data.length,
    turns,
    tokens,
    cost,
    avgScore: scoreCount > 0 ? scoreSum / scoreCount : null,
    efficiency: effCount > 0 ? effSum / effCount : null,
  };
}

const emptyStats = { sessions: 0, turns: 0, tokens: 0, cost: 0, avgScore: null, efficiency: null };

export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext();
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const teamId = ctx.teamId;
    const supabase = getSupabaseAdmin();
    const now = new Date();

    // Today boundaries
    const todayStr = now.toISOString().slice(0, 10);
    const tomorrowStr = new Date(now.getTime() + 86400000).toISOString().slice(0, 10);
    const yesterdayStr = new Date(now.getTime() - 86400000).toISOString().slice(0, 10);

    // Week boundaries (Monday-based)
    const dayOfWeek = now.getDay() || 7; // Sunday=7
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - dayOfWeek + 1);
    const weekStartStr = weekStart.toISOString().slice(0, 10);

    const prevWeekStart = new Date(weekStart);
    prevWeekStart.setDate(prevWeekStart.getDate() - 7);
    const prevWeekStartStr = prevWeekStart.toISOString().slice(0, 10);

    // Month boundaries
    const monthStartStr = `${todayStr.slice(0, 7)}-01`;
    const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonthStartStr = prevMonthDate.toISOString().slice(0, 10).slice(0, 7) + '-01';
    const prevMonthEndStr = monthStartStr;

    // Gather period stats
    const [today, thisWeek, thisMonth, previousDay, previousWeek, previousMonth] = await Promise.all([
      periodStats(teamId, todayStr, tomorrowStr),
      periodStats(teamId, weekStartStr, tomorrowStr),
      periodStats(teamId, monthStartStr, tomorrowStr),
      periodStats(teamId, yesterdayStr, todayStr),
      periodStats(teamId, prevWeekStartStr, weekStartStr),
      periodStats(teamId, prevMonthStartStr, prevMonthEndStr),
    ]);

    // Cost trend (last 30 days)
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000).toISOString().slice(0, 10);

    const { data: costRows } = await supabase
      .from('ai_sessions')
      .select('started_at, total_cost_usd')
      .eq('team_id', teamId)
      .gte('started_at', thirtyDaysAgo);

    const costByDate: Record<string, number> = {};
    for (const row of costRows ?? []) {
      const date = (row.started_at as string).slice(0, 10);
      costByDate[date] = (costByDate[date] ?? 0) + (row.total_cost_usd ?? 0);
    }
    const costTrend = Object.entries(costByDate)
      .map(([date, cost]) => ({ date, cost }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Score trend (last 30 days)
    const { data: scoreRows } = await supabase
      .from('ai_sessions')
      .select('started_at, avg_prompt_score')
      .eq('team_id', teamId)
      .gte('started_at', thirtyDaysAgo)
      .not('avg_prompt_score', 'is', null);

    const scoreByDate: Record<string, { sum: number; count: number }> = {};
    for (const row of scoreRows ?? []) {
      const date = (row.started_at as string).slice(0, 10);
      if (!scoreByDate[date]) scoreByDate[date] = { sum: 0, count: 0 };
      scoreByDate[date].sum += row.avg_prompt_score!;
      scoreByDate[date].count++;
    }
    const scoreTrend = Object.entries(scoreByDate)
      .map(([date, { sum, count }]) => ({ date, score: sum / count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Top anti-patterns — need to get session IDs first, then query turns
    const { data: teamSessionIds } = await supabase
      .from('ai_sessions')
      .select('id')
      .eq('team_id', teamId);

    const patternCounts: Record<string, number> = {};
    if (teamSessionIds && teamSessionIds.length > 0) {
      const sessionIds = teamSessionIds.map(s => s.id);
      // Query in batches if needed (Supabase IN has limits)
      const batchSize = 200;
      for (let i = 0; i < sessionIds.length; i += batchSize) {
        const batch = sessionIds.slice(i, i + batchSize);
        const { data: apRows } = await supabase
          .from('ai_turns')
          .select('anti_patterns')
          .in('session_id', batch)
          .not('anti_patterns', 'is', null);

        for (const row of apRows ?? []) {
          const patterns = row.anti_patterns;
          if (!Array.isArray(patterns)) continue;
          for (const p of patterns) {
            const id = typeof p === 'string' ? p : (p as Record<string, unknown>)?.id;
            if (typeof id === 'string') {
              patternCounts[id] = (patternCounts[id] ?? 0) + 1;
            }
          }
        }
      }
    }
    const topAntiPatterns = Object.entries(patternCounts)
      .map(([pattern, count]) => ({ pattern, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Model usage
    const { data: modelRows } = await supabase
      .from('ai_sessions')
      .select('model, total_cost_usd')
      .eq('team_id', teamId)
      .not('model', 'is', null);

    const modelMap: Record<string, { count: number; cost: number }> = {};
    for (const row of modelRows ?? []) {
      const m = row.model as string;
      if (!modelMap[m]) modelMap[m] = { count: 0, cost: 0 };
      modelMap[m].count++;
      modelMap[m].cost += row.total_cost_usd ?? 0;
    }
    const modelUsage = Object.entries(modelMap)
      .map(([model, { count, cost }]) => ({ model, count, cost }))
      .sort((a, b) => b.count - a.count);

    // Recent sessions with first prompt as task name
    const { data: recentSessionRows } = await supabase
      .from('ai_sessions')
      .select('id, total_turns, total_cost_usd, avg_prompt_score, started_at')
      .eq('team_id', teamId)
      .order('started_at', { ascending: false })
      .limit(15);

    const recentSessions: Array<{
      id: string; task: string; turns: number; cost: number; score: number | null; startedAt: string;
    }> = [];

    if (recentSessionRows && recentSessionRows.length > 0) {
      // Fetch first turns for these sessions
      const sessionIds = recentSessionRows.map(s => s.id);
      const { data: firstTurns } = await supabase
        .from('ai_turns')
        .select('session_id, prompt_text')
        .in('session_id', sessionIds)
        .order('created_at', { ascending: true });

      // Keep only the first turn per session
      const turnMap: Record<string, string> = {};
      for (const t of firstTurns ?? []) {
        if (t.prompt_text && !turnMap[t.session_id]) {
          turnMap[t.session_id] = t.prompt_text;
        }
      }

      for (const s of recentSessionRows) {
        const promptText = turnMap[s.id] ?? '';
        // Strip HTML/XML tags and normalize whitespace for clean display
        const clean = promptText.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
        const task = clean.length > 0
          ? (clean.length > 80 ? clean.slice(0, 80) + '...' : clean)
          : `Session ${(s.id as string).slice(0, 8)}`;

        recentSessions.push({
          id: s.id,
          task,
          turns: s.total_turns ?? 0,
          cost: s.total_cost_usd ?? 0,
          score: s.avg_prompt_score ?? null,
          startedAt: s.started_at,
        });
      }
    }

    return NextResponse.json({
      today,
      thisWeek,
      thisMonth,
      previousDay,
      previousWeek,
      previousMonth,
      costTrend,
      scoreTrend,
      topAntiPatterns,
      modelUsage,
      recentSessions,
    });
  } catch (err) {
    console.error('Stats API error:', err);
    return NextResponse.json({
      today: emptyStats,
      thisWeek: emptyStats,
      thisMonth: emptyStats,
      previousDay: emptyStats,
      previousWeek: emptyStats,
      previousMonth: emptyStats,
      costTrend: [],
      scoreTrend: [],
      topAntiPatterns: [],
      modelUsage: [],
      recentSessions: [],
    });
  }
}
