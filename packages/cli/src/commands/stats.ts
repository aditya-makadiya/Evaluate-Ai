import { Command } from 'commander';
import chalk from 'chalk';
import { apiRequest } from '../utils/api.js';
import { printHeader, formatCost, formatTokens, formatScore, formatTrend } from '../utils/display.js';

interface PeriodStats {
  sessionCount: number;
  totalTurns: number;
  totalTokens: number;
  totalCost: number;
  avgScore: number | null;
  avgEfficiency: number | null;
  antiPatterns: Record<string, number>;
}

interface SessionRow {
  total_turns?: number;
  total_input_tokens?: number;
  total_output_tokens?: number;
  total_cost_usd?: number;
  avg_prompt_score?: number;
  efficiency_score?: number;
  started_at: string;
}

interface StatsApiResponse {
  sessionCount: number;
  totalTurns: number;
  totalTokens: number;
  totalCost: number;
  avgScore: number | null;
  avgEfficiency: number | null;
  antiPatterns: Record<string, number>;
}

/**
 * Get the start-of-day ISO string for N days ago.
 */
function daysAgo(n: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

/**
 * Fetch stats from the API. Falls back to aggregating sessions client-side
 * if the /api/stats endpoint doesn't return enough data.
 */
async function queryPeriodStats(periodDays: number): Promise<PeriodStats> {
  const since = daysAgo(periodDays === 1 ? 0 : periodDays);

  // Try /api/stats endpoint first
  const { ok, data } = await apiRequest<StatsApiResponse>(`/api/stats?since=${encodeURIComponent(since)}`);

  if (ok && data && typeof data.sessionCount === 'number') {
    return {
      sessionCount: data.sessionCount,
      totalTurns: data.totalTurns ?? 0,
      totalTokens: data.totalTokens ?? 0,
      totalCost: data.totalCost ?? 0,
      avgScore: data.avgScore ?? null,
      avgEfficiency: data.avgEfficiency ?? null,
      antiPatterns: data.antiPatterns ?? {},
    };
  }

  // Fallback: aggregate from sessions list
  const { ok: sessOk, data: sessData } = await apiRequest<{ sessions: SessionRow[] }>(`/api/sessions?limit=1000`);

  if (!sessOk || !sessData?.sessions) {
    return {
      sessionCount: 0,
      totalTurns: 0,
      totalTokens: 0,
      totalCost: 0,
      avgScore: null,
      avgEfficiency: null,
      antiPatterns: {},
    };
  }

  // Filter sessions by date
  const sinceDate = new Date(since);
  const rows = sessData.sessions.filter(s => new Date(s.started_at) >= sinceDate);

  let totalTurns = 0;
  let totalTokens = 0;
  let totalCost = 0;
  let scoreSum = 0;
  let scoreCount = 0;
  let effSum = 0;
  let effCount = 0;

  for (const s of rows) {
    totalTurns += s.total_turns ?? 0;
    totalTokens += (s.total_input_tokens ?? 0) + (s.total_output_tokens ?? 0);
    totalCost += s.total_cost_usd ?? 0;
    if (s.avg_prompt_score != null) {
      scoreSum += s.avg_prompt_score;
      scoreCount++;
    }
    if (s.efficiency_score != null) {
      effSum += s.efficiency_score;
      effCount++;
    }
  }

  return {
    sessionCount: rows.length,
    totalTurns,
    totalTokens,
    totalCost,
    avgScore: scoreCount > 0 ? scoreSum / scoreCount : null,
    avgEfficiency: effCount > 0 ? effSum / effCount : null,
    antiPatterns: {},
  };
}

const TIPS: Record<string, string> = {
  'vague_verb': 'Add specific file paths, function names, and error messages to your prompts.',
  'paraphrased_error': 'Paste the exact error message in backticks instead of describing it.',
  'too_short': 'Add more context — file path, function name, expected behavior.',
  'retry_detected': 'Explain what was wrong with the prior answer instead of repeating.',
  'no_file_ref': 'Include the file path and function name for code-related questions.',
  'multi_question': 'Split into one question per turn for better results.',
  'overlong_prompt': 'Split long prompts into task description + separate context.',
  'no_expected_output': 'Describe what success looks like for better first-try results.',
  'unanchored_ref': "Re-state what 'it' or 'that' refers to — the AI may lose context.",
  'filler_words': 'Remove "please", "could you" etc. — saves tokens with no quality loss.',
};

function printStats(label: string, stats: PeriodStats, prev?: PeriodStats): void {
  printHeader(`${label} Stats`);

  console.log(`  Sessions:    ${chalk.white(String(stats.sessionCount))}${prev ? '  ' + formatTrend(stats.sessionCount, prev.sessionCount) : ''}`);
  console.log(`  Turns:       ${chalk.white(String(stats.totalTurns))}${prev ? '  ' + formatTrend(stats.totalTurns, prev.totalTurns) : ''}`);
  console.log(`  Tokens:      ${chalk.white(formatTokens(stats.totalTokens))}${prev ? '  ' + formatTrend(stats.totalTokens, prev.totalTokens) : ''}`);
  console.log(`  Cost:        ${chalk.white(formatCost(stats.totalCost))}${prev ? '  ' + formatTrend(stats.totalCost, prev.totalCost) : ''}`);
  console.log(`  Avg Score:   ${stats.avgScore != null ? formatScore(stats.avgScore) : chalk.gray('--')}${prev?.avgScore != null && stats.avgScore != null ? '  ' + formatTrend(stats.avgScore, prev.avgScore) : ''}`);
  console.log(`  Efficiency:  ${stats.avgEfficiency != null ? formatScore(stats.avgEfficiency) : chalk.gray('--')}${prev?.avgEfficiency != null && stats.avgEfficiency != null ? '  ' + formatTrend(stats.avgEfficiency, prev.avgEfficiency) : ''}`);

  // Top anti-patterns
  const sorted = Object.entries(stats.antiPatterns)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  if (sorted.length > 0) {
    console.log('');
    console.log(chalk.bold('  Top Anti-Patterns'));
    for (const [id, count] of sorted) {
      console.log(`    ${chalk.yellow(id.padEnd(25))} ${count}x`);
    }

    // Show a tip for the most common issue
    const topPattern = sorted[0][0];
    const tip = TIPS[topPattern];
    if (tip) {
      console.log('');
      console.log(chalk.cyan(`  💡 Tip: ${tip}`));
    }
  }

  console.log('');
}

export const statsCommand = new Command('stats')
  .description('Show usage statistics')
  .option('--week', 'Show this week\'s stats')
  .option('--month', 'Show this month\'s stats')
  .option('--compare', 'Compare with previous period')
  .action(async (opts: { week?: boolean; month?: boolean; compare?: boolean }) => {
    let periodDays: number;
    let label: string;

    if (opts.month) {
      periodDays = 30;
      label = 'This Month';
    } else if (opts.week) {
      periodDays = 7;
      label = 'This Week';
    } else {
      periodDays = 1;
      label = 'Today';
    }

    const stats = await queryPeriodStats(periodDays);

    let prev: PeriodStats | undefined;
    if (opts.compare) {
      const prevStats = await queryPeriodStats(periodDays * 2);
      // Subtract current period from the "since 2x ago" to get only previous period
      prev = {
        sessionCount: prevStats.sessionCount - stats.sessionCount,
        totalTurns: prevStats.totalTurns - stats.totalTurns,
        totalTokens: prevStats.totalTokens - stats.totalTokens,
        totalCost: prevStats.totalCost - stats.totalCost,
        avgScore: prevStats.avgScore,
        avgEfficiency: prevStats.avgEfficiency,
        antiPatterns: prevStats.antiPatterns,
      };
    }

    printStats(label, stats, prev);
  });
