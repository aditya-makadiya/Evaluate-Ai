import { join } from 'node:path';
import { homedir } from 'node:os';
import { readFileSync, writeFileSync, chmodSync, existsSync, mkdirSync, unlinkSync } from 'node:fs';

const DATA_DIR = join(homedir(), '.evaluateai-v2');
const CREDENTIALS_PATH = join(DATA_DIR, 'credentials.json');

export interface CliCredentials {
  token: string;
  apiUrl: string;
  userId?: string;
  teamId?: string;
  teamName?: string;
  email?: string;
  createdAt: string;
}

export function readCredentials(): CliCredentials | null {
  try {
    if (!existsSync(CREDENTIALS_PATH)) return null;
    const raw = readFileSync(CREDENTIALS_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function saveCredentials(creds: CliCredentials): void {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
  writeFileSync(CREDENTIALS_PATH, JSON.stringify(creds, null, 2));
  try {
    chmodSync(CREDENTIALS_PATH, 0o600);
  } catch {
    // chmod may fail on Windows — non-critical
  }
}

export function deleteCredentials(): void {
  try {
    if (existsSync(CREDENTIALS_PATH)) {
      unlinkSync(CREDENTIALS_PATH);
    }
  } catch {
    // ignore
  }
}

export function getApiUrl(): string {
  return process.env.EVALUATEAI_API_URL || readCredentials()?.apiUrl || 'http://localhost:3456';
}

export function getAuthToken(): string | null {
  return process.env.EVALUATEAI_TOKEN || readCredentials()?.token || null;
}
