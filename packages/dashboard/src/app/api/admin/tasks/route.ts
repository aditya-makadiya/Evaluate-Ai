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

    // Fetch ALL tasks (not filtered by created_at — a task created months ago
    // could have been completed this week). We use status_updated_at or
    // created_at for period-relevant activity below.
    let tasksQuery = admin
      .from('tasks')
      .select('id, team_id, assignee_id, title, description, status, priority, source, deadline, cycle_time_hours, matched_changes, first_commit_at, completed_at, status_updated_at, created_at');

    if (teamId) {
      tasksQuery = tasksQuery.eq('team_id', teamId);
    }

    const { data: tasks } = await tasksQuery;
    const allTasks = tasks ?? [];

    // Status breakdown (all tasks, regardless of period)
    const statusCounts: Record<string, number> = { pending: 0, in_progress: 0, completed: 0, dropped: 0 };
    for (const t of allTasks) {
      if (t.status in statusCounts) statusCounts[t.status] += 1;
    }

    const totalTasks = allTasks.length;
    const completionRate = totalTasks > 0
      ? (statusCounts.completed / totalTasks) * 100
      : 0;

    // Tasks active in period (created or status changed within period)
    const periodTasks = allTasks.filter((t) => {
      const updated = t.status_updated_at ?? t.created_at;
      return updated >= since;
    });

    // Average cycle time (all tasks that have it)
    const tasksWithCycleTime = allTasks.filter((t) => t.cycle_time_hours != null);
    const avgCycleTime = tasksWithCycleTime.length > 0
      ? tasksWithCycleTime.reduce((sum, t) => sum + (t.cycle_time_hours ?? 0), 0) / tasksWithCycleTime.length
      : 0;

    // Overdue tasks (deadline in past, not completed/dropped)
    const now = new Date().toISOString();
    const overdueTasks = allTasks.filter(
      (t) => t.deadline && t.deadline < now && t.status !== 'completed' && t.status !== 'dropped'
    );

    // By team breakdown
    const teamMap = new Map<string, { total: number; completed: number; inProgress: number; pending: number }>();
    for (const t of allTasks) {
      const entry = teamMap.get(t.team_id) ?? { total: 0, completed: 0, inProgress: 0, pending: 0 };
      entry.total += 1;
      if (t.status === 'completed') entry.completed += 1;
      else if (t.status === 'in_progress') entry.inProgress += 1;
      else if (t.status === 'pending') entry.pending += 1;
      teamMap.set(t.team_id, entry);
    }

    // Resolve team names
    const teamIds = Array.from(teamMap.keys());
    const teamNames = new Map<string, string>();
    if (teamIds.length > 0) {
      const { data: teams } = await admin
        .from('teams')
        .select('id, name')
        .in('id', teamIds);
      for (const tm of teams ?? []) {
        teamNames.set(tm.id, tm.name);
      }
    }

    const byTeam = Array.from(teamMap.entries())
      .map(([id, stats]) => ({
        teamId: id,
        teamName: teamNames.get(id) ?? id,
        ...stats,
        completionRate: stats.total > 0 ? (stats.completed / stats.total) * 100 : 0,
      }))
      .sort((a, b) => b.total - a.total);

    // Resolve all assignee names
    const allAssigneeIds = [...new Set(allTasks.map((t) => t.assignee_id).filter(Boolean))];
    const assigneeNames = new Map<string, string>();
    if (allAssigneeIds.length > 0) {
      const { data: members } = await admin
        .from('team_members')
        .select('id, name, email')
        .in('id', allAssigneeIds);
      for (const m of members ?? []) {
        assigneeNames.set(m.id, m.name || m.email || m.id);
      }
    }

    // Overdue task list
    const overdueList = overdueTasks.map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      priority: t.priority,
      deadline: t.deadline,
      teamName: teamNames.get(t.team_id) ?? t.team_id,
      assigneeName: t.assignee_id ? (assigneeNames.get(t.assignee_id) ?? t.assignee_id) : 'Unassigned',
    }));

    // Full task list for detailed view
    const taskList = allTasks
      .sort((a, b) => (b.status_updated_at ?? b.created_at).localeCompare(a.status_updated_at ?? a.created_at))
      .map((t) => ({
        id: t.id,
        title: t.title,
        description: t.description,
        status: t.status,
        priority: t.priority,
        source: t.source,
        deadline: t.deadline,
        cycleTimeHours: t.cycle_time_hours,
        hasCodeChanges: (t.matched_changes?.length ?? 0) > 0,
        firstCommitAt: t.first_commit_at,
        completedAt: t.completed_at,
        teamId: t.team_id,
        teamName: teamNames.get(t.team_id) ?? t.team_id,
        assigneeName: t.assignee_id ? (assigneeNames.get(t.assignee_id) ?? t.assignee_id) : 'Unassigned',
        createdAt: t.created_at,
        updatedAt: t.status_updated_at,
      }));

    // Period activity counts
    const periodCreated = periodTasks.filter((t) => t.created_at >= since).length;
    const periodCompleted = periodTasks.filter((t) => t.status === 'completed' && (t.completed_at ?? t.status_updated_at ?? '') >= since).length;

    return NextResponse.json({
      totalTasks,
      statusCounts,
      completionRate,
      avgCycleTime,
      overdueCount: overdueTasks.length,
      periodCreated,
      periodCompleted,
      byTeam,
      overdueTasks: overdueList,
      taskList,
    });
  } catch (error) {
    console.error('Admin tasks error:', error);
    return NextResponse.json({
      totalTasks: 0,
      statusCounts: { pending: 0, in_progress: 0, completed: 0, dropped: 0 },
      completionRate: 0,
      avgCycleTime: 0,
      overdueCount: 0,
      periodCreated: 0,
      periodCompleted: 0,
      byTeam: [],
      overdueTasks: [],
      taskList: [],
    });
  }
}
