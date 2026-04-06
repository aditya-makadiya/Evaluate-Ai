import { Command } from 'commander';
import chalk from 'chalk';
import Table from 'cli-table3';
import { getDb, sessions, turns, toolEvents } from 'evaluateai-core';
import type { Session, SessionAnalysis } from 'evaluateai-core';
import { desc, eq } from 'drizzle-orm';
import {
  formatCost,
  formatTokens,
  formatScore,
  formatDuration,
  printHeader,
} from '../utils/display.js';

/**
 * Print a table of recent sessions.
 */
function listSessions(limit: number): void {
  const db = getDb();
  const rows = db.select().from(sessions)
    .orderBy(desc(sessions.startedAt))
    .limit(limit)
    .all();

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
    colWidths: [12, 22, 8, 8, 10, 10, 14],
  });

  for (const s of rows) {
    const project = s.projectDir
      ? (s.projectDir.split('/').pop() ?? s.projectDir)
      : '--';
    const score = s.avgPromptScore != null ? formatScore(s.avgPromptScore) : chalk.gray('--');
    const tokens = formatTokens(s.totalInputTokens + s.totalOutputTokens);
    const cost = formatCost(s.totalCostUsd);
    const when = formatDuration(Date.now() - new Date(s.startedAt).getTime());

    table.push([
      chalk.dim(s.id.slice(0, 10)),
      project.length > 20 ? project.slice(0, 19) + '…' : project,
      score,
      String(s.totalTurns),
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
function showSession(sessionId: string): void {
  const db = getDb();

  // Find session (match by prefix)
  const allSessions = db.select().from(sessions).all();
  const session = allSessions.find(s => s.id.startsWith(sessionId));

  if (!session) {
    console.log(chalk.red(`  Session not found: ${sessionId}`));
    return;
  }

  // Session header
  printHeader(`Session ${session.id.slice(0, 10)}`);
  const project = session.projectDir
    ? session.projectDir.split('/').pop() ?? session.projectDir
    : '--';
  console.log(`  Project:     ${chalk.white(project)}`);
  console.log(`  Model:       ${chalk.white(session.model ?? '--')}`);
  console.log(`  Started:     ${chalk.white(session.startedAt)}`);
  console.log(`  Ended:       ${chalk.white(session.endedAt ?? 'in progress')}`);
  console.log(`  Turns:       ${chalk.white(String(session.totalTurns))}`);
  console.log(`  Tokens:      ${chalk.white(formatTokens(session.totalInputTokens + session.totalOutputTokens))}`);
  console.log(`  Cost:        ${chalk.white(formatCost(session.totalCostUsd))}`);
  console.log(`  Avg Score:   ${session.avgPromptScore != null ? formatScore(session.avgPromptScore) : chalk.gray('--')}`);
  console.log(`  Efficiency:  ${session.efficiencyScore != null ? formatScore(session.efficiencyScore) : chalk.gray('--')}`);

  // LLM analysis
  if (session.analysis) {
    try {
      const analysis: SessionAnalysis = JSON.parse(session.analysis);
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
  const turnRows = db.select().from(turns)
    .where(eq(turns.sessionId, session.id))
    .orderBy(turns.turnNumber)
    .all();

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
      const score = t.heuristicScore != null ? formatScore(t.heuristicScore) : chalk.gray('--');
      const tokens = t.responseTokensEst != null ? formatTokens(t.responseTokensEst) : '--';

      let toolCount = 0;
      if (t.toolCalls) {
        try {
          toolCount = JSON.parse(t.toolCalls).length;
        } catch { /* ignore */ }
      }

      const suggestion = t.suggestionText
        ? (t.suggestionText.length > 42 ? t.suggestionText.slice(0, 39) + '...' : t.suggestionText)
        : chalk.gray('--');

      table.push([
        String(t.turnNumber),
        score,
        tokens,
        String(toolCount),
        suggestion,
      ]);
    }

    console.log(table.toString());
  }

  // Tool events
  const events = db.select().from(toolEvents)
    .where(eq(toolEvents.sessionId, session.id))
    .all();

  if (events.length > 0) {
    console.log('');
    console.log(chalk.bold(`  Tool Calls (${events.length})`));
    const toolCounts: Record<string, number> = {};
    for (const e of events) {
      toolCounts[e.toolName] = (toolCounts[e.toolName] ?? 0) + 1;
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
  .action((id?: string) => {
    if (id) {
      showSession(id);
    } else {
      listSessions(20);
    }
  });
