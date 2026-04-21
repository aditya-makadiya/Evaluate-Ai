import { getSupabaseAdmin } from '@/lib/supabase-server';
import { generateText } from '@/lib/ai-provider';

// ---------- Types ----------

interface CodeChange {
  id: string;
  developer_id: string | null;
  type: string; // commit, pr_opened, pr_merged, pr_closed, review
  repo: string;
  branch: string | null;
  title: string;
  body: string | null;
  files_changed: number;
}

interface OpenTask {
  id: string;
  title: string;
  description: string | null;
  project: string | null;
  assignee_id: string | null;
  status: string;
}

interface MatchResult {
  taskId: string;
  score: number; // 0-100
  reason: string;
}

// ---------- Keyword Matching (fast, no AI) ----------

function keywordMatch(codeChange: CodeChange, task: OpenTask): number {
  const changeText = `${codeChange.title} ${codeChange.body ?? ''} ${codeChange.repo}`.toLowerCase();
  const taskText = `${task.title} ${task.description ?? ''} ${task.project ?? ''}`.toLowerCase();

  // Extract meaningful words (3+ chars, no common stop words)
  const stopWords = new Set([
    'the', 'and', 'for', 'that', 'this', 'with', 'from', 'will', 'have', 'has',
    'been', 'are', 'was', 'were', 'not', 'but', 'all', 'can', 'had', 'her',
    'one', 'our', 'out', 'day', 'get', 'make', 'like', 'just', 'over', 'such',
    'update', 'add', 'fix', 'implement', 'create', 'remove', 'change', 'use',
  ]);

  const taskWords = taskText
    .split(/[\s\-_/.,;:()]+/)
    .filter((w) => w.length >= 3 && !stopWords.has(w));

  if (taskWords.length === 0) return 0;

  let matched = 0;
  for (const word of taskWords) {
    if (changeText.includes(word)) matched++;
  }

  return Math.round((matched / taskWords.length) * 100);
}

// ---------- AI Matching (accurate, uses LLM) ----------

const MATCH_PROMPT = `You are a task-to-code matcher. Given a code change (commit or PR) and a list of open tasks from meetings, determine which tasks this code change is working on.

For each task, return a match score (0-100) and a short reason:
- 90-100: Direct match — the code clearly implements this task
- 60-89: Likely related — the code is working on something related to this task
- 30-59: Possibly related — some overlap but unclear
- 0-29: Not related

Code Change:
- Type: {type}
- Title: {title}
- Description: {body}
- Repository: {repo}
- Branch: {branch}

Open Tasks:
{tasks}

Return ONLY valid JSON — an array of matches with score >= 50:
[
  { "taskId": "uuid-here", "score": 85, "reason": "Commit implements the video module upload feature" }
]

If no tasks match with score >= 50, return an empty array: []`;

async function aiMatch(
  codeChange: CodeChange,
  tasks: OpenTask[]
): Promise<MatchResult[]> {
  const tasksText = tasks
    .map((t) => `- ID: ${t.id} | Title: ${t.title} | Project: ${t.project ?? 'unknown'} | Description: ${t.description ?? 'none'}`)
    .join('\n');

  const prompt = MATCH_PROMPT
    .replace('{type}', codeChange.type)
    .replace('{title}', codeChange.title)
    .replace('{body}', codeChange.body?.slice(0, 500) ?? 'none')
    .replace('{repo}', codeChange.repo)
    .replace('{branch}', codeChange.branch ?? 'unknown')
    .replace('{tasks}', tasksText);

  try {
    const result = await generateText(prompt);
    if (!result) return [];

    const jsonMatch = result.text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

    const matches: MatchResult[] = JSON.parse(jsonMatch[0]);
    return matches
      .filter((m) => m.taskId && m.score >= 50 && typeof m.score === 'number')
      .map((m) => ({
        taskId: m.taskId,
        score: Math.min(100, Math.max(0, m.score)),
        reason: m.reason?.slice(0, 200) ?? '',
      }));
  } catch (err) {
    console.error('AI task matching failed:', err);
    return [];
  }
}

// ---------- Branch-to-Task Matching ----------

const BRANCH_PREFIXES = new Set([
  'feat', 'feature', 'fix', 'bugfix', 'hotfix', 'chore', 'refactor',
  'docs', 'test', 'ci', 'build', 'perf', 'style', 'release',
]);

/**
 * Match a git branch name to an existing open task.
 * Parses branch names like "feat/TASK-123-add-auth" or "fix/login-bug".
 * Returns the matched task ID or null.
 */
export async function matchBranchToTask(
  branchName: string,
  teamId: string,
): Promise<string | null> {
  const supabase = getSupabaseAdmin();

  // Split branch on / - _ and filter out common prefixes
  const tokens = branchName
    .split(/[/\-_]/)
    .map((t) => t.toLowerCase().trim())
    .filter((t) => t.length >= 2 && !BRANCH_PREFIXES.has(t));

  if (tokens.length === 0) return null;

  // Check for explicit task/ticket ID patterns (e.g., TASK-123, EAI-456)
  const idPattern = /^[a-z]+-\d+$/i;
  const branchFull = branchName.toLowerCase();
  const ticketMatch = branchFull.match(/([a-z]+-\d+)/i);
  if (ticketMatch) {
    const { data: taskById } = await supabase
      .from('tasks')
      .select('id')
      .eq('team_id', teamId)
      .in('status', ['pending', 'in_progress'])
      .ilike('external_id', `%${ticketMatch[1]}%`)
      .limit(1)
      .single();

    if (taskById) return taskById.id;
  }

  // Keyword matching against open tasks
  const { data: openTasks } = await supabase
    .from('tasks')
    .select('id, title, description, project, assignee_id, status')
    .eq('team_id', teamId)
    .in('status', ['pending', 'in_progress'])
    .limit(100);

  if (!openTasks || openTasks.length === 0) return null;

  // Build a synthetic "code change" text from branch tokens for keyword matching
  const branchText = tokens.join(' ');

  let bestMatch: { taskId: string; score: number } | null = null;

  for (const task of openTasks) {
    const taskText = `${task.title} ${task.description ?? ''} ${task.project ?? ''}`.toLowerCase();

    // Count how many branch tokens appear in the task text
    let matched = 0;
    for (const token of tokens) {
      if (token.length >= 3 && taskText.includes(token)) matched++;
    }

    const filteredTokens = tokens.filter((t) => t.length >= 3);
    if (filteredTokens.length === 0) continue;

    const score = Math.round((matched / filteredTokens.length) * 100);

    if (score >= 40 && (!bestMatch || score > bestMatch.score)) {
      bestMatch = { taskId: task.id, score };
    }
  }

  return bestMatch?.taskId ?? null;
}

// ---------- Main Matching Function ----------

/**
 * Match a code change (commit/PR) against open tasks for the team.
 * Uses keyword matching first, then AI for refinement.
 * Updates both tasks.matched_changes and code_changes.matched_task_ids.
 *
 * Called from the GitHub sync handler after inserting a code_change.
 */
export async function matchCodeChangeToTasks(
  codeChangeId: string,
  teamId: string,
  developerId: string | null
): Promise<{ matchedCount: number; autoStatusUpdates: number }> {
  const supabase = getSupabaseAdmin();

  // 1. Fetch the code change
  const { data: codeChange } = await supabase
    .from('code_changes')
    .select('id, developer_id, type, repo, branch, title, body, files_changed')
    .eq('id', codeChangeId)
    .single();

  if (!codeChange) return { matchedCount: 0, autoStatusUpdates: 0 };

  // 2. Fetch open tasks (pending or in_progress) for this team
  let query = supabase
    .from('tasks')
    .select('id, title, description, project, assignee_id, status')
    .eq('team_id', teamId)
    .in('status', ['pending', 'in_progress']);

  // If we know the developer, prioritize their tasks but also check unassigned
  if (developerId) {
    query = supabase
      .from('tasks')
      .select('id, title, description, project, assignee_id, status')
      .eq('team_id', teamId)
      .in('status', ['pending', 'in_progress'])
      .or(`assignee_id.eq.${developerId},assignee_id.is.null`);
  }

  const { data: openTasks } = await query;
  if (!openTasks || openTasks.length === 0) return { matchedCount: 0, autoStatusUpdates: 0 };

  // 3. Keyword pre-filter: only send tasks with keyword score > 15 to AI
  const candidates = openTasks
    .map((task) => ({
      task,
      keywordScore: keywordMatch(codeChange as CodeChange, task),
    }))
    .filter((c) => c.keywordScore > 15)
    .sort((a, b) => b.keywordScore - a.keywordScore)
    .slice(0, 10); // Limit to top 10 candidates for AI

  if (candidates.length === 0) {
    // Mark as unplanned work
    await supabase
      .from('code_changes')
      .update({ is_planned: false })
      .eq('id', codeChangeId);
    return { matchedCount: 0, autoStatusUpdates: 0 };
  }

  // 4. AI matching for refined scores
  let matches: MatchResult[] = [];
  const aiMatches = await aiMatch(
    codeChange as CodeChange,
    candidates.map((c) => c.task)
  );

  if (aiMatches.length > 0) {
    matches = aiMatches;
  } else {
    // Fallback: use high keyword matches (score > 60)
    matches = candidates
      .filter((c) => c.keywordScore > 60)
      .map((c) => ({
        taskId: c.task.id,
        score: c.keywordScore,
        reason: 'Keyword match',
      }));
  }

  if (matches.length === 0) {
    await supabase
      .from('code_changes')
      .update({ is_planned: false })
      .eq('id', codeChangeId);
    return { matchedCount: 0, autoStatusUpdates: 0 };
  }

  // 5. Update records
  const matchedTaskIds = matches.map((m) => m.taskId);
  let autoStatusUpdates = 0;

  // Update code_changes: mark as planned, link task IDs
  await supabase
    .from('code_changes')
    .update({
      is_planned: true,
      matched_task_ids: matchedTaskIds,
    })
    .eq('id', codeChangeId);

  // Update each matched task
  for (const match of matches) {
    // Append code change to matched_changes array
    const { data: task } = await supabase
      .from('tasks')
      .select('matched_changes, status, alignment_score, first_commit_at, first_pr_at, completed_at, created_at')
      .eq('id', match.taskId)
      .single();

    if (!task) continue;

    const existingChanges = (task.matched_changes as string[]) ?? [];
    const updatedChanges = [...new Set([...existingChanges, codeChangeId])];

    // Calculate alignment score: average of all match scores for this task
    const newScore = task.alignment_score
      ? Math.round((task.alignment_score + match.score) / 2)
      : match.score;

    const updatePayload: Record<string, unknown> = {
      matched_changes: updatedChanges,
      alignment_score: newScore,
    };

    // Cycle time tracking: record first commit/PR timestamps
    if (!task.first_commit_at && codeChange.type === 'commit') {
      updatePayload.first_commit_at = new Date().toISOString();
    }
    if (!task.first_pr_at && codeChange.type === 'pr_opened') {
      updatePayload.first_pr_at = new Date().toISOString();
    }

    // Auto-status update logic:
    // Determine if this is a "default branch" commit (direct push, no PR)
    const defaultBranches = ['main', 'master', 'develop'];
    const isDefaultBranch = codeChange.branch
      ? defaultBranches.includes(codeChange.branch)
      : false;
    const isHighConfidence = match.score >= 75;

    if (task.status === 'pending' && ['commit', 'pr_opened'].includes(codeChange.type)) {
      // Direct commit to main/master with high confidence → completed (no PR workflow)
      if (codeChange.type === 'commit' && isDefaultBranch && isHighConfidence) {
        updatePayload.status = 'completed';
      } else {
        updatePayload.status = 'in_progress';
      }
      updatePayload.status_updated_at = new Date().toISOString();
      autoStatusUpdates++;
    } else if (task.status === 'in_progress') {
      // PR merged → completed
      // Direct commit to default branch with high confidence → completed
      if (
        codeChange.type === 'pr_merged' ||
        (codeChange.type === 'commit' && isDefaultBranch && isHighConfidence)
      ) {
        updatePayload.status = 'completed';
        updatePayload.status_updated_at = new Date().toISOString();
        autoStatusUpdates++;
      }
    }

    // Calculate cycle time when task completes
    if (updatePayload.status === 'completed' && !task.completed_at) {
      const completedAt = new Date().toISOString();
      updatePayload.completed_at = completedAt;
      if (task.created_at) {
        const cycleMs = new Date(completedAt).getTime() - new Date(task.created_at).getTime();
        updatePayload.cycle_time_hours = Math.round((cycleMs / 3_600_000) * 10) / 10;
      }
    }

    await supabase
      .from('tasks')
      .update(updatePayload)
      .eq('id', match.taskId);

    // Create timeline event for the match
    const taskDeveloperId = developerId;
    if (taskDeveloperId) {
      await supabase.from('activity_timeline').insert({
        team_id: teamId,
        developer_id: taskDeveloperId,
        event_type: 'task_code_match',
        title: `Code linked to task: ${(await supabase.from('tasks').select('title').eq('id', match.taskId).single()).data?.title ?? match.taskId}`,
        description: `${codeChange.type}: "${codeChange.title}" matched with ${match.score}% confidence`,
        metadata: {
          task_id: match.taskId,
          code_change_id: codeChangeId,
          match_score: match.score,
          match_reason: match.reason,
          auto_status: updatePayload.status ?? null,
        },
        source_id: codeChangeId,
        source_table: 'code_changes',
        occurred_at: new Date().toISOString(),
      });
    }
  }

  return { matchedCount: matches.length, autoStatusUpdates };
}
