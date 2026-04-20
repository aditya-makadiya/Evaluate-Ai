#!/usr/bin/env node

// Load .env from project root and ~/.evaluateai-v2/
import { config as dotenvConfig } from 'dotenv';
import { join } from 'node:path';
import { homedir } from 'node:os';
dotenvConfig({ path: join(homedir(), '.evaluateai-v2', '.env') });
dotenvConfig({ path: join(process.cwd(), '.env') });
dotenvConfig(); // also check CWD

import { Command } from 'commander';
import {
  initCommand,
  teamCommand,
  statsCommand,
  sessionsCommand,
  configCommand,
  exportCommand,

  loginCommand,
  logoutCommand,
  whoamiCommand,
  setupCommand,
  CLI_VERSION,
} from '../dist/index.js';

const program = new Command();

program
  .name('evalai')
  .version(CLI_VERSION)
  .description('EvaluateAI — AI coding assistant quality analyzer');

// Auth commands
program.addCommand(loginCommand);
program.addCommand(logoutCommand);
program.addCommand(whoamiCommand);

// Setup & team commands
program.addCommand(setupCommand);
program.addCommand(initCommand);
program.addCommand(teamCommand);

// Data commands
program.addCommand(statsCommand);
program.addCommand(sessionsCommand);
program.addCommand(configCommand);
program.addCommand(exportCommand);
// Hook subcommand: `evalai hook <event>`
// This is called by Claude Code hooks — it needs to be fast.
const hookCommand = new Command('hook')
  .description('Handle a Claude Code hook event (internal)')
  .argument('<event>', 'Hook event name')
  .allowUnknownOption(true)
  .action(async (event) => {
    // Read JSON from stdin (Claude Code pipes event data)
    let input = '';
    if (!process.stdin.isTTY) {
      const chunks = [];
      for await (const chunk of process.stdin) {
        chunks.push(chunk);
      }
      input = Buffer.concat(chunks).toString('utf-8');
    }

    let payload = {};
    if (input.trim()) {
      try {
        payload = JSON.parse(input);
      } catch {
        // If stdin is not valid JSON, ignore
      }
    }

    payload.type = event;

    // Dynamically import the hook handler to keep startup fast
    try {
      const { handleHookEvent } = await import('../dist/hooks/handler.js');
      await handleHookEvent(payload);
    } catch (err) {
      // Hooks must not crash Claude Code — log and exit silently
      const fs = await import('node:fs');
      const path = await import('node:path');
      const os = await import('node:os');
      const logDir = path.join(os.homedir(), '.evaluateai-v2', 'logs');
      try {
        fs.mkdirSync(logDir, { recursive: true });
        const msg = `[${new Date().toISOString()}] Hook ${event} error: ${err}\n`;
        fs.appendFileSync(path.join(logDir, 'hook-errors.log'), msg);
      } catch {
        // Absolutely cannot fail
      }
    }
  });

program.addCommand(hookCommand);

program.parse(process.argv);
