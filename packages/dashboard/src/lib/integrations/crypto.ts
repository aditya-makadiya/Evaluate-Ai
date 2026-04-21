/**
 * Symmetric encryption for integration tokens at rest.
 *
 * AES-256-GCM with an app-held key. BYTEA storage format is
 *   iv(12) || authTag(16) || ciphertext
 * decryptToken() rejects any input that doesn't match that shape, which
 * makes tampering (or accidental plaintext writes) fail loudly.
 *
 * Upgrade path to Supabase Vault: when Vault is provisioned, replace the
 * body of encryptToken / decryptToken with vault.decrypted_secrets calls,
 * then run a one-shot job that re-reads every user_integrations row,
 * decrypts with these helpers, and re-encrypts via Vault. Schema is
 * identical; no migration needed.
 */

import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto';

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;
const TAG_LEN = 16;

function getKey(): Buffer {
  const raw = process.env.EVALUATEAI_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      'EVALUATEAI_ENCRYPTION_KEY is not set. Generate one with ' +
        '`node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"` ' +
        'and add it to the dashboard env before running integration code.'
    );
  }
  // Accept either a 32-byte base64 string or arbitrary-length text — in the
  // latter case we derive a stable 32-byte key via SHA-256. Both paths yield
  // a usable AES-256 key; the base64 path is preferred.
  try {
    const buf = Buffer.from(raw, 'base64');
    if (buf.length === 32) return buf;
  } catch {
    // fall through to derivation
  }
  return createHash('sha256').update(raw, 'utf8').digest();
}

/**
 * Encrypts a token string and returns the BYTEA-compatible Buffer to store
 * in Postgres (iv || authTag || ciphertext).
 */
export function encryptToken(plaintext: string): Buffer {
  if (typeof plaintext !== 'string' || plaintext.length === 0) {
    throw new Error('encryptToken: plaintext must be a non-empty string');
  }
  const key = getKey();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]);
}

/**
 * Decrypts a stored BYTEA blob back to the original token string.
 * Throws on any integrity failure — callers should surface this as an
 * "integration unusable" error and mark the row status = 'error'.
 */
export function decryptToken(blob: Buffer | Uint8Array | string): string {
  const buf = normalizeBlob(blob);
  if (buf.length < IV_LEN + TAG_LEN + 1) {
    throw new Error('decryptToken: blob too short to contain iv + tag + ciphertext');
  }
  const key = getKey();
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ct = buf.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}

/**
 * Supabase returns BYTEA via the JS client as either a Buffer (Node) or a
 * hex string with a leading `\x` (REST). Normalize both to Buffer so callers
 * never have to think about transport.
 */
function normalizeBlob(blob: Buffer | Uint8Array | string): Buffer {
  if (Buffer.isBuffer(blob)) return blob;
  if (blob instanceof Uint8Array) return Buffer.from(blob);
  if (typeof blob === 'string') {
    const hex = blob.startsWith('\\x') ? blob.slice(2) : blob;
    return Buffer.from(hex, 'hex');
  }
  throw new Error('decryptToken: unsupported blob type');
}
