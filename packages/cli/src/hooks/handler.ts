// ============================================================
// Claude Code hook handlers
// All data writes go through the API proxy via CLI token auth.
// ============================================================

import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { readFileSync, existsSync, readdirSync, appendFileSync, writeFileSync, unlinkSync, mkdirSync } from 'node:fs';
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

/** Track whether we've already warned about missing credentials (once per process). */
let _credWarned = false;

/**
 * Send data to the API proxy. Returns true on success.
 */
async function sendToApi(event: string, data: Record<string, unknown>): Promise<boolean> {
  const creds = getCredentials();
  if (!creds?.token || !creds?.apiUrl) {
    if (!_credWarned) {
      _credWarned = true;
      process.stderr.write('[EvaluateAI] Not authenticated — data not tracked. Run: evalai login\n');
    }
    return false;
  }

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
    if (!res.ok) {
      appendToQueue(event, data);
      return false;
    }
    return true;
  } catch {
    appendToQueue(event, data);
    return false;
  }
}

// ── Event queue (offline resilience) ─────────────────────────

const QUEUE_DIR = join(homedir(), '.evaluateai-v2');
const QUEUE_PATH = join(QUEUE_DIR, 'queue.jsonl');
const MAX_QUEUE_EVENTS = 1000;

/**
 * Append a failed event to the local queue file for later retry.
 * Uses appendFileSync — typically sub-1ms, safe for hook budget.
 */
function appendToQueue(event: string, data: Record<string, unknown>): void {
  try {
    if (!existsSync(QUEUE_DIR)) mkdirSync(QUEUE_DIR, { recursive: true });
    const line = JSON.stringify({ event, ...data, _queuedAt: new Date().toISOString() }) + '\n';
    appendFileSync(QUEUE_PATH, line, 'utf-8');
  } catch {
    // Queue write failed — non-critical, don't crash
  }
}

/**
 * Flush queued events to the API. Fully async, fire-and-forget.
 * Reads the queue, replays events in order, rewrites with failures only.
 */
async function flushQueue(): Promise<void> {
  try {
    if (!existsSync(QUEUE_PATH)) return;

    const raw = readFileSync(QUEUE_PATH, 'utf-8').trim();
    if (!raw) return;

    const lines = raw.split('\n').filter(Boolean);
    if (lines.length === 0) return;

    // Cap to MAX_QUEUE_EVENTS (keep newest)
    const entries = lines.slice(-MAX_QUEUE_EVENTS);

    // Delete queue file before processing to avoid double-flush from concurrent hooks
    try { unlinkSync(QUEUE_PATH); } catch { /* ignore */ }

    const failed: string[] = [];

    for (const line of entries) {
      try {
        const parsed = JSON.parse(line);
        const { event, _queuedAt, ...rest } = parsed;
        if (!event) continue;

        const ok = await sendToApi(event, rest);
        if (!ok) {
          failed.push(line);
        }
      } catch {
        // Malformed line — drop it
      }
    }

    // Rewrite queue with only failed events
    if (failed.length > 0) {
      try {
        writeFileSync(QUEUE_PATH, failed.join('\n') + '\n', 'utf-8');
      } catch {
        // non-critical
      }
    }
  } catch {
    // Queue flush failed — non-critical
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

/**
 * Resolve transcript path from payload. Falls back to searching by session_id
 * in ~/.claude/projects/ if transcript_path is not provided.
 */
function resolveTranscriptPath(payload: Record<string, unknown>): string | null {
  // Prefer explicit transcript_path from Claude Code
  if (payload.transcript_path) {
    const p = String(payload.transcript_path);
    if (existsSync(p)) return p;
  }

  // Fallback: search for <session_id>.jsonl in ~/.claude/projects/
  const sid = String(payload.session_id || '');
  if (!sid) return null;

  try {
    const claudeProjectsDir = join(homedir(), '.claude', 'projects');
    if (!existsSync(claudeProjectsDir)) return null;

    const dirs = readdirSync(claudeProjectsDir, { withFileTypes: true });
    for (const dir of dirs) {
      if (!dir.isDirectory()) continue;
      const candidate = join(claudeProjectsDir, dir.name, `${sid}.jsonl`);
      if (existsSync(candidate)) return candidate;
    }
  } catch {
    // non-critical
  }

  return null;
}

// ── Hook event router ────────────────────────────────────────

/**
 * Route a hook event to the correct handler.
 * Called from bin/evalai.js when `evalai hook <event>` runs.
 */
export async function handleHookEvent(payload: Record<string, unknown>): Promise<void> {
  // Attempt to flush any queued events from previous failures (fire-and-forget)
  flushQueue().catch(() => {});

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
      anti_patterns: heuristic.antiPatterns.map(a => a.id),
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

/**
 * Stop fires after every Claude response. Update running metrics
 * via session_update (does NOT set ended_at).
 * Fire-and-forget to stay under 50ms.
 */
async function handleStop(payload: Record<string, unknown>): Promise<void> {
  try {
    const sid = String(payload.session_id || '');
    if (!sid) return;

    const transcriptPath = resolveTranscriptPath(payload);
    if (!transcriptPath) return;

    // Fire-and-forget: parse transcript and update metrics in background
    (async () => {
      try {
        const { getSessionSummary, getPerTurnSummary } = await import('evaluateai-core');
        const summary = getSessionSummary(transcriptPath);
        if (!summary) return;

        // Compute tool usage from transcript (ensures data survives Ctrl+C / stale sessions)
        const toolCounts: Record<string, number> = {};
        let totalToolCalls = 0;
        for (const resp of summary.responses) {
          for (const toolName of resp.toolCalls) {
            toolCounts[toolName] = (toolCounts[toolName] ?? 0) + 1;
            totalToolCalls++;
          }
        }

        // Extract per-turn response data (response_tokens, tool_calls) keyed by prompt_hash.
        // This fills gaps where the DB only has prompt data but no response data per turn.
        const perTurnData = getPerTurnSummary(transcriptPath);

        await sendToApi('session_update', {
          session_id: sid,
          model: summary.model,
          total_input_tokens: summary.totalInputTokens,
          total_output_tokens: summary.totalOutputTokens,
          total_cost_usd: summary.totalCostUsd,
          total_turns: summary.turns,
          total_tool_calls: totalToolCalls,
          tool_usage_summary: toolCounts,
          last_activity_at: new Date().toISOString(),
          per_turn_data: perTurnData ?? undefined,
        });
      } catch {
        // Non-critical — next Stop will retry
      }
    })().catch(() => {});
  } catch {
    // Never fail
  }
}

/**
 * SessionEnd fires once when the session closes.
 * Send final metrics with ended_at.
 *
 * IMPORTANT: This must NOT block Claude Code. The entire flow is
 * fire-and-forget — we launch the async work and return immediately.
 * If the API call fails, we retry once. If that also fails, the
 * dashboard's stale-session detection will auto-close it after 30 min.
 */
async function handleSessionEnd(payload: Record<string, unknown>): Promise<void> {
  try {
    const sid = String(payload.session_id || '');
    if (!sid) return;

    const now = payload.timestamp ? String(payload.timestamp) : new Date().toISOString();

    // Fire-and-forget: parse transcript + send session_end in background
    (async () => {
      try {
        const sessionData: Record<string, unknown> = {
          session_id: sid,
          ended_at: now,
        };

        // Read transcript for final token/cost/turn/tool data
        const transcriptPath = resolveTranscriptPath(payload);
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

              // Compute tool usage from transcript (replaces per-event tool_use API calls)
              const toolCounts: Record<string, number> = {};
              let totalToolCalls = 0;
              for (const resp of summary.responses) {
                for (const toolName of resp.toolCalls) {
                  toolCounts[toolName] = (toolCounts[toolName] ?? 0) + 1;
                  totalToolCalls++;
                }
              }
              sessionData.total_tool_calls = totalToolCalls;
              sessionData.tool_usage_summary = toolCounts;
            }
          } catch {
            // Transcript parsing failed — still send ended_at
          }
        }

        // Send session_end — retry once on failure
        const ok = await sendToApi('session_end', sessionData);
        if (!ok) {
          // Retry after a short delay
          await new Promise(r => setTimeout(r, 1000));
          await sendToApi('session_end', sessionData);
        }

        // Activity timeline entry is created server-side in the ingest route
        // when processing the session_end event (with enriched metrics).
      } catch {
        // Non-critical — stale session detection will handle cleanup
      }
    })().catch(() => {});
  } catch {
    // Never fail
  }
}
