import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase-server';

export async function GET(request: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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

    const sortBy = request.nextUrl.searchParams.get('sort') ?? 'name';

    // Fetch all team members for this team
    const { data: members } = await supabase
      .from('team_members')
      .select('id, user_id, name, email, role, github_username, evaluateai_installed')
      .eq('team_id', teamId);

    if (!members || members.length === 0) {
      return NextResponse.json({ developers: [] });
    }

    // Fetch AI sessions this week for this team
    const { data: aiSessions } = await supabase
      .from('ai_sessions')
      .select('developer_id, total_cost_usd, avg_prompt_score')
      .eq('team_id', teamId)
      .gte('started_at', weekStartStr)
      .lt('started_at', tomorrowStr);

    // Fetch code changes this week for this team
    const { data: codeChanges } = await supabase
      .from('code_changes')
      .select('developer_id, type')
      .eq('team_id', teamId)
      .gte('created_at', weekStartStr)
      .lt('created_at', tomorrowStr);

    // Fetch tasks this week for this team
    const { data: tasks } = await supabase
      .from('tasks')
      .select('assignee_id, status')
      .eq('team_id', teamId)
      .gte('created_at', weekStartStr);

    // Aggregate per developer
    const developers = members.map(m => {
      const devId = m.id;

      const devSessions = (aiSessions ?? []).filter(s => s.developer_id === devId);
      const aiCost = devSessions.reduce((sum, s) => sum + (s.total_cost_usd ?? 0), 0);
      const scores = devSessions.filter(s => s.avg_prompt_score != null).map(s => s.avg_prompt_score!);
      const avgPromptScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;

      const devChanges = (codeChanges ?? []).filter(c => c.developer_id === devId);
      const commitsCount = devChanges.filter(c => c.type === 'commit').length;
      const prsCount = devChanges.filter(c => c.type === 'pr_opened' || c.type === 'pr_merged').length;
      const reviewsCount = devChanges.filter(c => c.type === 'review').length;

      const devTasks = (tasks ?? []).filter(t => t.assignee_id === devId);
      const tasksCompleted = devTasks.filter(t => t.status === 'completed').length;
      const tasksTotal = devTasks.length;

      // Calculate alignment score
      const activityScore = Math.min((commitsCount + prsCount + reviewsCount) * 5, 40);
      const taskScore = tasksTotal > 0 ? (tasksCompleted / tasksTotal) * 30 : 15;
      const promptScore = avgPromptScore != null ? (avgPromptScore / 100) * 30 : 15;
      const alignmentScore = Math.round(activityScore + taskScore + promptScore);

      // Status determination
      const hasActivity = commitsCount > 0 || prsCount > 0 || devSessions.length > 0;
      const taskCompletionRate = tasksTotal > 0 ? tasksCompleted / tasksTotal : 1;
      let status: 'on_track' | 'at_risk' | 'inactive' = 'on_track';
      if (!hasActivity) status = 'inactive';
      else if (taskCompletionRate < 0.3 || (avgPromptScore != null && avgPromptScore < 40)) status = 'at_risk';

      return {
        id: m.id,
        userId: devId,
        name: m.name,
        email: m.email,
        role: m.role,
        githubUsername: m.github_username,
        evaluateaiInstalled: m.evaluateai_installed ?? false,
        alignmentScore: Math.min(alignmentScore, 100),
        commits: commitsCount,
        prs: prsCount,
        reviews: reviewsCount,
        aiCost,
        avgPromptScore,
        tasksCompleted,
        tasksTotal,
        status,
      };
    });

    // RBAC: Developers can only see their own data
    if (ctx.role === 'developer') {
      const selfIndex = developers.findIndex(d => d.id === ctx.memberId);
      if (selfIndex >= 0) {
        developers.splice(0, developers.length, developers[selfIndex]);
      } else {
        developers.length = 0;
      }
    }

    // Sort
    switch (sortBy) {
      case 'score':
        developers.sort((a, b) => b.alignmentScore - a.alignmentScore);
        break;
      case 'cost':
        developers.sort((a, b) => b.aiCost - a.aiCost);
        break;
      case 'activity':
        developers.sort((a, b) => (b.commits + b.prs + b.reviews) - (a.commits + a.prs + a.reviews));
        break;
      default:
        developers.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));
    }

    return NextResponse.json({ developers });
  } catch (err) {
    console.error('Developers API error:', err);
    return NextResponse.json({ developers: [] });
  }
}
