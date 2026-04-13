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

export interface VerifyResult {
  valid: boolean;
  userId?: string;
  teamId?: string;
  teamName?: string;
  email?: string;
}

/**
 * Verify a CLI token against the API.
 * Returns verification result with user details on success.
 * Never throws — returns { valid: false } on any failure.
 */
export async function verifyToken(token: string): Promise<VerifyResult> {
  try {
    const apiUrl = getApiUrl();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);

    try {
      const res = await fetch(`${apiUrl}/api/cli/verify`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      });

      if (!res.ok) {
        return { valid: false };
      }

      const data = await res.json() as Record<string, unknown>;
      return {
        valid: true,
        userId: (data.userId as string) || undefined,
        teamId: (data.teamId as string) || undefined,
        teamName: (data.teamName as string) || undefined,
        email: (data.email as string) || undefined,
      };
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return { valid: false };
  }
}
