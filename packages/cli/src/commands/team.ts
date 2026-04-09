import { Command } from 'commander';
import chalk from 'chalk';
import { apiRequest } from '../utils/api.js';
import { readCredentials } from '../utils/credentials.js';
import { printHeader } from '../utils/display.js';

interface TeamInfo {
  id: string;
  name: string;
  created_at: string;
  memberCount?: number;
  yourRole?: string;
}

interface TeamMember {
  name?: string;
  email?: string;
  role?: string;
  evaluateai_installed?: boolean;
  status?: string;
}

/**
 * Show current team info: name, member count, your role.
 */
async function showTeamInfo(): Promise<void> {
  const creds = readCredentials();
  if (!creds?.teamId) {
    console.log(chalk.yellow('  No team linked.'));
    console.log(chalk.gray('  Run `evalai login` to authenticate and link to a team.'));
    return;
  }

  const { ok, data: team } = await apiRequest<TeamInfo>(`/api/teams/${creds.teamId}`);

  if (!ok || !team) {
    console.log(chalk.red(`  Failed to fetch team info.`));
    return;
  }

  printHeader('Team Info');
  console.log(`  ${chalk.bold('Name:')}     ${team.name}`);
  console.log(`  ${chalk.bold('ID:')}       ${team.id}`);
  console.log(`  ${chalk.bold('Members:')}  ${team.memberCount ?? 0}`);
  console.log(`  ${chalk.bold('Your role:')} ${team.yourRole ?? creds.email ?? 'unknown'}`);
  console.log('');
}

/**
 * List team members with install status.
 */
async function showTeamMembers(): Promise<void> {
  const creds = readCredentials();
  if (!creds?.teamId) {
    console.log(chalk.yellow('  No team linked.'));
    console.log(chalk.gray('  Run `evalai login` to authenticate and link to a team.'));
    return;
  }

  const { ok, data } = await apiRequest<{ members: TeamMember[] }>(`/api/teams/${creds.teamId}/members`);

  if (!ok || !data) {
    console.log(chalk.red('  Failed to fetch team members.'));
    return;
  }

  const members = data.members ?? [];

  if (members.length === 0) {
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
  .description('View team info and members')
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
