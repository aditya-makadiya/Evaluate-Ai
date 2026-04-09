import { Command } from 'commander';
import chalk from 'chalk';
import { writeFileSync } from 'node:fs';
import { apiRequest } from '../utils/api.js';
import { printHeader } from '../utils/display.js';

interface SessionRow {
  id: string;
  tool?: string;
  project_dir?: string;
  git_repo?: string;
  git_branch?: string;
  model?: string;
  started_at?: string;
  ended_at?: string;
  total_turns?: number;
  total_input_tokens?: number;
  total_output_tokens?: number;
  total_cost_usd?: number;
  total_tool_calls?: number;
  files_changed?: number;
  avg_prompt_score?: number;
  efficiency_score?: number;
  token_waste_ratio?: number;
  context_peak_pct?: number;
  turns?: TurnRow[];
}

interface TurnRow {
  turn_number: number;
  [key: string]: unknown;
}

function getDateStamp(): string {
  return new Date().toISOString().split('T')[0];
}

async function exportCsv(): Promise<void> {
  const { ok, data } = await apiRequest<{ sessions: SessionRow[] }>('/api/sessions?limit=1000');

  if (!ok || !data) {
    console.log(chalk.red('  Error: Failed to fetch sessions from API.'));
    return;
  }

  const rows = data.sessions ?? [];

  if (rows.length === 0) {
    console.log(chalk.gray('  No sessions to export.'));
    return;
  }

  const headers = [
    'id', 'tool', 'project_dir', 'git_repo', 'git_branch', 'model',
    'started_at', 'ended_at', 'total_turns', 'total_input_tokens', 'total_output_tokens',
    'total_cost_usd', 'total_tool_calls', 'files_changed', 'avg_prompt_score',
    'efficiency_score', 'token_waste_ratio', 'context_peak_pct',
  ];

  const csvRows = [headers.join(',')];

  for (const s of rows) {
    const values = [
      s.id,
      s.tool ?? '',
      s.project_dir ?? '',
      s.git_repo ?? '',
      s.git_branch ?? '',
      s.model ?? '',
      s.started_at ?? '',
      s.ended_at ?? '',
      String(s.total_turns ?? 0),
      String(s.total_input_tokens ?? 0),
      String(s.total_output_tokens ?? 0),
      String(s.total_cost_usd ?? 0),
      String(s.total_tool_calls ?? 0),
      String(s.files_changed ?? 0),
      s.avg_prompt_score != null ? String(s.avg_prompt_score) : '',
      s.efficiency_score != null ? String(s.efficiency_score) : '',
      s.token_waste_ratio != null ? String(s.token_waste_ratio) : '',
      s.context_peak_pct != null ? String(s.context_peak_pct) : '',
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

async function exportJson(): Promise<void> {
  const { ok, data } = await apiRequest<{ sessions: SessionRow[] }>('/api/sessions?limit=1000');

  if (!ok || !data) {
    console.log(chalk.red('  Error: Failed to fetch sessions from API.'));
    return;
  }

  const sessionRows = data.sessions ?? [];

  if (sessionRows.length === 0) {
    console.log(chalk.gray('  No sessions to export.'));
    return;
  }

  // For JSON export, fetch each session with turns included
  const sessionsWithTurns = [];
  for (const s of sessionRows) {
    const { ok: detailOk, data: detail } = await apiRequest<SessionRow>(`/api/sessions/${s.id}`);
    if (detailOk && detail) {
      sessionsWithTurns.push(detail);
    } else {
      sessionsWithTurns.push(s);
    }
  }

  const filename = `evaluateai-export-${getDateStamp()}.json`;
  writeFileSync(filename, JSON.stringify(sessionsWithTurns, null, 2) + '\n', 'utf-8');
  console.log(chalk.green(`  Exported ${sessionRows.length} sessions to ${filename}`));
}

export const exportCommand = new Command('export')
  .description('Export sessions to CSV or JSON')
  .option('--csv', 'Export as CSV')
  .option('--json', 'Export as JSON')
  .action(async (opts: { csv?: boolean; json?: boolean }) => {
    printHeader('Export');

    if (!opts.csv && !opts.json) {
      console.log(chalk.yellow('  Specify --csv or --json'));
      console.log(chalk.gray('  Usage: evalai export --csv'));
      return;
    }

    if (opts.csv) await exportCsv();
    if (opts.json) await exportJson();
    console.log('');
  });
