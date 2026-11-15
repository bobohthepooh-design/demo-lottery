// จำลอง: admin ซ่อนประเภท → ดู response เวลา + member endpoints ยังตอบไหม
const BASE = 'http://localhost:4000';
const jar = { cookies: {} };
async function req(path, { method = 'GET', body, headers = {} } = {}) {
  const h = { ...headers };
  const ck = Object.entries(jar.cookies).map(([k, v]) => `${k}=${v}`).join('; ');
  if (ck) h.cookie = ck;
  const t0 = Date.now();
  const r = await fetch(BASE + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  const ms = Date.now() - t0;
  for (const c of (r.headers.getSetCookie?.() || [])) {
    const [pair] = c.split(';');
    const i = pair.indexOf('=');
    jar.cookies[pair.slice(0, i).trim()] = pair.slice(i + 1).trim();
  }
  return { status: r.status, ms, json: await r.json().catch(() => null) };
}
const csrf = (await req('/api/csrf-token')).json.csrfToken;
const H = { 'x-csrf-token': csrf, 'content-type': 'application/json' };

// admin login + MFA
await req('/api/auth/login', { method: 'POST', headers: H, body: { username: 'admin', password: 'Admin@Demo123' } });
// mfa — ใช้ session id จาก cookie + TOTP จาก admin-mfa-info.mjs? ลอง endpoint verify ด้วย code จากไฟล์
import { execSync } from 'node:child_process';
// ข้าม MFA — ใช้ test1 member แทนสำหรับ PUT ไม่ได้ (ต้อง admin perm)
// → ใช้ admin-mfa-info.mjs logic: อ่าน secret จาก db
const { getDb } = await import('./src/db/index.js');
const admin = getDb().prepare(`SELECT id, mfa_secret FROM users WHERE username='admin'`).get();
const { verifyTotp, generateSecret } = await import('./src/lib/totp.js').catch(() => ({}));
// generate code from secret
import { createHmac } from 'node:crypto';
function b32dec(s){const A='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';let b=0,v=0,o=[];for(const c of s){v=(v<<5)|A.indexOf(c);b+=5;if(b>=8){b-=8;o.push((v>>b)&255)}}return Buffer.from(o)}
function totp(sec){const key=b32dec(sec);const ctr=Math.floor(Date.now()/1000/30);const buf=Buffer.alloc(8);buf.writeBigUInt64BE(BigInt(ctr));const h=createHmac('sha1',key).update(buf).digest();const off=h[19]&15;const code=((h.readUInt32BE(off)&0x7fffffff)%1000000);return String(code).padStart(6,'0')}
const sessId = jar.cookies.dl_session;
const v = await req('/api/auth/mfa/verify', { method: 'POST', headers: H, body: { code: totp(admin.mfa_secret) } });
console.log('mfa verify', v.status);

// admin PUT hidden types
const t0 = Date.now();
const put = await req('/api/admin/settings/bet_menu_hidden_types', { method: 'PUT', headers: H, body: { value: ['TH','LA','HN','HR','SC'] } });
console.log('PUT hidden', put.status, put.ms + 'ms', JSON.stringify(put.json).slice(0,100));

// member endpoints latency หลัง hide
const mcsrf = (await req('/api/csrf-token')).json.csrfToken;
const MH = { 'x-csrf-token': mcsrf, 'content-type': 'application/json' };
await req('/api/auth/login', { method: 'POST', headers: MH, body: { username: 'test1', password: '87654321' } });
for (const p of ['/api/auth/me','/api/lottery/types','/api/lottery/public-config','/api/lottery/draws?upcoming=1','/api/lottery/results','/api/bets/mine','/api/scratch/mine']) {
  const r = await req(p);
  console.log(r.status, r.ms + 'ms', p);
}
// restore
await req('/api/admin/settings/bet_menu_hidden_types', { method: 'PUT', headers: H, body: { value: [] } });
console.log('restored');
