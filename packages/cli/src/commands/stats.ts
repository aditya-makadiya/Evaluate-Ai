import { Command } from 'commander';
import chalk from 'chalk';
import { getDb, sessions, turns } from 'evaluateai-core';
import { gte } from 'drizzle-orm';
import { printHeader, formatCost, formatTokens, formatScore, formatTrend } from '../utils/display.js';

/**
 * Get the start-of-day ISO string for N days ago.
 */
function daysAgo(n: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

interface PeriodStats {
  sessionCount: number;
  totalTurns: number;
  totalTokens: number;
  totalCost: number;
  avgScore: number | null;
  avgEfficiency: number | null;
  antiPatterns: Record<string, number>;
}

function queryPeriodStats(since: string): PeriodStats {
  const db = getDb();

  const sessRows = db.select().from(sessions)
    .where(gte(sessions.startedAt, since))
    .all();

  const sessionCount = sessRows.length;
  let totalTurns = 0;
  let totalTokens = 0;
  let totalCost = 0;
  let scoreSum = 0;
  let scoreCount = 0;
  let effSum = 0;
  let effCount = 0;

  for (const s of sessRows) {
    totalTurns += s.totalTurns;
    totalTokens += s.totalInputTokens + s.totalOutputTokens;
    totalCost += s.totalCostUsd;
    if (s.avgPromptScore != null) {
      scoreSum += s.avgPromptScore;
      scoreCount++;
    }
    if (s.efficiencyScore != null) {
      effSum += s.efficiencyScore;
      effCount++;
    }
  }

  // Gather anti-patterns from turns
  const sessionIds = sessRows.map(s => s.id);
  const antiPatterns: Record<string, number> = {};

  if (sessionIds.length > 0) {
    const turnRows = db.select({ antiPatterns: turns.antiPatterns })
      .from(turns)
      .where(gte(turns.createdAt, since))
      .all();

    for (const t of turnRows) {
      if (!t.antiPatterns) continue;
      try {
        const patterns: unknown = JSON.parse(t.antiPatterns);
        if (Array.isArray(patterns)) {
          for (const p of patterns) {
            // Patterns stored as string[] (e.g. ["vague_verb"]) or {id}[]
            const id = typeof p === 'string' ? p : (p as { id?: string })?.id;
            if (id) {
              antiPatterns[id] = (antiPatterns[id] ?? 0) + 1;
            }
          }
        }
      } catch {
        // skip malformed JSON
      }
    }
  }

  return {
    sessionCount,
    totalTurns,
    totalTokens,
    totalCost,
    avgScore: scoreCount > 0 ? scoreSum / scoreCount : null,
    avgEfficiency: effCount > 0 ? effSum / effCount : null,
    antiPatterns,
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
  .action((opts: { week?: boolean; month?: boolean; compare?: boolean }) => {
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

    const since = daysAgo(periodDays === 1 ? 0 : periodDays);
    const stats = queryPeriodStats(since);

    let prev: PeriodStats | undefined;
    if (opts.compare) {
      const prevSince = daysAgo(periodDays * 2);
      prev = queryPeriodStats(prevSince);
      // Subtract current period from the "since 2x ago" to get only previous period
      prev = {
        sessionCount: prev.sessionCount - stats.sessionCount,
        totalTurns: prev.totalTurns - stats.totalTurns,
        totalTokens: prev.totalTokens - stats.totalTokens,
        totalCost: prev.totalCost - stats.totalCost,
        avgScore: prev.avgScore,
        avgEfficiency: prev.avgEfficiency,
        antiPatterns: prev.antiPatterns,
      };
    }

    printStats(label, stats, prev);
  });
