import { join } from 'node:path';
import { homedir } from 'node:os';
import { mkdirSync, existsSync } from 'node:fs';

export const DATA_DIR = join(homedir(), '.evaluateai-v2');
export const CONFIG_PATH = join(DATA_DIR, 'config.json');
export const LOGS_DIR = join(DATA_DIR, 'logs');

/**
 * Returns the path to Claude Code's settings.json.
 */
export function getClaudeSettingsPath(): string {
  return join(homedir(), '.claude', 'settings.json');
}

/**
 * Ensure the data directory and logs subdirectory exist.
 */
export function ensureDataDir(): void {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!existsSync(LOGS_DIR)) {
    mkdirSync(LOGS_DIR, { recursive: true });
  }
}
