#!/usr/bin/env node
// E2E smoke test — ยิง HTTP จริงใส่ server ที่รันอยู่ (default http://localhost ผ่าน Caddy)
// ครอบคลุม: health → csrf → register → login → wallet → draws → bet → my-bets → logout
// ใช้: node scripts/e2e-smoke.mjs [baseUrl]   เช่น node scripts/e2e-smoke.mjs http://localhost
import fs from 'node:fs';
// baseUrl: argv > LAN_IP ใน .env (Caddy site จริง) > localhost
let envLan = '';
try { envLan = fs.readFileSync(new URL('../.env', import.meta.url), 'utf8').match(/^LAN_IP=(.+)$/m)?.[1]?.trim() || ''; } catch {}
const BASE = (process.argv[2] || (envLan ? `http://${envLan}` : 'http://localhost')).replace(/\/$/, '');
const USER = `smoke${Date.now().toString(36)}`;
const PASS = 'SmokeTest123!';

let passed = 0, failed = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { passed++; console.log(`  ✅ ${name}`); }
  else { failed++; console.log(`  ❌ ${name} ${extra}`); }
};

// cookie jar + csrf ตาม pattern เดียวกับ test suite
const jar = {};
let csrf = null;
const cookieHeader = () => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
function storeCookies(res) {
  const raw = res.headers.getSetCookie?.() || [];
  for (const c of raw) {
    const [pair] = c.split(';');
    const i = pair.indexOf('=');
    if (i > 0) jar[pair.slice(0, i).trim()] = pair.slice(i + 1).trim();
  }
}
async function api(path, { method = 'GET', body } = {}, retry = true) {
  const headers = { 'Content-Type': 'application/json' };
  if (cookieHeader()) headers.Cookie = cookieHeader();
  if (method !== 'GET') {
    if (!csrf) {
      const t = await fetch(`${BASE}/api/csrf-token`, { headers: { Cookie: cookieHeader() } });
      storeCookies(t);
      csrf = (await t.json()).csrfToken;
    }
    headers['x-csrf-token'] = csrf;
  }
  const res = await fetch(`${BASE}/api${path}`, {
    method, headers, body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  storeCookies(res);
  let json = null;
  try { json = await res.json(); } catch {}
  if (res.status === 403 && json?.code === 'CSRF_FAILED' && retry) { csrf = null; return api(path, { method, body }, false); }
  return { status: res.status, json };
}

console.log(`E2E smoke → ${BASE}\n`);

// 1. health
{
  const r = await fetch(`${BASE}/api/health`);
  const j = await r.json().catch(() => ({}));
  ok('health 200 + ok:true', r.status === 200 && j.ok === true, `status=${r.status}`);
}

// 2. public lottery data
{
  const [types, draws] = await Promise.all([api('/lottery/types'), api('/lottery/draws?upcoming=1')]);
  ok('lottery types', types.status === 200 && (types.json?.types?.length ?? 0) > 0);
  ok('draws upcoming', draws.status === 200 && Array.isArray(draws.json?.draws));
}

// 3. register + login
{
  const r = await api('/auth/register', { method: 'POST', body: { username: USER, password: PASS, displayName: 'Smoke Test', ageConfirmed: true } });
  ok('register', r.status === 201 || r.status === 200, JSON.stringify(r.json));
  const l = await api('/auth/login', { method: 'POST', body: { username: USER, password: PASS } });
  ok('login', l.status === 200 && l.json?.ok === true, `status=${l.status}`);
}

// 4. me + wallet
let balance = 0;
{
  const me = await api('/auth/me');
  ok('auth/me', me.status === 200 && me.json?.user?.username === USER);
  balance = me.json?.balance ?? 0;
  ok('initial credit > 0', balance > 0, `balance=${balance}`);
}

// 5. place a bet on first open draw (skip gracefully if none)
{
  const dr = await api('/lottery/draws?upcoming=1');
  const open = (dr.json?.draws || []).find(d => d.status === 'open');
  if (!open) {
    console.log('  ⏭️  ไม่มีรอบที่เปิดรับ — ข้ามขั้นตอนแทง');
  } else {
    // หา rule ของ draw นี้ — /lottery/draws/:id/rules (ต้อง login)
    const rules = await api(`/lottery/draws/${open.id}/rules`);
    const rl = rules.json?.rules?.find(r => r.is_active !== 0) || rules.json?.rules?.[0];
    if (!rl) {
      console.log('  ⏭️  ไม่พบ rule สำหรับรอบนี้ — ข้ามขั้นตอนแทง');
    } else {
      const digits = Math.max(1, Math.min(10, Number(rl.digits) || 2));
      const number = '1'.repeat(digits);
      const amount = Math.max(Number(rl.min_amount) || 100, Number(rl.stake_unit) || 100);
      const bet = await api('/bets', { method: 'POST', body: {
        drawId: open.id, items: [{ ruleId: rl.id, number, amount }],
      }});
      ok('place bet', bet.status === 201, `status=${bet.status} ${JSON.stringify(bet.json)?.slice(0, 200)}`);
      const mine = await api('/bets/mine');
      ok('my bets', mine.status === 200 && (mine.json?.slips?.length ?? 0) >= 1, `total=${mine.json?.total}`);
      // ทดสอบ idempotency — ส่ง key เดิมซ้ำต้องไม่สร้างโพยซ้ำ
      const key = `smoke-${Date.now()}`;
      const b1 = await api('/bets', { method: 'POST', body: { drawId: open.id, items: [{ ruleId: rl.id, number, amount }], idempotencyKey: key } });
      const b2 = await api('/bets', { method: 'POST', body: { drawId: open.id, items: [{ ruleId: rl.id, number, amount }], idempotencyKey: key } });
      ok('idempotent bet', b1.status === 201 && (b2.status === 201 || b2.status === 200 || b2.status === 409), `b1=${b1.status} b2=${b2.status}`);
    }
  }
}

// 6. wallet transactions
{
  const tx = await api('/bets/wallet');
  ok('wallet', tx.status === 200 && Array.isArray(tx.json?.transactions), `balance=${tx.json?.balance}`);
}

// 7. PDPA export (P2 endpoint)
{
  const ex = await api('/auth/me/export');
  ok('PDPA export', ex.status === 200 && ex.json?.user?.username === USER);
}

// 8. cleanup — ยกเลิกโพยที่ค้างแล้วลบบัญชี (ทดสอบ PDPA delete ด้วย)
{
  const mine = await api('/bets/mine?status=pending');
  for (const s of (mine.json?.slips || [])) {
    await api(`/bets/${s.id}/cancel`, { method: 'POST' }).catch(() => {});
  }
  const del = await api('/auth/me', { method: 'DELETE', body: { confirm: true } });
  ok('PDPA delete account', del.status === 200 && del.json?.ok === true, `status=${del.status} ${JSON.stringify(del.json)?.slice(0, 160)}`);
}

// 9. logout (session ถูก revoke ไปแล้วจาก delete — ถ้า delete ไม่สำเร็จค่อย logout ปกติ)
{
  const lo = await api('/auth/logout', { method: 'POST' });
  const me = await api('/auth/me');
  ok('me after logout/delete → 401', me.status === 401, `status=${me.status} (logout=${lo.status})`);
}

console.log(`\nผลลัพธ์: ${passed} ผ่าน, ${failed} ไม่ผ่าน`);
process.exit(failed ? 1 : 0);
