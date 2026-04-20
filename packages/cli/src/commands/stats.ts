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

interface ApiPeriodBucket {
  sessions: number;
  turns: number;
  tokens: number;
  cost: number;
  avgScore: number | null;
  efficiency: number | null;
}

interface StatsApiResponse {
  today?: ApiPeriodBucket;
  thisWeek?: ApiPeriodBucket;
  thisMonth?: ApiPeriodBucket;
  previousDay?: ApiPeriodBucket;
  previousWeek?: ApiPeriodBucket;
  previousMonth?: ApiPeriodBucket;
  topAntiPatterns?: Array<{ pattern: string; count: number }>;
}

type PeriodKey = 'today' | 'week' | 'month';

const EMPTY_STATS: PeriodStats = {
  sessionCount: 0,
  totalTurns: 0,
  totalTokens: 0,
  totalCost: 0,
  avgScore: null,
  avgEfficiency: null,
  antiPatterns: {},
};

function toPeriodStats(
  bucket: ApiPeriodBucket | undefined,
  antiPatterns: Record<string, number>,
): PeriodStats {
  if (!bucket) return { ...EMPTY_STATS, antiPatterns };
  return {
    sessionCount: bucket.sessions ?? 0,
    totalTurns: bucket.turns ?? 0,
    totalTokens: bucket.tokens ?? 0,
    totalCost: bucket.cost ?? 0,
    avgScore: bucket.avgScore ?? null,
    avgEfficiency: bucket.efficiency ?? null,
    antiPatterns,
  };
}

/**
 * Fetch stats from `/api/stats?period=...` and project the response shape
 * (period buckets + top anti-patterns) onto the CLI's PeriodStats view.
 * Returns both the current-period and previous-period aggregates so `--compare`
 * can render without issuing a second request.
 */
async function queryPeriodStats(periodKey: PeriodKey): Promise<{ current: PeriodStats; previous: PeriodStats }> {
  const { ok, data } = await apiRequest<StatsApiResponse>(`/api/stats?period=${periodKey}`);

  if (!ok || !data) {
    return { current: { ...EMPTY_STATS }, previous: { ...EMPTY_STATS } };
  }

  const antiPatternMap: Record<string, number> = {};
  for (const { pattern, count } of data.topAntiPatterns ?? []) {
    if (pattern) antiPatternMap[pattern] = count;
  }

  const currKey = periodKey === 'today' ? 'today' : periodKey === 'week' ? 'thisWeek' : 'thisMonth';
  const prevKey = periodKey === 'today' ? 'previousDay' : periodKey === 'week' ? 'previousWeek' : 'previousMonth';

  return {
    current: toPeriodStats(data[currKey], antiPatternMap),
    previous: toPeriodStats(data[prevKey], antiPatternMap),
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
    let periodKey: PeriodKey;
    let label: string;

    if (opts.month) {
      periodKey = 'month';
      label = 'This Month';
    } else if (opts.week) {
      periodKey = 'week';
      label = 'This Week';
    } else {
      periodKey = 'today';
      label = 'Today';
    }

    const { current, previous } = await queryPeriodStats(periodKey);
    printStats(label, current, opts.compare ? previous : undefined);
  });
