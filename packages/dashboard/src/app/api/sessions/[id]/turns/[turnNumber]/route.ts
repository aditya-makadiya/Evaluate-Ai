import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
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

const PRICING: Record<string, { input: number; output: number; cacheRead: number; cacheWrite: number }> = {
  'claude-opus-4-6': { input: 15, output: 75, cacheRead: 1.5, cacheWrite: 18.75 },
  'claude-sonnet-4-6': { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
  'claude-haiku-4-5-20251001': { input: 0.8, output: 4, cacheRead: 0.08, cacheWrite: 1 },
};

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

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

function findTranscriptFile(sessionId: string): string | null {
  const claudeProjectsDir = join(homedir(), '.claude', 'projects');
  if (!existsSync(claudeProjectsDir)) return null;

  try {
    // Search all project directories for the session transcript
    const projectDirs = readdirSync(claudeProjectsDir, { withFileTypes: true });
    for (const dir of projectDirs) {
      if (!dir.isDirectory()) continue;
      const dirPath = join(claudeProjectsDir, dir.name);

      // Check direct match: <project-dir>/<session-id>.jsonl
      const candidate = join(dirPath, `${sessionId}.jsonl`);
      if (existsSync(candidate)) return candidate;

      // Also check subdirectories (some projects nest deeper)
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

  // Fallback: try globbing with find-like approach
  try {
    const { execSync } = require('node:child_process');
    const result = execSync(
      `find "${claudeProjectsDir}" -name "${sessionId}.jsonl" -maxdepth 3 2>/dev/null | head -1`,
      { encoding: 'utf-8', timeout: 2000 }
    ).trim();
    if (result && existsSync(result)) return result;
  } catch { /* ignore */ }

  return null;
}

function parseTranscriptForTurn(transcriptPath: string, turnNumber: number): {
  text: string;
  toolCalls: string[];
  usage: { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number; model: string };
  costUsd: number;
} | null {
  try {
    const content = readFileSync(transcriptPath, 'utf-8');
    const lines = content.trim().split('\n');

    let userTurnCount = 0;
    let targetAssistantIndex = -1;

    // Walk through entries: count user PROMPT messages (not tool_result) to find the Nth turn
    const entries: Array<{ message: TranscriptEntry['message'] }> = [];
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);
        // Handle both { message: {...} } and direct { role: ... } formats
        const msg = parsed.message ?? parsed;
        if (msg.role) entries.push({ message: msg });
      } catch { continue; }
    }

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      if (entry.message.role === 'user') {
        // Only count actual user prompts, not tool_result responses
        const content = entry.message.content;
        const isToolResult = Array.isArray(content) && content.length > 0 && content[0]?.type === 'tool_result';
        if (isToolResult) continue;

        userTurnCount++;
        if (userTurnCount === turnNumber) {
          // Collect ALL assistant responses until the next user prompt
          // (a single turn may involve multiple assistant messages with tool calls)
          const assistantIndices: number[] = [];
          for (let j = i + 1; j < entries.length; j++) {
            const e = entries[j];
            if (e.message.role === 'user') {
              // Check if this is a tool_result (part of current turn) or new prompt
              const c = e.message.content;
              const isTool = Array.isArray(c) && c.length > 0 && c[0]?.type === 'tool_result';
              if (!isTool) break; // New user prompt = end of this turn
            }
            if (e.message.role === 'assistant') {
              assistantIndices.push(j);
            }
          }
          if (assistantIndices.length > 0) {
            targetAssistantIndex = assistantIndices[0]; // Primary for usage data
          }

          // Store all assistant indices for full response collection
          (entries as unknown as { _allAssistant?: number[] })._allAssistant = assistantIndices;
          break;
        }
      }
    }

    if (targetAssistantIndex === -1) return null;

    // Collect response text and tool calls from ALL assistant messages in this turn
    const allAssistantIndices = ((entries as unknown as { _allAssistant?: number[] })._allAssistant) ?? [targetAssistantIndex];
    const allTextParts: string[] = [];
    const allToolCalls: string[] = [];
    let totalInput = 0, totalOutput = 0, totalCacheRead = 0, totalCacheWrite = 0;
    let model = 'unknown';

    for (const idx of allAssistantIndices) {
      const msg = entries[idx].message;
      if (msg.model) model = msg.model;

      // Collect text content
      for (const c of (msg.content ?? [])) {
        if (c.type === 'text' && c.text) {
          allTextParts.push(c.text);
        } else if (c.type === 'tool_use' && c.name) {
          allToolCalls.push(c.name);
          // Include tool call details in response text
          const inputStr = c.input ? JSON.stringify(c.input, null, 2) : '';
          const summary = inputStr.length > 500 ? inputStr.slice(0, 500) + '...' : inputStr;
          allTextParts.push(`**Tool: ${c.name}**\n\`\`\`json\n${summary}\n\`\`\``);
        }
      }

      // Accumulate usage
      if (msg.usage) {
        totalInput += msg.usage.input_tokens ?? 0;
        totalOutput += msg.usage.output_tokens ?? 0;
        totalCacheRead += msg.usage.cache_read_input_tokens ?? 0;
        totalCacheWrite += msg.usage.cache_creation_input_tokens ?? 0;
      }
    }

    const responseText = allTextParts.join('\n\n');
    const toolCalls = [...new Set(allToolCalls)]; // dedupe

    const usage = {
      inputTokens: totalInput,
      outputTokens: totalOutput,
      cacheReadTokens: totalCacheRead,
      cacheWriteTokens: totalCacheWrite,
      model,
    };

    const pricing = PRICING[usage.model] ?? PRICING['claude-sonnet-4-6'];
    const costUsd = (
      usage.inputTokens * pricing.input +
      usage.outputTokens * pricing.output +
      usage.cacheReadTokens * pricing.cacheRead +
      usage.cacheWriteTokens * pricing.cacheWrite
    ) / 1_000_000;

    return { text: responseText, toolCalls, usage, costUsd };
  } catch {
    return null;
  }
}

function generateRewrite(promptText: string, antiPatterns: string[], missingSignals: string[]): string {
  let rewrite = promptText;

  // Remove filler words
  if (antiPatterns.includes('filler_words')) {
    rewrite = rewrite.replace(/\b(please|could you|would you mind|would you kindly|help me)\b\s*/gi, '').trim();
  }

  // Replace unanchored references
  if (antiPatterns.includes('unanchored_ref')) {
    rewrite = rewrite.replace(/^(it|that|the issue|the problem|the error|this)\s/i, '[specify the subject] ');
  }

  // Add file path placeholder if missing
  if (missingSignals.includes('has_file_path') || antiPatterns.includes('no_file_ref')) {
    if (!/[/\\][\w.-]+\.\w{1,5}/.test(rewrite)) {
      rewrite += '\n\nFile: [specify file path, e.g. src/components/Auth.tsx]';
    }
  }

  // Add error message placeholder if missing
  if (missingSignals.includes('has_error_msg') || antiPatterns.includes('paraphrased_error')) {
    if (!/```/.test(rewrite)) {
      rewrite += '\n\nError:\n```\n[paste exact error message here]\n```';
    }
  }

  // Expand too-short prompts
  if (antiPatterns.includes('too_short') || antiPatterns.includes('vague_verb')) {
    if (rewrite.trim().split(/\s+/).length < 15) {
      rewrite += '\n\nContext: [describe what the code currently does]\nExpected: [describe the desired behavior]\nConstraints: [any requirements to preserve]';
    }
  }

  // Add expected output if missing
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
  // Parse anti-patterns: handle both string[] and {id, severity, hint}[] formats
  let antiPatternIds: string[] = [];
  let antiPatternObjects: AntiPatternItem[] = [];

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

  // Build issues list
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

  // Check missing positive signals
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

  // Generate rewrite
  const rewriteExample = generateRewrite(promptText, antiPatternIds, missingSignalIds);

  // Estimate token savings: if prompt is improved, responses tend to be shorter
  const estimatedTokensSaved = Math.round((promptTokensEst ?? 50) * 0.3 + antiPatternObjects.length * 50);
  const pricing = PRICING['claude-sonnet-4-6'];
  const estimatedCostSaved = (estimatedTokensSaved * pricing.output) / 1_000_000;

  // Max possible score
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

  // Fetch turn data
  const turn = queryOne(
    `SELECT
       id,
       turn_number as turnNumber,
       prompt_text as promptText,
       prompt_hash as promptHash,
       prompt_tokens_est as promptTokensEst,
       heuristic_score as heuristicScore,
       llm_score as llmScore,
       anti_patterns as antiPatterns,
       score_breakdown as scoreBreakdown,
       suggestion_text as suggestionText,
       suggestion_accepted as suggestionAccepted,
       response_tokens_est as responseTokensEst,
       tool_calls as toolCalls,
       latency_ms as latencyMs,
       was_retry as wasRetry,
       context_used_pct as contextUsedPct,
       created_at as createdAt
     FROM turns
     WHERE session_id = ? AND turn_number = ?`,
    [id, turnNumber]
  );

  if (!turn) {
    return NextResponse.json({ error: 'Turn not found' }, { status: 404 });
  }

  // Fetch session data
  const session = queryOne(
    `SELECT
       id,
       model,
       project_dir as projectDir,
       git_branch as gitBranch,
       started_at as startedAt,
       total_turns as totalTurns
     FROM sessions
     WHERE id = ?`,
    [id]
  );

  if (!session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }

  const t = turn as Record<string, unknown>;
  const s = session as Record<string, unknown>;

  // Parse JSON fields
  const antiPatterns = parseJson<unknown[]>(t.antiPatterns as string | null, []);
  const scoreBreakdown = parseJson<ScoreBreakdown | null>(t.scoreBreakdown as string | null, null);
  const toolCalls = parseJson<string[]>(t.toolCalls as string | null, []);

  const promptText = (t.promptText as string) || '';
  const score = (t.heuristicScore as number) ?? (t.llmScore as number) ?? 50;

  // Try to find transcript and parse response for this turn
  let response = null;
  const transcriptPath = findTranscriptFile(id);
  if (transcriptPath) {
    const parsed = parseTranscriptForTurn(transcriptPath, turnNumber);
    if (parsed) {
      response = parsed;
    }
  }

  // Generate improvement data
  const improvement = generateImprovement(
    promptText,
    score,
    antiPatterns,
    scoreBreakdown,
    t.promptTokensEst as number | null
  );

  return NextResponse.json({
    turn: {
      id: t.id,
      turnNumber: t.turnNumber,
      promptText: t.promptText,
      promptHash: t.promptHash,
      promptTokensEst: t.promptTokensEst,
      heuristicScore: t.heuristicScore,
      llmScore: t.llmScore,
      antiPatterns,
      scoreBreakdown,
      suggestionText: t.suggestionText,
      suggestionAccepted: t.suggestionAccepted == null ? null : Boolean(t.suggestionAccepted),
      responseTokensEst: t.responseTokensEst,
      toolCalls,
      latencyMs: t.latencyMs,
      wasRetry: Boolean(t.wasRetry),
      contextUsedPct: t.contextUsedPct,
      createdAt: t.createdAt,
    },
    session: {
      id: s.id,
      model: s.model,
      projectDir: s.projectDir,
      gitBranch: s.gitBranch,
      startedAt: s.startedAt,
      totalTurns: s.totalTurns,
    },
    response,
    improvement,
  });
}
