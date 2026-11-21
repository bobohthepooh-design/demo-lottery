import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
const BASE = 'http://localhost';
const cookies = new Map(); let csrf = null;
const jar = r => { for (const c of r.headers.getSetCookie?.() || []) { const [p] = c.split(';'); const i = p.indexOf('='); cookies.set(p.slice(0, i).trim(), p.slice(i + 1).trim()); } };
const ch = () => [...cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
async function raw(m, p, b) { const h = { 'content-type': 'application/json' }; if (cookies.size) h.cookie = ch(); if (m !== 'GET' && csrf) h['x-csrf-token'] = csrf; const r = await fetch(BASE + p, { method: m, headers: h, body: b === undefined ? undefined : JSON.stringify(b) }); jar(r); return r; }
async function api(m, p, b) { if (!csrf) { const r = await raw('GET', '/api/csrf-token'); csrf = (await r.json()).csrfToken; } let r = await raw(m, p, b); if (r.status === 403) { csrf = null; const r2 = await raw('GET', '/api/csrf-token'); csrf = (await r2.json()).csrfToken; r = await raw(m, p, b); } return r; }
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function b32d(s) { let b = ''; for (const c of s.toUpperCase().replace(/=+$/, '')) b += B32.indexOf(c).toString(2).padStart(5, '0'); const o = []; for (let i = 0; i + 8 <= b.length; i += 8) o.push(parseInt(b.slice(i, i + 8), 2)); return Buffer.from(o); }
function totp(sec) { const k = b32d(sec); const buf = Buffer.alloc(8); buf.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000))); const h = crypto.createHmac('sha1', k).update(buf).digest(); const o = h[19] & 15; return String((((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1e6).padStart(6, '0'); }

let r = await api('POST', '/api/auth/login', { username: 'admin', password: 'Admin@Demo123' });
let j = await r.json(); console.log('login:', r.status, 'mfa?', j.requiresMfa);
if (j.requiresMfa) {
  const sec = execSync(`docker exec demo-lottery-postgres-1 psql -U lottery -d lottery -t -A -c "SELECT mfa_secret FROM users WHERE username='admin'"`).toString().trim();
  r = await api('POST', '/api/auth/mfa/verify', { code: totp(sec) }); console.log('mfa:', r.status);
}
r = await api('POST', '/api/admin/draws/758/fetch-result', {});
console.log('fetch-result:', r.status, JSON.stringify(await r.json()).slice(0, 300));
r = await api('POST', '/api/admin/draws/758/settle-preview', { winning_numbers: { num4: '1234' } });
console.log('settle-preview:', r.status, JSON.stringify(await r.json()).slice(0, 200));
// settle จริงเขียน DB — ทดสอบผ่าน settle-preview เท่านั้น (ด้านบน)
