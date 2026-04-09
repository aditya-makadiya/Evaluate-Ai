// ============================================================
// Claude Code hook handlers
// All data writes go through the API proxy via CLI token auth.
// ============================================================

import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

// ── Credentials & API client ────────────────────────────────

interface CliCreds {
  token: string;
  apiUrl: string;
  teamId?: string;
  userId?: string;
}

let _creds: CliCreds | null = null;
let _credsLoaded = false;

function getCredentials(): CliCreds | null {
  if (_credsLoaded) return _creds;
  try {
    const credPath = join(homedir(), '.evaluateai-v2', 'credentials.json');
    _credsLoaded = true;
    if (!existsSync(credPath)) { _creds = null; return null; }
    _creds = JSON.parse(readFileSync(credPath, 'utf-8'));
    return _creds;
  } catch {
    _credsLoaded = true;
    _creds = null;
    return null;
  }
}

/**
 * Send data to the API proxy. Returns true on success.
 */
async function sendToApi(event: string, data: Record<string, unknown>): Promise<boolean> {
  const creds = getCredentials();
  if (!creds?.token || !creds?.apiUrl) return false;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(`${creds.apiUrl}/api/cli/ingest`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${creds.token}`,
      },
      body: JSON.stringify({ event, ...data }),
      signal: controller.signal,
    });

    clearTimeout(timeout);
    return res.ok;
  } catch {
    return false;
  }
}

// ── Shared utilities ─────────────────────────────────────────

/**
 * Read JSON from stdin (Claude Code sends hook data as JSON on stdin).
 */
export async function readStdinJSON<T = Record<string, unknown>>(): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const chunks: Buffer[] = [];
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk: string | Buffer) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    process.stdin.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8').trim();
        if (!raw) {
          resolve({} as T);
          return;
        }
        resolve(JSON.parse(raw) as T);
      } catch (err) {
        reject(err);
      }
    });
    process.stdin.on('error', reject);

    if (process.stdin.readableEnded) {
      resolve({} as T);
    }
  });
}

/**
 * Write JSON response to stdout (for Claude Code to read).
 */
export function writeOutput(data: unknown): void {
  process.stdout.write(JSON.stringify(data) + '\n');
}

/**
 * Extract git repo URL and branch from a directory.
 */
export function getGitInfo(cwd: string): { gitRepo: string | null; gitBranch: string | null } {
  let gitRepo: string | null = null;
  let gitBranch: string | null = null;

  try {
    gitRepo = execSync('git config --get remote.origin.url', {
      cwd,
      timeout: 3000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).toString().trim() || null;
  } catch {
    // Not a git repo or no remote
  }

  try {
    gitBranch = execSync('git rev-parse --abbrev-ref HEAD', {
      cwd,
      timeout: 3000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).toString().trim() || null;
  } catch {
    // Not a git repo
  }

  return { gitRepo, gitBranch };
}

/**
 * SHA-256 hash of text.
 */
export function hashText(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

/**
 * Safe exit: always exit 0 so we never break Claude Code.
 */
export function safeExit(code: number = 0): never {
  try {
    process.exit(0);
  } catch {
    process.exit(0);
  }
}

// ── Hook event router ────────────────────────────────────────

/**
 * Route a hook event to the correct handler.
 * Called from bin/evalai.js when `evalai hook <event>` runs.
 */
export async function handleHookEvent(payload: Record<string, unknown>): Promise<void> {
  const event = String(payload.type || '');

  switch (event) {
    case 'session-start':
    case 'SessionStart':
      await handleSessionStart(payload);
      break;
    case 'prompt-submit':
    case 'UserPromptSubmit':
      await handlePromptSubmit(payload);
      break;
    case 'pre-tool':
    case 'PreToolUse':
      await handlePreTool(payload);
      break;
    case 'post-tool':
    case 'PostToolUse':
      await handlePostTool(payload);
      break;
    case 'stop':
    case 'Stop':
      await handleStop(payload);
      break;
    case 'session-end':
    case 'SessionEnd':
      await handleSessionEnd(payload);
      break;
    default:
      break;
  }
}

// ── Event handlers ──────────────────────────────────────────

async function handleSessionStart(payload: Record<string, unknown>): Promise<void> {
  try {
    const cwd = String(payload.cwd || process.cwd());
    const { gitRepo, gitBranch } = getGitInfo(cwd);
    const sid = String(payload.session_id || `session-${Date.now()}`);
    const now = payload.timestamp ? String(payload.timestamp) : new Date().toISOString();

    await sendToApi('session_start', {
      session_id: sid,
      tool: 'claude-code',
      model: payload.model ? String(payload.model) : null,
      project_dir: cwd,
      git_repo: gitRepo,
      git_branch: gitBranch,
      started_at: now,
    });

    // Activity timeline (fire-and-forget)
    sendToApi('activity', {
      event_type: 'ai_session_start',
      title: 'AI session started',
      description: `Claude Code session in ${cwd.split('/').pop() || cwd}`,
      developer_name: '',
      metadata: { session_id: sid, project_dir: cwd, git_branch: gitBranch },
    }).catch(() => {});
  } catch {
    // Never fail
  }
}

async function handlePromptSubmit(payload: Record<string, unknown>): Promise<void> {
  try {
    const { scoreHeuristic, estimateTokens } = await import('evaluateai-core');

    const sid = String(payload.session_id || '');
    const promptText = String(payload.prompt || '');

    if (!sid || !promptText) return;

    const promptHash = hashText(promptText);
    const tokenEst = estimateTokens(promptText);
    const heuristic = scoreHeuristic(promptText, []);

    // turn_number is auto-assigned by the ingest API based on existing turn count
    await sendToApi('prompt_submit', {
      session_id: sid,
      prompt_text: promptText,
      prompt_hash: promptHash,
      prompt_tokens_est: tokenEst,
      heuristic_score: heuristic.score,
      anti_patterns: JSON.stringify(heuristic.antiPatterns.map(a => a.id)),
      intent: heuristic.intent ?? null,
      was_retry: false,
    });

    // Show suggestion if score is low
    if (heuristic.score < 50 && heuristic.quickTip) {
      process.stderr.write(`[EvaluateAI] Score: ${heuristic.score}/100\n`);
      process.stderr.write(`Tip: ${heuristic.quickTip}\n`);
    }
  } catch {
    // Never fail
  }
}

async function handlePreTool(payload: Record<string, unknown>): Promise<void> {
  try {
    const sid = String(payload.session_id || '');
    if (!sid) return;

    // Fire-and-forget — tool events are non-critical
    sendToApi('tool_use', {
      session_id: sid,
      tool_name: String(payload.tool_name || 'unknown'),
      tool_input_summary: payload.tool_input ? String(payload.tool_input).substring(0, 200) : null,
    }).catch(() => {});
  } catch {
    // Never fail
  }
}

async function handlePostTool(payload: Record<string, unknown>): Promise<void> {
  try {
    const sid = String(payload.session_id || '');
    if (!sid) return;

    // Fire-and-forget — tool events are non-critical
    sendToApi('tool_use', {
      session_id: sid,
      tool_name: String(payload.tool_name || 'unknown'),
      success: payload.success === true,
      execution_ms: typeof payload.execution_ms === 'number' ? payload.execution_ms : null,
    }).catch(() => {});
  } catch {
    // Never fail
  }
}

/**
 * Stop fires after every Claude response. Update running metrics
 * via session_update (does NOT set ended_at).
 * Fire-and-forget to stay under 50ms.
 */
async function handleStop(payload: Record<string, unknown>): Promise<void> {
  try {
    const sid = String(payload.session_id || '');
    if (!sid) return;

    const transcriptPath = payload.transcript_path ? String(payload.transcript_path) : null;
    if (!transcriptPath) return;

    // Fire-and-forget: parse transcript and update metrics in background
    (async () => {
      try {
        const { getSessionSummary } = await import('evaluateai-core');
        const summary = getSessionSummary(transcriptPath);
        if (!summary) return;

        await sendToApi('session_update', {
          session_id: sid,
          model: summary.model,
          total_input_tokens: summary.totalInputTokens,
          total_output_tokens: summary.totalOutputTokens,
          total_cost_usd: summary.totalCostUsd,
          total_turns: summary.turns,
        });
      } catch {
        // transcript parsing is optional
      }
    })().catch(() => {});
  } catch {
    // Never fail
  }
}

/**
 * SessionEnd fires once when the session closes.
 * Send final metrics with ended_at.
 */
async function handleSessionEnd(payload: Record<string, unknown>): Promise<void> {
  try {
    const sid = String(payload.session_id || '');
    if (!sid) return;

    const now = payload.timestamp ? String(payload.timestamp) : new Date().toISOString();

    const sessionData: Record<string, unknown> = {
      session_id: sid,
      ended_at: now,
    };

    // Read transcript for final token/cost/turn data
    const transcriptPath = payload.transcript_path ? String(payload.transcript_path) : null;
    if (transcriptPath) {
      try {
        const { getSessionSummary } = await import('evaluateai-core');
        const summary = getSessionSummary(transcriptPath);
        if (summary) {
          sessionData.model = summary.model;
          sessionData.total_input_tokens = summary.totalInputTokens;
          sessionData.total_output_tokens = summary.totalOutputTokens;
          sessionData.total_cost_usd = summary.totalCostUsd;
          sessionData.total_turns = summary.turns;
        }
      } catch {
        // transcript parsing is optional
      }
    }

    await sendToApi('session_end', sessionData);

    // Activity timeline (fire-and-forget)
    sendToApi('activity', {
      event_type: 'ai_session_end',
      title: 'AI session ended',
      description: 'Session completed',
      developer_name: '',
      metadata: { session_id: sid },
    }).catch(() => {});
  } catch {
    // Never fail
  }
}
