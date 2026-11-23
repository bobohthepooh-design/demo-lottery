// Maker-checker approval flow tests — admin back office phase 1
// ต้องมี TEST_DATABASE_URL (throwaway PG — app auto-migrate+seed ตอน boot)
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
function makeAgent() {
  const jar = {};
  let csrf = null;
  const ip = `10.98.${Math.floor(++__agentSeq / 250)}.${__agentSeq % 250}`;
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
    const res = await req.send(body === undefined ? undefined : JSON.stringify(body));
    store(res);
    return res;
  }
  return { get: (u) => call('get', u), post: (u, b) => call('post', u, b), patch: (u, b) => call('patch', u, b), put: (u, b) => call('put', u, b), delete: (u) => call('delete', u) };
}

// TOTP helper — เหมือน payments.test.js
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const dec = s => { let b = ''; for (const c of s) b += B32.indexOf(c).toString(2).padStart(5, '0'); const o = []; for (let i = 0; i + 8 <= b.length; i += 8) o.push(parseInt(b.slice(i, i + 8), 2)); return Buffer.from(o); };
const hotp = (sec, c) => { const k = dec(sec); const buf = Buffer.alloc(8); buf.writeBigUInt64BE(BigInt(c)); const h = crypto.createHmac('sha1', k).update(buf).digest(); const o = h[h.length - 1] & 15; return String((((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1e6).padStart(6, '0'); };
const totpNow = sec => hotp(sec, Math.floor(Date.now() / 1000 / 30));

async function makeAdmin(username, roleName) {
  const d = getDb();
  await d.prepare(`INSERT INTO users (username, email, password_hash, display_name) VALUES ($1,$2,$3,$4)`)
    .run(username, `${username}@t.local`, hashPassword('Admin@Demo123'), username);
  const uid = (await d.prepare(`SELECT id FROM users WHERE username=$1`).get(username)).id;
  const roleId = (await d.prepare(`SELECT id FROM roles WHERE name=$1`).get(roleName)).id;
  await d.prepare(`INSERT INTO user_roles (user_id, role_id) VALUES ($1,$2)`).run(uid, roleId);
  const a = makeAgent();
  await a.post('/auth/login', { username, password: 'Admin@Demo123' });
  const setup = await a.post('/auth/mfa/setup');
  const secret = setup.body.secret;
  await a.post('/auth/mfa/enable', { code: totpNow(secret) });
  const a2 = makeAgent();
  await a2.post('/auth/login', { username, password: 'Admin@Demo123' });
  const v = await a2.post('/auth/mfa/verify', { code: totpNow(secret) });
  expect(v.status).toBe(200);
  return { agent: a2, userId: uid };
}

const ts = Date.now().toString(36);
let member, maker, checker, memberId, adjId1;

beforeAll(async () => {
  // บังคับ maker-checker เสมอในไฟล์นี้ — ไม่พึ่ง auto mode (กันไฟล์อื่นมาแย่ง setting)
  await setSetting('maker_checker', 'always', null);

  await makeAgent().post('/auth/register', { username: `mm${ts}`, email: `mm${ts}@t.local`, password: 'Password123', ageConfirmed: true, termsAccepted: true });
  member = makeAgent();
  await member.post('/auth/login', { username: `mm${ts}`, password: 'Password123' });
  memberId = (await getDb().prepare(`SELECT id FROM users WHERE username=$1`).get(`mm${ts}`)).id;

  maker = await makeAdmin(`makr${ts}`, 'super_admin');
  checker = await makeAdmin(`chkr${ts}`, 'admin');
});

afterAll(async () => { await closeDb(); });

const memberBalance = async () => (await member.get('/bets/wallet')).body.balance;
const submitAdjust = async (agent, amount, key) => {
  const r = await agent.post('/admin/wallet/adjust', { userId: memberId, amount, direction: 'credit', reason: 'ทดสอบ maker-checker', idempotencyKey: key });
  expect(r.status).toBe(200);
  expect(r.body.pendingApproval).toBe(true);
  return r.body.approval.id;
};

describe('approvals — maker-checker', () => {
  it('wallet.adjust → pending approval, เงินยังไม่ขยับ', async () => {
    const before = await memberBalance();
    adjId1 = await submitAdjust(maker.agent, 5000, `adj-${ts}-1`);
    expect(adjId1).toBeTruthy();
    expect(await memberBalance()).toBe(before);
  });

  it('maker อนุมัติคำขอตัวเองไม่ได้ (SELF_APPROVAL)', async () => {
    const r = await maker.agent.post(`/admin/approvals/${adjId1}/approve`, {});
    expect(r.status).toBe(403);
    expect(r.body.code).toBe('SELF_APPROVAL');
  });

  it('checker approve → execute จริง เงินเข้า wallet', async () => {
    const before = await memberBalance();
    const r = await checker.agent.post(`/admin/approvals/${adjId1}/approve`, { note: 'ok' });
    expect(r.status).toBe(200);
    expect(r.body.request.status).toBe('executed');
    expect(await memberBalance()).toBe(before + 5000);
  });

  it('approve ซ้ำ → 409 (กัน replay)', async () => {
    const r = await checker.agent.post(`/admin/approvals/${adjId1}/approve`, {});
    expect(r.status).toBe(409);
  });

  it('reject ต้องมีเหตุผล', async () => {
    const id = await submitAdjust(maker.agent, 1000, `adj-${ts}-2`);
    const noNote = await checker.agent.post(`/admin/approvals/${id}/reject`, {});
    expect(noNote.status).toBe(400);
    const r = await checker.agent.post(`/admin/approvals/${id}/reject`, { note: 'ไม่สมเหตุสมผล' });
    expect(r.status).toBe(200);
    expect(r.body.request.status).toBe('rejected');
  });

  it('maker ยกเลิกคำขอ pending ของตัวเองได้', async () => {
    const id = await submitAdjust(maker.agent, 1000, `adj-${ts}-3`);
    const r = await maker.agent.post(`/admin/approvals/${id}/cancel`);
    expect(r.status).toBe(200);
    expect(r.body.request.status).toBe('cancelled');
  });

  it('member ธรรมดาเข้าถึง approvals ไม่ได้', async () => {
    expect((await member.get('/admin/approvals')).status).toBe(403);
  });
});
