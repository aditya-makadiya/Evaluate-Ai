import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase-server';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { homedir } from 'node:os';

// --------------- Types ---------------

interface AntiPatternItem {
  id: string;
  severity: 'high' | 'medium' | 'low';
  points: number;
  hint: string;
}

interface ScoreBreakdown {
  specificity: number;
  context: number;
  clarity: number;
  actionability: number;
}

interface TranscriptEntry {
  message: {
    role: 'user' | 'assistant';
    model?: string;
    content?: Array<{
      type: string;
      text?: string;
      name?: string;
      input?: Record<string, unknown>;
    }>;
    usage?: {
      input_tokens: number;
      output_tokens: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
    };
    stop_reason?: string;
  };
}

// --------------- Pricing ---------------
import { getModelPricing, normalizeModelId, calculateCost } from '@/lib/pricing';

// --------------- Anti-pattern / signal definitions (mirrors core heuristic) ---------------

const ANTI_PATTERN_DEFS: Record<string, { severity: 'high' | 'medium' | 'low'; points: number; label: string; hint: string }> = {
  vague_verb:       { severity: 'high',   points: 15, label: 'Vague Verb',           hint: 'Add: which file, what specific behavior, what error' },
  paraphrased_error:{ severity: 'high',   points: 15, label: 'Paraphrased Error',    hint: 'Paste the exact error message in backticks' },
  too_short:        { severity: 'high',   points: 15, label: 'Too Short',            hint: 'Add context: file path, function name, expected behavior' },
  retry_detected:   { severity: 'high',   points: 15, label: 'Retry Detected',       hint: 'Explain what was wrong with the prior answer' },
  no_file_ref:      { severity: 'medium', points: 10, label: 'No File Reference',    hint: 'Specify the file path and function name' },
  multi_question:   { severity: 'medium', points: 10, label: 'Multiple Questions',   hint: 'One question per turn — split into steps' },
  overlong_prompt:  { severity: 'medium', points: 10, label: 'Overlong Prompt',      hint: 'Split into task description + separate context' },
  no_expected_output:{ severity: 'medium', points: 10, label: 'No Expected Output',  hint: 'Describe what success looks like' },
  unanchored_ref:   { severity: 'low',    points: 5,  label: 'Unanchored Reference', hint: "Re-state what 'it' refers to — AI may lose context" },
  filler_words:     { severity: 'low',    points: 5,  label: 'Filler Words',         hint: 'Filler words cost tokens — remove for efficiency' },
};

const POSITIVE_SIGNAL_DEFS: Record<string, { points: number; label: string; hint: string; test: RegExp }> = {
  has_file_path:   { points: 10, label: 'File Path',     hint: 'Include a specific file path like src/auth/login.ts',       test: /[/\\][\w.-]+\.\w{1,5}/ },
  has_code_block:  { points: 10, label: 'Code Block',    hint: 'Include a code block with the relevant snippet',            test: /```[\s\S]+```/ },
  has_error_msg:   { points: 10, label: 'Error Message', hint: 'Paste the exact error message in a code block',             test: /```[\s\S]*(?:error|exception|traceback|TypeError|ReferenceError|SyntaxError)[\s\S]*```/i },
  has_constraints: { points: 10, label: 'Constraints',   hint: 'Add constraints like "must", "should not", "without", etc', test: /\b(must|should not|without|keep|preserve|don't change|do not|avoid)\b/i },
};

// --------------- Helpers ---------------

function findTranscriptFile(sessionId: string): string | null {
  const claudeProjectsDir = join(homedir(), '.claude', 'projects');
  if (!existsSync(claudeProjectsDir)) return null;

  try {
    const projectDirs = readdirSync(claudeProjectsDir, { withFileTypes: true });
    for (const dir of projectDirs) {
      if (!dir.isDirectory()) continue;
      const dirPath = join(claudeProjectsDir, dir.name);

      const candidate = join(dirPath, `${sessionId}.jsonl`);
      if (existsSync(candidate)) return candidate;

      try {
        const subEntries = readdirSync(dirPath, { withFileTypes: true });
        for (const sub of subEntries) {
          if (sub.isFile() && sub.name === `${sessionId}.jsonl`) {
            return join(dirPath, sub.name);
          }
        }
      } catch { /* skip unreadable dirs */ }
    }
  } catch { /* ignore */ }

  try {
    const result = execSync(
      `find "${claudeProjectsDir}" -name "${sessionId}.jsonl" -maxdepth 3 2>/dev/null | head -1`,
      { encoding: 'utf-8', timeout: 2000 }
    ).trim();
    if (result && existsSync(result)) return result;
  } catch { /* ignore */ }

  return null;
}

/**
 * Extract user prompt text from a transcript entry's content.
 */
function extractUserPromptText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    for (const block of content) {
      if (block?.type === 'text' && typeof block.text === 'string') return block.text;
    }
  }
  return '';
}

/**
 * SHA-256 hash — matches the CLI's hashText() so we can compare prompt_hash values.
 */
function hashText(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

/**
 * Parse transcript entries from a JSONL file.
 */
function parseTranscriptEntries(transcriptPath: string): Array<{ message: TranscriptEntry['message'] }> {
  const content = readFileSync(transcriptPath, 'utf-8');
  const lines = content.trim().split('\n');
  const entries: Array<{ message: TranscriptEntry['message'] }> = [];
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);
      const msg = parsed.message ?? parsed;
      if (msg.role) entries.push({ message: msg });
    } catch { continue; }
  }
  return entries;
}

/**
 * Collect all assistant response indices between a user turn and the next user turn.
 */
function collectAssistantIndices(entries: Array<{ message: TranscriptEntry['message'] }>, userIndex: number): number[] {
  const indices: number[] = [];
  for (let j = userIndex + 1; j < entries.length; j++) {
    const e = entries[j];
    if (e.message.role === 'user') {
      const c = e.message.content;
      const isTool = Array.isArray(c) && c.length > 0 && c[0]?.type === 'tool_result';
      if (!isTool) break;
    }
    if (e.message.role === 'assistant') {
      indices.push(j);
    }
  }
  return indices;
}

/**
 * Extract response data from a set of assistant message indices.
 */
function extractResponseFromIndices(
  entries: Array<{ message: TranscriptEntry['message'] }>,
  assistantIndices: number[]
): {
  text: string;
  toolCalls: string[];
  usage: { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number; model: string };
  costUsd: number;
} {
  const allTextParts: string[] = [];
  const allToolCalls: string[] = [];
  let totalInput = 0, totalOutput = 0, totalCacheRead = 0, totalCacheWrite = 0;
  let model = 'unknown';

  for (const idx of assistantIndices) {
    const msg = entries[idx].message;
    if (msg.model) model = normalizeModelId(msg.model);

    for (const c of (msg.content ?? [])) {
      if (c.type === 'text' && c.text) {
        allTextParts.push(c.text);
      } else if (c.type === 'tool_use' && c.name) {
        allToolCalls.push(c.name);
        const inputStr = c.input ? JSON.stringify(c.input, null, 2) : '';
        const summary = inputStr.length > 500 ? inputStr.slice(0, 500) + '...' : inputStr;
        allTextParts.push(`**Tool: ${c.name}**\n\`\`\`json\n${summary}\n\`\`\``);
      }
    }

    if (msg.usage) {
      totalInput += msg.usage.input_tokens ?? 0;
      totalOutput += msg.usage.output_tokens ?? 0;
      totalCacheRead += msg.usage.cache_read_input_tokens ?? 0;
      totalCacheWrite += msg.usage.cache_creation_input_tokens ?? 0;
    }
  }

  const usage = { inputTokens: totalInput, outputTokens: totalOutput, cacheReadTokens: totalCacheRead, cacheWriteTokens: totalCacheWrite, model };
  const costUsd = calculateCost(usage.inputTokens, usage.outputTokens, usage.model, usage.cacheReadTokens, usage.cacheWriteTokens);

  return { text: allTextParts.join('\n\n'), toolCalls: [...new Set(allToolCalls)], usage, costUsd };
}

/**
 * Parse transcript for a specific turn, matching by prompt_hash to avoid
 * position misalignment caused by interrupted turns in the transcript.
 * Falls back to position-based matching if hash matching fails.
 */
function parseTranscriptForTurn(
  transcriptPath: string,
  turnNumber: number,
  promptHash?: string | null
): {
  text: string;
  toolCalls: string[];
  usage: { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number; model: string };
  costUsd: number;
} | null {
  try {
    const entries = parseTranscriptEntries(transcriptPath);

    // Build list of all user turns (non-tool-result) with their indices
    const userTurns: Array<{ index: number; promptHash: string }> = [];
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      if (entry.message.role === 'user') {
        const c = entry.message.content;
        const isToolResult = Array.isArray(c) && c.length > 0 && c[0]?.type === 'tool_result';
        if (isToolResult) continue;
        const promptText = extractUserPromptText(c);
        userTurns.push({ index: i, promptHash: hashText(promptText) });
      }
    }

    // Strategy 1: Match by prompt_hash (reliable, handles interrupted turns)
    if (promptHash) {
      const matched = userTurns.find(t => t.promptHash === promptHash);
      if (matched) {
        const assistantIndices = collectAssistantIndices(entries, matched.index);
        if (assistantIndices.length > 0) {
          return extractResponseFromIndices(entries, assistantIndices);
        }
      }
    }

    // Strategy 2: Fall back to position-based matching (legacy behavior)
    if (turnNumber >= 1 && turnNumber <= userTurns.length) {
      const fallback = userTurns[turnNumber - 1];
      const assistantIndices = collectAssistantIndices(entries, fallback.index);
      if (assistantIndices.length > 0) {
        return extractResponseFromIndices(entries, assistantIndices);
      }
    }

    return null;
  } catch {
    return null;
  }
}

function generateRewrite(promptText: string, antiPatterns: string[], missingSignals: string[]): string {
  let rewrite = promptText;

  if (antiPatterns.includes('filler_words')) {
    rewrite = rewrite.replace(/\b(please|could you|would you mind|would you kindly|help me)\b\s*/gi, '').trim();
  }

  if (antiPatterns.includes('unanchored_ref')) {
    rewrite = rewrite.replace(/^(it|that|the issue|the problem|the error|this)\s/i, '[specify the subject] ');
  }

  if (missingSignals.includes('has_file_path') || antiPatterns.includes('no_file_ref')) {
    if (!/[/\\][\w.-]+\.\w{1,5}/.test(rewrite)) {
      rewrite += '\n\nFile: [specify file path, e.g. src/components/Auth.tsx]';
    }
  }

  if (missingSignals.includes('has_error_msg') || antiPatterns.includes('paraphrased_error')) {
    if (!/```/.test(rewrite)) {
      rewrite += '\n\nError:\n```\n[paste exact error message here]\n```';
    }
  }

  if (antiPatterns.includes('too_short') || antiPatterns.includes('vague_verb')) {
    if (rewrite.trim().split(/\s+/).length < 15) {
      rewrite += '\n\nContext: [describe what the code currently does]\nExpected: [describe the desired behavior]\nConstraints: [any requirements to preserve]';
    }
  }

  if (missingSignals.includes('has_constraints') || antiPatterns.includes('no_expected_output')) {
    if (!/\b(must|should|expected|want|result)\b/i.test(rewrite)) {
      rewrite += '\n\nExpected behavior: [describe what success looks like]';
    }
  }

  return rewrite.trim();
}

function generateImprovement(
  promptText: string,
  score: number,
  antiPatternsRaw: unknown,
  scoreBreakdown: ScoreBreakdown | null,
  promptTokensEst: number | null
) {
  const antiPatternIds: string[] = [];
  const antiPatternObjects: AntiPatternItem[] = [];

  if (Array.isArray(antiPatternsRaw)) {
    for (const ap of antiPatternsRaw) {
      if (typeof ap === 'string') {
        antiPatternIds.push(ap);
        const def = ANTI_PATTERN_DEFS[ap];
        if (def) {
          antiPatternObjects.push({ id: ap, severity: def.severity, points: def.points, hint: def.hint });
        }
      } else if (ap && typeof ap === 'object' && 'id' in ap) {
        antiPatternIds.push(ap.id);
        antiPatternObjects.push(ap as AntiPatternItem);
      }
    }
  }

  const issues = antiPatternObjects.map(ap => {
    const def = ANTI_PATTERN_DEFS[ap.id];
    return {
      id: ap.id,
      severity: ap.severity || def?.severity || 'medium',
      label: def?.label || ap.id.replace(/_/g, ' '),
      hint: ap.hint || def?.hint || '',
      impact: `-${ap.points || def?.points || 10} points`,
    };
  });

  const missingSignals: Array<{ id: string; label: string; hint: string; impact: string }> = [];
  const missingSignalIds: string[] = [];
  for (const [id, sig] of Object.entries(POSITIVE_SIGNAL_DEFS)) {
    if (!sig.test.test(promptText)) {
      missingSignals.push({
        id,
        label: sig.label,
        hint: sig.hint,
        impact: `+${sig.points} points`,
      });
      missingSignalIds.push(id);
    }
  }

  const rewriteExample = generateRewrite(promptText, antiPatternIds, missingSignalIds);

  const estimatedTokensSaved = Math.round((promptTokensEst ?? 50) * 0.3 + antiPatternObjects.length * 50);
  const sonnetPricing = getModelPricing('claude-sonnet-4-6');
  const estimatedCostSaved = (estimatedTokensSaved * sonnetPricing.output) / 1_000_000;

  const maxPossibleScore = 100;

  return {
    score: Math.round(score),
    maxPossibleScore,
    issues,
    missingSignals,
    rewriteExample,
    estimatedTokensSaved,
    estimatedCostSaved: Math.round(estimatedCostSaved * 10000) / 10000,
  };
}

// --------------- Route Handler ---------------

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; turnNumber: string }> }
) {
  const { id, turnNumber: turnNumberStr } = await params;
  const turnNumber = parseInt(turnNumberStr, 10);

  if (isNaN(turnNumber) || turnNumber < 1) {
    return NextResponse.json({ error: 'Invalid turn number' }, { status: 400 });
  }

  try {
    const ctx = await getAuthContext();
    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getSupabaseAdmin();

    // Fetch all turns for this session ordered by created_at and pick by position.
    // We use position-based lookup because turn_number values can be duplicated
    // or inconsistent in the database.
    const { data: allTurns, error: allTurnsErr } = await supabase
      .from('ai_turns')
      .select('*')
      .eq('session_id', id)
      .order('created_at', { ascending: true });

    if (allTurnsErr || !allTurns || allTurns.length === 0) {
      return NextResponse.json({ error: 'Turn not found' }, { status: 404 });
    }

    // Pick the nth turn by position (1-indexed)
    const idx = turnNumber - 1;
    if (idx < 0 || idx >= allTurns.length) {
      return NextResponse.json({ error: 'Turn not found' }, { status: 404 });
    }
    const turn = allTurns[idx];

    // Fetch session data
    const { data: session, error: sessionErr } = await supabase
      .from('ai_sessions')
      .select('id, model, project_dir, git_branch, started_at, ended_at, last_activity_at, total_turns, developer_id')
      .eq('id', id)
      .single();

    if (sessionErr || !session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    // RBAC: Developers can only view turns from their own sessions
    if (ctx.role === 'developer' && (session as Record<string, unknown>).developer_id !== ctx.memberId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Fetch developer name for breadcrumb navigation
    let developerName: string | null = null;
    if (session.developer_id) {
      const { data: memberRow } = await supabase
        .from('team_members')
        .select('name')
        .eq('id', session.developer_id)
        .single();
      developerName = memberRow?.name ?? null;
    }

    // JSONB fields are already parsed from Supabase
    const antiPatterns = turn.anti_patterns ?? [];
    const scoreBreakdown = turn.score_breakdown ?? null;
    const toolCalls = turn.tool_calls ?? [];

    const promptText = (turn.prompt_text as string) || '';
    const score = (turn.heuristic_score as number) ?? (turn.llm_score as number) ?? 50;

    // Try to find transcript and parse response for this turn.
    // Use prompt_hash to match the correct transcript turn (avoids off-by-one
    // when interrupted turns exist in the transcript but not in the DB).
    let response = null;
    const transcriptPath = findTranscriptFile(id);
    if (transcriptPath) {
      const parsed = parseTranscriptForTurn(transcriptPath, turnNumber, turn.prompt_hash);
      if (parsed) {
        response = parsed;
      }
    }

    // Generate improvement data
    const improvement = generateImprovement(
      promptText,
      score,
      antiPatterns,
      scoreBreakdown as ScoreBreakdown | null,
      turn.prompt_tokens_est as number | null
    );

    // Detect stale sessions: no ended_at and no activity for > 30 min.
    // This means the SessionEnd hook likely failed to fire (e.g. Ctrl+C).
    const lastActiveMs = session.last_activity_at
      ? new Date(session.last_activity_at).getTime()
      : (session.started_at ? new Date(session.started_at).getTime() : 0);
    const isStaleSession = !session.ended_at && lastActiveMs > 0
      && (Date.now() - lastActiveMs) > 30 * 60 * 1000;

    // Use effective endedAt: if session is stale, treat it as ended
    const effectiveEndedAt = session.ended_at ?? (isStaleSession ? (session.last_activity_at || session.started_at) : null);

    return NextResponse.json({
      turn: {
        id: turn.id,
        turnNumber: turnNumber, // Use position-based number, not DB value
        promptText: turn.prompt_text,
        promptHash: turn.prompt_hash,
        promptTokensEst: turn.prompt_tokens_est,
        heuristicScore: turn.heuristic_score,
        llmScore: turn.llm_score,
        antiPatterns,
        scoreBreakdown,
        suggestionText: turn.suggestion_text,
        suggestionAccepted: turn.suggestion_accepted == null ? null : Boolean(turn.suggestion_accepted),
        responseTokensEst: turn.response_tokens_est,
        toolCalls,
        latencyMs: turn.latency_ms,
        wasRetry: Boolean(turn.was_retry),
        contextUsedPct: turn.context_used_pct,
        createdAt: turn.created_at,
      },
      session: {
        id: session.id,
        model: session.model,
        projectDir: session.project_dir,
        gitBranch: session.git_branch,
        startedAt: session.started_at,
        endedAt: effectiveEndedAt,
        totalTurns: allTurns.length || session.total_turns,
        developerId: session.developer_id,
        developerName,
      },
      response,
      improvement,
    });
  } catch (err) {
    console.error('Turn detail API error:', err);
    return NextResponse.json({ error: 'Failed to load turn' }, { status: 500 });
  }
}
