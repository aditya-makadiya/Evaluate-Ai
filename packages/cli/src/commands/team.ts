import { Command } from 'commander';
import chalk from 'chalk';
import { linkTeam, getCurrentTeamId, getGitEmail, getSupabase } from './init.js';
import { printHeader } from '../utils/display.js';

/**
 * Show current team info: name, member count, your role.
 */
async function showTeamInfo(): Promise<void> {
  const teamId = getCurrentTeamId();
  if (!teamId) {
    console.log(chalk.yellow('  No team linked.'));
    console.log(chalk.gray('  Run `evalai team link <team-id>` to link to a team.'));
    return;
  }

  const supabase = getSupabase();
  if (!supabase) {
    console.log(chalk.red('  ✗ Supabase not configured.'));
    return;
  }

  // Fetch team info
  const { data: team, error: teamError } = await supabase
    .from('teams')
    .select('id, name, created_at')
    .eq('id', teamId)
    .single();

  if (teamError || !team) {
    console.log(chalk.red(`  ✗ Team not found: ${teamId}`));
    return;
  }

  // Fetch member count
  const { count } = await supabase
    .from('team_members')
    .select('id', { count: 'exact', head: true })
    .eq('team_id', teamId);

  // Fetch your role
  const email = getGitEmail();
  let yourRole = 'unknown';
  if (email) {
    const { data: member } = await supabase
      .from('team_members')
      .select('role, name')
      .eq('team_id', teamId)
      .eq('email', email)
      .maybeSingle();

    if (member) {
      yourRole = member.role || 'developer';
    }
  }

  printHeader('Team Info');
  console.log(`  ${chalk.bold('Name:')}     ${team.name}`);
  console.log(`  ${chalk.bold('ID:')}       ${team.id}`);
  console.log(`  ${chalk.bold('Members:')}  ${count ?? 0}`);
  console.log(`  ${chalk.bold('Your role:')} ${yourRole}`);
  console.log('');
}

/**
 * List team members with install status.
 */
async function showTeamMembers(): Promise<void> {
  const teamId = getCurrentTeamId();
  if (!teamId) {
    console.log(chalk.yellow('  No team linked.'));
    console.log(chalk.gray('  Run `evalai team link <team-id>` to link to a team.'));
    return;
  }

  const supabase = getSupabase();
  if (!supabase) {
    console.log(chalk.red('  ✗ Supabase not configured.'));
    return;
  }

  const { data: members, error } = await supabase
    .from('team_members')
    .select('name, email, role, evaluateai_installed, status')
    .eq('team_id', teamId)
    .order('name', { ascending: true });

  if (error) {
    console.log(chalk.red(`  ✗ Failed to fetch members: ${error.message}`));
    return;
  }

  if (!members || members.length === 0) {
    console.log(chalk.gray('  No team members found.'));
    return;
  }

  printHeader('Team Members');
  console.log('');

  const maxName = Math.max(...members.map(m => (m.name || '').length), 4);
  const maxEmail = Math.max(...members.map(m => (m.email || '').length), 5);
  const maxRole = Math.max(...members.map(m => (m.role || '').length), 4);

  // Header
  const header = `  ${'Name'.padEnd(maxName)}  ${'Email'.padEnd(maxEmail)}  ${'Role'.padEnd(maxRole)}  CLI`;
  console.log(chalk.bold(header));
  console.log(chalk.gray('  ' + '─'.repeat(header.length - 2)));

  for (const member of members) {
    const name = (member.name || '—').padEnd(maxName);
    const email = (member.email || '—').padEnd(maxEmail);
    const role = (member.role || '—').padEnd(maxRole);
    const installed = member.evaluateai_installed
      ? chalk.green('✓')
      : chalk.gray('✗');
    const statusColor = member.status === 'active' ? chalk.white : chalk.gray;

    console.log(`  ${statusColor(name)}  ${chalk.gray(email)}  ${role}  ${installed}`);
  }

  console.log('');
  const installedCount = members.filter(m => m.evaluateai_installed).length;
  console.log(chalk.gray(`  ${installedCount}/${members.length} members have EvaluateAI installed`));
  console.log('');
}

export const teamCommand = new Command('team')
  .description('Manage team linking and view team info')
  .action(async () => {
    await showTeamInfo();
  });

// Subcommand: evalai team members
teamCommand
  .command('members')
  .description('List team members with EvaluateAI install status')
  .action(async () => {
    await showTeamMembers();
  });

// Subcommand: evalai team link <team-id>
teamCommand
  .command('link <team-id>')
  .description('Link this CLI to a team (same as evalai init --team)')
  .action(async (teamId: string) => {
    printHeader('Team Linking');
    const success = await linkTeam(teamId);
    if (success) {
      console.log('');
      console.log(chalk.dim('  Run `evalai team` to view team info.'));
      console.log(chalk.dim('  Run `evalai team members` to see team members.'));
      console.log('');
    }
  });
