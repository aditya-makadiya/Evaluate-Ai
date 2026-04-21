import { describe, it, expect, beforeAll } from 'vitest';
import { randomBytes } from 'node:crypto';
import { encryptToken, decryptToken } from '../crypto';

beforeAll(() => {
  // Set a deterministic key for all tests.
  process.env.EVALUATEAI_ENCRYPTION_KEY = randomBytes(32).toString('base64');
});

describe('crypto', () => {
  it('round-trips a short token', () => {
    const plaintext = 'ghp_abc123def456';
    const blob = encryptToken(plaintext);
    expect(blob).toBeInstanceOf(Buffer);
    // iv(12) + tag(16) + ciphertext(>=len)
    expect(blob.length).toBeGreaterThanOrEqual(12 + 16 + plaintext.length);
    expect(decryptToken(blob)).toBe(plaintext);
  });

  it('round-trips a long payload', () => {
    const plaintext = 'x'.repeat(4096);
    const blob = encryptToken(plaintext);
    expect(decryptToken(blob)).toBe(plaintext);
  });

  it('produces distinct ciphertexts for the same plaintext (random IV)', () => {
    const plaintext = 'fireflies-api-key-xyz';
    const a = encryptToken(plaintext);
    const b = encryptToken(plaintext);
    expect(a.equals(b)).toBe(false);
    expect(decryptToken(a)).toBe(plaintext);
    expect(decryptToken(b)).toBe(plaintext);
  });

  it('rejects an empty string', () => {
    expect(() => encryptToken('')).toThrow(/non-empty string/);
  });

  it('rejects a blob shorter than iv + tag + 1', () => {
    expect(() => decryptToken(Buffer.alloc(10))).toThrow(/blob too short/);
  });

  it('rejects a tampered ciphertext (auth tag fails)', () => {
    const blob = encryptToken('original-secret');
    // Flip a bit in the ciphertext portion
    const tampered = Buffer.from(blob);
    tampered[tampered.length - 1] ^= 0x01;
    expect(() => decryptToken(tampered)).toThrow();
  });

  it('rejects a tampered auth tag', () => {
    const blob = encryptToken('original-secret');
    const tampered = Buffer.from(blob);
    tampered[12] ^= 0x01; // first byte of auth tag
    expect(() => decryptToken(tampered)).toThrow();
  });

  it('accepts both Buffer and \\x hex string input for decrypt', () => {
    const blob = encryptToken('hex-input-check');
    const hex = '\\x' + blob.toString('hex');
    expect(decryptToken(hex)).toBe('hex-input-check');
  });

  it('throws when key is missing', () => {
    const saved = process.env.EVALUATEAI_ENCRYPTION_KEY;
    delete process.env.EVALUATEAI_ENCRYPTION_KEY;
    try {
      expect(() => encryptToken('any')).toThrow(/EVALUATEAI_ENCRYPTION_KEY/);
    } finally {
      process.env.EVALUATEAI_ENCRYPTION_KEY = saved;
    }
  });
});
