/**
 * Signed, time-limited OAuth `state` tokens.
 *
 * GitHub (and Fireflies later) bounces the user back to /api/integrations/<p>/
 * callback with the same state we sent. Three things matter:
 *
 *  1. Integrity — a tampered state must fail decode. HMAC-SHA256.
 *  2. Freshness — a stale callback (replayed hours later) must be rejected.
 *     We issue an `iat` timestamp and reject tokens older than 10 minutes.
 *  3. Backward compat — the legacy v1 callback decoded plain base64 JSON
 *     `{ team_id }`. If this module fails to decode a string as a v2 signed
 *     token, the caller falls back to the legacy path. New state emitted by
 *     v2 connect handlers always carries the signature.
 *
 * Key derivation: the encryption key is already an app-held secret. We
 * derive a distinct HMAC key via SHA-256 with a fixed salt so a leak of
 * the state-signing key wouldn't help decrypt stored tokens (and vice
 * versa). Same physical env var, different derived keys.
 */

import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const VERSION = 'v2';
const DEFAULT_TTL_MS = 10 * 60 * 1000;

export interface OAuthStatePayload {
  flow: 'v2';
  provider: 'github' | 'fireflies';
  userId: string;
  teamId: string;
}

interface SignedEnvelope {
  v: 'v2';
  p: OAuthStatePayload;
  iat: number;
  nonce: string;
}

function hmacKey(): Buffer {
  const raw = process.env.EVALUATEAI_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error('EVALUATEAI_ENCRYPTION_KEY is not set');
  }
  return createHash('sha256').update(`oauth-state|${raw}`, 'utf8').digest();
}

function sign(bodyB64: string): string {
  return createHmac('sha256', hmacKey()).update(bodyB64).digest('base64url');
}

/**
 * Produce a URL-safe `state` string carrying the signed envelope. Suitable
 * for passing directly through GitHub's `state=` parameter.
 */
export function encodeState(payload: OAuthStatePayload): string {
  const envelope: SignedEnvelope = {
    v: VERSION,
    p: payload,
    iat: Date.now(),
    nonce: randomBytes(16).toString('base64url'),
  };
  const body = Buffer.from(JSON.stringify(envelope), 'utf8').toString('base64url');
  const sig = sign(body);
  return `${VERSION}.${body}.${sig}`;
}

export type DecodeOutcome =
  | { kind: 'v2'; payload: OAuthStatePayload }
  | { kind: 'legacy'; teamId: string }
  | { kind: 'invalid'; reason: string };

/**
 * Best-effort decode. Callers branch on `kind`:
 *   - 'v2'     → verified signed v2 flow, proceed with per-user upsert
 *   - 'legacy' → plain base64 JSON with { team_id } — run the old path
 *   - 'invalid'→ surface a user-visible error; do not proceed
 */
export function decodeState(state: string, ttlMs: number = DEFAULT_TTL_MS): DecodeOutcome {
  if (!state || typeof state !== 'string') {
    return { kind: 'invalid', reason: 'missing state' };
  }

  // v2 signed envelope: `v2.<body>.<sig>`
  if (state.startsWith(`${VERSION}.`)) {
    const parts = state.split('.');
    if (parts.length !== 3) {
      return { kind: 'invalid', reason: 'malformed v2 state' };
    }
    const [, body, sig] = parts;

    const expected = sign(body);
    const expectedBuf = Buffer.from(expected, 'utf8');
    const actualBuf = Buffer.from(sig, 'utf8');
    if (expectedBuf.length !== actualBuf.length || !timingSafeEqual(expectedBuf, actualBuf)) {
      return { kind: 'invalid', reason: 'bad signature' };
    }

    let envelope: SignedEnvelope;
    try {
      envelope = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    } catch {
      return { kind: 'invalid', reason: 'unparseable body' };
    }

    if (envelope.v !== VERSION) {
      return { kind: 'invalid', reason: 'version mismatch' };
    }
    if (Date.now() - envelope.iat >= ttlMs) {
      return { kind: 'invalid', reason: 'expired' };
    }
    if (!envelope.p?.userId || !envelope.p?.teamId || !envelope.p?.provider) {
      return { kind: 'invalid', reason: 'incomplete payload' };
    }
    return { kind: 'v2', payload: envelope.p };
  }

  // Legacy path: plain base64 JSON with { team_id }
  try {
    const decoded = JSON.parse(Buffer.from(state, 'base64url').toString('utf8'));
    if (typeof decoded?.team_id === 'string') {
      return { kind: 'legacy', teamId: decoded.team_id };
    }
  } catch {
    // fall through
  }
  return { kind: 'invalid', reason: 'unrecognized state format' };
}
