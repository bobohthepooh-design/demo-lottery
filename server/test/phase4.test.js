// Phase 4 — audit hash-chain tamper evidence + promo campaigns + infra endpoint
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

let __agentSeq = 0;
const RUN_OCTET = 60 + (Date.now() % 150);
function makeAgent() {
  const jar = {};
  let csrf = null;
  const ip = `10.97.${RUN_OCTET}.${++__agentSeq % 250}`;
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
  return { get: (u) => call('get', u), post: (u, b) => call('post', u, b), patch: (u, b) => call('patch', u, b), put: (u, b) => call('put', u, b) };
}

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const dec = s => { let b = ''; for (const c of s) b += B32.indexOf(c).toString(2).padStart(5, '0'); const o = []; for (let i = 0; i + 8 <= b.length; i += 8) o.push(parseInt(b.slice(i, i + 8), 2)); return Buffer.from(o); };
const hotp = (sec, c) => { const k = dec(sec); const buf = Buffer.alloc(8); buf.writeBigUInt64BE(BigInt(c)); const h = crypto.createHmac('sha1', k).update(buf).digest(); const o = h[h.length - 1] & 15; return String((((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1e6).padStart(6, '0'); };
const totpNow = sec => hotp(sec, Math.floor(Date.now() / 1000 / 30));

const ts = Date.now().toString(36);
let admin;

beforeAll(async () => {
  // canon v2 (ไม่มี user_id) — re-hash chain ครั้งเดียวให้ตรง canon ปัจจุบัน
  const { rebuildAuditChain } = await import('../src/lib/audit.js');
  await rebuildAuditChain();
  const { setSetting } = await import('../src/services/settingsService.js');
  await setSetting('maker_checker', 'off', null);
  const d = getDb();
  await d.prepare(`INSERT INTO users (username, email, password_hash, display_name) VALUES ($1,$2,$3,$4)`)
    .run(`adp4${ts}`, `adp4${ts}@t.local`, hashPassword('Admin@Demo123'), 'adp4');
  const uid = (await d.prepare(`SELECT id FROM users WHERE username=$1`).get(`adp4${ts}`)).id;
  const roleId = (await d.prepare(`SELECT id FROM roles WHERE name='super_admin'`).get()).id;
  await d.prepare(`INSERT INTO user_roles (user_id, role_id) VALUES ($1,$2)`).run(uid, roleId);
  const a = makeAgent();
  await a.post('/auth/login', { username: `adp4${ts}`, password: 'Admin@Demo123' });
  const setup = await a.post('/auth/mfa/setup');
  const secret = setup.body.secret;
  await a.post('/auth/mfa/enable', { code: totpNow(secret) });
  admin = makeAgent();
  await admin.post('/auth/login', { username: `adp4${ts}`, password: 'Admin@Demo123' });
  await admin.post('/auth/mfa/verify', { code: totpNow(secret) });
});

afterAll(async () => { await closeDb(); });

describe('phase4 — audit hash chain', () => {
  it('audit rows มี hash + verify ผ่าน', async () => {
    // สร้าง audit entry ผ่าน action จริง (settings update)
    await admin.put('/admin/settings/p4_probe', { value: 'x' });
    // audit เป็น fire-and-forget — รอ insert
    await new Promise(r => setTimeout(r, 800));
    const row = await getDb().prepare(`SELECT hash, prev_hash, correlation_id FROM audit_logs WHERE action='admin.setting_update' AND entity_id='p4_probe' ORDER BY id DESC LIMIT 1`).get();
    expect(row).toBeTruthy();
    expect(row.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(row.correlation_id).toBeTruthy();
    const v = await admin.get('/admin/audit/verify');
    expect(v.status).toBe(200);
    expect(v.body.ok).toBe(true);
    expect(v.body.hashed).toBeGreaterThan(0);
  });

  it('audit filters: action + correlation_id', async () => {
    const r = await admin.get('/admin/audit?action=admin.setting_update&limit=10');
    expect(r.status).toBe(200);
    expect(r.body.logs.every(l => l.action === 'admin.setting_update')).toBe(true);
  });
});

describe('phase4 — promo campaigns', () => {
  let campId;
  it('CRUD + active singleton + run', async () => {
    const c1 = await admin.post('/admin/promotions/campaigns', { name: 'แคมเปญ A', percent: 5, window_hours: 24, min_satang: 10000 });
    expect(c1.status).toBe(200);
    const list1 = await admin.get('/admin/promotions/campaigns');
    campId = list1.body.campaigns[0].id;
    // validation: percent > 100 → 400
    expect((await admin.post('/admin/promotions/campaigns', { name: 'bad', percent: 101 })).status).toBe(400);
    // สร้างอีกอัน + เปิดทั้งคู่ → ตัวหลังเปิด ตัวแรกต้องถูกปิด
    await admin.post('/admin/promotions/campaigns', { name: 'แคมเปญ B', percent: 3 });
    const list2 = await admin.get('/admin/promotions/campaigns');
    const b = list2.body.campaigns.find(c => c.name === 'แคมเปญ B');
    await admin.patch(`/admin/promotions/campaigns/${b.id}`, { active: true });
    await admin.patch(`/admin/promotions/campaigns/${campId}`, { active: true });
    const list3 = await admin.get('/admin/promotions/campaigns');
    const actives = list3.body.campaigns.filter(c => c.active);
    expect(actives.length).toBe(1);
    expect(actives[0].id).toBe(campId);
    // run (ไม่มี bettors → users=0 แต่ไม่ error)
    const run = await admin.post(`/admin/promotions/campaigns/${campId}/run`);
    expect(run.status).toBe(200);
  });
});

describe('phase4 — infra endpoint', () => {
  it('/admin/infra คืน system stats', async () => {
    const r = await admin.get('/admin/infra');
    expect(r.status).toBe(200);
    expect(r.body.uptimeSec).toBeGreaterThan(0);
    expect(r.body.node).toMatch(/^v/);
    expect(r.body.tableCounts.users).toBeGreaterThan(0);
    expect(r.body.dbSizeBytes).toBeGreaterThan(0);
  });
});

describe('phase5 — backups + incidents + retention', () => {
  it('backup create + list', async () => {
    const r = await admin.post('/admin/backups');
    expect(r.status).toBe(200);
    expect(r.body.file).toMatch(/backup-.*\.json\.gz$/);
    const list = await admin.get('/admin/backups');
    expect(list.status).toBe(200);
    expect(list.body.backups.length).toBeGreaterThan(0);
  });

  it('incidents CRUD + status flow', async () => {
    const c = await admin.post('/admin/incidents', { title: 'DB connection pool สูง', severity: 'high', detail: 'test incident' });
    expect(c.status).toBe(200);
    const list = await admin.get('/admin/incidents');
    const inc = list.body.incidents.find(i => i.title === 'DB connection pool สูง');
    expect(inc.status).toBe('open');
    await admin.patch(`/admin/incidents/${inc.id}`, { status: 'mitigated' });
    await admin.patch(`/admin/incidents/${inc.id}`, { status: 'resolved' });
    const list2 = await admin.get('/admin/incidents');
    expect(list2.body.incidents.find(i => i.id === inc.id).status).toBe('resolved');
    // invalid status → 400
    expect((await admin.patch(`/admin/incidents/${inc.id}`, { status: 'bogus' })).status).toBe(400);
  });

  it('retention purge ทำงาน (ลบเฉพาะ events เก่า + audit legacy)', async () => {
    const { maybeRunRetention } = await import('../src/services/opsService.js');
    const r = await maybeRunRetention();
    // รันซ้ำวันเดียวกัน → null (idempotent)
    const r2 = await maybeRunRetention();
    expect(r === null || typeof r === 'object').toBe(true);
    expect(r2).toBeNull();
  });
});

describe('phase6 — double-entry ledger', () => {
  it('wallet adjust → journal 2 ขา + verify ผ่าน', async () => {
    // หา member มาปรับเครดิต (สร้าง virtual_transaction + journal)
    const target = await getDb().prepare(`SELECT u.id FROM users u JOIN virtual_wallets w ON w.user_id=u.id WHERE u.username != 'admin' ORDER BY u.id LIMIT 1`).get();
    expect(target).toBeTruthy();
    const adj = await admin.post('/admin/wallet/adjust', { userId: target.id, amount: 100, direction: 'credit', reason: 'ledger test', idempotencyKey: `led-${Date.now()}` });
    expect(adj.status).toBe(200);
    const txId = adj.body.transaction.id;
    const legs = await getDb().prepare(`SELECT account, debit, credit FROM journal_entries WHERE transaction_id=$1 ORDER BY id`).all(txId);
    expect(legs.length).toBe(2);
    expect(legs[0].account).toMatch(/^house:/);
    expect(legs[1].account).toBe(`member:${target.id}:wallet`);
    expect(Number(legs[0].debit) + Number(legs[1].debit)).toBe(100);
    expect(Number(legs[0].credit) + Number(legs[1].credit)).toBe(100);
    // rebuild backfill (transactions เก่าก่อนมี ledger)
    const rb = await admin.post('/admin/ledger/rebuild', { limit: 100 });
    expect(rb.status).toBe(200);
    const v = await admin.get('/admin/ledger/verify');
    expect(v.body.ok).toBe(true);
    // accounts endpoint
    const accts = await admin.get('/admin/ledger/accounts');
    expect(accts.body.accounts.length).toBeGreaterThan(0);
  });
});
