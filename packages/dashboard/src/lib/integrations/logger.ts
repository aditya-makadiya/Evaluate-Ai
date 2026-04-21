/**
 * Structured logger for the integrations subsystem.
 *
 * Every log line includes { team_id?, user_id?, provider?, action, outcome }
 * so Phase 2+ debugging doesn't require grep-the-world. Values matching
 * /token|secret|key|password/i are redacted automatically so a stray
 * `...extra: { access_token: '...' }` can't leak to stdout.
 *
 * Intentionally minimal — this is not a full logging framework. Swap for
 * pino / Axiom / Datadog later without touching call sites.
 */

type Outcome = 'ok' | 'skip' | 'retry' | 'error';

export interface IntegrationLogContext {
  team_id?: string;
  user_id?: string;
  provider?: string;
  action: string;
  outcome: Outcome;
  [key: string]: unknown;
}

const SENSITIVE_KEY = /token|secret|key|password|authorization/i;

function redact(value: unknown, keyHint?: string): unknown {
  if (keyHint && SENSITIVE_KEY.test(keyHint)) return '[REDACTED]';
  if (value == null) return value;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.map((v) => redact(v));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = redact(v, k);
    }
    return out;
  }
  return String(value);
}

export function logIntegration(ctx: IntegrationLogContext): void {
  const line = {
    ts: new Date().toISOString(),
    scope: 'integrations',
    ...(redact(ctx) as Record<string, unknown>),
  };
  const serialized = JSON.stringify(line);
  if (ctx.outcome === 'error') {
    console.error(serialized);
  } else {
    console.log(serialized);
  }
}
