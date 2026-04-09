import { Command } from 'commander';
import chalk from 'chalk';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { getClaudeSettingsPath, ensureDataDir } from '../utils/paths.js';
import { printHeader } from '../utils/display.js';

/**
 * The 6 Claude Code hook events we register.
 */
const HOOK_EVENTS = [
  'SessionStart',
  'UserPromptSubmit',
  'PreToolUse',
  'PostToolUse',
  'Stop',
  'SessionEnd',
] as const;

/**
 * Build the hooks object that should be merged into settings.json.
 */
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

/**
 * Read the existing Claude Code settings.json, or return an empty object.
 */
function readSettings(path: string): Record<string, unknown> {
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    return {};
  }
}

/**
 * Write settings back to disk.
 */
function writeSettings(path: string, settings: Record<string, unknown>): void {
  writeFileSync(path, JSON.stringify(settings, null, 2) + '\n', 'utf-8');
}

/**
 * Check which hooks are installed, returning status per event.
 */
function checkHooks(settings: Record<string, unknown>): Map<string, boolean> {
  const result = new Map<string, boolean>();
  const hooks = (settings.hooks ?? {}) as Record<string, unknown>;
  for (const event of HOOK_EVENTS) {
    const hookEntry = hooks[event];
    let installed = false;

    if (Array.isArray(hookEntry)) {
      // Correct format: [{ hooks: [{ type: "command", command: "evalai hook ..." }] }]
      installed = hookEntry.some((entry: Record<string, unknown>) => {
        const innerHooks = entry.hooks;
        if (Array.isArray(innerHooks)) {
          return innerHooks.some(
            (h: Record<string, unknown>) =>
              typeof h.command === 'string' && (h.command as string).includes('evalai hook')
          );
        }
        // Also check flat format: { type: "command", command: "..." }
        return typeof entry.command === 'string' && (entry.command as string).includes('evalai hook');
      });
    }

    result.set(event, installed);
  }
  return result;
}

/**
 * Remove all EvaluateAI hooks from settings.
 */
function removeHooks(settings: Record<string, unknown>): Record<string, unknown> {
  const hooks = (settings.hooks ?? {}) as Record<string, unknown>;
  for (const event of HOOK_EVENTS) {
    const hookEntry = hooks[event];

    if (Array.isArray(hookEntry)) {
      // Filter out entries that contain our evalai hooks
      const remaining = hookEntry.filter((entry: Record<string, unknown>) => {
        const innerHooks = entry.hooks;
        if (Array.isArray(innerHooks)) {
          return !innerHooks.some(
            (h: Record<string, unknown>) =>
              typeof h.command === 'string' && (h.command as string).includes('evalai hook')
          );
        }
        // Also handle flat format
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

export const initCommand = new Command('init')
  .description('Initialize EvaluateAI: install hooks and verify configuration')
  .option('--check', 'Verify that all hooks are installed')
  .option('--uninstall', 'Remove all EvaluateAI hooks')
  .action(async (opts: { check?: boolean; uninstall?: boolean }) => {
    const settingsPath = getClaudeSettingsPath();

    // --- --check: verify installation ---
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

      // Check CLI auth status (token-based flow)
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

        // Verify token is still valid
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

    // --- --uninstall: remove hooks ---
    if (opts.uninstall) {
      printHeader('Uninstalling Hooks');
      const settings = readSettings(settingsPath);
      const cleaned = removeHooks(settings);
      writeSettings(settingsPath, cleaned);
      console.log(chalk.green('  All EvaluateAI hooks removed from Claude Code settings.'));
      return;
    }

    // --- Default: full init ---
    printHeader('EvaluateAI Init');

    // 1. Create data directory
    console.log('  Creating data directory...');
    ensureDataDir();
    console.log(chalk.green('  ✓ ~/.evaluateai-v2/ ready'));

    // 2. Check login status
    const { readCredentials } = await import('../utils/credentials.js');
    const creds = readCredentials();
    if (!creds?.token) {
      console.log(chalk.yellow('  ⚠ Not logged in'));
      console.log(chalk.dim('    Run `evalai login` first to authenticate.'));
    } else {
      console.log(chalk.green(`  ✓ Logged in as ${creds.email || 'unknown'} (${creds.teamName || 'unknown team'})`));
    }

    // 3. Install hooks into Claude Code settings
    console.log('  Installing hooks into Claude Code...');
    const settings = readSettings(settingsPath);
    const existingHooks = (settings.hooks ?? {}) as Record<string, unknown>;
    const newHooks = buildHooksConfig();

    // Merge: add our hooks, preserve any others the user has
    settings.hooks = { ...existingHooks, ...newHooks };
    writeSettings(settingsPath, settings);
    console.log(chalk.green('  ✓ 6 hooks installed'));

    // 4. Summary
    console.log('');
    console.log(chalk.bold('  Setup complete!'));
    console.log(chalk.dim('  Run `evalai init --check` to verify.'));
    if (!creds?.token) {
      console.log(chalk.dim('  Run `evalai login` to authenticate with your team.'));
    }
    console.log('');
  });
