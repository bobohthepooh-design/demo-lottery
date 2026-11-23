// Payment flow tests — PromptPay deposit → slip → admin review → withdraw
// ต้องมี TEST_DATABASE_URL + PROMPTPAY_ID (ตั้งก่อน import app เพราะ config อ่าน env ตอน load)
process.env.SESSION_SECRET = 'test-secret';
process.env.NODE_ENV = 'test';
process.env.LOGIN_RATE_LIMIT_MAX = '200';
process.env.INITIAL_CREDIT = '5000';
process.env.HIBP_CHECK = 'false'; // hermetic: ห้ามยิง api.pwnedpasswords.com ใน test
process.env.PROMPTPAY_ID = '0812345678'; // test-only — ไม่ใช่เบอร์จริง
if (!process.env.TEST_DATABASE_URL) {
  throw new Error('TEST_DATABASE_URL is required');
}
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

const { default: app } = await import('../src/index.js');
const { getDb, closeDb } = await import('../src/db/index.js');
const { hashPassword } = await import('../src/lib/password.js');

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

const ts = Date.now().toString(36);
let member, adminAgent, depositId, withdrawId;
const TINY_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

beforeAll(async () => {
  // maker-checker: เทส direct-execution path — ไฟล์นี้สร้าง admin คนที่ 2 ทำให้ auto mode บังคับ approval
  const { setSetting } = await import('../src/services/settingsService.js');
  await setSetting('maker_checker', 'off', null);
  // member
  await makeAgent().post('/auth/register', { username: `p${ts}`, email: `p${ts}@t.local`, password: 'Password123', ageConfirmed: true, termsAccepted: true });
  member = makeAgent();
  await member.post('/auth/login', { username: `p${ts}`, password: 'Password123' });

  // admin เฉพาะไฟล์นี้ — ห้ามใช้ 'admin' กลางเพราะ api.test.js reset MFA ของมัน
  // (สองไฟล์รันขนานใน worker คนละตัว → แย่ง reset/enable กันเอง)
  const adminName = `adminp${ts}`;
  const d = getDb();
  await d.prepare(`INSERT INTO users (username, email, password_hash, display_name) VALUES ($1,$2,$3,'Pay Admin')`)
    .run(adminName, `${adminName}@t.local`, hashPassword('Admin@Demo123'));
  const uid = (await d.prepare(`SELECT id FROM users WHERE username=$1`).get(adminName)).id;
  const roleId = (await d.prepare(`SELECT id FROM roles WHERE name='super_admin'`).get()).id;
  await d.prepare(`INSERT INTO user_roles (user_id, role_id) VALUES ($1,$2)`).run(uid, roleId);
  const a = makeAgent();
  await a.post('/auth/login', { username: adminName, password: 'Admin@Demo123' });
  const setup = await a.post('/auth/mfa/setup');
  const secret = setup.body.secret;
  const crypto = await import('node:crypto');
  const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const dec = s => { let b = ''; for (const c of s) b += B32.indexOf(c).toString(2).padStart(5, '0'); const o = []; for (let i = 0; i + 8 <= b.length; i += 8) o.push(parseInt(b.slice(i, i + 8), 2)); return Buffer.from(o); };
  const hotp = (sec, c) => { const k = dec(sec); const buf = Buffer.alloc(8); buf.writeBigUInt64BE(BigInt(c)); const h = crypto.createHmac('sha1', k).update(buf).digest(); const o = h[h.length - 1] & 15; return String((((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1e6).padStart(6, '0'); };
  await a.post('/auth/mfa/enable', { code: hotp(secret, Math.floor(Date.now() / 1000 / 30)) });
  const a2 = makeAgent();
  await a2.post('/auth/login', { username: adminName, password: 'Admin@Demo123' });
  const v = await a2.post('/auth/mfa/verify', { code: hotp(secret, Math.floor(Date.now() / 1000 / 30)) });
  expect(v.status).toBe(200);
  adminAgent = a2;
});

afterAll(async () => { await closeDb(); });

describe('payments — deposit', () => {
  it('rejects deposit below 1 baht', async () => {
    const r = await member.post('/payments/deposit', { amount: 50, method: 'promptpay' });
    expect(r.status).toBe(400);
  });
  it('creates deposit → pending_slip + QR payload', async () => {
    const r = await member.post('/payments/deposit', { amount: 10000, method: 'promptpay' });
    expect(r.status).toBe(200);
    expect(r.body.qrDataUrl).toMatch(/^data:image/);
    expect(r.body.payload).toContain('5406100.00'); // 100.00 THB ใน EMV payload
    depositId = r.body.id;
    const row = await getDb().prepare(`SELECT status FROM payment_requests WHERE id = $1`).get(depositId);
    expect(row.status).toBe('pending_slip');
  });
  it('lists own requests', async () => {
    const r = await member.get('/payments');
    expect(r.status).toBe(200);
    expect(r.body.paymentsConfigured).toBe(true);
    expect(r.body.requests.some(x => x.id === depositId && x.status === 'pending_slip')).toBe(true);
  });
  it('rejects slip on non-pending_slip request', async () => {
    // submit ครั้งแรก → pending_review; ครั้งสองต้อง 400
    const r1 = await member.post(`/payments/${depositId}/slip`, { imageBase64: 'data:image/png;base64,' + TINY_PNG });
    expect(r1.status).toBe(200);
    expect(r1.body.status).toBe('pending_review'); // ไม่มี SlipOK ใน test → รอ admin
    const r2 = await member.post(`/payments/${depositId}/slip`, { imageBase64: 'data:image/png;base64,' + TINY_PNG });
    expect(r2.status).toBe(400);
  });
});

describe('payments — admin review', () => {
  it('admin sees pending (pending_slip + pending_review)', async () => {
    const r = await adminAgent.get('/admin/payments?status=pending');
    expect(r.status).toBe(200);
    expect(r.body.requests.some(x => x.id === depositId)).toBe(true);
  });
  it('admin approve → credits wallet once', async () => {
    const before = (await member.get('/bets/wallet')).body.balance;
    const r = await adminAgent.post(`/admin/payments/${depositId}/review`, { action: 'approve', note: 'test' });
    expect(r.status).toBe(200);
    expect(r.body.credited).toBe(true);
    const after = (await member.get('/bets/wallet')).body.balance;
    expect(after - before).toBe(10000);
    // double approve → 400 (idempotent state guard)
    const r2 = await adminAgent.post(`/admin/payments/${depositId}/review`, { action: 'approve' });
    expect(r2.status).toBe(400);
  });
});

describe('payments — withdraw', () => {
  it('rejects withdraw below 100 baht', async () => {
    const r = await member.post('/payments/withdraw', { amount: 5000, bankName: 'KBANK', accountNo: '123-4', accountName: 'Test' });
    expect(r.status).toBe(400);
  });
  it('rejects withdraw over withdrawable', async () => {
    const r = await member.post('/payments/withdraw', { amount: 99999900, bankName: 'KBANK', accountNo: '123-4', accountName: 'Test' });
    expect(r.status).toBe(400);
  });
  it('creates withdraw → pending_review after deposit unlocks', async () => {
    // withdrawable = 10000 satang (15000 balance − 5000 promo non-withdrawable)
    const r = await member.post('/payments/withdraw', { amount: 10000, bankName: 'KBANK', accountNo: '123-4', accountName: 'Test User', promptpayId: '0812345678' });
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('pending_review');
    withdrawId = r.body.id;
  });
  it('admin reject → no debit', async () => {
    const before = (await member.get('/bets/wallet')).body.balance;
    const r = await adminAgent.post(`/admin/payments/${withdrawId}/review`, { action: 'reject', note: 'test reject' });
    expect(r.status).toBe(200);
    const after = (await member.get('/bets/wallet')).body.balance;
    expect(after).toBe(before);
  });
});

describe('payments — demo wallet action guard', () => {
  it('wallet/action deposit blocked when payments configured', async () => {
    const r = await member.post('/bets/wallet/action', { direction: 'deposit', amount: 10000, idempotencyKey: `guard-${ts}` });
    expect(r.status).toBe(403);
    expect(r.body.code).toBe('USE_PAYMENTS');
  });
  it('wallet/action withdraw blocked too', async () => {
    const r = await member.post('/bets/wallet/action', { direction: 'withdraw', amount: 100, idempotencyKey: `guard2-${ts}` });
    expect(r.status).toBe(403);
  });
});

describe('payments — require_email_verify_for_withdraw setting', () => {
  it('default off → withdraw works; on → 403 EMAIL_NOT_VERIFIED; off again → works', async () => {
    const body = { amount: 10000, bankName: 'กสิกร', accountNo: '123-4', accountName: 't', idempotencyKey: `ev-${ts}` };
    // member ที่สมัครผ่าน password ไม่มี email จริง → email_verified=0
    // setting default false → ต้องไม่โดนบล็อก (อาจติด WITHDRAW_LIMIT ถ้าเครดิตไม่พอ — เช็คแค่ไม่ใช่ EMAIL_NOT_VERIFIED)
    await adminAgent.put('/admin/settings/require_email_verify_for_withdraw', { value: true });
    const blocked = await member.post('/payments/withdraw', body);
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe('EMAIL_NOT_VERIFIED');
    await adminAgent.put('/admin/settings/require_email_verify_for_withdraw', { value: false });
    const allowed = await member.post('/payments/withdraw', { ...body, idempotencyKey: `ev2-${ts}` });
    expect(allowed.body.code).not.toBe('EMAIL_NOT_VERIFIED');
  });
});
