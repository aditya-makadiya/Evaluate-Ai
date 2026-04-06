import { Command } from 'commander';
import chalk from 'chalk';
import { writeFileSync } from 'node:fs';
import { getDb, sessions, turns } from 'evaluateai-core';
import { desc } from 'drizzle-orm';
import { printHeader } from '../utils/display.js';

function getDateStamp(): string {
  return new Date().toISOString().split('T')[0];
}

function exportCsv(): void {
  const db = getDb();
  const rows = db.select().from(sessions)
    .orderBy(desc(sessions.startedAt))
    .all();

  if (rows.length === 0) {
    console.log(chalk.gray('  No sessions to export.'));
    return;
  }

  const headers = [
    'id', 'tool', 'integration', 'project_dir', 'git_repo', 'git_branch', 'model',
    'started_at', 'ended_at', 'total_turns', 'total_input_tokens', 'total_output_tokens',
    'total_cost_usd', 'total_tool_calls', 'files_changed', 'avg_prompt_score',
    'efficiency_score', 'token_waste_ratio', 'context_peak_pct',
  ];

  const csvRows = [headers.join(',')];

  for (const s of rows) {
    const values = [
      s.id,
      s.tool,
      s.integration,
      s.projectDir ?? '',
      s.gitRepo ?? '',
      s.gitBranch ?? '',
      s.model ?? '',
      s.startedAt,
      s.endedAt ?? '',
      String(s.totalTurns),
      String(s.totalInputTokens),
      String(s.totalOutputTokens),
      String(s.totalCostUsd),
      String(s.totalToolCalls),
      String(s.filesChanged),
      s.avgPromptScore != null ? String(s.avgPromptScore) : '',
      s.efficiencyScore != null ? String(s.efficiencyScore) : '',
      s.tokenWasteRatio != null ? String(s.tokenWasteRatio) : '',
      s.contextPeakPct != null ? String(s.contextPeakPct) : '',
    ];
    // Escape values containing commas or quotes
    const escaped = values.map(v => {
      if (v.includes(',') || v.includes('"') || v.includes('\n')) {
        return `"${v.replace(/"/g, '""')}"`;
      }
      return v;
    });
    csvRows.push(escaped.join(','));
  }

  const filename = `evaluateai-export-${getDateStamp()}.csv`;
  writeFileSync(filename, csvRows.join('\n') + '\n', 'utf-8');
  console.log(chalk.green(`  Exported ${rows.length} sessions to ${filename}`));
}

function exportJson(): void {
  const db = getDb();
  const sessionRows = db.select().from(sessions)
    .orderBy(desc(sessions.startedAt))
    .all();

  if (sessionRows.length === 0) {
    console.log(chalk.gray('  No sessions to export.'));
    return;
  }

  const turnRows = db.select().from(turns).all();
  const turnsBySession: Record<string, typeof turnRows> = {};
  for (const t of turnRows) {
    if (!turnsBySession[t.sessionId]) turnsBySession[t.sessionId] = [];
    turnsBySession[t.sessionId].push(t);
  }

  const data = sessionRows.map(s => ({
    ...s,
    turns: (turnsBySession[s.id] ?? []).sort((a, b) => a.turnNumber - b.turnNumber),
  }));

  const filename = `evaluateai-export-${getDateStamp()}.json`;
  writeFileSync(filename, JSON.stringify(data, null, 2) + '\n', 'utf-8');
  console.log(chalk.green(`  Exported ${sessionRows.length} sessions to ${filename}`));
}

export const exportCommand = new Command('export')
  .description('Export sessions to CSV or JSON')
  .option('--csv', 'Export as CSV')
  .option('--json', 'Export as JSON')
  .action((opts: { csv?: boolean; json?: boolean }) => {
    printHeader('Export');

    if (!opts.csv && !opts.json) {
      console.log(chalk.yellow('  Specify --csv or --json'));
      console.log(chalk.gray('  Usage: evalai export --csv'));
      return;
    }

    if (opts.csv) exportCsv();
    if (opts.json) exportJson();
    console.log('');
  });
