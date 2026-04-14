import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { calculateCost, normalizeModelId } from '../models/pricing.js';

/**
 * A single entry from a Claude Code transcript JSONL file.
 */
export interface TranscriptEntry {
  parentUuid?: string;
  isSidechain?: boolean;
  message: {
    role: 'user' | 'assistant';
    model?: string;
    type?: string;
    content?: Array<{
      type: string;
      text?: string;
      name?: string;
      input?: Record<string, unknown>;
      id?: string;
    }>;
    usage?: {
      input_tokens: number;
      output_tokens: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
      server_tool_use?: {
        web_search_requests?: number;
        web_fetch_requests?: number;
      };
    };
    stop_reason?: string;
  };
}

/**
 * Parsed usage data from a transcript entry.
 */
export interface TranscriptUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  model: string;
  totalTokens: number;
}

/**
 * Summary of an assistant response from transcript.
 */
export interface TranscriptResponse {
  responseText: string;       // concatenated text blocks
  toolCalls: string[];        // tool names called
  usage: TranscriptUsage;
  stopReason: string | null;
}

/**
 * Per-turn summary keyed by prompt hash.
 */
export interface PerTurnData {
  promptHash: string;
  responseTokens: number;
  toolCalls: string[];
}

/**
 * Full session summary from transcript.
 */
export interface TranscriptSummary {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheReadTokens: number;
  totalCacheWriteTokens: number;
  model: string;
  turns: number;              // count of user messages
  responses: TranscriptResponse[];
  totalCostUsd: number;
}

function calculateExactCost(usage: TranscriptUsage): number {
  return calculateCost(
    usage.inputTokens,
    usage.outputTokens,
    usage.model,
    usage.cacheReadTokens,
    usage.cacheWriteTokens
  );
}

/**
 * Read the last N lines of a JSONL file efficiently.
 */
function readLastLines(filePath: string, count: number): string[] {
  try {
    const content = readFileSync(filePath, 'utf-8');
    const lines = content.trim().split('\n');
    return lines.slice(-count);
  } catch {
    return [];
  }
}

/**
 * Parse a single JSONL line into a TranscriptEntry.
 */
function parseLine(line: string): TranscriptEntry | null {
  try {
    return JSON.parse(line) as TranscriptEntry;
  } catch {
    return null;
  }
}

/**
 * Get the latest assistant response from a transcript file.
 * Reads from the end of the file for efficiency.
 */
export function getLatestResponse(transcriptPath: string): TranscriptResponse | null {
  const lines = readLastLines(transcriptPath, 20);

  // Find the last assistant message with usage data
  for (let i = lines.length - 1; i >= 0; i--) {
    const entry = parseLine(lines[i]);
    if (!entry?.message) continue;

    const msg = entry.message;
    if (msg.role === 'assistant' && msg.usage?.output_tokens) {
      const responseText = (msg.content ?? [])
        .filter(c => c.type === 'text' && c.text)
        .map(c => c.text!)
        .join('\n');

      const toolCalls = (msg.content ?? [])
        .filter(c => c.type === 'tool_use' && c.name)
        .map(c => c.name!);

      const usage: TranscriptUsage = {
        inputTokens: msg.usage.input_tokens ?? 0,
        outputTokens: msg.usage.output_tokens ?? 0,
        cacheReadTokens: msg.usage.cache_read_input_tokens ?? 0,
        cacheWriteTokens: msg.usage.cache_creation_input_tokens ?? 0,
        model: normalizeModelId(msg.model ?? 'unknown'),
        totalTokens: (msg.usage.input_tokens ?? 0) + (msg.usage.output_tokens ?? 0) +
                     (msg.usage.cache_read_input_tokens ?? 0) + (msg.usage.cache_creation_input_tokens ?? 0),
      };

      return {
        responseText,
        toolCalls,
        usage,
        stopReason: msg.stop_reason ?? null,
      };
    }
  }

  return null;
}

/**
 * Get full session summary from a transcript file.
 * Reads the entire file and aggregates all assistant responses.
 */
export function getSessionSummary(transcriptPath: string): TranscriptSummary | null {
  try {
    const content = readFileSync(transcriptPath, 'utf-8');
    const lines = content.trim().split('\n');

    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalCacheReadTokens = 0;
    let totalCacheWriteTokens = 0;
    let model = 'unknown';
    let userMessageCount = 0;
    const responses: TranscriptResponse[] = [];

    for (const line of lines) {
      const entry = parseLine(line);
      if (!entry?.message) continue;

      const msg = entry.message;

      if (msg.role === 'user') {
        // Only count real user prompts, not tool_result messages
        const content = msg.content;
        const isToolResult = Array.isArray(content) && content.length > 0 && content[0]?.type === 'tool_result';
        if (!isToolResult) {
          userMessageCount++;
        }
      }

      if (msg.role === 'assistant' && msg.usage) {
        const inputTokens = msg.usage.input_tokens ?? 0;
        const outputTokens = msg.usage.output_tokens ?? 0;
        const cacheRead = msg.usage.cache_read_input_tokens ?? 0;
        const cacheWrite = msg.usage.cache_creation_input_tokens ?? 0;

        totalInputTokens += inputTokens;
        totalOutputTokens += outputTokens;
        totalCacheReadTokens += cacheRead;
        totalCacheWriteTokens += cacheWrite;

        if (msg.model) model = normalizeModelId(msg.model);

        const responseText = (msg.content ?? [])
          .filter(c => c.type === 'text' && c.text)
          .map(c => c.text!)
          .join('\n');

        const toolCalls = (msg.content ?? [])
          .filter(c => c.type === 'tool_use' && c.name)
          .map(c => c.name!);

        const usage: TranscriptUsage = {
          inputTokens, outputTokens, cacheReadTokens: cacheRead,
          cacheWriteTokens: cacheWrite, model: normalizeModelId(msg.model ?? model),
          totalTokens: inputTokens + outputTokens + cacheRead + cacheWrite,
        };

        responses.push({ responseText, toolCalls, usage, stopReason: msg.stop_reason ?? null });
      }
    }

    const summaryUsage: TranscriptUsage = {
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      cacheReadTokens: totalCacheReadTokens,
      cacheWriteTokens: totalCacheWriteTokens,
      model,
      totalTokens: totalInputTokens + totalOutputTokens + totalCacheReadTokens + totalCacheWriteTokens,
    };

    return {
      totalInputTokens,
      totalOutputTokens,
      totalCacheReadTokens,
      totalCacheWriteTokens,
      model,
      turns: userMessageCount,
      responses,
      totalCostUsd: calculateExactCost(summaryUsage),
    };
  } catch {
    return null;
  }
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
 * SHA-256 hash — matches the CLI hook's hashText() function.
 */
function hashText(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

/**
 * Get per-turn summary from a transcript file.
 * Groups assistant responses by user turn and returns per-turn
 * response token counts and tool calls, keyed by prompt hash.
 *
 * This enables the CLI Stop hook to update individual turns
 * in the database with response data that would otherwise be missing.
 */
export function getPerTurnSummary(transcriptPath: string): PerTurnData[] | null {
  try {
    const content = readFileSync(transcriptPath, 'utf-8');
    const lines = content.trim().split('\n');

    // Parse all entries
    const entries: Array<{ role: string; model?: string; content?: unknown[]; usage?: { output_tokens?: number } }> = [];
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);
        const msg = parsed?.message ?? parsed;
        if (msg?.role) entries.push(msg);
      } catch { continue; }
    }

    const result: PerTurnData[] = [];
    let i = 0;
    while (i < entries.length) {
      const entry = entries[i];
      if (entry.role === 'user') {
        const c = entry.content;
        const isToolResult = Array.isArray(c) && c.length > 0 && (c[0] as Record<string, unknown>)?.type === 'tool_result';
        if (!isToolResult) {
          const promptText = extractUserPromptText(c);
          const hash = hashText(promptText);

          let responseTokens = 0;
          const toolCalls: string[] = [];

          let j = i + 1;
          while (j < entries.length) {
            const e = entries[j];
            if (e.role === 'user') {
              const uc = e.content;
              const isTool = Array.isArray(uc) && uc.length > 0 && (uc[0] as Record<string, unknown>)?.type === 'tool_result';
              if (!isTool) break;
            }
            if (e.role === 'assistant') {
              if (e.usage) {
                responseTokens += e.usage.output_tokens ?? 0;
              }
              if (Array.isArray(e.content)) {
                for (const block of e.content) {
                  const b = block as Record<string, unknown>;
                  if (b?.type === 'tool_use' && b?.name) {
                    toolCalls.push(b.name as string);
                  }
                }
              }
            }
            j++;
          }

          result.push({
            promptHash: hash,
            responseTokens,
            toolCalls: [...new Set(toolCalls)],
          });
        }
      }
      i++;
    }

    return result;
  } catch {
    return null;
  }
}
