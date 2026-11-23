import crypto from 'node:crypto';
import { logger } from './logger.js';

// HaveIBeenPwned k-anonymity check (https://haveibeenpwned.com/API/v3)
// ส่งแค่ 5 ตัวแรกของ SHA-1 (hex upper) — server ไม่เห็นรหัสผ่านเต็ม
// fail-open: network error → breached:null (ไม่ block user ตอน HIBP ล่ม)

const TIMEOUT_MS = 3000;
const cache = new Map(); // sha1Upper -> { breached, count, ts }
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX = 2000;

export function passwordSha1Suffix(password) {
  const sha1 = crypto.createHash('sha1').update(String(password), 'utf8').digest('hex').toUpperCase();
  return sha1.slice(5); // suffix หลัง prefix 5 ตัว
}

async function fetchRange(prefix, fetchImpl) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetchImpl(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { 'Add-Padding': 'true', 'User-Agent': 'demo-lottery/1.0' },
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

// returns { breached: true|false|null, count }
// breached=null = ตรวจไม่ได้ (network/parse fail) — caller ตัดสินใจเอง
export async function isPasswordBreached(password, fetchImpl = fetch) {
  const sha1 = crypto.createHash('sha1').update(String(password), 'utf8').digest('hex').toUpperCase();
  const hit = cache.get(sha1);
  if (hit && Date.now() - hit.ts < CACHE_TTL_MS) return { breached: hit.breached, count: hit.count };

  const prefix = sha1.slice(0, 5);
  const suffix = sha1.slice(5);
  let body;
  try {
    body = await fetchRange(prefix, fetchImpl);
  } catch (e) {
    logger.warn('hibp fetch failed', { error: e.message });
    return { breached: null, count: 0 };
  }
  if (body == null) return { breached: null, count: 0 };

  let count = 0;
  for (const line of body.split('\n')) {
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    if (line.slice(0, idx).trim() === suffix) {
      count = parseInt(line.slice(idx + 1).trim(), 10) || 0;
      break;
    }
  }
  const breached = count > 0;
  if (cache.size >= CACHE_MAX) cache.clear();
  cache.set(sha1, { breached, count, ts: Date.now() });
  return { breached, count };
}
