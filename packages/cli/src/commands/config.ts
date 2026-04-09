import { Command } from 'commander';
import chalk from 'chalk';
import { apiRequest } from '../utils/api.js';
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

async function showConfig(): Promise<void> {
  const { ok, data } = await apiRequest<Record<string, { value: string; updatedAt: string }>>('/api/config');

  printHeader('Configuration');

  if (!ok || !data) {
    console.log(chalk.red('  Error: Failed to fetch configuration from API.'));
    return;
  }

  const entries = Object.entries(data);
  if (entries.length === 0) {
    console.log(chalk.gray('  No configuration found. Run `evalai config set <key> <value>` to add.'));
    return;
  }

  for (const [key, info] of entries) {
    const displayKey = key.replace(/_/g, '-');
    console.log(`  ${chalk.cyan(displayKey.padEnd(20))} ${chalk.white(info.value)}`);
  }
  console.log('');
}

async function setConfig(key: string, value: string): Promise<void> {
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

  const { ok } = await apiRequest('/api/config', {
    method: 'PUT',
    body: { key, value },
  });

  if (!ok) {
    console.log(chalk.red('  Error: Failed to update configuration via API.'));
    return;
  }

  console.log(chalk.green(`  ${key} = ${value}`));
}

export const configCommand = new Command('config')
  .description('View or update configuration')
  .argument('[action]', '"set" to update a config value')
  .argument('[key]', 'Config key to set')
  .argument('[value]', 'Config value')
  .action(async (action?: string, key?: string, value?: string) => {
    if (!action) {
      await showConfig();
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
      await setConfig(key, value);
      return;
    }

    // If action is not "set", treat it as showing config
    console.log(chalk.red(`  Unknown action: ${action}`));
    console.log(chalk.gray('  Usage: evalai config [set <key> <value>]'));
  });
