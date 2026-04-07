// @evaluateai/cli — public API

export { initCommand } from './commands/init.js';
export { teamCommand } from './commands/team.js';
export { statsCommand } from './commands/stats.js';
export { sessionsCommand } from './commands/sessions.js';
export { configCommand } from './commands/config.js';
export { exportCommand } from './commands/export.js';
export { syncCommand } from './commands/sync.js';

export { DATA_DIR, DB_PATH, CONFIG_PATH, LOGS_DIR, getClaudeSettingsPath, ensureDataDir } from './utils/paths.js';
export {
  formatCost,
  formatTokens,
  formatScore,
  formatTrend,
  formatDuration,
  printHeader,
  printSessionSummary,
} from './utils/display.js';

export const CLI_VERSION = '1.0.0';
