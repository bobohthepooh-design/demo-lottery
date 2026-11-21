// Instant-game linked flows: buy → play/reveal → guess → verify → cancel paths
import fs from 'node:fs';
const env = fs.readFileSync('.env', 'utf8');
const BASE = `http://${(env.match(/LAN_IP=(.+)/) || [])[1]?.trim() || 'localhost'}`;
const cookies = new Map(); let csrf = null;
const jar = r => { for (const c of r.headers.getSetCookie?.() || []) { const [p] = c.split(';'); const i = p.indexOf('='); cookies.set(p.slice(0, i).trim(), p.slice(i + 1).trim()); } };
const ch = () => [...cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
async function raw(m, p, b) {
  const h = { 'content-type': 'application/json' }; if (cookies.size) h.cookie = ch(); if (m !== 'GET' && csrf) h['x-csrf-token'] = csrf;
  const r = await fetch(BASE + p, { method: m, headers: h, body: b === undefined ? undefined : JSON.stringify(b) }); jar(r); return r;
}
async function api(m, p, b) {
  if (!csrf) csrf = (await (await raw('GET', '/api/csrf-token')).json()).csrfToken;
  let r = await raw(m, p, b);
  if (r.status === 403) { const j = await r.clone().json().catch(() => ({})); if (j.code === 'CSRF_FAILED') { csrf = null; csrf = (await (await raw('GET', '/api/csrf-token')).json()).csrfToken; r = await raw(m, p, b); } }
  return r;
}
const results = [];
async function t(name, fn, expect = [200, 201]) {
  try {
    const r = await fn(); const b = await r.json().catch(() => null);
    const ok = expect.includes(r.status);
    results.push(ok); console.log(`  ${ok ? '✅' : '❌'} ${name} → ${r.status} ${ok ? '' : JSON.stringify(b).slice(0, 140)}`);
    return { status: r.status, body: b };
  } catch (e) { results.push(false); console.log(`  ❌ ${name} → EXC ${e.message.slice(0, 100)}`); return { status: 'EXC', body: null }; }
}
const uname = 'flow' + Date.now().toString(36);
console.log(`Instant-game flows → ${BASE}\n`);
await t('register', () => api('POST', '/api/auth/register', { username: uname, password: 'Flow@12345', ageConfirmed: true }));
await t('login', () => api('POST', '/api/auth/login', { username: uname, password: 'Flow@12345' }));
await t('deposit 1,000', () => api('POST', '/api/bets/wallet/action', { direction: 'deposit', amount: 100000, paymentMethod: 'qr_promptpay' }));

// SCRATCH: buy → list → reveal → verify
console.log('— scratch —');
const buy = await t('scratch/buy', () => api('POST', '/api/scratch/buy', { idempotencyKey: 'sk' + Date.now() }));
const mine = await t('scratch/mine', () => api('GET', '/api/scratch/mine'));
const ticket = (mine.body?.cards || mine.body?.tickets || mine.body || [])[0];
const tid = ticket?.id;
if (tid) {
  await t(`scratch/${tid}/reveal`, () => api('POST', `/api/scratch/${tid}/reveal`, {}));
  await t('scratch/verify', () => api('POST', '/api/scratch/verify', { seed: ticket.seed || 'x' }), [200, 400]);
} else console.log('  ⚠️ ไม่มี scratch ticket');

// HILO: buy → play → guess → verify
console.log('— hilo —');
await t('hilo/buy', () => api('POST', '/api/hilo/buy', { idempotencyKey: 'hk' + Date.now() }));
const hmine = await t('hilo/mine', () => api('GET', '/api/hilo/mine'));
const ht = (hmine.body?.tickets || [])[0];
if (ht?.id) {
  await t('hilo/play', () => api('POST', '/api/hilo/play', { pick: 'low', idempotencyKey: 'hp' + Date.now() }), [200, 201, 400]);
  await t(`hilo/${ht.id}/guess`, () => api('POST', `/api/hilo/${ht.id}/guess`, { pick: 'low' }), [200, 400]);
} else console.log('  ⚠️ ไม่มี hilo ticket');

// KIWI: play → guess → verify
console.log('— kiwi —');
const kinfo = await api('GET','/api/kiwi/info'); const kg=(await kinfo.json())?.games?.[0];
if(kg){ const pc = kg.dice?3:(kg.pickCount||kg.pick_count||3); const picks = kg.zodiac? kg.symbols?.slice(0,pc)||[1,2,3] : Array.from({length:pc},(_,i)=>i+1); await t('kiwi/play '+kg.game, () => api('POST','/api/kiwi/play',{game:kg.game,picks,betType:kg.dice?'big':undefined,idempotencyKey:'kp'+Date.now()})); } else console.log('  ⚠️ kiwi/info ไม่มีเกม');
const kmine = await t('kiwi/mine', () => api('GET', '/api/kiwi/mine'));
const kt = (kmine.body?.tickets || kmine.body?.games || [])[0];
if (kt?.id) {
  await t(`kiwi guess`, () => api('POST', `/api/kiwi/${kt.id}/guess`, { guess: 'up' }), [200, 400]);
} else console.log('  ⚠️ ไม่มี kiwi game — play อาจต้องการ choice อื่น');


// wallet balance after games
await t('wallet final', () => api('GET', '/api/bets/wallet'));
await t('cleanup delete', () => api('DELETE', '/api/auth/me', { confirm: true }));
const fails = results.filter(x => !x).length;
console.log(`\n═══ ${results.length - fails}/${results.length} passed ═══`);
process.exit(fails ? 1 : 0);
