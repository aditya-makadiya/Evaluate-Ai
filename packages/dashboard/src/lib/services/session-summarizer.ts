import { getSupabaseAdmin } from '@/lib/supabase-server';
import { generateText } from '@/lib/ai-provider';

// ---------- Types ----------

interface SessionTurn {
  prompt_text: string | null;
  intent: string | null;
  heuristic_score: number | null;
  turn_number: number;
}

interface SessionRow {
  id: string;
  git_branch: string | null;
  git_repo: string | null;
  project_dir: string | null;
  model: string | null;
  total_turns: number | null;
  total_cost_usd: number | null;
  matched_task_id: string | null;
}

interface OpenTask {
  id: string;
  title: string;
  description: string | null;
  project: string | null;
  status: string;
}

interface SummaryResult {
  workSummary: string;
  tags: string[];
  category: string;
  taskMatches: Array<{ taskId: string; score: number; reason: string }>;
}

// ---------- Constants ----------

const VALID_CATEGORIES = new Set([
  'feature', 'debug', 'refactor', 'research', 'review', 'config', 'general',
]);

const MAX_PROMPTS_FOR_LLM = 20;
const MAX_PROMPT_LENGTH = 300;

// ---------- LLM Prompt ----------

const SUMMARIZE_PROMPT = `You are analyzing a developer's AI coding session. Given their prompts and a list of open tasks, provide:
1. A concise work summary (1-2 sentences describing what was accomplished or worked on)
2. Key topic tags (3-5 lowercase keywords)
3. The primary work category
4. Which open tasks (if any) this session relates to

Session Context:
- Branch: {branch}
- Repository: {repo}
- Project Directory: {project_dir}
- Model: {model}
- Total Turns: {turn_count}
- Total Cost: {cost}

Developer Prompts (chronological):
{prompts}

Open Tasks:
{tasks}

Return ONLY valid JSON, no markdown fences:
{
  "workSummary": "Brief description of what the session accomplished",
  "tags": ["tag1", "tag2", "tag3"],
  "category": "feature|debug|refactor|research|review|config|general",
  "taskMatches": [
    { "taskId": "uuid-here", "score": 85, "reason": "Session implements this task" }
  ]
}

Rules:
- workSummary should be specific and action-oriented (e.g., "Debugged JWT auth redirect, fixed callback URL handling" not "Worked on authentication")
- tags should be concrete technical terms, not generic words
- Only include taskMatches with score >= 50
- If no tasks match, return an empty taskMatches array: []
- category must be one of: feature, debug, refactor, research, review, config, general`;

// ---------- Fallback Summary (no AI provider) ----------

function generateFallbackSummary(
  turns: SessionTurn[],
  session: SessionRow,
): { workSummary: string; tags: string[]; category: string } {
  // Determine primary intent from turn distribution
  const intentCounts: Record<string, number> = {};
  for (const turn of turns) {
    if (turn.intent) {
      intentCounts[turn.intent] = (intentCounts[turn.intent] ?? 0) + 1;
    }
  }

  let primaryIntent = 'general';
  let maxCount = 0;
  for (const [intent, count] of Object.entries(intentCounts)) {
    if (count > maxCount) {
      primaryIntent = intent;
      maxCount = count;
    }
  }

  // Extract keywords from first prompt
  const firstPrompt = turns[0]?.prompt_text?.slice(0, 150) ?? '';
  const cleanedPrompt = firstPrompt
    .replace(/[^a-zA-Z0-9\s/._-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Build a basic summary from intent + first prompt
  const intentLabel: Record<string, string> = {
    feature: 'Feature development',
    debug: 'Debugging',
    refactor: 'Refactoring',
    research: 'Research',
    review: 'Code review',
    config: 'Configuration',
    generate: 'Code generation',
    general: 'Development',
  };

  const label = intentLabel[primaryIntent] ?? 'Development';
  const branch = session.git_branch;
  const branchContext = branch ? ` on ${branch}` : '';

  let workSummary: string;
  if (cleanedPrompt.length > 20) {
    // Use truncated first prompt as context
    const truncated = cleanedPrompt.length > 100
      ? cleanedPrompt.slice(0, 100) + '...'
      : cleanedPrompt;
    workSummary = `${label}${branchContext}: ${truncated}`;
  } else {
    workSummary = `${label} session${branchContext} (${turns.length} turns)`;
  }

  // Extract simple tags from prompts
  const allText = turns
    .map(t => t.prompt_text ?? '')
    .join(' ')
    .toLowerCase();

  const commonWords = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'can', 'this', 'that', 'these', 'those',
    'and', 'but', 'or', 'not', 'no', 'for', 'with', 'from', 'to', 'in',
    'on', 'at', 'of', 'it', 'its', 'my', 'we', 'our', 'you', 'your',
    'how', 'what', 'when', 'where', 'why', 'which', 'who', 'all', 'each',
    'use', 'make', 'just', 'also', 'like', 'get', 'set', 'new', 'now',
    'need', 'want', 'try', 'add', 'fix', 'file', 'code', 'please', 'help',
  ]);

  const wordFreq: Record<string, number> = {};
  for (const word of allText.split(/\s+/)) {
    const clean = word.replace(/[^a-z0-9]/g, '');
    if (clean.length >= 3 && !commonWords.has(clean)) {
      wordFreq[clean] = (wordFreq[clean] ?? 0) + 1;
    }
  }

  const tags = Object.entries(wordFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([word]) => word);

  return {
    workSummary,
    tags,
    category: primaryIntent === 'generate' ? 'feature' : primaryIntent,
  };
}

// ---------- Main Function ----------

/**
 * Generate an AI-powered work summary for a completed session and
 * match it to open tasks. Called fire-and-forget at session_end.
 *
 * Gracefully degrades: if no AI provider is configured, generates
 * a basic keyword-based summary from prompt intent and content.
 */
export async function summarizeAndMatchSession(
  sessionId: string,
  teamId: string,
  developerId: string,
): Promise<void> {
  const supabase = getSupabaseAdmin();

  // 1. Fetch session metadata
  const { data: session } = await supabase
    .from('ai_sessions')
    .select('id, git_branch, git_repo, project_dir, model, total_turns, total_cost_usd, matched_task_id')
    .eq('id', sessionId)
    .single();

  if (!session) return;

  // 2. Fetch all turns for this session
  const { data: turns } = await supabase
    .from('ai_turns')
    .select('prompt_text, intent, heuristic_score, turn_number')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true });

  if (!turns || turns.length === 0) return;

  // 3. Fetch open tasks for matching
  const { data: openTasks } = await supabase
    .from('tasks')
    .select('id, title, description, project, status')
    .eq('team_id', teamId)
    .in('status', ['pending', 'in_progress'])
    .limit(50);

  // 4. Try AI-powered summary, fall back to keyword-based
  let result: SummaryResult;

  const aiResult = await tryAISummary(session, turns, openTasks ?? []);
  if (aiResult) {
    result = aiResult;
  } else {
    const fallback = generateFallbackSummary(turns, session);
    result = { ...fallback, taskMatches: [] };
  }

  // 5. Validate and sanitize
  const workSummary = (result.workSummary || '').slice(0, 500);
  const workTags = (result.tags || [])
    .filter((t): t is string => typeof t === 'string' && t.length > 0)
    .map(t => t.toLowerCase().slice(0, 50))
    .slice(0, 10);
  const workCategory = VALID_CATEGORIES.has(result.category)
    ? result.category
    : 'general';

  if (!workSummary) return;

  // 6. Update ai_sessions with summary
  await supabase
    .from('ai_sessions')
    .update({
      work_summary: workSummary,
      work_tags: workTags,
      work_category: workCategory,
      summarized_at: new Date().toISOString(),
    })
    .eq('id', sessionId);

  // 7. Handle task matching (only if branch matcher didn't already find a match)
  if (result.taskMatches.length > 0) {
    const bestMatch = result.taskMatches
      .filter(m => m.score >= 50)
      .sort((a, b) => b.score - a.score)[0];

    if (bestMatch && !session.matched_task_id) {
      // Link session to task
      await supabase
        .from('ai_sessions')
        .update({ matched_task_id: bestMatch.taskId })
        .eq('id', sessionId);

      // Auto-transition task status: pending → in_progress
      const matchedTask = openTasks?.find(t => t.id === bestMatch.taskId);
      if (matchedTask?.status === 'pending') {
        await supabase
          .from('tasks')
          .update({
            status: 'in_progress',
            updated_at: new Date().toISOString(),
          })
          .eq('id', bestMatch.taskId);
      }
    }
  }

  // 8. Enrich the activity timeline entry with the work summary
  const { data: timelineEntry } = await supabase
    .from('activity_timeline')
    .select('id, metadata')
    .eq('source_id', sessionId)
    .eq('event_type', 'ai_session_end')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (timelineEntry) {
    const existingMeta = (timelineEntry.metadata as Record<string, unknown>) ?? {};
    await supabase
      .from('activity_timeline')
      .update({
        description: workSummary,
        metadata: {
          ...existingMeta,
          work_summary: workSummary,
          work_tags: workTags,
          work_category: workCategory,
        },
      })
      .eq('id', timelineEntry.id);
  }
}

// ---------- AI Summary Generation ----------

async function tryAISummary(
  session: SessionRow,
  turns: SessionTurn[],
  openTasks: OpenTask[],
): Promise<SummaryResult | null> {
  // Format prompts (limit count and length for token efficiency)
  const selectedTurns = turns.length > MAX_PROMPTS_FOR_LLM
    ? [
        ...turns.slice(0, 5),
        ...turns.slice(Math.floor(turns.length / 2) - 2, Math.floor(turns.length / 2) + 3),
        ...turns.slice(-5),
      ]
    : turns;

  const formattedPrompts = selectedTurns
    .map((t, i) => {
      const text = (t.prompt_text ?? '').slice(0, MAX_PROMPT_LENGTH);
      const intent = t.intent ? ` [${t.intent}]` : '';
      return `Turn ${t.turn_number || i + 1}${intent}: ${text}`;
    })
    .join('\n');

  const formattedTasks = openTasks.length > 0
    ? openTasks
        .map(t => `- ID: ${t.id} | Title: ${t.title} | Project: ${t.project ?? 'unknown'} | Description: ${(t.description ?? 'none').slice(0, 200)}`)
        .join('\n')
    : '(No open tasks)';

  // Extract project name from project_dir
  const projectDir = session.project_dir
    ? session.project_dir.split('/').filter(Boolean).pop() ?? session.project_dir
    : 'unknown';

  const prompt = SUMMARIZE_PROMPT
    .replace('{branch}', session.git_branch ?? 'unknown')
    .replace('{repo}', session.git_repo ?? 'unknown')
    .replace('{project_dir}', projectDir)
    .replace('{model}', session.model ?? 'unknown')
    .replace('{turn_count}', String(session.total_turns ?? turns.length))
    .replace('{cost}', (session.total_cost_usd ?? 0).toFixed(3))
    .replace('{prompts}', formattedPrompts)
    .replace('{tasks}', formattedTasks);

  try {
    const result = await generateText(prompt);
    if (!result) return null;

    // Parse JSON from response
    const jsonMatch = result.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);

    // Validate required fields
    if (!parsed.workSummary || typeof parsed.workSummary !== 'string') return null;

    return {
      workSummary: parsed.workSummary,
      tags: Array.isArray(parsed.tags) ? parsed.tags : [],
      category: typeof parsed.category === 'string' ? parsed.category : 'general',
      taskMatches: Array.isArray(parsed.taskMatches)
        ? parsed.taskMatches.filter(
            (m: { taskId?: string; score?: number; reason?: string }) =>
              m.taskId && typeof m.score === 'number' && m.score >= 50,
          )
        : [],
    };
  } catch {
    return null;
  }
}
