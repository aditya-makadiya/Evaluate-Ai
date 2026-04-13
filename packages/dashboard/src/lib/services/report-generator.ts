import { SupabaseClient } from '@supabase/supabase-js';

// ── Types ──────────────────────────────────────────────────────────

interface TeamMember {
  id: string;
  name: string;
  email: string;
}

interface DeveloperReport {
  developerId: string;
  developerName: string;
  commitsCount: number;
  prsOpened: number;
  prsMerged: number;
  reviewsGiven: number;
  linesAdded: number;
  linesRemoved: number;
  aiSessionsCount: number;
  aiTotalCost: number;
  aiAvgPromptScore: number | null;
  aiTokensUsed: number;
  aiModelBreakdown: Record<string, number>;
  tasksAssigned: number;
  tasksCompleted: number;
  tasksInProgress: number;
  alignmentScore: number | null;
}

interface AlertRecord {
  team_id: string;
  type: string;
  severity: string;
  title: string;
  description: string;
  developer_id?: string;
  task_id?: string;
}

export interface GenerateReportsResult {
  reportsGenerated: number;
  alertsGenerated: number;
  staleSessionsClosed: number;
  date: string;
}

// ── Stale session cleanup ──────────────────────────────────────────

export async function cleanupStaleSessions(
  supabase: SupabaseClient,
  teamId: string,
): Promise<number> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const { data: staleRows } = await supabase
    .from('ai_sessions')
    .select('id, started_at')
    .eq('team_id', teamId)
    .is('ended_at', null)
    .lt('started_at', oneHourAgo);

  if (!staleRows || staleRows.length === 0) return 0;

  await Promise.all(
    staleRows.map((row) =>
      supabase
        .from('ai_sessions')
        .update({ ended_at: row.started_at })
        .eq('id', row.id),
    ),
  );

  return staleRows.length;
}

// ── Per-member aggregation ─────────────────────────────────────────

async function aggregateMemberReport(
  supabase: SupabaseClient,
  teamId: string,
  member: TeamMember,
  dateFrom: string,
  dateTo: string,
): Promise<DeveloperReport> {
  const [{ data: codeChanges }, { data: aiSessions }, { data: tasksData }] =
    await Promise.all([
      supabase
        .from('code_changes')
        .select('type, additions, deletions')
        .eq('developer_id', member.id)
        .gte('created_at', dateFrom)
        .lt('created_at', dateTo),
      supabase
        .from('ai_sessions')
        .select(
          'id, total_cost_usd, avg_prompt_score, total_input_tokens, total_output_tokens, model',
        )
        .eq('developer_id', member.id)
        .gte('started_at', dateFrom)
        .lt('started_at', dateTo),
      supabase
        .from('tasks')
        .select('status')
        .eq('team_id', teamId)
        .eq('assignee_id', member.id),
    ]);

  const changes = codeChanges ?? [];
  const sessions = aiSessions ?? [];
  const tasks = tasksData ?? [];

  const commitsCount = changes.filter((c) => c.type === 'commit').length;
  const prsOpened = changes.filter((c) => c.type === 'pr_opened').length;
  const prsMerged = changes.filter((c) => c.type === 'pr_merged').length;
  const reviewsGiven = changes.filter((c) => c.type === 'review').length;
  const linesAdded = changes.reduce((sum, c) => sum + (c.additions ?? 0), 0);
  const linesRemoved = changes.reduce(
    (sum, c) => sum + (c.deletions ?? 0),
    0,
  );

  const aiSessionsCount = sessions.length;
  const aiTotalCost = sessions.reduce(
    (sum, s) => sum + (s.total_cost_usd ?? 0),
    0,
  );
  const scoresWithValues = sessions.filter(
    (s) => s.avg_prompt_score != null,
  );
  const aiAvgPromptScore =
    scoresWithValues.length > 0
      ? scoresWithValues.reduce(
          (sum, s) => sum + (s.avg_prompt_score ?? 0),
          0,
        ) / scoresWithValues.length
      : null;
  const aiTokensUsed = sessions.reduce(
    (sum, s) =>
      sum + (s.total_input_tokens ?? 0) + (s.total_output_tokens ?? 0),
    0,
  );

  const aiModelBreakdown: Record<string, number> = {};
  for (const s of sessions) {
    const model = s.model ?? 'unknown';
    aiModelBreakdown[model] = (aiModelBreakdown[model] ?? 0) + 1;
  }

  const tasksAssigned = tasks.length;
  const tasksCompleted = tasks.filter(
    (t) => t.status === 'completed' || t.status === 'done',
  ).length;
  const tasksInProgress = tasks.filter(
    (t) => t.status === 'in_progress',
  ).length;

  const alignmentScore =
    tasksAssigned > 0
      ? Math.round((tasksCompleted / tasksAssigned) * 100)
      : null;

  return {
    developerId: member.id,
    developerName: member.name,
    commitsCount,
    prsOpened,
    prsMerged,
    reviewsGiven,
    linesAdded,
    linesRemoved,
    aiSessionsCount,
    aiTotalCost,
    aiAvgPromptScore,
    aiTokensUsed,
    aiModelBreakdown,
    tasksAssigned,
    tasksCompleted,
    tasksInProgress,
    alignmentScore,
  };
}

// ── Upsert daily report row ────────────────────────────────────────

async function upsertDailyReport(
  supabase: SupabaseClient,
  teamId: string,
  member: TeamMember,
  report: DeveloperReport,
  date: string,
  generatedAt: string,
): Promise<boolean> {
  const summaryParts: string[] = [];
  if (report.commitsCount > 0)
    summaryParts.push(
      `${report.commitsCount} commit${report.commitsCount > 1 ? 's' : ''}`,
    );
  if (report.prsOpened > 0)
    summaryParts.push(
      `opened ${report.prsOpened} PR${report.prsOpened > 1 ? 's' : ''}`,
    );
  if (report.prsMerged > 0)
    summaryParts.push(
      `merged ${report.prsMerged} PR${report.prsMerged > 1 ? 's' : ''}`,
    );
  if (report.reviewsGiven > 0)
    summaryParts.push(
      `${report.reviewsGiven} review${report.reviewsGiven > 1 ? 's' : ''}`,
    );

  let aiSummary =
    summaryParts.length > 0
      ? `${member.name} made ${summaryParts.join(', ')}.`
      : `${member.name} had no code activity.`;

  if (report.aiSessionsCount > 0) {
    aiSummary += ` Used AI for ${report.aiSessionsCount} session${report.aiSessionsCount > 1 ? 's' : ''} ($${report.aiTotalCost.toFixed(2)})`;
  }

  const { error } = await supabase.from('daily_reports').upsert(
    {
      team_id: teamId,
      developer_id: member.id,
      date,
      commits_count: report.commitsCount,
      prs_opened: report.prsOpened,
      prs_merged: report.prsMerged,
      reviews_given: report.reviewsGiven,
      lines_added: report.linesAdded,
      lines_removed: report.linesRemoved,
      ai_summary: aiSummary,
      tasks_assigned: report.tasksAssigned,
      tasks_completed: report.tasksCompleted,
      planned_commits: report.commitsCount,
      unplanned_commits: 0,
      alignment_score: report.alignmentScore,
      ai_sessions_count: report.aiSessionsCount,
      ai_total_cost: report.aiTotalCost,
      ai_avg_prompt_score: report.aiAvgPromptScore,
      ai_tokens_used: report.aiTokensUsed,
      ai_model_breakdown: report.aiModelBreakdown,
      generated_at: generatedAt,
    },
    { onConflict: 'developer_id,date' },
  );

  return !error;
}

// ── Team alignment report ──────────────────────────────────────────

async function upsertAlignmentReport(
  supabase: SupabaseClient,
  teamId: string,
  memberCount: number,
  reports: DeveloperReport[],
  date: string,
  generatedAt: string,
): Promise<void> {
  const activeDevelopers = reports.filter(
    (r) => r.commitsCount > 0 || r.aiSessionsCount > 0,
  ).length;

  const totalCommits = reports.reduce((s, r) => s + r.commitsCount, 0);
  const totalPrs = reports.reduce((s, r) => s + r.prsOpened + r.prsMerged, 0);
  const totalAiCost = reports.reduce((s, r) => s + r.aiTotalCost, 0);
  const totalTasksAssigned = reports.reduce((s, r) => s + r.tasksAssigned, 0);
  const totalTasksCompleted = reports.reduce(
    (s, r) => s + r.tasksCompleted,
    0,
  );
  const totalTasksInProgress = reports.reduce(
    (s, r) => s + r.tasksInProgress,
    0,
  );
  const totalTasksDropped = Math.max(
    0,
    totalTasksAssigned - totalTasksCompleted - totalTasksInProgress,
  );

  const scores = reports
    .map((r) => r.aiAvgPromptScore)
    .filter((s): s is number => s != null);
  const avgPromptScore =
    scores.length > 0
      ? scores.reduce((a, b) => a + b, 0) / scores.length
      : null;

  const taskRate =
    totalTasksAssigned > 0 ? totalTasksCompleted / totalTasksAssigned : 0.5;
  const activeRate = memberCount > 0 ? activeDevelopers / memberCount : 0.5;
  const promptScoreNorm =
    avgPromptScore != null ? avgPromptScore / 100 : 0.5;
  const teamHealthScore = Math.round(
    taskRate * 35 +
      activeRate * 25 +
      promptScoreNorm * 25 +
      Math.min(totalPrs / 10, 1) * 15,
  );

  const { data: tasksWithCode } = await supabase
    .from('tasks')
    .select('id, matched_changes')
    .eq('team_id', teamId)
    .not('matched_changes', 'is', null);

  const meetingToCodeRate =
    totalTasksAssigned > 0
      ? (tasksWithCode ?? []).length / totalTasksAssigned
      : 0;

  await supabase.from('alignment_reports').upsert(
    {
      team_id: teamId,
      date,
      team_health_score: Math.min(teamHealthScore, 100),
      active_developers: activeDevelopers,
      total_developers: memberCount,
      tasks_total: totalTasksAssigned,
      tasks_completed: totalTasksCompleted,
      tasks_in_progress: totalTasksInProgress,
      tasks_dropped: totalTasksDropped,
      unplanned_work_count: 0,
      total_commits: totalCommits,
      total_prs: totalPrs,
      total_ai_cost: totalAiCost,
      avg_prompt_score: avgPromptScore,
      meeting_to_code_rate: meetingToCodeRate,
      generated_at: generatedAt,
    },
    { onConflict: 'team_id,date' },
  );
}

// ── Alert generation ───────────────────────────────────────────────

async function generateAlerts(
  supabase: SupabaseClient,
  teamId: string,
  members: TeamMember[],
  reports: DeveloperReport[],
  now: Date,
): Promise<number> {
  const alerts: AlertRecord[] = [];
  const threeDaysAgo = new Date(now);
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

  // Stale tasks (no status update for 3+ days)
  const [{ data: staleTasks }, { data: staleTasksNoUpdate }] =
    await Promise.all([
      supabase
        .from('tasks')
        .select('id, title, assignee_id, status, status_updated_at, created_at')
        .eq('team_id', teamId)
        .in('status', ['pending', 'in_progress'])
        .lt('status_updated_at', threeDaysAgo.toISOString()),
      supabase
        .from('tasks')
        .select('id, title, assignee_id, status, created_at')
        .eq('team_id', teamId)
        .in('status', ['pending', 'in_progress'])
        .is('status_updated_at', null)
        .lt('created_at', threeDaysAgo.toISOString()),
    ]);

  for (const task of [...(staleTasks ?? []), ...(staleTasksNoUpdate ?? [])]) {
    alerts.push({
      team_id: teamId,
      type: 'task_stale',
      severity: 'critical',
      title: `Stale task: ${task.title}`,
      description: `No activity for 3+ days. Status: ${task.status}`,
      developer_id: task.assignee_id ?? undefined,
      task_id: task.id,
    });
  }

  // High AI cost (> 2x team average)
  const totalAiCost = reports.reduce((s, r) => s + r.aiTotalCost, 0);
  const avgCost = members.length > 0 ? totalAiCost / members.length : 0;
  if (avgCost > 0) {
    for (const report of reports) {
      if (report.aiTotalCost > avgCost * 2) {
        alerts.push({
          team_id: teamId,
          type: 'high_ai_cost',
          severity: 'warning',
          title: `High AI cost: ${report.developerName}`,
          description: `Spent $${report.aiTotalCost.toFixed(2)} yesterday (team avg: $${avgCost.toFixed(2)})`,
          developer_id: report.developerId,
        });
      }
    }
  }

  // Low prompt score (< 40)
  for (const report of reports) {
    if (report.aiAvgPromptScore != null && report.aiAvgPromptScore < 40) {
      alerts.push({
        team_id: teamId,
        type: 'low_prompt_score',
        severity: 'warning',
        title: `Low prompt quality: ${report.developerName}`,
        description: `Average prompt score of ${Math.round(report.aiAvgPromptScore)} (threshold: 40)`,
        developer_id: report.developerId,
      });
    }
  }

  // Sprint risk (< 50% done with < 2 days left)
  const { data: deadlineTasks } = await supabase
    .from('tasks')
    .select('id, title, status, deadline, assignee_id')
    .eq('team_id', teamId)
    .not('deadline', 'is', null);

  if (deadlineTasks && deadlineTasks.length > 0) {
    const twoDaysFromNow = new Date(now);
    twoDaysFromNow.setDate(twoDaysFromNow.getDate() + 2);

    const urgentTasks = deadlineTasks.filter(
      (t) => new Date(t.deadline) <= twoDaysFromNow,
    );
    if (urgentTasks.length > 0) {
      const urgentDone = urgentTasks.filter(
        (t) => t.status === 'completed' || t.status === 'done',
      ).length;
      const completionRate = urgentDone / urgentTasks.length;
      if (completionRate < 0.5) {
        alerts.push({
          team_id: teamId,
          type: 'sprint_risk',
          severity: 'critical',
          title: 'Sprint at risk',
          description: `Only ${Math.round(completionRate * 100)}% of deadline tasks completed with < 2 days remaining (${urgentDone}/${urgentTasks.length})`,
        });
      }
    }
  }

  // Inactive developers (no activity in 3 days)
  const inactivityChecks = await Promise.all(
    members.map(async (member) => {
      const [{ data: recentCode }, { data: recentAi }] = await Promise.all([
        supabase
          .from('code_changes')
          .select('id')
          .eq('developer_id', member.id)
          .gte('created_at', threeDaysAgo.toISOString())
          .limit(1),
        supabase
          .from('ai_sessions')
          .select('id')
          .eq('developer_id', member.id)
          .gte('started_at', threeDaysAgo.toISOString())
          .limit(1),
      ]);
      return { member, hasActivity: (recentCode?.length ?? 0) > 0 || (recentAi?.length ?? 0) > 0 };
    }),
  );

  for (const { member, hasActivity } of inactivityChecks) {
    if (!hasActivity) {
      alerts.push({
        team_id: teamId,
        type: 'inactive_developer',
        severity: 'warning',
        title: `Inactive: ${member.name}`,
        description: 'No commits or AI sessions in the last 3 days',
        developer_id: member.id,
      });
    }
  }

  // High performers (positive signal)
  for (const report of reports) {
    if (
      report.aiAvgPromptScore != null &&
      report.aiAvgPromptScore > 85 &&
      report.commitsCount > 0
    ) {
      alerts.push({
        team_id: teamId,
        type: 'high_performer',
        severity: 'positive',
        title: `High performer: ${report.developerName}`,
        description: `Prompt score ${Math.round(report.aiAvgPromptScore)} with ${report.commitsCount} commits yesterday`,
        developer_id: report.developerId,
      });
    }
  }

  if (alerts.length === 0) return 0;

  const { error } = await supabase.from('alerts').insert(alerts);
  return error ? 0 : alerts.length;
}

// ── Main entry point ───────────────────────────────────────────────

/**
 * Generate daily reports, alignment data, and alerts for a single team.
 * Called by the Sync Now button (via API) or the cron job.
 *
 * @param date - The date to generate reports for (YYYY-MM-DD). Defaults to yesterday.
 */
export async function generateTeamReports(
  supabase: SupabaseClient,
  teamId: string,
  date?: string,
): Promise<GenerateReportsResult> {
  const now = new Date();
  const generatedAt = now.toISOString();

  const reportDate =
    date ?? new Date(now.getTime() - 86_400_000).toISOString().slice(0, 10);
  const nextDay = new Date(reportDate + 'T00:00:00Z');
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);
  const nextDayStr = nextDay.toISOString().slice(0, 10);

  // Clean up stale sessions for this team
  let staleSessionsClosed = 0;
  try {
    staleSessionsClosed = await cleanupStaleSessions(supabase, teamId);
  } catch {
    // Non-critical
  }

  // Fetch active team members
  const { data: members } = await supabase
    .from('team_members')
    .select('id, name, email')
    .eq('team_id', teamId)
    .eq('is_active', true);

  if (!members || members.length === 0) {
    return { reportsGenerated: 0, alertsGenerated: 0, staleSessionsClosed, date: reportDate };
  }

  // Aggregate all member reports in parallel
  const developerReports = await Promise.all(
    members.map((m) =>
      aggregateMemberReport(supabase, teamId, m, reportDate, nextDayStr),
    ),
  );

  // Upsert daily reports in parallel
  const upsertResults = await Promise.all(
    members.map((m, i) =>
      upsertDailyReport(supabase, teamId, m, developerReports[i], reportDate, generatedAt),
    ),
  );
  const reportsGenerated = upsertResults.filter(Boolean).length;

  // Upsert team alignment report
  await upsertAlignmentReport(
    supabase,
    teamId,
    members.length,
    developerReports,
    reportDate,
    generatedAt,
  );

  // Generate alerts
  const alertsGenerated = await generateAlerts(
    supabase,
    teamId,
    members,
    developerReports,
    now,
  );

  return { reportsGenerated, alertsGenerated, staleSessionsClosed, date: reportDate };
}
