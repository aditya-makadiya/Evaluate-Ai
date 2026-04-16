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

    // Team info
    const { data: team } = await admin
      .from('teams')
      .select('id, name, slug, team_code, created_at, owner_id, settings')
      .eq('id', id)
      .single();

    if (!team) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 });
    }

    // Parallel fetches
    const [membersRes, integrationsRes, sessionsRes, tasksRes, codeChangesRes, recentSessionsRes] = await Promise.all([
      admin.from('team_members')
        .select('id, name, email, role, github_username, evaluateai_installed, is_active, joined_at, last_ai_sync_at')
        .eq('team_id', id)
        .order('joined_at', { ascending: true }),
      admin.from('integrations')
        .select('id, provider, status, last_sync_at, created_at')
        .eq('team_id', id),
      admin.from('ai_sessions')
        .select('id, developer_id, model, total_cost_usd, total_turns, total_input_tokens, total_output_tokens, avg_prompt_score, work_category, started_at, ended_at')
        .eq('team_id', id)
        .order('started_at', { ascending: false })
        .limit(200),
      admin.from('tasks')
        .select('id, title, status, priority, assignee_id, deadline, cycle_time_hours, created_at')
        .eq('team_id', id),
      admin.from('code_changes')
        .select('id, developer_id, type, repo, title, additions, deletions, files_changed, created_at')
        .eq('team_id', id)
        .gte('created_at', thirtyDaysAgo)
        .order('created_at', { ascending: false })
        .limit(50),
      admin.from('ai_sessions')
        .select('id, developer_id, model, total_cost_usd, total_turns, avg_prompt_score, work_summary, work_category, started_at, ended_at')
        .eq('team_id', id)
        .order('started_at', { ascending: false })
        .limit(20),
    ]);

    const members = membersRes.data ?? [];
    const integrations = integrationsRes.data ?? [];
    const allSessions = sessionsRes.data ?? [];
    const tasks = tasksRes.data ?? [];
    const codeChanges = codeChangesRes.data ?? [];
    const recentSessions = recentSessionsRes.data ?? [];

    // Member name map
    const memberNames = new Map<string, string>();
    for (const m of members) memberNames.set(m.id, m.name || m.email || m.id);

    // --- Aggregate stats ---
    const totalCost = allSessions.reduce((s, x) => s + (x.total_cost_usd ?? 0), 0);
    const totalTokens = allSessions.reduce((s, x) => s + (x.total_input_tokens ?? 0) + (x.total_output_tokens ?? 0), 0);
    const avgScore = allSessions.length > 0
      ? allSessions.reduce((s, x) => s + (x.avg_prompt_score ?? 0), 0) / allSessions.filter(x => x.avg_prompt_score != null).length
      : 0;

    // Cost per member
    const costByMember = new Map<string, { cost: number; sessions: number; tokens: number }>();
    for (const s of allSessions) {
      if (!s.developer_id) continue;
      const entry = costByMember.get(s.developer_id) ?? { cost: 0, sessions: 0, tokens: 0 };
      entry.cost += s.total_cost_usd ?? 0;
      entry.sessions += 1;
      entry.tokens += (s.total_input_tokens ?? 0) + (s.total_output_tokens ?? 0);
      costByMember.set(s.developer_id, entry);
    }

    // Model usage
    const modelMap = new Map<string, { count: number; cost: number }>();
    for (const s of allSessions) {
      const model = s.model ?? 'unknown';
      const entry = modelMap.get(model) ?? { count: 0, cost: 0 };
      entry.count += 1;
      entry.cost += s.total_cost_usd ?? 0;
      modelMap.set(model, entry);
    }

    // Work category breakdown
    const categoryMap = new Map<string, number>();
    for (const s of allSessions) {
      const cat = s.work_category ?? 'general';
      categoryMap.set(cat, (categoryMap.get(cat) ?? 0) + 1);
    }

    // Task stats
    const taskStats = { pending: 0, in_progress: 0, completed: 0, dropped: 0 };
    for (const t of tasks) {
      if (t.status in taskStats) (taskStats as Record<string, number>)[t.status] += 1;
    }

    // Code stats
    const commits = codeChanges.filter(c => c.type === 'commit').length;
    const prsOpened = codeChanges.filter(c => c.type === 'pr_opened').length;
    const prsMerged = codeChanges.filter(c => c.type === 'pr_merged').length;

    // Enrich members with AI stats
    const enrichedMembers = members.map((m) => {
      const stats = costByMember.get(m.id);
      return {
        id: m.id,
        name: m.name,
        email: m.email,
        role: m.role,
        githubUsername: m.github_username,
        cliInstalled: m.evaluateai_installed ?? false,
        isActive: m.is_active ?? true,
        joinedAt: m.joined_at,
        lastSyncAt: m.last_ai_sync_at,
        totalCost: stats?.cost ?? 0,
        totalSessions: stats?.sessions ?? 0,
        totalTokens: stats?.tokens ?? 0,
      };
    });

    // Enrich recent sessions
    const enrichedSessions = recentSessions.map((s) => {
      const dur = s.started_at && s.ended_at
        ? Math.round((new Date(s.ended_at).getTime() - new Date(s.started_at).getTime()) / 60000)
        : null;
      return {
        id: s.id,
        developerName: memberNames.get(s.developer_id) ?? 'Unknown',
        model: s.model,
        cost: s.total_cost_usd ?? 0,
        turns: s.total_turns ?? 0,
        score: s.avg_prompt_score,
        workSummary: s.work_summary,
        workCategory: s.work_category,
        startedAt: s.started_at,
        durationMin: dur,
      };
    });

    // Enrich tasks
    const enrichedTasks = tasks
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, 30)
      .map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        priority: t.priority,
        assigneeName: t.assignee_id ? (memberNames.get(t.assignee_id) ?? 'Unknown') : 'Unassigned',
        deadline: t.deadline,
        cycleTimeHours: t.cycle_time_hours,
        createdAt: t.created_at,
      }));

    // Enrich code changes
    const enrichedCodeChanges = codeChanges.slice(0, 30).map((c) => ({
      id: c.id,
      type: c.type,
      repo: c.repo,
      title: c.title,
      developerName: memberNames.get(c.developer_id) ?? 'Unknown',
      additions: c.additions,
      deletions: c.deletions,
      filesChanged: c.files_changed,
      createdAt: c.created_at,
    }));

    return NextResponse.json({
      team: {
        id: team.id,
        name: team.name,
        slug: team.slug,
        teamCode: team.team_code,
        createdAt: team.created_at,
      },
      stats: {
        memberCount: members.length,
        activeMembers: members.filter(m => m.is_active).length,
        integrationCount: integrations.filter(i => i.status === 'active').length,
        totalSessions: allSessions.length,
        totalCost,
        totalTokens,
        avgScore,
        taskStats,
        commits,
        prsOpened,
        prsMerged,
      },
      members: enrichedMembers,
      integrations: integrations.map(i => ({
        id: i.id,
        provider: i.provider,
        status: i.status,
        lastSyncAt: i.last_sync_at,
        createdAt: i.created_at,
      })),
      modelUsage: Array.from(modelMap.entries())
        .map(([model, stats]) => ({ model, ...stats }))
        .sort((a, b) => b.count - a.count),
      categoryBreakdown: Array.from(categoryMap.entries())
        .map(([category, count]) => ({ category, count }))
        .sort((a, b) => b.count - a.count),
      recentSessions: enrichedSessions,
      tasks: enrichedTasks,
      codeChanges: enrichedCodeChanges,
    });
  } catch (error) {
    console.error('Admin team detail error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
