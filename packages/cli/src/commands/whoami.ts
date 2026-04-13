import { Command } from 'commander';
import chalk from 'chalk';
import { readCredentials, getApiUrl, verifyToken } from '../utils/credentials.js';

export const whoamiCommand = new Command('whoami')
  .description('Show current login status')
  .action(async () => {
    const creds = readCredentials();

    if (!creds?.token) {
      console.log('');
      console.log(chalk.yellow('  Not logged in'));
      console.log(chalk.dim('  Run: evalai login'));
      console.log('');
      return;
    }

    console.log('');
    console.log(chalk.cyan('  EvaluateAI CLI'));
    console.log('');
    console.log(`  ${chalk.dim('Email:')}    ${creds.email || 'unknown'}`);
    console.log(`  ${chalk.dim('Team:')}     ${creds.teamName || 'unknown'}`);
    console.log(`  ${chalk.dim('Team ID:')}  ${creds.teamId || 'unknown'}`);
    console.log(`  ${chalk.dim('API URL:')}  ${getApiUrl()}`);
    console.log(`  ${chalk.dim('Token:')}    ${creds.token.slice(0, 12)}...`);
    console.log(`  ${chalk.dim('Since:')}    ${creds.createdAt ? new Date(creds.createdAt).toLocaleDateString() : 'unknown'}`);
    console.log('');

    const result = await verifyToken(creds.token);
    if (result.valid) {
      console.log(chalk.green('  ✓ Token is valid'));
    } else {
      console.log(chalk.red('  ✗ Token is invalid or expired'));
      console.log(chalk.dim('  Run: evalai login'));
    }
    console.log('');
  });
