import { Command } from 'commander';
import chalk from 'chalk';
import { runLogin } from './login.js';
import { runInit } from './init.js';
import { printHeader } from '../utils/display.js';

/**
 * `evalai setup` — one-command onboarding.
 *
 * Chains login + init with a unified progress UI. Accepts a token for
 * zero-browser installs from CI, Docker, or the dashboard one-liner.
 */
export const setupCommand = new Command('setup')
  .description('One-command install: authenticate and install Claude Code hooks')
  .option('--token <token>', 'API token (skip browser OAuth; use the one-liner from your dashboard)')
  .option('--api-url <url>', 'API URL override (defaults to production)')
  .option('--force', 'Re-authenticate even if already logged in')
  .option('--skip-hooks', 'Only authenticate; skip Claude Code hook installation')
  .action(async (opts: {
    token?: string;
    apiUrl?: string;
    force?: boolean;
    skipHooks?: boolean;
  }) => {
    const totalSteps = opts.skipHooks ? 1 : 2;
    printHeader('EvaluateAI Setup');

    // ── Step 1: Authenticate ─────────────────────────────────────────────
    console.log(chalk.bold(`  [1/${totalSteps}] Authenticating${opts.token ? ' with token' : ''}...`));
    const loginResult = await runLogin({
      token: opts.token,
      apiUrl: opts.apiUrl,
      force: opts.force,
      quiet: true,
    });

    if (!loginResult.success) {
      console.log(chalk.red(`  ✗ ${loginResult.reason || 'Authentication failed'}`));
      console.log('');
      if (!opts.token) {
        console.log(chalk.dim('  Tip: run `evalai setup --token=<token>` with a token from your dashboard.'));
      }
      process.exit(1);
    }

    const creds = loginResult.creds;
    const email = creds?.email || 'unknown';
    const team = creds?.teamName || 'unknown team';

    if (loginResult.alreadyLoggedIn) {
      console.log(chalk.green(`  ✓ Already logged in as ${email}`));
    } else {
      console.log(chalk.green(`  ✓ Logged in as ${email}`));
    }
    console.log(chalk.dim(`      Team: ${team}`));
    console.log('');

    if (opts.skipHooks) {
      console.log(chalk.bold.green('  ✓ Setup complete (hooks skipped).'));
      console.log(chalk.dim('    Run `evalai init` later to install Claude Code hooks.'));
      console.log('');
      process.exit(0);
    }

    // ── Step 2: Install hooks ────────────────────────────────────────────
    console.log(chalk.bold(`  [2/${totalSteps}] Installing Claude Code hooks...`));
    const initResult = await runInit({ silent: true });

    if (!initResult.success) {
      console.log(chalk.red(`  ✗ ${initResult.reason || 'Hook installation failed'}`));
      console.log('');
      console.log(chalk.dim('  Authentication succeeded. Run `evalai init` to retry hook installation.'));
      process.exit(1);
    }

    console.log(chalk.green(`  ✓ ${initResult.hooksInstalled} hooks installed in Claude Code settings`));
    console.log('');
    console.log(chalk.bold.green('  ✓ Setup complete!'));
    console.log(chalk.dim('    Start using Claude Code — your sessions sync automatically.'));
    console.log(chalk.dim('    Verify: `evalai init --check`    Stats: `evalai stats`'));
    console.log('');
    process.exit(0);
  });
