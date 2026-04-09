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

const EMPTY_RESPONSE = {
  stats: { activeDevs: 0, totalDevs: 0, prsMerged: 0, tasksDone: 0, tasksTotal: 0, aiSpend: 0, commits: 0 },
  timeline: [],
  alerts: [],
  healthScore: 0,
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

  const teamId = ctx.teamId;

  try {
    const supabase = getSupabaseAdmin();
    const now = new Date();
    const tomorrowStr = new Date(now.getTime() + 86400000).toISOString().slice(0, 10);

    // Week boundaries (Monday-based)
    const dayOfWeek = now.getDay() || 7;
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - dayOfWeek + 1);
    const weekStartStr = weekStart.toISOString().slice(0, 10);

    // AI stats for this week
    const { data: aiData } = await supabase
      .from('ai_sessions')
      .select('total_cost_usd, developer_id')
      .eq('team_id', teamId)
      .gte('started_at', weekStartStr)
      .lt('started_at', tomorrowStr);

    const totalAiSpend = (aiData ?? []).reduce((sum, r) => sum + (r.total_cost_usd ?? 0), 0);

    // Code changes this week (commits/PRs)
    const { data: codeData } = await supabase
      .from('code_changes')
      .select('change_type')
      .eq('team_id', teamId)
      .gte('created_at', weekStartStr)
      .lt('created_at', tomorrowStr);

    const prsMerged = (codeData ?? []).filter(r => r.change_type === 'pr_merged').length;
    const commits = (codeData ?? []).filter(r => r.change_type === 'commit').length;

    // Tasks completed this week
    const { data: taskData, count: tasksTotal } = await supabase
      .from('tasks')
      .select('status', { count: 'exact' })
      .eq('team_id', teamId)
      .gte('created_at', weekStartStr);

    const tasksDone = (taskData ?? []).filter(r => r.status === 'completed').length;

    // Active developers (those with any activity this week)
    const { data: teamMembers } = await supabase
      .from('team_members')
      .select('id, name, email, role')
      .eq('team_id', teamId);

    const activeDeveloperIds = new Set(
      (aiData ?? []).map(r => r.developer_id).filter(Boolean)
    );
    const activeDevs = activeDeveloperIds.size;
    const totalDevs = (teamMembers ?? []).length;

    // Activity timeline (last 20 events)
    const { data: timelineData } = await supabase
      .from('activity_timeline')
      .select('id, event_type, title, description, developer_name, metadata, created_at')
      .eq('team_id', teamId)
      .order('created_at', { ascending: false })
      .limit(20);

    const timeline = (timelineData ?? []).map(e => ({
      id: e.id,
      eventType: e.event_type,
      title: e.title,
      description: e.description,
      developerName: e.developer_name,
      metadata: e.metadata,
      createdAt: e.created_at,
    }));

    // Unread alerts (top 3)
    const { data: alertData } = await supabase
      .from('alerts')
      .select('id, title, severity, description, created_at')
      .eq('team_id', teamId)
      .eq('is_read', false)
      .order('created_at', { ascending: false })
      .limit(3);

    const alerts = (alertData ?? []).map(a => ({
      id: a.id,
      title: a.title,
      severity: a.severity,
      description: a.description,
      createdAt: a.created_at,
    }));

    // Calculate team health score (0-100)
    const taskCompletionRate = (tasksTotal ?? 0) > 0 ? tasksDone / (tasksTotal ?? 1) : 0.5;
    const activeDevRate = totalDevs > 0 ? activeDevs / totalDevs : 0.5;

    const { data: scoreData } = await supabase
      .from('ai_sessions')
      .select('avg_prompt_score')
      .eq('team_id', teamId)
      .gte('started_at', weekStartStr)
      .not('avg_prompt_score', 'is', null);

    const avgScore = (scoreData ?? []).length > 0
      ? (scoreData ?? []).reduce((s, r) => s + (r.avg_prompt_score ?? 0), 0) / scoreData!.length
      : 50;

    const healthScore = Math.round(
      (taskCompletionRate * 30) + (activeDevRate * 25) + ((avgScore / 100) * 25) + (Math.min(prsMerged / 10, 1) * 20)
    );

    return NextResponse.json({
      greeting: getGreeting(ctx.name),
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
      ...EMPTY_RESPONSE,
    });
  }
}
