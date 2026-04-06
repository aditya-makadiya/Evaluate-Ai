import chalk from 'chalk';
import type { Session } from 'evaluateai-core';

/**
 * Format a USD cost value for display.
 */
export function formatCost(usd: number): string {
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}

/**
 * Format a token count (e.g. 89400 -> "89.4K").
 */
export function formatTokens(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return String(count);
}

/**
 * Format a score with color coding.
 * Green >= 70, Yellow >= 40, Red < 40.
 */
export function formatScore(score: number): string {
  const rounded = Math.round(score);
  if (rounded >= 70) return chalk.green(String(rounded));
  if (rounded >= 40) return chalk.yellow(String(rounded));
  return chalk.red(String(rounded));
}

/**
 * Format a trend between current and previous values.
 * Returns "↑12%" or "↓8%" with color.
 */
export function formatTrend(current: number, previous: number): string {
  if (previous === 0) return chalk.gray('--');
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct > 0) return chalk.green(`↑${pct}%`);
  if (pct < 0) return chalk.red(`↓${Math.abs(pct)}%`);
  return chalk.gray('→0%');
}

/**
 * Format a duration from a timestamp string to a relative time.
 */
export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  return `${weeks}w ago`;
}

/**
 * Print a styled header line.
 */
export function printHeader(title: string): void {
  const line = '─'.repeat(50);
  console.log('');
  console.log(chalk.bold.cyan(`  ${title}`));
  console.log(chalk.gray(`  ${line}`));
}

/**
 * Print a one-liner summary for a session.
 */
export function printSessionSummary(session: Session): void {
  const score = session.avgPromptScore != null
    ? formatScore(session.avgPromptScore)
    : chalk.gray('--');
  const tokens = formatTokens(session.totalInputTokens + session.totalOutputTokens);
  const cost = formatCost(session.totalCostUsd);
  const turns = session.totalTurns;
  const elapsed = formatDuration(Date.now() - new Date(session.startedAt).getTime());

  const project = session.projectDir
    ? session.projectDir.split('/').pop() ?? session.projectDir
    : 'unknown';

  console.log(
    `  ${chalk.dim(session.id.slice(0, 8))} ` +
    `${chalk.white(project.padEnd(20))} ` +
    `Score:${score.padStart(5)}  ` +
    `${String(turns).padStart(3)} turns  ` +
    `${tokens.padStart(7)} tok  ` +
    `${cost.padStart(7)}  ` +
    `${chalk.dim(elapsed)}`
  );
}
