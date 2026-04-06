import { Command } from 'commander';
import chalk from 'chalk';
import { getDb, config } from 'evaluateai-core';
import type { PrivacyMode, ScoringMode } from 'evaluateai-core';
import { eq } from 'drizzle-orm';
import { printHeader } from '../utils/display.js';

const VALID_KEYS: Record<string, { validate: (v: string) => boolean; description: string }> = {
  privacy: {
    validate: (v) => ['off', 'local', 'hash'].includes(v),
    description: 'Privacy mode: off | local | hash',
  },
  scoring: {
    validate: (v) => ['heuristic', 'llm'].includes(v),
    description: 'Scoring mode: heuristic | llm',
  },
  threshold: {
    validate: (v) => {
      const n = Number(v);
      return !isNaN(n) && n >= 0 && n <= 100;
    },
    description: 'Score threshold: 0-100',
  },
  'dashboard-port': {
    validate: (v) => {
      const n = Number(v);
      return !isNaN(n) && n >= 1024 && n <= 65535;
    },
    description: 'Dashboard port: 1024-65535',
  },
};

/**
 * Map CLI key names to DB key names (underscores).
 */
function toDbKey(key: string): string {
  return key.replace(/-/g, '_');
}

function showConfig(): void {
  const db = getDb();
  const rows = db.select().from(config).all();

  printHeader('Configuration');

  if (rows.length === 0) {
    console.log(chalk.gray('  No configuration found. Run `evalai init` first.'));
    return;
  }

  for (const row of rows) {
    const displayKey = row.key.replace(/_/g, '-');
    console.log(`  ${chalk.cyan(displayKey.padEnd(20))} ${chalk.white(row.value)}`);
  }
  console.log('');
}

function setConfig(key: string, value: string): void {
  const validator = VALID_KEYS[key];
  if (!validator) {
    console.log(chalk.red(`  Unknown config key: ${key}`));
    console.log(chalk.gray(`  Valid keys: ${Object.keys(VALID_KEYS).join(', ')}`));
    return;
  }

  if (!validator.validate(value)) {
    console.log(chalk.red(`  Invalid value for ${key}: ${value}`));
    console.log(chalk.gray(`  ${validator.description}`));
    return;
  }

  const db = getDb();
  const dbKey = toDbKey(key);
  const now = new Date().toISOString();

  db.insert(config)
    .values({ key: dbKey, value, updatedAt: now })
    .onConflictDoUpdate({ target: config.key, set: { value, updatedAt: now } })
    .run();

  console.log(chalk.green(`  ${key} = ${value}`));
}

export const configCommand = new Command('config')
  .description('View or update configuration')
  .argument('[action]', '"set" to update a config value')
  .argument('[key]', 'Config key to set')
  .argument('[value]', 'Config value')
  .action((action?: string, key?: string, value?: string) => {
    if (!action) {
      showConfig();
      return;
    }

    if (action === 'set') {
      if (!key || !value) {
        console.log(chalk.red('  Usage: evalai config set <key> <value>'));
        console.log('');
        console.log('  Available keys:');
        for (const [k, v] of Object.entries(VALID_KEYS)) {
          console.log(`    ${chalk.cyan(k.padEnd(20))} ${chalk.gray(v.description)}`);
        }
        return;
      }
      setConfig(key, value);
      return;
    }

    // If action is not "set", treat it as showing config
    console.log(chalk.red(`  Unknown action: ${action}`));
    console.log(chalk.gray('  Usage: evalai config [set <key> <value>]'));
  });
