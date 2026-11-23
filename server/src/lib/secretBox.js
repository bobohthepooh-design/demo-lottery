import crypto from 'node:crypto';
import { config } from '../config.js';

// AES-256-GCM encryption for secrets at rest (TOTP seeds and future sensitive fields).
// Key derived from SESSION_SECRET (or MFA_ENCRYPTION_KEY if set) — rotate both together.
// Stored format: enc:v1:<iv>:<tag>:<ciphertext> (base64url parts)
// Values WITHOUT the prefix are treated as legacy plaintext (read-compatible).

const PREFIX = 'enc:v1:';
const key = () => crypto.createHash('sha256')
  .update(config.mfaEncryptionKey || config.sessionSecret)
  .digest();

export function encryptSecret(plain) {
  if (plain == null) return plain;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv, { authTagLength: 16 });
  const ct = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + [iv, tag, ct].map(b => b.toString('base64url')).join(':');
}

export function decryptSecret(stored) {
  if (stored == null) return stored;
  const s = String(stored);
  if (!s.startsWith(PREFIX)) return s; // legacy plaintext row
  try {
    const [iv, tag, ct] = s.slice(PREFIX.length).split(':').map(p => Buffer.from(p, 'base64url'));
    const d = crypto.createDecipheriv('aes-256-gcm', key(), iv, { authTagLength: 16 });
    d.setAuthTag(tag);
    return Buffer.concat([d.update(ct), d.final()]).toString('utf8');
  } catch {
    // key rotated / corrupted — treat as unusable rather than leaking plaintext path
    return null;
  }
}

export const isEncrypted = (v) => typeof v === 'string' && v.startsWith(PREFIX);
