import { getApiUrl, getAuthToken } from './credentials.js';

interface ApiOptions {
  method?: string;
  body?: unknown;
  timeout?: number;
}

interface ApiResult<T = unknown> {
  ok: boolean;
  status: number;
  data: T;
}

/**
 * Make an authenticated HTTP request to the EvaluateAI API.
 * Uses the CLI token from credentials.json or EVALUATEAI_TOKEN env var.
 */
export async function apiRequest<T = Record<string, unknown>>(
  path: string,
  options: ApiOptions = {}
): Promise<ApiResult<T>> {
  const { method = 'GET', body, timeout = 10000 } = options;
  const apiUrl = getApiUrl();
  const token = getAuthToken();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetch(`${apiUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      return { ok: false, status: res.status, data: { error: `Unexpected response (${res.status}). Is the dashboard running at ${apiUrl}?` } as T };
    }

    const data = await res.json() as T;
    return { ok: res.ok, status: res.status, data };
  } finally {
    clearTimeout(timer);
  }
}
