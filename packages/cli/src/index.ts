// @evaluateai/cli — public API

export { initCommand } from './commands/init.js';
export { teamCommand } from './commands/team.js';
export { statsCommand } from './commands/stats.js';
export { sessionsCommand } from './commands/sessions.js';
export { configCommand } from './commands/config.js';
export { exportCommand } from './commands/export.js';
export { loginCommand } from './commands/login.js';
export { logoutCommand } from './commands/logout.js';
export { whoamiCommand } from './commands/whoami.js';

export { DATA_DIR, CONFIG_PATH, LOGS_DIR, getClaudeSettingsPath, ensureDataDir } from './utils/paths.js';
export { readCredentials, saveCredentials, deleteCredentials, getApiUrl, getAuthToken } from './utils/credentials.js';
export { apiRequest } from './utils/api.js';
export {
  formatCost,
  formatTokens,
  formatScore,
  formatTrend,
  formatDuration,
  printHeader,
  printSessionSummary,
} from './utils/display.js';

export const CLI_VERSION = '2.0.0';
