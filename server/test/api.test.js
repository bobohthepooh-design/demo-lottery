// Integration tests — run against a throwaway DB
process.env.DATABASE_PATH = './test-tmp.db';
process.env.SESSION_SECRET = 'test-secret';
process.env.NODE_ENV = 'test';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbFile = path.resolve(__dirname, '..', 'test-tmp.db');
for (const ext of ['', '-wal', '-shm']) { try { fs.unlinkSync(dbFile + ext); } catch {} }

const { default: app } = await import('../src/index.js');
const { getDb, closeDb } = await import('../src/db/index.js');

function makeAgent() {
  const jar = {};
  let csrf = null;
  const cookieHeader = () => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
  const store = (res) => {
    const raw = res.headers.getSetCookie?.() || res.headers['set-cookie'] || [];
    for (const c of Array.isArray(raw) ? raw : [raw]) {
      const [pair] = c.split(';');
      const i = pair.indexOf('=');
      jar[pair.slice(0, i).trim()] = pair.slice(i + 1).trim();
    }
  };
  async function ensureCsrf() {
    if (csrf) return;
    const r = await request(app).get('/api/csrf-token');
    store(r);
    csrf = r.body.csrfToken;
  }
  async function call(method, url, body) {
    if (method !== 'get') await ensureCsrf();
    let req = request(app)[method](`/api${url}`).set('Cookie', cookieHeader());
    if (method !== 'get') req = req.set('x-csrf-token', csrf).set('Content-Type', 'application/json');
    const res = await (body !== undefined ? req.send(body) : req);
    store(res);
    return res;
  }
  return { get: (u) => call('get', u), post: (u, b) => call('post', u, b), patch: (u, b) => call('patch', u, b), put: (u, b) => call('put', u, b) };
}

async function loginAs(username, password) {
  const a = makeAgent();
  const r = await a.post('/auth/login', { username, password });
  return { agent: a, res: r };
}

let member, adminAgent, drawId, ruleBottom2, ruleTop3;
const ts = Date.now().toString(36);

beforeAll(async () => {
  // create member
  await makeAgent().post('/auth/register', { username: `m${ts}`, email: `m${ts}@t.local`, password: 'Password123' });
  member = await loginAs(`m${ts}`, 'Password123');

  // admin: login + MFA setup/enable/verify
  const a = makeAgent();
  await a.post('/auth/login', { username: 'admin', password: 'Admin@Demo123' });
  const setup = await a.post('/auth/mfa/setup');
  const secret = setup.body.secret;
  // compute TOTP
  const crypto = await import('node:crypto');
  const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const dec = s => { let b=''; for (const c of s) b += B32.indexOf(c).toString(2).padStart(5,'0'); const o=[]; for(let i=0;i+8<=b.length;i+=8) o.push(parseInt(b.slice(i,i+8),2)); return Buffer.from(o); };
  const hotp = (sec,c) => { const k=dec(sec); const buf=Buffer.alloc(8); buf.writeBigUInt64BE(BigInt(c)); const h=crypto.createHmac('sha1',k).update(buf).digest(); const o=h[h.length-1]&15; return String((((h[o]&127)<<24)|(h[o+1]<<16)|(h[o+2]<<8)|h[o+3])%1e6).padStart(6,'0'); };
  const code = hotp(secret, Math.floor(Date.now()/1000/30));
  await a.post('/auth/mfa/enable', { code });
  // re-login (new session) then verify mfa
  const a2 = makeAgent();
  await a2.post('/auth/login', { username: 'admin', password: 'Admin@Demo123' });
  const code2 = hotp(secret, Math.floor(Date.now()/1000/30));
  const v = await a2.post('/auth/mfa/verify', { code: code2 });
  expect(v.status).toBe(200);
  adminAgent = a2;

  // create + open draw
  const now = Date.now();
  const fmt = ms => { const d = new Date(ms); const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`; };
  const d = await adminAgent.post('/admin/draws', {
    lottery_type_id: 1, draw_code: `T${ts}`,
    draw_at: fmt(now - 3600e3), close_at: fmt(now + 3600e3),
  });
  drawId = d.body.id;
  await adminAgent.patch(`/admin/draws/${drawId}/status`, { status: 'open' });

  const t = await member.agent.get('/lottery/types/1');
  ruleBottom2 = t.body.rules.find(r => r.bet_type === 'bottom2');
  ruleTop3 = t.body.rules.find(r => r.bet_type === 'top3');
});

afterAll(() => { closeDb(); for (const ext of ['', '-wal', '-shm']) { try { fs.unlinkSync(dbFile + ext); } catch {} } });

describe('auth', () => {
  it('rejects wrong password', async () => {
    const r = await makeAgent().post('/auth/login', { username: 'admin', password: 'wrong' });
    expect(r.status).toBe(401);
  });
  it('register rejects duplicate', async () => {
    const r = await makeAgent().post('/auth/register', { username: `m${ts}`, email: `dup${ts}@test.com`, password: 'Password123' });
    expect(r.status).toBe(409);
  });
  it('member cannot access admin', async () => {
    const r = await member.agent.get('/admin/overview');
    expect(r.status).toBe(403);
  });
  it('CSRF blocks missing token', async () => {
    const r = await request(app).post('/api/auth/logout').set('Cookie', '');
    expect(r.status).toBe(403);
  });
});

describe('betting', () => {
  it('places bet and deducts balance', async () => {
    const r = await member.agent.post('/bets', { drawId, items: [{ ruleId: ruleBottom2.id, number: '42', amount: 1000 }] });
    expect(r.status).toBe(201);
    expect(r.body.balance).toBe(9000);
  });
  it('rejects bet on closed draw', async () => {
    const now = Date.now();
    const fmt = ms => { const d = new Date(ms); const p = n => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`; };
    const d = await adminAgent.post('/admin/draws', { lottery_type_id: 1, draw_code: `C${ts}`, draw_at: fmt(now-7200e3), close_at: fmt(now-3600e3) });
    await adminAgent.patch(`/admin/draws/${d.body.id}/status`, { status: 'open' }); // will auto-close since close_at passed
    const r = await member.agent.post('/bets', { drawId: d.body.id, items: [{ ruleId: ruleBottom2.id, number: '42', amount: 100 }] });
    expect(r.status).toBe(400);
  });
  it('rejects invalid number format', async () => {
    const r = await member.agent.post('/bets', { drawId, items: [{ ruleId: ruleBottom2.id, number: '4a', amount: 100 }] });
    expect(r.status).toBe(400);
  });
  it('settles draw and pays winner', async () => {
    // winning bottom2 = '42' → bottom2 bet wins x100; place another losing bet
    await member.agent.post('/bets', { drawId, items: [{ ruleId: ruleTop3.id, number: '999', amount: 500 }] });
    const r = await adminAgent.post(`/admin/draws/${drawId}/settle`, { winning_numbers: { top3: '542', bottom2: '42' } });
    expect(r.status).toBe(200);
    expect(r.body.winningItems).toBe(1);
    // balance: 10000 -1000 -500 + 1000*100 = 108500
    const me = await member.agent.get('/auth/me');
    expect(me.body.balance).toBe(108500);
  });
  it('double settle rejected', async () => {
    const r = await adminAgent.post(`/admin/draws/${drawId}/settle`, { winning_numbers: { top3: '111' } });
    expect(r.status).toBe(400);
  });
});

describe('wallet', () => {
  it('admin adjust credits member', async () => {
    const members = await adminAgent.get('/admin/members');
    const m = members.body.members.find(x => x.username === `m${ts}`);
    const r = await adminAgent.post('/admin/wallet/adjust', {
      userId: m.id, amount: 5000, direction: 'credit', reason: 'test credit', idempotencyKey: `test-${ts}`,
    });
    expect(r.status).toBe(200);
    expect(r.body.balance).toBe(113500);
  });
  it('duplicate idempotency key rejected', async () => {
    const members = await adminAgent.get('/admin/members');
    const m = members.body.members.find(x => x.username === `m${ts}`);
    const r = await adminAgent.post('/admin/wallet/adjust', {
      userId: m.id, amount: 5000, direction: 'credit', reason: 'test credit', idempotencyKey: `test-${ts}`,
    });
    expect(r.status).toBe(409);
  });
  it('admin cannot debit below zero', async () => {
    const members = await adminAgent.get('/admin/members');
    const m = members.body.members.find(x => x.username === `m${ts}`);
    const r = await adminAgent.post('/admin/wallet/adjust', {
      userId: m.id, amount: 99999999, direction: 'debit', reason: 'test debit', idempotencyKey: `test2-${ts}`,
    });
    expect(r.status).toBe(400);
  });
});
