import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuthContext } from '@/lib/admin-auth';
import { getSupabaseAdmin } from '@/lib/supabase-server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getAdminAuthContext();
  if (!ctx) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const { id } = await params;
    const admin = getSupabaseAdmin();
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();

    // Member info
    const { data: member } = await admin
      .from('team_members')
      .select('id, team_id, user_id, name, email, role, github_username, evaluateai_installed, is_active, joined_at, last_ai_sync_at')
      .eq('id', id)
      .single();

    if (!member) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Team name
    const { data: team } = await admin
      .from('teams')
      .select('id, name, slug')
      .eq('id', member.team_id)
      .single();

    // Parallel fetches
    const [sessionsRes, codeChangesRes, tasksRes] = await Promise.all([
      admin.from('ai_sessions')
        .select('id, model, total_cost_usd, total_turns, total_input_tokens, total_output_tokens, avg_prompt_score, efficiency_score, work_summary, work_category, work_tags, started_at, ended_at, git_repo, files_changed, total_tool_calls')
        .eq('developer_id', id)
        .order('started_at', { ascending: false })
        .limit(100),
      admin.from('code_changes')
        .select('id, type, repo, branch, title, additions, deletions, files_changed, is_ai_assisted, created_at')
        .eq('developer_id', id)
        .order('created_at', { ascending: false })
        .limit(50),
      admin.from('tasks')
        .select('id, title, status, priority, deadline, cycle_time_hours, source, created_at, completed_at')
        .eq('assignee_id', id)
        .order('created_at', { ascending: false })
        .limit(50),
    ]);

    const sessions = sessionsRes.data ?? [];
    const codeChanges = codeChangesRes.data ?? [];
    const tasks = tasksRes.data ?? [];

    // --- Aggregate stats ---
    const totalCost = sessions.reduce((s, x) => s + (x.total_cost_usd ?? 0), 0);
    const totalTokens = sessions.reduce((s, x) => s + (x.total_input_tokens ?? 0) + (x.total_output_tokens ?? 0), 0);
    const scoresFiltered = sessions.filter(x => x.avg_prompt_score != null);
    const avgScore = scoresFiltered.length > 0
      ? scoresFiltered.reduce((s, x) => s + (x.avg_prompt_score ?? 0), 0) / scoresFiltered.length
      : null;

    // Sessions in last 30 days
    const recentSessions = sessions.filter(s => s.started_at >= thirtyDaysAgo);

    // Model usage breakdown
    const modelMap = new Map<string, { count: number; cost: number }>();
    for (const s of sessions) {
      const model = s.model ?? 'unknown';
      const entry = modelMap.get(model) ?? { count: 0, cost: 0 };
      entry.count += 1;
      entry.cost += s.total_cost_usd ?? 0;
      modelMap.set(model, entry);
    }

    // Work category breakdown
    const categoryMap = new Map<string, number>();
    for (const s of sessions) {
      const cat = s.work_category ?? 'general';
      categoryMap.set(cat, (categoryMap.get(cat) ?? 0) + 1);
    }

    // Daily activity (last 30 days)
    const dailyMap = new Map<string, { sessions: number; cost: number }>();
    for (const s of recentSessions) {
      const day = s.started_at.slice(0, 10);
      const entry = dailyMap.get(day) ?? { sessions: 0, cost: 0 };
      entry.sessions += 1;
      entry.cost += s.total_cost_usd ?? 0;
      dailyMap.set(day, entry);
    }
    const dailyActivity = Array.from(dailyMap.entries())
      .map(([date, stats]) => ({ date, ...stats }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Task stats
    const taskStats = { pending: 0, in_progress: 0, completed: 0, dropped: 0 };
    for (const t of tasks) {
      if (t.status in taskStats) (taskStats as Record<string, number>)[t.status] += 1;
    }

    // Code stats
    const commits = codeChanges.filter(c => c.type === 'commit').length;
    const prsOpened = codeChanges.filter(c => c.type === 'pr_opened').length;
    const prsMerged = codeChanges.filter(c => c.type === 'pr_merged').length;
    const totalAdditions = codeChanges.reduce((s, c) => s + (c.additions ?? 0), 0);
    const totalDeletions = codeChanges.reduce((s, c) => s + (c.deletions ?? 0), 0);

    // Enrich sessions for display
    const enrichedSessions = sessions.slice(0, 30).map((s) => {
      const dur = s.started_at && s.ended_at
        ? Math.round((new Date(s.ended_at).getTime() - new Date(s.started_at).getTime()) / 60000)
        : null;
      return {
        id: s.id,
        model: s.model,
        cost: s.total_cost_usd ?? 0,
        turns: s.total_turns ?? 0,
        inputTokens: s.total_input_tokens ?? 0,
        outputTokens: s.total_output_tokens ?? 0,
        score: s.avg_prompt_score,
        efficiencyScore: s.efficiency_score,
        workSummary: s.work_summary,
        workCategory: s.work_category,
        workTags: s.work_tags,
        gitRepo: s.git_repo,
        filesChanged: s.files_changed,
        toolCalls: s.total_tool_calls,
        startedAt: s.started_at,
        durationMin: dur,
      };
    });

    // Enrich code changes
    const enrichedCodeChanges = codeChanges.slice(0, 30).map((c) => ({
      id: c.id,
      type: c.type,
      repo: c.repo,
      branch: c.branch,
      title: c.title,
      additions: c.additions,
      deletions: c.deletions,
      filesChanged: c.files_changed,
      isAiAssisted: c.is_ai_assisted,
      createdAt: c.created_at,
    }));

    // Enrich tasks
    const enrichedTasks = tasks.slice(0, 30).map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      priority: t.priority,
      deadline: t.deadline,
      cycleTimeHours: t.cycle_time_hours,
      source: t.source,
      completedAt: t.completed_at,
      createdAt: t.created_at,
    }));

    return NextResponse.json({
      user: {
        id: member.id,
        userId: member.user_id,
        name: member.name,
        email: member.email,
        role: member.role,
        githubUsername: member.github_username,
        cliInstalled: member.evaluateai_installed ?? false,
        isActive: member.is_active ?? true,
        joinedAt: member.joined_at,
        lastSyncAt: member.last_ai_sync_at,
        teamId: member.team_id,
        teamName: team?.name ?? 'Unknown',
        teamSlug: team?.slug ?? '',
      },
      stats: {
        totalSessions: sessions.length,
        recentSessions: recentSessions.length,
        totalCost,
        totalTokens,
        avgScore,
        taskStats,
        totalTasks: tasks.length,
        commits,
        prsOpened,
        prsMerged,
        totalAdditions,
        totalDeletions,
      },
      modelUsage: Array.from(modelMap.entries())
        .map(([model, stats]) => ({ model, ...stats }))
        .sort((a, b) => b.count - a.count),
      categoryBreakdown: Array.from(categoryMap.entries())
        .map(([category, count]) => ({ category, count }))
        .sort((a, b) => b.count - a.count),
      dailyActivity,
      sessions: enrichedSessions,
      codeChanges: enrichedCodeChanges,
      tasks: enrichedTasks,
    });
  } catch (error) {
    console.error('Admin user detail error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
