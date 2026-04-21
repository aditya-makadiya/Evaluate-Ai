import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { randomBytes } from 'node:crypto';
import { encodeState, decodeState } from '../oauth-state';

beforeAll(() => {
  process.env.EVALUATEAI_ENCRYPTION_KEY = randomBytes(32).toString('base64');
});

describe('oauth-state', () => {
  const payload = {
    flow: 'v2' as const,
    provider: 'github' as const,
    userId: '11111111-1111-1111-1111-111111111111',
    teamId: '22222222-2222-2222-2222-222222222222',
  };

  it('round-trips a v2 payload', () => {
    const state = encodeState(payload);
    const decoded = decodeState(state);
    expect(decoded.kind).toBe('v2');
    if (decoded.kind !== 'v2') throw new Error('unreachable');
    expect(decoded.payload).toEqual(payload);
  });

  it('produces different ciphertext for same payload (nonce)', () => {
    const a = encodeState(payload);
    const b = encodeState(payload);
    expect(a).not.toBe(b);
  });

  it('rejects a tampered body', () => {
    const state = encodeState(payload);
    const parts = state.split('.');
    // Replace one char in the body — signature no longer matches
    const tamperedBody = parts[1].slice(0, -1) + (parts[1].slice(-1) === 'A' ? 'B' : 'A');
    const tampered = [parts[0], tamperedBody, parts[2]].join('.');
    const decoded = decodeState(tampered);
    expect(decoded.kind).toBe('invalid');
  });

  it('rejects a tampered signature', () => {
    const state = encodeState(payload);
    const parts = state.split('.');
    const tamperedSig = parts[2].slice(0, -1) + (parts[2].slice(-1) === 'A' ? 'B' : 'A');
    const tampered = [parts[0], parts[1], tamperedSig].join('.');
    const decoded = decodeState(tampered);
    expect(decoded.kind).toBe('invalid');
  });

  it('rejects a malformed v2 string (wrong part count)', () => {
    const decoded = decodeState('v2.onlyonepart');
    expect(decoded.kind).toBe('invalid');
  });

  it('rejects expired tokens (ttl=0)', () => {
    const state = encodeState(payload);
    const decoded = decodeState(state, 0);
    expect(decoded.kind).toBe('invalid');
    if (decoded.kind === 'invalid') {
      expect(decoded.reason).toMatch(/expired/);
    }
  });

  it('rejects expired tokens when time moves forward', () => {
    vi.useFakeTimers();
    try {
      const now = Date.now();
      vi.setSystemTime(now);
      const state = encodeState(payload);
      vi.setSystemTime(now + 11 * 60 * 1000); // 11 minutes later
      const decoded = decodeState(state);
      expect(decoded.kind).toBe('invalid');
    } finally {
      vi.useRealTimers();
    }
  });

  it('decodes legacy base64 {team_id} as legacy kind', () => {
    const legacy = Buffer.from(JSON.stringify({ team_id: 'abc-123' })).toString('base64url');
    const decoded = decodeState(legacy);
    expect(decoded.kind).toBe('legacy');
    if (decoded.kind === 'legacy') expect(decoded.teamId).toBe('abc-123');
  });

  it('rejects empty or non-string input', () => {
    expect(decodeState('').kind).toBe('invalid');
    expect(decodeState(undefined as unknown as string).kind).toBe('invalid');
  });

  it('rejects gibberish that looks like v2 prefix', () => {
    const decoded = decodeState('v2.aGVsbG8.dGVzdA');
    expect(decoded.kind).toBe('invalid');
  });
});
