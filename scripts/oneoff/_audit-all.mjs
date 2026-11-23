// Comprehensive system audit — hits every API endpoint (member + admin) and reports status
// Usage: node _audit-all.mjs   (reads LAN_IP from .env)
import { execSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';

const env = fs.readFileSync('.env', 'utf8');
const LAN_IP = (env.match(/LAN_IP=(.+)/) || [])[1]?.trim() || 'localhost';
const BASE = `http://${LAN_IP}`;

// ---------- cookie jar + csrf ----------
function makeClient() {
  const cookies = new Map();
  let csrf = null;
  const jar = (res) => {
    const set = res.headers.getSetCookie?.() || [];
    for (const c of set) {
      const [pair] = c.split(';');
      const i = pair.indexOf('=');
      cookies.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
    }
  };
  const cookieHeader = () => [...cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  async function raw(method, path, body) {
    const headers = { 'content-type': 'application/json' };
    if (cookies.size) headers.cookie = cookieHeader();
    if (method !== 'GET' && csrf) headers['x-csrf-token'] = csrf;
    const res = await fetch(BASE + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    jar(res);
    return res;
  }
  async function api(method, path, body) {
    if (!csrf) {
      const r = await raw('GET', '/api/csrf-token');
      csrf = (await r.json()).csrfToken;
    }
    let res = await raw(method, path, body);
    if (res.status === 403) {
      const j = await res.clone().json().catch(() => ({}));
      if (j.code === 'CSRF_FAILED') {
        csrf = null;
        const r2 = await raw('GET', '/api/csrf-token');
        csrf = (await r2.json()).csrfToken;
        res = await raw(method, path, body);
      }
    }
    return res;
  }
  return { api, raw };
}

// ---------- TOTP (same algo as server lib/totp.js) ----------
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function b32dec(str) {
  let bits = '';
  for (const c of str.toUpperCase().replace(/=+$/, '')) bits += B32.indexOf(c).toString(2).padStart(5, '0');
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}
function totp(secret) {
  const key = b32dec(secret);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 1000 / 30)));
  const h = crypto.createHmac('sha1', key).update(buf).digest();
  const o = h[h.length - 1] & 0x0f;
  return String((((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1e6).padStart(6, '0');
}
function adminSecret() {
  return execSync('docker exec demo-lottery-postgres-1 psql -U lottery -d lottery -t -A -c "SELECT mfa_secret FROM users u JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id WHERE r.name=\'super_admin\' LIMIT 1"').toString().trim();
}

// ---------- runner ----------
const results = [];
async function t(name, fn, expect = [200]) {
  try {
    const r = await fn();
    const status = r.status;
    let body = null;
    const ct = r.headers.get('content-type') || '';
    if (ct.includes('json')) body = await r.json().catch(() => null);
    else await r.text().catch(() => {});
    const ok = expect.includes(status) || (expect.includes('2xx') && status >= 200 && status < 300) || (expect.includes('4xx') && status >= 400 && status < 500);
    results.push({ name, status, ok, err: ok ? null : (body?.error || body?.message || '') });
    console.log(`  ${ok ? '✅' : '❌'} ${name} → ${status}${ok ? '' : '  ' + JSON.stringify(body?.error || body).slice(0, 120)}`);
    return { status, body, res: r };
  } catch (e) {
    results.push({ name, status: 'EXC', ok: false, err: e.message });
    console.log(`  ❌ ${name} → EXCEPTION ${e.message.slice(0, 120)}`);
    return { status: 'EXC', body: null, res: null };
  }
}
const j = (r) => r?.body;

console.log(`Audit → ${BASE}\n`);

// ============ PUBLIC ============
console.log('── PUBLIC ──');
const pub = makeClient();
const typesR = await t('GET /lottery/types', () => pub.api('GET', '/api/lottery/types'));
const types = j(typesR)?.types || [];
const typeId = types[0]?.id;
await t('GET /lottery/public-config', () => pub.api('GET', '/api/lottery/public-config'));
await t('GET /lottery/markets', () => pub.api('GET', '/api/lottery/markets'));
await t('GET /lottery/lucky', () => pub.api('GET', '/api/lottery/lucky'));
await t('GET /lottery/draws', () => pub.api('GET', '/api/lottery/draws'));
const drawsR = await t('GET /lottery/draws (list)', () => pub.api('GET', '/api/lottery/draws'));
const draws = j(drawsR)?.draws || j(drawsR) || [];
const drawId = Array.isArray(draws) ? draws[0]?.id : draws?.draws?.[0]?.id;
await t('GET /lottery/results', () => pub.api('GET', '/api/lottery/results'));
await t('GET /lottery/history?type_code=TH', () => pub.api('GET', '/api/lottery/history?type_code=TH&limit=5'));
await t('GET /lottery/stats?type_code=TH', () => pub.api('GET', '/api/lottery/stats?type_code=TH'));
await t('GET /lottery/check (no draw → 4xx)', () => pub.api('GET', '/api/lottery/check?numbers=123'), [400,404]);
await t('GET /lottery/today', () => pub.api('GET', '/api/lottery/today'));
await t('GET /lottery/winners', () => pub.api('GET', '/api/lottery/winners'));
await t('GET /lottery/fairness/gen?code=TH', () => pub.api('GET', '/api/lottery/fairness/gen?kind=thai&code=TH'));
if (typeId) await t(`GET /lottery/types/${typeId}`, () => pub.api('GET', `/api/lottery/types/${typeId}`));
if (drawId) await t(`GET /lottery/draws/${drawId}`, () => pub.api('GET', `/api/lottery/draws/${drawId}`));
await t('GET /push/vapid-key', () => pub.api('GET', '/api/push/vapid-key'));
await t('GET /public/results?lottery=lao-morning', () => pub.api('GET', '/api/public/results?lottery=lao-morning'));
await t('GET /openapi.json', () => pub.api('GET', '/api/openapi.json'));
await t('GET /auth/me (no auth → 401)', () => pub.api('GET', '/api/auth/me'), [401]);
await t('GET /admin/overview (no auth → 401)', () => pub.api('GET', '/api/admin/overview'), [401]);

// ============ MEMBER ============
console.log('\n── MEMBER ──');
const mem = makeClient();
const uname = 'audit' + Date.now().toString(36);
await t('POST /auth/register', () => mem.api('POST', '/api/auth/register', {
  username: uname, password: 'Audit@12345', displayName: 'Audit User',
  email: `${uname}@test.dev`, ageConfirmed: true,
}), [200, 201]);
await t('POST /auth/login', () => mem.api('POST', '/api/auth/login', { username: uname, password: 'Audit@12345' }));
await t('GET /auth/me', () => mem.api('GET', '/api/auth/me'));
await t('GET /auth/me/export', () => mem.api('GET', '/api/auth/me/export'));
await t('PATCH /auth/me/prefs', () => mem.api('PATCH', '/api/auth/me/prefs', { locale: 'th' }), [200, 400]);
await t('PATCH /auth/me/responsible-gambling', () => mem.api('PATCH', '/api/auth/me/responsible-gambling', { deposit_limit: 100000 }), [200, 400]);
await t('POST /auth/me/confirm-age', () => mem.api('POST', '/api/auth/me/confirm-age'), [200, 400]);
await t('POST /auth/mfa/setup (member → 403 ถูกต้อง)', () => mem.api('POST', '/api/auth/mfa/setup'), [403]);
await t('POST /auth/change-password', () => mem.api('POST', '/api/auth/change-password', { currentPassword: 'Audit@12345', newPassword: 'Audit@12345' }), [200, 400]);
await t('POST /auth/forgot-password', () => mem.api('POST', '/api/auth/forgot-password', { username: uname }), [200, 400]);
await t('GET /bets/mine', () => mem.api('GET', '/api/bets/mine'));
await t('GET /bets/stats', () => mem.api('GET', '/api/bets/stats'));
await t('GET /bets/export', () => mem.api('GET', '/api/bets/export'));
await t('GET /lottery/wallet', () => mem.api('GET', '/api/bets/wallet'));
await t('GET /notifications', () => mem.api('GET', '/api/notifications'));
await t('POST /notifications/read', () => mem.api('POST', '/api/notifications/read', { all: true }), [200, 400]);
await t('GET /chat/thread', () => mem.api('GET', '/api/chat/thread'));
await t('GET /chat/unread', () => mem.api('GET', '/api/chat/unread'));
await t('POST /chat/messages', () => mem.api('POST', '/api/chat/messages', { body: 'audit test' }), [200, 201, 400]);
await t('GET /kiwi/info', () => mem.api('GET', '/api/kiwi/info'));
await t('GET /hilo/mine', () => mem.api('GET', '/api/hilo/mine'));
await t('POST /hilo/play', () => mem.api('POST', '/api/hilo/play', { guess: 'low' }), [200, 201, 400]);
await t('POST /hilo/verify', () => mem.api('POST', '/api/hilo/verify', {}), [200, 400]);
await t('GET /kiwi/mine', () => mem.api('GET', '/api/kiwi/mine'));
await t('POST /kiwi/play', () => mem.api('POST', '/api/kiwi/play', {}), [200, 201, 400]);
await t('POST /kiwi/verify', () => mem.api('POST', '/api/kiwi/verify', {}), [200, 400]);
await t('GET /scratch/mine', () => mem.api('GET', '/api/scratch/mine'));
await t('POST /scratch/buy', () => mem.api('POST', '/api/scratch/buy', {}), [200, 201, 400]);
await t('POST /scratch/verify', () => mem.api('POST', '/api/scratch/verify', {}), [200, 400]);
await t('GET /push/status', () => mem.api('GET', '/api/push/status'));
await t('POST /push/subscribe', () => mem.api('POST', '/api/push/subscribe', { endpoint: 'https://push.test/x', keys: { p256dh: 'x', auth: 'y' } }), [200, 201, 400]);

// bet flow — find an open draw and bet
const memDraws = await mem.api('GET', '/api/lottery/draws');
const md = (await memDraws.json())?.draws || [];
const openDraw = md.find(d => d.status === 'open' || d.status === 'upcoming') || md[0];
if (openDraw) {
  await t(`POST /bets (draw ${openDraw.draw_code || openDraw.id})`, () => mem.api('POST', '/api/bets', {
    draw_id: openDraw.id, bet_type: 'top3', numbers: '123', amount: 10,
  }), [200, 201, 400, 409]);
}
const myBets = await mem.api('GET', '/api/bets/mine');
const mb = await myBets.json().catch(() => ({}));
const slip = (mb.bets || mb.slips || [])[0];
const slipRef = slip?.ref || slip?.slip_ref;
if (slipRef) await t(`GET /bets/slips/${slipRef}`, () => mem.api('GET', `/api/bets/slips/${slipRef}`));
const slipId = slip?.id || slip?.slip_id;
if (slipId) await t(`POST /bets/${slipId}/cancel`, () => mem.api('POST', `/api/bets/${slipId}/cancel`, {}), [200, 400, 409]);
await t('POST /wallet/action deposit', () => mem.api('POST', '/api/bets/wallet/action', { direction: 'deposit', amount: 10000, paymentMethod: 'qr_promptpay' }), [200, 400]);
await t('POST /wallet/action withdraw (blocked by open slips or ok)', () => mem.api('POST', '/api/bets/wallet/action', { direction: 'withdraw', amount: 5000, paymentMethod: 'bank_transfer', accountNo: 'xxx' }), [200, 400, 409]);
await t('DELETE /auth/me (last)', () => mem.api('DELETE', '/api/auth/me', { confirm: true }), [200, 400]);
await t('GET /auth/me after delete → 401', () => mem.api('GET', '/api/auth/me'), [401]);

// ============ ADMIN ============
console.log('\n── ADMIN ──');
const adm = makeClient();
const loginR = await t('POST /auth/login admin', () => adm.api('POST', '/api/auth/login', { username: 'admin', password: 'Admin@Demo123' }));
const loginBody = await loginR.res?.json?.().catch(() => null);
const needsMfa = loginR.body?.requiresMfa || loginR.body?.user?.mfaEnabled;
if (needsMfa) {
  const secret = adminSecret();
  await t('POST /auth/mfa/verify', () => adm.api('POST', '/api/auth/mfa/verify', { code: totp(secret) }));
}
await t('GET /admin/overview', () => adm.api('GET', '/api/admin/overview'));
await t('GET /admin/members', () => adm.api('GET', '/api/admin/members'));
await t('GET /admin/roles', () => adm.api('GET', '/api/admin/roles'));
await t('GET /admin/lottery/types', () => adm.api('GET', '/api/admin/lottery/types'));
await t('GET /admin/lottery/categories', () => adm.api('GET', '/api/admin/lottery/categories'));
await t('GET /admin/lottery/rules', () => adm.api('GET', '/api/admin/lottery/rules'));
await t('GET /admin/lottery/last-results', () => adm.api('GET', '/api/admin/lottery/last-results'));
await t('GET /admin/lottery/rules/export', () => adm.api('GET', '/api/admin/lottery/rules/export'));
await t('GET /admin/draws', () => adm.api('GET', '/api/admin/draws'));
await t('GET /admin/results/status', () => adm.api('GET', '/api/admin/results/status'));
await t('GET /admin/draws/schedule', () => adm.api('GET', '/api/admin/draws/schedule'));
await t('GET /admin/bets', () => adm.api('GET', '/api/admin/bets'));
await t('GET /admin/wallet/transactions', () => adm.api('GET', '/api/admin/wallet/transactions'));
await t('GET /admin/audit', () => adm.api('GET', '/api/admin/audit'));
await t('GET /admin/security-events', () => adm.api('GET', '/api/admin/security-events'));
await t('GET /admin/settings', () => adm.api('GET', '/api/admin/settings'));
await t('GET /admin/promotions/cashback/preview', () => adm.api('GET', '/api/admin/promotions/cashback/preview'));
await t('GET /admin/reports/summary', () => adm.api('GET', '/api/admin/reports/summary'));
await t('GET /admin/reports/reconciliation', () => adm.api('GET', '/api/admin/reports/reconciliation'));
await t('GET /admin/health', () => adm.api('GET', '/api/admin/health'));
await t('GET /admin/chat/unread', () => adm.api('GET', '/api/admin/chat/unread'));
await t('GET /admin/chat/threads', () => adm.api('GET', '/api/admin/chat/threads'));
// validation-error probes (should be 4xx not 5xx)
await t('POST /admin/wallet/adjust (empty → 4xx)', () => adm.api('POST', '/api/admin/wallet/adjust', {}), [400, 422]);
await t('POST /admin/lottery/rules (empty → 4xx)', () => adm.api('POST', '/api/admin/lottery/rules', {}), [400, 422]);
await t('PATCH /admin/lottery/rules/999999 (→ 404)', () => adm.api('PATCH', '/api/admin/lottery/rules/999999', { name_th: 'x' }), [404, 400]);
await t('PUT /admin/settings/nonexistent_key', () => adm.api('PUT', '/api/admin/settings/__nope__', { value: 1 }), [200, 400, 404]);
await t('POST /admin/broadcast (empty → 4xx)', () => adm.api('POST', '/api/admin/broadcast', {}), [400, 422]);
await t('POST /admin/draws (empty → 4xx)', () => adm.api('POST', '/api/admin/draws', {}), [400, 422]);
// member → admin forbidden
const memAdm = makeClient();
await memAdm.api('POST', '/api/auth/login', { username: uname, password: 'Audit@12345' }).catch(() => {});
await t('GET /admin/overview as member → 403', () => memAdm.api('GET', '/api/admin/overview'), [401, 403]);

// ============ SUMMARY ============
const fails = results.filter(r => !r.ok);
console.log(`\n═══ RESULT: ${results.length - fails.length}/${results.length} passed ═══`);
if (fails.length) {
  console.log('\nFAILURES:');
  for (const f of fails) console.log(`  ❌ ${f.name} → ${f.status} ${f.err || ''}`);
  process.exit(1);
}
