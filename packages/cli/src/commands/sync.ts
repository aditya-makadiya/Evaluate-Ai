import { Command } from 'commander';
import chalk from 'chalk';
import { printHeader } from '../utils/display.js';

export const syncCommand = new Command('sync')
  .description('Sync data (deprecated — hooks sync in real time)')
  .action(async () => {
    printHeader('Sync');

    console.log(chalk.green('  All data syncs automatically via hooks.'));
    console.log('');
    console.log(chalk.gray('  Hooks send data to the API in real time.'));
    console.log(chalk.gray('  Make sure you are logged in: evalai whoami'));
    console.log('');
  });
