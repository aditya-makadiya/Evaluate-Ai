import { Command } from 'commander';
import chalk from 'chalk';
import Table from 'cli-table3';
import type { SessionAnalysis } from 'evaluateai-core';
import { apiRequest } from '../utils/api.js';
import {
  formatCost,
  formatTokens,
  formatScore,
  formatDuration,
  printHeader,
} from '../utils/display.js';

interface SessionRow {
  id: string;
  projectDir?: string;
  model?: string;
  startedAt: string;
  endedAt?: string;
  totalTurns?: number;
  totalInputTokens?: number;
  totalOutputTokens?: number;
  totalCostUsd?: number;
  avgPromptScore?: number;
  efficiencyScore?: number;
  analysis?: string | SessionAnalysis;
  // Also support snake_case from some endpoints
  project_dir?: string;
  started_at?: string;
  ended_at?: string;
  total_turns?: number;
  total_input_tokens?: number;
  total_output_tokens?: number;
  total_cost_usd?: number;
  avg_prompt_score?: number;
  efficiency_score?: number;
}

interface TurnRow {
  turnNumber?: number;
  turn_number?: number;
  heuristicScore?: number;
  heuristic_score?: number;
  responseTokensEst?: number;
  response_tokens_est?: number;
  toolCalls?: string | unknown[];
  tool_calls?: string | unknown[];
  suggestionText?: string;
  suggestion_text?: string;
}

interface ToolEvent {
  toolName?: string;
  tool_name?: string;
}

interface SessionDetailResponse {
  id: string;
  projectDir?: string;
  project_dir?: string;
  model?: string;
  startedAt?: string;
  started_at?: string;
  endedAt?: string;
  ended_at?: string;
  totalTurns?: number;
  total_turns?: number;
  totalInputTokens?: number;
  total_input_tokens?: number;
  totalOutputTokens?: number;
  total_output_tokens?: number;
  totalCostUsd?: number;
  total_cost_usd?: number;
  avgPromptScore?: number;
  avg_prompt_score?: number;
  efficiencyScore?: number;
  efficiency_score?: number;
  analysis?: string | SessionAnalysis;
  turns?: TurnRow[];
  toolEvents?: ToolEvent[];
}

/**
 * Print a table of recent sessions.
 */
async function listSessions(limit: number): Promise<void> {
  const { ok, data } = await apiRequest<{ sessions: SessionRow[] }>(`/api/sessions?limit=${limit}`);

  if (!ok || !data) {
    console.log(chalk.red('  Error: Failed to fetch sessions from API.'));
    return;
  }

  const rows = data.sessions ?? [];

  if (rows.length === 0) {
    console.log(chalk.gray('  No sessions found.'));
    return;
  }

  const table = new Table({
    head: [
      chalk.cyan('ID'),
      chalk.cyan('Project'),
      chalk.cyan('Score'),
      chalk.cyan('Turns'),
      chalk.cyan('Tokens'),
      chalk.cyan('Cost'),
      chalk.cyan('When'),
    ],
    style: { head: [], border: ['gray'] },
    colWidths: [38, 22, 8, 8, 10, 10, 14],
  });

  for (const s of rows) {
    const projectDir = s.projectDir || s.project_dir;
    const project = projectDir ? (projectDir.split('/').pop() ?? projectDir) : '--';
    const avgScore = s.avgPromptScore ?? s.avg_prompt_score;
    const score = avgScore != null ? formatScore(avgScore) : chalk.gray('--');
    const inputTokens = s.totalInputTokens ?? s.total_input_tokens ?? 0;
    const outputTokens = s.totalOutputTokens ?? s.total_output_tokens ?? 0;
    const tokens = formatTokens(inputTokens + outputTokens);
    const cost = formatCost(s.totalCostUsd ?? s.total_cost_usd ?? 0);
    const startedAt = s.startedAt || s.started_at;
    const when = startedAt ? formatDuration(Date.now() - new Date(startedAt).getTime()) : '--';

    table.push([
      chalk.dim(s.id),
      project.length > 20 ? project.slice(0, 19) + '...' : project,
      score,
      String(s.totalTurns ?? s.total_turns ?? 0),
      tokens,
      cost,
      chalk.dim(when),
    ]);
  }

  printHeader('Recent Sessions');
  console.log(table.toString());
  console.log('');
}

/**
 * Print a detailed view of a single session.
 */
async function showSession(sessionId: string): Promise<void> {
  // Support prefix matching — if short ID, find the full ID first
  let fullId = sessionId;
  if (sessionId.length < 36) {
    const { ok: listOk, data: listData } = await apiRequest<{ sessions: SessionRow[] }>('/api/sessions?limit=100');
    if (listOk && listData?.sessions) {
      const match = listData.sessions.find(s => s.id.startsWith(sessionId));
      if (match) {
        fullId = match.id;
      }
    }
  }

  const { ok, data: response } = await apiRequest<{ session: SessionDetailResponse; turns: TurnRow[]; toolEvents: ToolEvent[] }>(`/api/sessions/${fullId}`);

  if (!ok || !response?.session) {
    console.log(chalk.red(`  Session not found: ${sessionId}`));
    return;
  }

  const session = response.session;
  session.turns = response.turns;
  session.toolEvents = response.toolEvents;

  // Session header
  printHeader(`Session ${session.id.slice(0, 10)}`);
  const projectDir = session.projectDir || session.project_dir;
  const project = projectDir ? (projectDir.split('/').pop() ?? projectDir) : '--';
  const startedAt = session.startedAt || session.started_at || '--';
  const endedAt = session.endedAt || session.ended_at;
  const totalTurns = session.totalTurns ?? session.total_turns ?? 0;
  const inputTokens = session.totalInputTokens ?? session.total_input_tokens ?? 0;
  const outputTokens = session.totalOutputTokens ?? session.total_output_tokens ?? 0;
  const costUsd = session.totalCostUsd ?? session.total_cost_usd ?? 0;
  const avgScore = session.avgPromptScore ?? session.avg_prompt_score;
  const effScore = session.efficiencyScore ?? session.efficiency_score;

  console.log(`  Project:     ${chalk.white(project)}`);
  console.log(`  Model:       ${chalk.white(session.model ?? '--')}`);
  console.log(`  Started:     ${chalk.white(startedAt)}`);
  console.log(`  Ended:       ${chalk.white(endedAt ?? 'in progress')}`);
  console.log(`  Turns:       ${chalk.white(String(totalTurns))}`);
  console.log(`  Tokens:      ${chalk.white(formatTokens(inputTokens + outputTokens))}`);
  console.log(`  Cost:        ${chalk.white(formatCost(costUsd))}`);
  console.log(`  Avg Score:   ${avgScore != null ? formatScore(avgScore) : chalk.gray('--')}`);
  console.log(`  Efficiency:  ${effScore != null ? formatScore(effScore) : chalk.gray('--')}`);

  // LLM analysis
  if (session.analysis) {
    try {
      const analysis: SessionAnalysis = typeof session.analysis === 'string'
        ? JSON.parse(session.analysis)
        : session.analysis;
      console.log('');
      console.log(chalk.bold('  Analysis'));
      console.log(`  ${chalk.white(analysis.summary)}`);
      if (analysis.spiralDetected) {
        console.log(chalk.red(`  ⚠ Spiral detected at turn ${analysis.spiralStartTurn}`));
      }
      if (analysis.topTip) {
        console.log(chalk.cyan(`  💡 ${analysis.topTip}`));
      }
      if (analysis.wastedTurns.length > 0) {
        console.log(chalk.yellow(`  Wasted turns: ${analysis.wastedTurns.map(w => `#${w.turn}`).join(', ')}`));
      }
    } catch {
      // skip malformed analysis
    }
  }

  // Turn-by-turn detail
  const turnRows = session.turns ?? [];

  if (turnRows.length > 0) {
    console.log('');
    console.log(chalk.bold('  Turn-by-Turn'));

    const table = new Table({
      head: [
        chalk.cyan('#'),
        chalk.cyan('Score'),
        chalk.cyan('Tokens'),
        chalk.cyan('Tools'),
        chalk.cyan('Suggestion'),
      ],
      style: { head: [], border: ['gray'] },
      colWidths: [5, 8, 10, 8, 45],
    });

    for (const t of turnRows) {
      const hScore = t.heuristicScore ?? t.heuristic_score;
      const score = hScore != null ? formatScore(hScore) : chalk.gray('--');
      const respTokens = t.responseTokensEst ?? t.response_tokens_est;
      const tokens = respTokens != null ? formatTokens(respTokens) : '--';

      const tc = t.toolCalls ?? t.tool_calls;
      let toolCount = 0;
      if (tc) {
        try {
          const calls = typeof tc === 'string' ? JSON.parse(tc) : tc;
          toolCount = Array.isArray(calls) ? calls.length : 0;
        } catch { /* ignore */ }
      }

      const sugText = t.suggestionText ?? t.suggestion_text;
      const suggestion = sugText
        ? (sugText.length > 42 ? sugText.slice(0, 39) + '...' : sugText)
        : chalk.gray('--');

      const turnNum = t.turnNumber ?? t.turn_number ?? 0;
      table.push([
        String(turnNum),
        score,
        tokens,
        String(toolCount),
        suggestion,
      ]);
    }

    console.log(table.toString());
  }

  // Tool events
  const events = session.toolEvents ?? [];

  if (events.length > 0) {
    console.log('');
    console.log(chalk.bold(`  Tool Calls (${events.length})`));
    const toolCounts: Record<string, number> = {};
    for (const e of events) {
      const name = e.toolName ?? e.tool_name ?? 'unknown';
      toolCounts[name] = (toolCounts[name] ?? 0) + 1;
    }
    const sorted = Object.entries(toolCounts).sort((a, b) => b[1] - a[1]);
    for (const [name, count] of sorted.slice(0, 10)) {
      console.log(`    ${chalk.white(name.padEnd(25))} ${count}x`);
    }
  }

  console.log('');
}

export const sessionsCommand = new Command('sessions')
  .description('List and inspect sessions')
  .argument('[id]', 'Session ID to show details for')
  .action(async (id?: string) => {
    if (id) {
      await showSession(id);
    } else {
      await listSessions(20);
    }
  });
