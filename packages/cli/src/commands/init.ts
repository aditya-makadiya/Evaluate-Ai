import { Command } from 'commander';
import chalk from 'chalk';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { getClaudeSettingsPath, ensureDataDir } from '../utils/paths.js';
import { printHeader } from '../utils/display.js';

/**
 * The 4 Claude Code hook events we register.
 * PreToolUse/PostToolUse removed — tool data is computed from transcript at session end.
 */
const HOOK_EVENTS = [
  'SessionStart',
  'UserPromptSubmit',
  'Stop',
  'SessionEnd',
] as const;

export interface InitOptions {
  /** When true, suppress the init command's own header/output (caller owns UX). */
  silent?: boolean;
}

export interface InitResult {
  success: boolean;
  hooksInstalled: number;
  reason?: string;
}

function buildHooksConfig(): Record<string, unknown> {
  const hooks: Record<string, unknown> = {};
  for (const event of HOOK_EVENTS) {
    hooks[event] = [
      {
        hooks: [
          {
            type: 'command',
            command: `evalai hook ${event}`,
            timeout: 10000,
          },
        ],
      },
    ];
  }
  return hooks;
}

function readSettings(path: string): Record<string, unknown> {
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    return {};
  }
}

function writeSettings(path: string, settings: Record<string, unknown>): void {
  writeFileSync(path, JSON.stringify(settings, null, 2) + '\n', 'utf-8');
}

function checkHooks(settings: Record<string, unknown>): Map<string, boolean> {
  const result = new Map<string, boolean>();
  const hooks = (settings.hooks ?? {}) as Record<string, unknown>;
  for (const event of HOOK_EVENTS) {
    const hookEntry = hooks[event];
    let installed = false;

    if (Array.isArray(hookEntry)) {
      installed = hookEntry.some((entry: Record<string, unknown>) => {
        const innerHooks = entry.hooks;
        if (Array.isArray(innerHooks)) {
          return innerHooks.some(
            (h: Record<string, unknown>) =>
              typeof h.command === 'string' && (h.command as string).includes('evalai hook')
          );
        }
        return typeof entry.command === 'string' && (entry.command as string).includes('evalai hook');
      });
    }

    result.set(event, installed);
  }
  return result;
}

function removeHooks(settings: Record<string, unknown>): Record<string, unknown> {
  const hooks = (settings.hooks ?? {}) as Record<string, unknown>;
  for (const event of Object.keys(hooks)) {
    const hookEntry = hooks[event];

    if (Array.isArray(hookEntry)) {
      const remaining = hookEntry.filter((entry: Record<string, unknown>) => {
        const innerHooks = entry.hooks;
        if (Array.isArray(innerHooks)) {
          return !innerHooks.some(
            (h: Record<string, unknown>) =>
              typeof h.command === 'string' && (h.command as string).includes('evalai hook')
          );
        }
        return !(typeof entry.command === 'string' && (entry.command as string).includes('evalai hook'));
      });
      if (remaining.length === 0) {
        delete hooks[event];
      } else {
        hooks[event] = remaining;
      }
    }
  }
  if (Object.keys(hooks).length === 0) {
    delete settings.hooks;
  } else {
    settings.hooks = hooks;
  }
  return settings;
}

/**
 * Run init programmatically — creates the data dir and installs hooks into
 * Claude Code's settings.json. Returns a structured result instead of printing.
 */
export async function runInit(_opts: InitOptions = {}): Promise<InitResult> {
  try {
    ensureDataDir();
    const settingsPath = getClaudeSettingsPath();
    const settings = readSettings(settingsPath);
    const existingHooks = (settings.hooks ?? {}) as Record<string, unknown>;
    const newHooks = buildHooksConfig();
    settings.hooks = { ...existingHooks, ...newHooks };
    writeSettings(settingsPath, settings);
    return { success: true, hooksInstalled: HOOK_EVENTS.length };
  } catch (err) {
    return {
      success: false,
      hooksInstalled: 0,
      reason: err instanceof Error ? err.message : 'Unknown error during init',
    };
  }
}

export const initCommand = new Command('init')
  .description('Initialize EvaluateAI: install hooks and verify configuration')
  .option('--check', 'Verify that all hooks are installed')
  .option('--uninstall', 'Remove all EvaluateAI hooks')
  .action(async (opts: { check?: boolean; uninstall?: boolean }) => {
    const settingsPath = getClaudeSettingsPath();

    if (opts.check) {
      printHeader('Hook Status');
      const settings = readSettings(settingsPath);
      const status = checkHooks(settings);
      let allGood = true;
      for (const [event, ok] of status) {
        const icon = ok ? chalk.green('✓') : chalk.red('✗');
        console.log(`  ${icon} ${event}`);
        if (!ok) allGood = false;
      }
      console.log('');
      if (allGood) {
        console.log(chalk.green('  All hooks installed correctly.'));
      } else {
        console.log(chalk.yellow('  Some hooks are missing. Run `evalai init` to install them.'));
      }

      console.log('');
      printHeader('Auth Status');
      const { readCredentials, getApiUrl } = await import('../utils/credentials.js');
      const creds = readCredentials();
      if (!creds?.token) {
        console.log(chalk.red('  ✗ Not logged in'));
        console.log(chalk.dim('    Run: evalai login'));
      } else {
        console.log(chalk.green(`  ✓ Logged in as ${creds.email || 'unknown'}`));
        console.log(chalk.dim(`    Team:    ${creds.teamName || 'unknown'}`));
        console.log(chalk.dim(`    API URL: ${getApiUrl()}`));

        try {
          const res = await fetch(`${getApiUrl()}/api/cli/verify`, {
            headers: { Authorization: `Bearer ${creds.token}` },
          });
          if (res.ok) {
            console.log(chalk.green('  ✓ Token is valid'));
          } else {
            console.log(chalk.red('  ✗ Token is invalid or expired'));
            console.log(chalk.dim('    Run: evalai login'));
          }
        } catch {
          console.log(chalk.yellow('  ⚠ Could not reach API to verify token'));
        }
      }

      console.log('');
      return;
    }

    if (opts.uninstall) {
      printHeader('Uninstalling Hooks');
      const settings = readSettings(settingsPath);
      const cleaned = removeHooks(settings);
      writeSettings(settingsPath, cleaned);
      console.log(chalk.green('  All EvaluateAI hooks removed from Claude Code settings.'));
      return;
    }

    printHeader('EvaluateAI Init');

    console.log('  Creating data directory...');
    const result = await runInit();
    if (!result.success) {
      console.log(chalk.red(`  ✗ ${result.reason || 'Init failed'}`));
      process.exit(1);
    }
    console.log(chalk.green('  ✓ ~/.evaluateai-v2/ ready'));

    const { readCredentials } = await import('../utils/credentials.js');
    const creds = readCredentials();
    if (!creds?.token) {
      console.log(chalk.yellow('  ⚠ Not logged in'));
      console.log(chalk.dim('    Run `evalai login` first to authenticate.'));
    } else {
      console.log(chalk.green(`  ✓ Logged in as ${creds.email || 'unknown'} (${creds.teamName || 'unknown team'})`));
    }

    console.log(chalk.green(`  ✓ ${result.hooksInstalled} hooks installed`));
    console.log('');
    console.log(chalk.bold('  Setup complete!'));
    console.log(chalk.dim('  Run `evalai init --check` to verify.'));
    if (!creds?.token) {
      console.log(chalk.dim('  Run `evalai login` to authenticate with your team.'));
    }
    console.log('');
  });
