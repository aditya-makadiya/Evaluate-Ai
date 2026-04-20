import { Command } from 'commander';
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import chalk from 'chalk';
import {
  saveCredentials,
  readCredentials,
  getApiUrl,
  verifyToken,
  type CliCredentials,
} from '../utils/credentials.js';

/**
 * Programmatic login API shared by `evalai login` and `evalai setup`.
 * Pure: returns a result instead of calling process.exit.
 */
export interface LoginOptions {
  token?: string;
  apiUrl?: string;
  force?: boolean;
  quiet?: boolean;
}

export interface LoginResult {
  success: boolean;
  alreadyLoggedIn?: boolean;
  reason?: string;
  creds?: CliCredentials;
}

function findOpenPort(start: number, end: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    let port = start;

    const tryPort = () => {
      server.once('error', () => {
        port++;
        if (port > end) {
          reject(new Error('No open port found'));
        } else {
          tryPort();
        }
      });
      server.once('listening', () => {
        server.close(() => resolve(port));
      });
      server.listen(port, '127.0.0.1');
    };

    tryPort();
  });
}

async function loginWithBrowser(opts: { quiet?: boolean }): Promise<LoginResult> {
  const apiUrl = getApiUrl();
  const port = await findOpenPort(9876, 9900);
  const state = randomBytes(16).toString('hex');

  return new Promise((resolve) => {
    const server = createServer(async (req, res) => {
      const url = new URL(req.url!, `http://localhost:${port}`);

      if (url.pathname === '/callback') {
        const token = url.searchParams.get('token');
        const returnedState = url.searchParams.get('state');
        const userId = url.searchParams.get('user_id') || '';
        const email = url.searchParams.get('email') || '';
        const teamId = url.searchParams.get('team_id') || '';
        const teamName = decodeURIComponent(url.searchParams.get('team_name') || '');

        if (returnedState !== state) {
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end('<html><body><h1>Invalid state. Please try again.</h1></body></html>');
          return;
        }

        if (!token) {
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end('<html><body><h1>No token received. Please try again.</h1></body></html>');
          return;
        }

        const creds: CliCredentials = {
          token,
          apiUrl,
          userId,
          teamId,
          teamName,
          email,
          createdAt: new Date().toISOString(),
        };
        saveCredentials(creds);

        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`<html><body style="font-family:system-ui;text-align:center;padding:60px;background:#0a0a0a;color:#fff">
          <h1 style="color:#8b5cf6">Logged in!</h1>
          <p>You can close this tab and return to the terminal.</p>
        </body></html>`);

        server.close();
        resolve({ success: true, creds });
      }
    });

    server.listen(port, '127.0.0.1', () => {
      const authUrl = `${apiUrl}/cli/auth?port=${port}&state=${state}`;
      if (!opts.quiet) {
        console.log('');
        console.log(chalk.cyan('  Opening browser to login...'));
        console.log(chalk.dim(`  If browser doesn't open, visit:`));
        console.log(chalk.dim(`  ${authUrl}`));
        console.log('');
      }

      import('node:child_process').then(({ exec }) => {
        const cmd = process.platform === 'darwin' ? 'open'
          : process.platform === 'win32' ? 'start'
          : 'xdg-open';
        exec(`${cmd} "${authUrl}"`, () => {});
      });
    });

    setTimeout(() => {
      server.close();
      resolve({ success: false, reason: 'Login timed out after 5 minutes' });
    }, 300000);
  });
}

async function loginWithToken(token: string): Promise<LoginResult> {
  const apiUrl = getApiUrl();
  const result = await verifyToken(token);

  if (!result.valid) {
    return { success: false, reason: 'Invalid token. Check the token value and API URL.' };
  }

  const creds: CliCredentials = {
    token,
    apiUrl,
    userId: result.userId || '',
    teamId: result.teamId || '',
    teamName: result.teamName || '',
    email: result.email || '',
    createdAt: new Date().toISOString(),
  };
  saveCredentials(creds);

  return { success: true, creds };
}

/**
 * Run the login flow programmatically.
 * - Honors existing valid session unless `force` is set.
 * - Uses token flow if `token` is provided, otherwise opens browser.
 */
export async function runLogin(opts: LoginOptions = {}): Promise<LoginResult> {
  if (opts.apiUrl) {
    process.env.EVALUATEAI_API_URL = opts.apiUrl;
  }

  if (!opts.force && !opts.token) {
    const existing = readCredentials();
    if (existing?.token) {
      const verified = await verifyToken(existing.token);
      if (verified.valid) {
        return { success: true, alreadyLoggedIn: true, creds: existing };
      }
    }
  }

  if (opts.token) {
    return loginWithToken(opts.token);
  }
  return loginWithBrowser({ quiet: opts.quiet });
}

export const loginCommand = new Command('login')
  .description('Log in to EvaluateAI')
  .option('--token <token>', 'Login with an API token (for CI/CD)')
  .option('--api-url <url>', 'API URL override')
  .option('--force', 'Force re-authentication even if already logged in')
  .action(async (opts) => {
    const result = await runLogin({
      token: opts.token,
      apiUrl: opts.apiUrl,
      force: opts.force,
    });

    if (result.alreadyLoggedIn && result.creds) {
      console.log('');
      console.log(chalk.green('  ✓ Already logged in'));
      if (result.creds.email) console.log(`  ${chalk.dim('Email:')}  ${result.creds.email}`);
      if (result.creds.teamName) console.log(`  ${chalk.dim('Team:')}   ${result.creds.teamName}`);
      console.log('');
      console.log(chalk.dim('  Use --force to re-authenticate'));
      console.log('');
      process.exit(0);
    }

    if (result.success && result.creds) {
      console.log('');
      console.log(chalk.green('  ✓ Logged in successfully'));
      if (result.creds.email) console.log(chalk.dim(`    Email: ${result.creds.email}`));
      if (result.creds.teamName) console.log(chalk.dim(`    Team:  ${result.creds.teamName}`));
      console.log('');
      process.exit(0);
    }

    console.log(chalk.red(`  ✗ ${result.reason || 'Login failed'}`));
    process.exit(1);
  });
