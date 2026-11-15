// ทดสอบ sliding session renewal: หดอายุ session ให้เหลือ <6 ชม. แล้วยิง /auth/me ดูว่า expires_at ขยาย + cookie ใหม่
import { getDb } from './src/db/index.js';

const BASE = 'http://localhost:4000';
const jar = { cookies: {} };
async function req(path, { method = 'GET', body, headers = {} } = {}) {
  const h = { ...headers };
  const ck = Object.entries(jar.cookies).map(([k, v]) => `${k}=${v}`).join('; ');
  if (ck) h.cookie = ck;
  const r = await fetch(BASE + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  for (const c of (r.headers.getSetCookie?.() || [])) {
    const [pair] = c.split(';');
    const i = pair.indexOf('=');
    jar.cookies[pair.slice(0, i).trim()] = pair.slice(i + 1).trim();
  }
  return { status: r.status, json: await r.json().catch(() => null), headers: r.headers };
}

const csrf = (await req('/api/csrf-token')).json.csrfToken;
const login = await req('/api/auth/login', { method: 'POST', headers: { 'x-csrf-token': csrf, 'content-type': 'application/json' }, body: { username: 'test1', password: '87654321' } });
console.log('login', login.status);

const db = getDb();
const sessId = jar.cookies.dl_session;
console.log('session before:', db.prepare('SELECT expires_at FROM user_sessions WHERE id=?').get(sessId));
// บีบอายุให้เหลือ 2 ชม.
db.prepare(`UPDATE user_sessions SET expires_at = datetime('now','+2 hours') WHERE id=?`).run(sessId);
console.log('session shrunk:', db.prepare('SELECT expires_at FROM user_sessions WHERE id=?').get(sessId));

const me = await req('/api/auth/me');
console.log('me', me.status, me.json?.user?.username);
console.log('session after:', db.prepare('SELECT expires_at FROM user_sessions WHERE id=?').get(sessId));
console.log('new dl_session cookie set:', !!me.headers.getSetCookie?.().some(c => c.startsWith('dl_session=')));
