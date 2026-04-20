import { NextResponse } from 'next/server';
import { NextRequest } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-server';
import { guardApi } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const teamId = request.nextUrl.searchParams.get('team_id');
    if (!teamId) {
      return NextResponse.json({ error: 'team_id is required' }, { status: 400 });
    }

    const guard = await guardApi({ teamId });
    if (guard.response) return guard.response;
    const ctx = guard.ctx;

    const page = parseInt(request.nextUrl.searchParams.get('page') ?? '1', 10);
    const limit = parseInt(request.nextUrl.searchParams.get('limit') ?? '50', 10);
    const offset = (page - 1) * limit;

    const status = request.nextUrl.searchParams.get('status');
    const priority = request.nextUrl.searchParams.get('priority');
    const assigneeIdParam = request.nextUrl.searchParams.get('assignee_id');
    const project = request.nextUrl.searchParams.get('project');

    // Developers only ever see tasks assigned to themselves. Managers/owners
    // see all team tasks, optionally narrowed by the assignee_id filter.
    const isDeveloper = ctx.role === 'developer';
    const effectiveAssigneeId = isDeveloper ? ctx.memberId : assigneeIdParam;

    const supabase = getSupabaseAdmin();

    let query = supabase
      .from('tasks')
      .select(
        'id, title, description, status, priority, deadline, assignee_id, project, meeting_id, matched_changes, alignment_score, source, created_at',
        { count: 'exact' }
      )
      .eq('team_id', teamId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) query = query.eq('status', status);
    if (priority) query = query.eq('priority', priority);
    if (effectiveAssigneeId) query = query.eq('assignee_id', effectiveAssigneeId);
    if (project) query = query.eq('project', project);

    const { data: tasks, count, error } = await query;

    if (error) {
      console.error('Failed to fetch tasks:', error);
      return NextResponse.json({ tasks: [], total: 0, page, limit });
    }

    // Batch-fetch team members (all, for assignee dropdown) and meeting titles
    const meetingIds = [...new Set((tasks ?? []).map((t) => t.meeting_id).filter(Boolean))] as string[];

    const [allMembersResult, meetingResult] = await Promise.all([
      supabase.from('team_members').select('id, name').eq('team_id', teamId),
      meetingIds.length > 0
        ? supabase.from('meetings').select('id, title, date').in('id', meetingIds)
        : Promise.resolve({ data: [] }),
    ]);

    const allMembers = allMembersResult.data ?? [];
    const assigneeMap = new Map(allMembers.map((m) => [m.id, m.name]));
    const meetingMap = new Map(
      (meetingResult.data ?? []).map((m) => [m.id, { title: m.title, date: m.date }])
    );

    // Fetch AI cost per task (sessions matched to tasks)
    const taskIds = (tasks ?? []).map((t) => t.id);
    const aiCostMap = new Map<string, { cost: number; sessions: number }>();
    if (taskIds.length > 0) {
      const { data: aiSessionRows } = await supabase
        .from('ai_sessions')
        .select('matched_task_id, total_cost_usd')
        .in('matched_task_id', taskIds);

      for (const row of aiSessionRows ?? []) {
        const tid = row.matched_task_id as string;
        const entry = aiCostMap.get(tid) ?? { cost: 0, sessions: 0 };
        entry.cost += row.total_cost_usd ?? 0;
        entry.sessions++;
        aiCostMap.set(tid, entry);
      }
    }

    // Fetch linked code change details
    const allChangeIds = (tasks ?? [])
      .flatMap((t) => (t.matched_changes as string[]) ?? [])
      .filter(Boolean);
    const uniqueChangeIds = [...new Set(allChangeIds)];

    let codeChangeMap = new Map<string, { type: string; title: string; repo: string; branch: string | null; externalId: string; createdAt: string }>();
    if (uniqueChangeIds.length > 0) {
      const { data: changes } = await supabase
        .from('code_changes')
        .select('id, type, title, repo, branch, external_id, created_at')
        .in('id', uniqueChangeIds);
      codeChangeMap = new Map(
        (changes ?? []).map((c) => [c.id, {
          type: c.type,
          title: c.title,
          repo: c.repo,
          branch: c.branch,
          externalId: c.external_id,
          createdAt: c.created_at,
        }])
      );
    }

    const enrichedTasks = (tasks ?? []).map((task) => {
      const changeIds = (task.matched_changes as string[]) ?? [];
      const linkedChanges = changeIds
        .map((id) => {
          const change = codeChangeMap.get(id);
          if (!change) return null;
          return { id, ...change };
        })
        .filter(Boolean);

      return {
        id: task.id,
        title: task.title,
        description: task.description,
        status: task.status,
        priority: task.priority,
        deadline: task.deadline,
        assigneeId: task.assignee_id,
        assigneeName: assigneeMap.get(task.assignee_id) ?? null,
        project: task.project ?? null,
        meetingId: task.meeting_id,
        meetingTitle: meetingMap.get(task.meeting_id)?.title ?? null,
        meetingDate: meetingMap.get(task.meeting_id)?.date ?? null,
        matchedChanges: changeIds,
        linkedChanges,
        alignmentScore: task.alignment_score,
        source: task.source,
        createdAt: task.created_at,
        aiCost: aiCostMap.get(task.id)?.cost ?? 0,
        aiSessions: aiCostMap.get(task.id)?.sessions ?? 0,
      };
    });

    // Compute filter options for the UI
    const allProjects = [...new Set(enrichedTasks.map((t) => t.project).filter(Boolean))];
    const allAssignees = allMembers.map((m) => ({ id: m.id, name: m.name }));

    // Compute stats
    const allTasks = enrichedTasks;
    const totalCount = count ?? 0;
    const completedCount = allTasks.filter((t) => t.status === 'completed').length;
    const inProgressCount = allTasks.filter((t) => t.status === 'in_progress').length;
    const pendingCount = allTasks.filter((t) => t.status === 'pending').length;
    const highPriorityCount = allTasks.filter((t) => t.priority === 'high' && t.status !== 'completed').length;

    return NextResponse.json({
      tasks: enrichedTasks,
      total: totalCount,
      page,
      limit,
      stats: {
        total: totalCount,
        completed: completedCount,
        inProgress: inProgressCount,
        pending: pendingCount,
        highPriority: highPriorityCount,
        deliveryRate: totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0,
      },
      filters: {
        projects: allProjects,
        assignees: allAssignees,
      },
    });
  } catch (err) {
    console.error('Tasks API error:', err);
    return NextResponse.json({
      tasks: [],
      total: 0,
      page: 1,
      limit: 50,
      stats: { total: 0, completed: 0, inProgress: 0, pending: 0, highPriority: 0, deliveryRate: 0 },
      filters: { projects: [], assignees: [] },
    });
  }
}
