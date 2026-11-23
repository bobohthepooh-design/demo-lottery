// Compliance phase 3 — KYC manual review + support tickets + RG list
process.env.SESSION_SECRET = 'test-secret';
process.env.NODE_ENV = 'test';
process.env.LOGIN_RATE_LIMIT_MAX = '200';
process.env.INITIAL_CREDIT = '5000';
process.env.HIBP_CHECK = 'false';
process.env.PROMPTPAY_ID = '';
if (!process.env.TEST_DATABASE_URL) {
  throw new Error('TEST_DATABASE_URL is required');
}
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import crypto from 'node:crypto';

const { default: app } = await import('../src/index.js');
const { getDb, closeDb } = await import('../src/db/index.js');
const { hashPassword } = await import('../src/lib/password.js');
const { setSetting } = await import('../src/services/settingsService.js');

let __agentSeq = 0;
const RUN_OCTET = 30 + (Date.now() % 200);
function makeAgent() {
  const jar = {};
  let csrf = null;
  const ip = `10.96.${RUN_OCTET}.${++__agentSeq % 250}`;
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
    let req = request(app)[method](`/api${url}`).set('Cookie', cookieHeader()).set('X-Forwarded-For', ip);
    if (method !== 'get') req = req.set('x-csrf-token', csrf).set('Content-Type', 'application/json');
    const res = await (body !== undefined ? req.send(JSON.stringify(body)) : req);
    store(res);
    return res;
  }
  return { get: (u) => call('get', u), post: (u, b) => call('post', u, b) };
}

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const dec = s => { let b = ''; for (const c of s) b += B32.indexOf(c).toString(2).padStart(5, '0'); const o = []; for (let i = 0; i + 8 <= b.length; i += 8) o.push(parseInt(b.slice(i, i + 8), 2)); return Buffer.from(o); };
const hotp = (sec, c) => { const k = dec(sec); const buf = Buffer.alloc(8); buf.writeBigUInt64BE(BigInt(c)); const h = crypto.createHmac('sha1', k).update(buf).digest(); const o = h[h.length - 1] & 15; return String((((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1e6).padStart(6, '0'); };
const totpNow = sec => hotp(sec, Math.floor(Date.now() / 1000 / 30));

async function makeAdmin(username) {
  const d = getDb();
  await d.prepare(`INSERT INTO users (username, email, password_hash, display_name) VALUES ($1,$2,$3,$4)`)
    .run(username, `${username}@t.local`, hashPassword('Admin@Demo123'), username);
  const uid = (await d.prepare(`SELECT id FROM users WHERE username=$1`).get(username)).id;
  const roleId = (await d.prepare(`SELECT id FROM roles WHERE name='admin'`).get()).id;
  await d.prepare(`INSERT INTO user_roles (user_id, role_id) VALUES ($1,$2)`).run(uid, roleId);
  const a = makeAgent();
  await a.post('/auth/login', { username, password: 'Admin@Demo123' });
  const setup = await a.post('/auth/mfa/setup');
  const secret = setup.body.secret;
  await a.post('/auth/mfa/enable', { code: totpNow(secret) });
  const a2 = makeAgent();
  await a2.post('/auth/login', { username, password: 'Admin@Demo123' });
  await a2.post('/auth/mfa/verify', { code: totpNow(secret) });
  return { agent: a2, userId: uid };
}

const ts = Date.now().toString(36);
let member, admin, memberId;

beforeAll(async () => {
  await setSetting('maker_checker', 'off', null);
  await makeAgent().post('/auth/register', { username: `cp${ts}`, email: `cp${ts}@t.local`, password: 'Password123', ageConfirmed: true, termsAccepted: true });
  member = makeAgent();
  await member.post('/auth/login', { username: `cp${ts}`, password: 'Password123' });
  memberId = (await getDb().prepare(`SELECT id FROM users WHERE username=$1`).get(`cp${ts}`)).id;
  // verify email ให้ KYC request ผ่าน
  await getDb().prepare('UPDATE users SET email_verified=1 WHERE id=$1').run(memberId);
  admin = await makeAdmin(`adcp${ts}`);
});

afterAll(async () => { await closeDb(); });

describe('compliance — KYC', () => {
  it('member ขอ KYC → pending → admin verify → verified', async () => {
    const st0 = await member.get('/compliance/kyc/status');
    expect(st0.body.kyc.kyc_status).toBe('none');
    const req = await member.post('/compliance/kyc/request', {});
    expect(req.status).toBe(200);
    // ขอซ้ำตอน pending → 400
    expect((await member.post('/compliance/kyc/request', {})).status).toBe(400);
    // admin เห็นในคิว
    const list = await admin.agent.get('/admin/kyc?status=pending');
    expect(list.body.kyc.some(k => k.id === memberId)).toBe(true);
    // reject ต้องมี note
    expect((await admin.agent.post(`/admin/kyc/${memberId}/review`, { action: 'reject' })).status).toBe(400);
    // verify
    const v = await admin.agent.post(`/admin/kyc/${memberId}/review`, { action: 'verify' });
    expect(v.status).toBe(200);
    const st1 = await member.get('/compliance/kyc/status');
    expect(st1.body.kyc.kyc_status).toBe('verified');
    // verify แล้วขอใหม่ → 400
    expect((await member.post('/compliance/kyc/request', {})).status).toBe(400);
  });
});

describe('compliance — tickets', () => {
  let ticketId;
  it('member เปิด ticket → admin เห็นและตอบ', async () => {
    const r = await member.post('/compliance/tickets', { category: 'payment', subject: 'เติมเงินไม่เข้า', message: 'โอน PromptPay แล้วแต่เครดิตไม่เข้า REF-123 กรุณาตรวจสอบ' });
    expect(r.status).toBe(200);
    ticketId = r.body.id;
    const mine = await member.get('/compliance/tickets');
    expect(mine.body.tickets[0].subject).toBe('เติมเงินไม่เข้า');
    // admin list + reply
    const list = await admin.agent.get('/admin/tickets?status=open');
    expect(list.body.tickets.some(t => t.id === ticketId)).toBe(true);
    const rep = await admin.agent.post(`/admin/tickets/${ticketId}/reply`, { reply: 'ได้รับเรื่องแล้ว กำลังตรวจสอบ REF-123', status: 'in_progress' });
    expect(rep.status).toBe(200);
    const mine2 = await member.get('/compliance/tickets');
    expect(mine2.body.tickets[0].admin_reply).toContain('REF-123');
    expect(mine2.body.tickets[0].status).toBe('in_progress');
  });

  it('subject สั้นเกิน → 400', async () => {
    expect((await member.post('/compliance/tickets', { subject: 'hi', message: 'message too short' })).status).toBe(400);
  });
});

describe('compliance — RG restricted list', () => {
  it('admin เห็นรายชื่อ RG restricted', async () => {
    // ตั้ง limit ให้ member
    await getDb().prepare('UPDATE users SET daily_limit_satang=100000 WHERE id=$1').run(memberId);
    const r = await admin.agent.get('/admin/rg/restricted');
    expect(r.status).toBe(200);
    expect(r.body.restricted.some(m => m.id === memberId)).toBe(true);
  });
});
