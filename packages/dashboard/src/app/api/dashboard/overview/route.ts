import { NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase-server';

function getGreeting(userName?: string | null): string {
  const hour = new Date().getHours();
  let greeting: string;
  if (hour < 12) greeting = 'Good morning';
  else if (hour < 18) greeting = 'Good afternoon';
  else greeting = 'Good evening';
  if (userName) greeting += `, ${userName}`;
  return greeting;
}

type Scope = 'team' | 'self';

const EMPTY_RESPONSE = {
  stats: { activeDevs: 0, totalDevs: 0, prsMerged: 0, tasksDone: 0, tasksTotal: 0, aiSpend: 0, commits: 0 },
  timeline: [],
  alerts: [],
  healthScore: 0,
  scope: 'team' as Scope,
};

export async function GET() {
  const ctx = await getAuthContext();

  if (!ctx) {
    return NextResponse.json({
      ...EMPTY_RESPONSE,
      greeting: getGreeting(),
      error: 'Unauthorized',
    }, { status: 401 });
  }

  // Developers see self-scoped data; managers and owners see team-wide.
  const scope: Scope = ctx.role === 'developer' ? 'self' : 'team';
  const teamId = ctx.teamId;
  const memberId = ctx.memberId;

  try {
    const supabase = getSupabaseAdmin();
    const now = new Date();
    const tomorrowStr = new Date(now.getTime() + 86400000).toISOString().slice(0, 10);

    const dayOfWeek = now.getDay() || 7;
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - dayOfWeek + 1);
    const weekStartStr = weekStart.toISOString().slice(0, 10);

    // ── AI sessions ────────────────────────────────────────────────
    let aiQuery = supabase
      .from('ai_sessions')
      .select('total_cost_usd, developer_id')
      .eq('team_id', teamId)
      .gte('started_at', weekStartStr)
      .lt('started_at', tomorrowStr);
    if (scope === 'self') aiQuery = aiQuery.eq('developer_id', memberId);
    const { data: aiData } = await aiQuery;

    const totalAiSpend = (aiData ?? []).reduce((sum, r) => sum + (r.total_cost_usd ?? 0), 0);

    // ── Code changes (commits / PRs) ──────────────────────────────
    let codeQuery = supabase
      .from('code_changes')
      .select('type')
      .eq('team_id', teamId)
      .gte('created_at', weekStartStr)
      .lt('created_at', tomorrowStr);
    if (scope === 'self') codeQuery = codeQuery.eq('developer_id', memberId);
    const { data: codeData } = await codeQuery;

    const prsMerged = (codeData ?? []).filter(r => r.type === 'pr_merged').length;
    const commits = (codeData ?? []).filter(r => r.type === 'commit').length;

    // ── Tasks ─────────────────────────────────────────────────────
    let taskQuery = supabase
      .from('tasks')
      .select('status', { count: 'exact' })
      .eq('team_id', teamId)
      .gte('created_at', weekStartStr);
    if (scope === 'self') taskQuery = taskQuery.eq('assignee_id', memberId);
    const { data: taskData, count: tasksTotal } = await taskQuery;

    const tasksDone = (taskData ?? []).filter(r => r.status === 'completed').length;

    // ── Active developers (team view only) ────────────────────────
    let activeDevs = 0;
    let totalDevs = 0;
    if (scope === 'team') {
      const { data: teamMembers } = await supabase
        .from('team_members')
        .select('id')
        .eq('team_id', teamId);
      const activeDeveloperIds = new Set(
        (aiData ?? []).map(r => r.developer_id).filter(Boolean)
      );
      activeDevs = activeDeveloperIds.size;
      totalDevs = (teamMembers ?? []).length;
    } else {
      // Self view: "activeDevs" doesn't make sense; surface a simple 1/1 signal.
      activeDevs = (aiData ?? []).length > 0 ? 1 : 0;
      totalDevs = 1;
    }

    // ── Activity timeline ─────────────────────────────────────────
    let timelineQuery = supabase
      .from('activity_timeline')
      .select('id, event_type, title, description, developer_id, metadata, created_at')
      .eq('team_id', teamId)
      .order('created_at', { ascending: false })
      .limit(20);
    if (scope === 'self') timelineQuery = timelineQuery.eq('developer_id', memberId);
    const { data: timelineData } = await timelineQuery;

    const timelineDevIds = [...new Set((timelineData ?? []).map(e => e.developer_id).filter(Boolean))];
    const timelineDevNames: Record<string, string> = {};
    if (timelineDevIds.length > 0) {
      const { data: devRows } = await supabase
        .from('team_members')
        .select('id, name')
        .in('id', timelineDevIds);
      for (const d of devRows ?? []) {
        timelineDevNames[d.id] = d.name;
      }
    }

    const timeline = (timelineData ?? []).map(e => ({
      id: e.id,
      eventType: e.event_type,
      title: e.title,
      description: e.description,
      developerName: e.developer_id ? (timelineDevNames[e.developer_id] ?? null) : null,
      metadata: e.metadata,
      createdAt: e.created_at,
    }));

    // ── Alerts (top 3 unread) ─────────────────────────────────────
    let alertQuery = supabase
      .from('alerts')
      .select('id, title, severity, description, created_at')
      .eq('team_id', teamId)
      .eq('is_read', false)
      .order('created_at', { ascending: false })
      .limit(3);
    if (scope === 'self') alertQuery = alertQuery.eq('developer_id', memberId);
    const { data: alertData } = await alertQuery;

    const alerts = (alertData ?? []).map(a => ({
      id: a.id,
      title: a.title,
      severity: a.severity,
      description: a.description,
      createdAt: a.created_at,
    }));

    // ── Health score ──────────────────────────────────────────────
    const taskCompletionRate = (tasksTotal ?? 0) > 0 ? tasksDone / (tasksTotal ?? 1) : 0.5;
    const activeDevRate = totalDevs > 0 ? activeDevs / totalDevs : 0.5;

    let scoreQuery = supabase
      .from('ai_sessions')
      .select('avg_prompt_score')
      .eq('team_id', teamId)
      .gte('started_at', weekStartStr)
      .not('avg_prompt_score', 'is', null);
    if (scope === 'self') scoreQuery = scoreQuery.eq('developer_id', memberId);
    const { data: scoreData } = await scoreQuery;

    const avgScore = (scoreData ?? []).length > 0
      ? (scoreData ?? []).reduce((s, r) => s + (r.avg_prompt_score ?? 0), 0) / scoreData!.length
      : 50;

    const healthScore = Math.round(
      (taskCompletionRate * 30) + (activeDevRate * 25) + ((avgScore / 100) * 25) + (Math.min(prsMerged / 10, 1) * 20)
    );

    return NextResponse.json({
      greeting: getGreeting(ctx.name),
      scope,
      role: ctx.role,
      stats: {
        activeDevs,
        totalDevs,
        prsMerged,
        tasksDone,
        tasksTotal: tasksTotal ?? 0,
        aiSpend: totalAiSpend,
        commits,
      },
      timeline,
      alerts,
      healthScore: Math.min(healthScore, 100),
    });
  } catch (err) {
    console.error('Dashboard overview API error:', err);
    return NextResponse.json({
      greeting: getGreeting(ctx.name),
      role: ctx.role,
      ...EMPTY_RESPONSE,
      scope,
    });
  }
}
