import { Command } from 'commander';
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import chalk from 'chalk';
import { saveCredentials, readCredentials, getApiUrl, verifyToken } from '../utils/credentials.js';

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

async function loginWithBrowser(): Promise<boolean> {
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

        saveCredentials({
          token,
          apiUrl,
          userId,
          teamId,
          teamName,
          email,
          createdAt: new Date().toISOString(),
        });

        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`<html><body style="font-family:system-ui;text-align:center;padding:60px;background:#0a0a0a;color:#fff">
          <h1 style="color:#8b5cf6">Logged in!</h1>
          <p>You can close this tab and return to the terminal.</p>
        </body></html>`);

        console.log('');
        console.log(chalk.green('  ✓ Logged in successfully'));
        if (email) console.log(chalk.dim(`    Email: ${email}`));
        if (teamName) console.log(chalk.dim(`    Team:  ${teamName}`));
        console.log('');

        server.close();
        resolve(true);
      }
    });

    server.listen(port, '127.0.0.1', () => {
      const authUrl = `${apiUrl}/cli/auth?port=${port}&state=${state}`;
      console.log('');
      console.log(chalk.cyan('  Opening browser to login...'));
      console.log(chalk.dim(`  If browser doesn't open, visit:`));
      console.log(chalk.dim(`  ${authUrl}`));
      console.log('');

      // Try to open browser
      import('node:child_process').then(({ exec }) => {
        const cmd = process.platform === 'darwin' ? 'open'
          : process.platform === 'win32' ? 'start'
          : 'xdg-open';
        exec(`${cmd} "${authUrl}"`, () => {});
      });
    });

    // Timeout after 5 minutes
    setTimeout(() => {
      console.log(chalk.yellow('  Login timed out. Please try again.'));
      server.close();
      resolve(false);
    }, 300000);
  });
}

async function loginWithToken(token: string): Promise<boolean> {
  const apiUrl = getApiUrl();
  const result = await verifyToken(token);

  if (!result.valid) {
    console.log(chalk.red('  ✗ Invalid token. Check your token and API URL.'));
    return false;
  }

  saveCredentials({
    token,
    apiUrl,
    userId: result.userId || '',
    teamId: result.teamId || '',
    teamName: result.teamName || '',
    email: result.email || '',
    createdAt: new Date().toISOString(),
  });

  console.log(chalk.green('  ✓ Logged in successfully'));
  return true;
}

export const loginCommand = new Command('login')
  .description('Log in to EvaluateAI')
  .option('--token <token>', 'Login with an API token (for CI/CD)')
  .option('--api-url <url>', 'API URL override')
  .option('--force', 'Force re-authentication even if already logged in')
  .action(async (opts) => {
    if (opts.apiUrl) {
      process.env.EVALUATEAI_API_URL = opts.apiUrl;
    }

    // Check for existing valid session unless --force or --token is used
    if (!opts.force && !opts.token) {
      const existing = readCredentials();
      if (existing?.token) {
        const result = await verifyToken(existing.token);
        if (result.valid) {
          console.log('');
          console.log(chalk.green('  ✓ Already logged in'));
          if (existing.email) console.log(`  ${chalk.dim('Email:')}  ${existing.email}`);
          if (existing.teamName) console.log(`  ${chalk.dim('Team:')}   ${existing.teamName}`);
          console.log('');
          console.log(chalk.dim('  Use --force to re-authenticate'));
          console.log('');
          process.exit(0);
        }
        // Token exists but is invalid — proceed with login
        console.log(chalk.yellow('  ⚠ Existing session is no longer valid. Re-authenticating...'));
        console.log('');
      }
    }

    if (opts.token) {
      const success = await loginWithToken(opts.token);
      process.exit(success ? 0 : 1);
    } else {
      const success = await loginWithBrowser();
      process.exit(success ? 0 : 1);
    }
  });
