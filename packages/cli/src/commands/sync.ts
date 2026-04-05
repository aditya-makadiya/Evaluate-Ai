import { Command } from 'commander';
import chalk from 'chalk';
import { isSupabaseConfigured, syncToSupabase, checkSupabaseConnection } from '@evaluateai/core';
import { printHeader } from '../utils/display.js';

export const syncCommand = new Command('sync')
  .description('Sync local data to Supabase')
  .action(async () => {
    printHeader('Sync');

    if (!isSupabaseConfigured()) {
      console.log(chalk.red('  Supabase not configured.'));
      console.log(chalk.gray('  Set SUPABASE_URL and SUPABASE_ANON_KEY environment variables.'));
      console.log(chalk.gray('  Add them to ~/.evaluateai-v2/.env or export in your shell.'));
      console.log('');
      return;
    }

    console.log('  Checking connection...');
    const connected = await checkSupabaseConnection();
    if (!connected) {
      console.log(chalk.red('  Cannot reach Supabase. Check your URL and key.'));
      console.log('');
      return;
    }

    console.log('  Syncing to Supabase...');
    const result = await syncToSupabase();

    if (result.success) {
      console.log(chalk.green(`  Synced ${result.synced} records`));
    } else {
      console.log(chalk.red(`  Sync failed: ${result.error}`));
      if (result.synced > 0) {
        console.log(chalk.yellow(`  Partially synced: ${result.synced} records`));
      }
    }
    console.log('');
  });
