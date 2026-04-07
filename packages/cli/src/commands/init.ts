import { Command } from 'commander';
import chalk from 'chalk';
import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { createClient } from '@supabase/supabase-js';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { getClaudeSettingsPath, ensureDataDir, DATA_DIR } from '../utils/paths.js';
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
 * Simple readline prompt helper.
 */
function prompt(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
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

/**
 * Check Supabase connection.
 */
async function checkSupabaseConnection(): Promise<boolean> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return false;

  try {
    const supabase = createClient(url, key, { auth: { persistSession: false } });
    const { error } = await supabase.from('ai_sessions').select('id').limit(1);
    return !error;
  } catch {
    return false;
  }
}

/**
 * Get Supabase client (requires env vars to be set).
 */
function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

/**
 * Read git user email from git config.
 */
function getGitEmail(): string | null {
  try {
    return execSync('git config user.email', { encoding: 'utf-8', timeout: 2000 }).trim() || null;
  } catch {
    return null;
  }
}

/**
 * Read git username from git config.
 */
function getGitUsername(): string | null {
  try {
    return execSync('git config user.name', { encoding: 'utf-8', timeout: 2000 }).trim() || null;
  } catch {
    return null;
  }
}

/**
 * Save a key=value to ~/.evaluateai-v2/.env (update if exists, append if not).
 */
function saveToEnvFile(key: string, value: string): void {
  ensureDataDir();
  const envPath = join(DATA_DIR, '.env');

  if (existsSync(envPath)) {
    const content = readFileSync(envPath, 'utf-8');
    const lines = content.split('\n');
    const idx = lines.findIndex(l => l.startsWith(`${key}=`));
    if (idx >= 0) {
      lines[idx] = `${key}=${value}`;
      writeFileSync(envPath, lines.join('\n'), 'utf-8');
    } else {
      appendFileSync(envPath, `\n${key}=${value}\n`, 'utf-8');
    }
  } else {
    writeFileSync(envPath, `${key}=${value}\n`, 'utf-8');
  }

  // Also set in current process
  process.env[key] = value;
}

/**
 * Read current team ID from env.
 */
function getCurrentTeamId(): string | null {
  // Check process env first (loaded by dotenv)
  if (process.env.EVALUATEAI_TEAM_ID) return process.env.EVALUATEAI_TEAM_ID;

  // Fallback: read .env file directly
  const envPath = join(DATA_DIR, '.env');
  if (!existsSync(envPath)) return null;

  try {
    const content = readFileSync(envPath, 'utf-8');
    const match = content.match(/^EVALUATEAI_TEAM_ID=(.+)$/m);
    return match ? match[1].trim() : null;
  } catch {
    return null;
  }
}

/**
 * Link the CLI to a team:
 * 1. Verify team exists in Supabase
 * 2. Find or create team_member record
 * 3. Mark evaluateai_installed = true
 * 4. Save team_id to .env
 */
async function linkTeam(teamId: string): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) {
    console.log(chalk.red('  ✗ Supabase not configured. Run `evalai init --supabase` first.'));
    return false;
  }

  // 1. Verify team exists
  console.log('  Verifying team...');
  const { data: team, error: teamError } = await supabase
    .from('teams')
    .select('id, name')
    .eq('id', teamId)
    .single();

  if (teamError || !team) {
    console.log(chalk.red(`  ✗ Team not found: ${teamId}`));
    console.log(chalk.gray('    Check the team ID and try again.'));
    return false;
  }

  // 2. Get developer email
  let email = getGitEmail();
  if (!email) {
    email = await prompt('  Enter your email: ');
  } else {
    console.log(chalk.gray(`  Using git email: ${email}`));
  }

  if (!email) {
    console.log(chalk.red('  ✗ Email is required to link to a team.'));
    return false;
  }

  // 3. Find or create team_member
  console.log('  Linking developer...');
  const { data: existingMember } = await supabase
    .from('team_members')
    .select('id, name, role')
    .eq('team_id', teamId)
    .eq('email', email)
    .maybeSingle();

  if (existingMember) {
    // Update existing member
    await supabase
      .from('team_members')
      .update({ evaluateai_installed: true })
      .eq('id', existingMember.id);
  } else {
    // Create new member
    const gitName = getGitUsername() || email.split('@')[0];
    const { error: insertError } = await supabase
      .from('team_members')
      .insert({
        team_id: teamId,
        name: gitName,
        email: email,
        role: 'developer',
        evaluateai_installed: true,
        status: 'active',
      });

    if (insertError) {
      console.log(chalk.red(`  ✗ Failed to create team member: ${insertError.message}`));
      return false;
    }
  }

  // 4. Save team_id to .env
  saveToEnvFile('EVALUATEAI_TEAM_ID', teamId);

  console.log(chalk.green(`  ✓ Linked to team: ${team.name}`));
  if (existingMember) {
    console.log(chalk.gray(`    Role: ${existingMember.role}`));
  }

  return true;
}

/**
 * Show current team status.
 */
async function showTeamStatus(): Promise<void> {
  const teamId = getCurrentTeamId();
  if (!teamId) {
    console.log(chalk.gray('  No team linked. Run `evalai init --team <team-id>` to link.'));
    return;
  }

  const supabase = getSupabase();
  if (!supabase) {
    console.log(chalk.gray(`  Team ID: ${teamId} (Supabase not configured)`));
    return;
  }

  const { data: team } = await supabase
    .from('teams')
    .select('name')
    .eq('id', teamId)
    .single();

  if (team) {
    console.log(chalk.green(`  ✓ Team: ${team.name}`));
  } else {
    console.log(chalk.yellow(`  ⚠ Team ID set (${teamId}) but team not found in Supabase`));
  }
}

export const initCommand = new Command('init')
  .description('Initialize EvaluateAI: install hooks, verify Supabase connection, link team')
  .option('--check', 'Verify that all hooks are installed')
  .option('--uninstall', 'Remove all EvaluateAI hooks')
  .option('--supabase', 'Configure Supabase cloud connection')
  .option('--team <team-id>', 'Link this CLI to a team')
  .action(async (opts: { check?: boolean; uninstall?: boolean; supabase?: boolean; team?: string }) => {
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

      // Also check Supabase
      console.log('');
      printHeader('Supabase Status');
      if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
        console.log(chalk.red('  ✗ SUPABASE_URL / SUPABASE_ANON_KEY not set'));
      } else {
        const ok = await checkSupabaseConnection();
        if (ok) {
          console.log(chalk.green('  ✓ Supabase connected'));
        } else {
          console.log(chalk.red('  ✗ Cannot reach Supabase. Check your URL and key.'));
        }
      }

      // Show team status
      console.log('');
      printHeader('Team Status');
      await showTeamStatus();

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

    // --- --supabase: show env var instructions ---
    if (opts.supabase) {
      printHeader('Supabase Configuration');
      console.log('  Supabase is configured via environment variables.');
      console.log('');
      console.log('  Add these to your shell profile or ~/.evaluateai-v2/.env:');
      console.log('');
      console.log(chalk.cyan('    export SUPABASE_URL=https://your-project.supabase.co'));
      console.log(chalk.cyan('    export SUPABASE_ANON_KEY=your-anon-key-here'));
      console.log('');
      console.log('  All hook data is written directly to Supabase — no local database.');
      console.log('');
      return;
    }

    // --- Default: full init ---
    printHeader('EvaluateAI Init');

    // 1. Create data directory (for .env file storage)
    console.log('  Creating data directory...');
    ensureDataDir();
    console.log(chalk.green('  ✓ ~/.evaluateai-v2/ ready'));

    // 2. Check Supabase connection
    console.log('  Checking Supabase connection...');
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
      console.log(chalk.yellow('  ⚠ SUPABASE_URL / SUPABASE_ANON_KEY not set'));
      console.log(chalk.gray('    Run `evalai init --supabase` for setup instructions.'));
    } else {
      const connected = await checkSupabaseConnection();
      if (connected) {
        console.log(chalk.green('  ✓ Supabase connected'));
      } else {
        console.log(chalk.yellow('  ⚠ Cannot reach Supabase. Check your URL and key.'));
      }
    }

    // 3. Link team if --team flag provided
    if (opts.team) {
      console.log('');
      printHeader('Team Linking');
      await linkTeam(opts.team);
    } else {
      // Show existing team status
      const teamId = getCurrentTeamId();
      if (teamId) {
        console.log('');
        printHeader('Team Status');
        await showTeamStatus();
      }
    }

    // 4. Install hooks into Claude Code settings
    console.log('  Installing hooks into Claude Code...');
    const settings = readSettings(settingsPath);
    const existingHooks = (settings.hooks ?? {}) as Record<string, unknown>;
    const newHooks = buildHooksConfig();

    // Merge: add our hooks, preserve any others the user has
    settings.hooks = { ...existingHooks, ...newHooks };
    writeSettings(settingsPath, settings);
    console.log(chalk.green('  ✓ 6 hooks installed'));

    // 5. Summary
    console.log('');
    console.log(chalk.bold('  Setup complete!'));
    console.log(chalk.dim('  Run `evalai init --check` to verify.'));
    console.log(chalk.dim('  Run `evalai init --supabase` to configure cloud connection.'));
    if (!opts.team && !getCurrentTeamId()) {
      console.log(chalk.dim('  Run `evalai init --team <team-id>` to link to a team.'));
    }
    console.log('');
  });

// Export linkTeam for reuse in team command
export { linkTeam, getCurrentTeamId, getGitEmail, getGitUsername, getSupabase };
