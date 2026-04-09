import { Command } from 'commander';
import chalk from 'chalk';
import { deleteCredentials, readCredentials } from '../utils/credentials.js';

export const logoutCommand = new Command('logout')
  .description('Log out of EvaluateAI and remove saved credentials')
  .action(() => {
    const creds = readCredentials();
    deleteCredentials();

    if (creds) {
      console.log(chalk.green('  ✓ Logged out successfully'));
      if (creds.email) console.log(chalk.dim(`    Was: ${creds.email}`));
    } else {
      console.log(chalk.dim('  No credentials found — already logged out.'));
    }
  });
