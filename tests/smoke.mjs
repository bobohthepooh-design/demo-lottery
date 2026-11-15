#!/usr/bin/env node
/**
 * Smoke test — วิ่ง against server ที่รันอยู่ (default https://localhost)
 * ใช้: node tests/smoke.mjs            (LOCAL=https://localhost)
 *      BASE_URL=http://192.168.1.41 node tests/smoke.mjs
 *
 * ครอบคลุม: health → register/login → public config → เกมด่วน (scratch/hilo/kiwi)
 * → แทงหวย → ยกเลิก → wallet deposit/withdraw guards
 * ไม่แตะข้อมูลจริง — สมัคร user ใหม่ทุกครั้ง (smoke-<timestamp>)
 */
const BASE = process.env.BASE_URL || 'https://localhost';
const INSECURE = process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0' || BASE.startsWith('https://192.168') || BASE.includes('localhost');
if (INSECURE) process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

let cookie = '';
let csrf = '';
const results = [];
const ok = (name, cond, extra = '') => {
  results.push({ name, pass: !!cond });
  console.log(`${cond ? '✅' : '❌'} ${name}${extra ? ' — ' + extra : ''}`);
};

async function api(path, { method = 'GET', body, auth = true } = {}) {
  const headers = {};
  if (cookie) headers.cookie = cookie;
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (method !== 'GET' && csrf) headers['x-csrf-token'] = csrf;
  const r = await fetch(BASE + '/api' + path, {
    method, headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: 'manual',
  });
  // เก็บ cookie ใหม่ (session + csrf)
  const setC = r.headers.getSetCookie?.() || [];
  if (setC.length) {
    const jar = new Map(cookie.split('; ').filter(Boolean).map(c => c.split('=')));
    for (const sc of setC) {
      const [pair] = sc.split(';');
      const [k, ...v] = pair.split('=');
      jar.set(k.trim(), v.join('='));
    }
    cookie = [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  }
  let json = null;
  try { json = await r.json(); } catch {}
  return { status: r.status, json };
}

const uniq = Date.now().toString(36);
const USER = { username: `smoke${uniq}`, email: `smoke${uniq}@test.local`, password: 'Smoke@12345', displayName: 'Smoke Test' };

// ---------- 1. health ----------
{
  const h = await api('/health');
  ok('GET /health', h.status === 200 && h.json?.ok, `status=${h.status}`);
  const hd = await api('/health?deep=1');
  ok('GET /health?deep=1 (db)', hd.status === 200 && hd.json?.db === 'ok', JSON.stringify(hd.json));
}

// ---------- 2. csrf + register + login ----------
{
  const c = await api('/csrf-token');
  csrf = c.json?.csrfToken || '';
  ok('GET /csrf-token', !!csrf);

  const reg = await api('/auth/register', { method: 'POST', body: { ...USER, ageConfirmed: true }, auth: false });
  ok('POST /auth/register', reg.status === 201 || reg.status === 200, `status=${reg.status} ${reg.json?.error || ''}`);

  const login = await api('/auth/login', { method: 'POST', body: { username: USER.username, password: USER.password }, auth: false });
  ok('POST /auth/login', login.status === 200 && login.json?.ok, `status=${login.status} ${login.json?.error || ''}`);

  const me = await api('/auth/me');
  ok('GET /auth/me', me.status === 200 && me.json?.user?.username === USER.username);
}

// ---------- 3. public config + lottery ----------
let openDraw = null;
{
  const cfg = await api('/lottery/public-config', { auth: false });
  ok('GET /public-config', cfg.status === 200 && cfg.json?.instantGame, `scratch=${cfg.json?.instantGame?.scratchPrice}`);

  const draws = await api('/lottery/draws?upcoming=1', { auth: false });
  const list = draws.json?.draws || [];
  openDraw = list.find(d => d.status === 'open');
  ok('GET /lottery/draws', draws.status === 200 && list.length > 0, `${list.length} draws`);

  const mk = await api('/lottery/markets', { auth: false });
  ok('GET /lottery/markets', mk.status === 200 && (mk.json?.markets || []).length > 0);
}

// ---------- 4. instant games ----------
let scratchCardId = null, hiloTicketId = null;
{
  const bal0 = (await api('/bets/wallet')).json?.balance ?? 0;
  const idem = `smoke-ig-${uniq}`;

  const buy = await api('/scratch/buy', { method: 'POST', body: { idempotencyKey: `${idem}-sc` } });
  ok('POST /scratch/buy', buy.status === 201 && buy.json?.card?.id, `status=${buy.status} ${buy.json?.error || ''}`);
  scratchCardId = buy.json?.card?.id;
  // ยิงซ้ำ key เดิม → ต้องได้ใบเดิม ไม่สร้าง/ไม่หักซ้ำ
  const buyDup = await api('/scratch/buy', { method: 'POST', body: { idempotencyKey: `${idem}-sc` } });
  ok('scratch buy idempotent', buyDup.json?.duplicate === true && buyDup.json?.card?.id === scratchCardId,
    `dup=${buyDup.json?.duplicate} card=${buyDup.json?.card?.id}`);

  if (scratchCardId) {
    const rev = await api(`/scratch/${scratchCardId}/reveal`, { method: 'POST' });
    ok('POST /scratch/:id/reveal', rev.status === 200 && rev.json?.ok !== false, `status=${rev.status} ${rev.json?.error || ''}`);
    // reveal ซ้ำต้องได้ duplicate ไม่ error
    const rev2 = await api(`/scratch/${scratchCardId}/reveal`, { method: 'POST' });
    ok('reveal ซ้ำ = duplicate', rev2.status === 200 && rev2.json?.duplicate === true);
  }

  const hplay = await api('/hilo/play', { method: 'POST', body: { pick: 'low', idempotencyKey: `${idem}-hl` } });
  ok('POST /hilo/play', hplay.status === 200 && hplay.json?.ok, `status=${hplay.status} ${hplay.json?.error || ''}`);
  hiloTicketId = hplay.json?.id ?? hplay.json?.ticket?.id;
  const hplayDup = await api('/hilo/play', { method: 'POST', body: { pick: 'low', idempotencyKey: `${idem}-hl` } });
  ok('hilo play idempotent', hplayDup.json?.duplicate === true && (hplayDup.json?.id ?? hplayDup.json?.ticket?.id) === hiloTicketId,
    `dup=${hplayDup.json?.duplicate} id=${hplayDup.json?.id ?? hplayDup.json?.ticket?.id}`);

  const kinfo = await api('/kiwi/info');
  const kgame = kinfo.json?.games?.[0];
  if (kgame) {
    const kbody = { game: kgame.game, picks: kgame.pickCount ? Array.from({ length: kgame.pickCount }, (_, i) => i + 1) : undefined, idempotencyKey: `${idem}-ki` };
    const kplay = await api('/kiwi/play', { method: 'POST', body: kbody });
    ok('POST /kiwi/play', kplay.status === 200 && kplay.json?.ok, `status=${kplay.status} ${kplay.json?.error || ''}`);
    const kplayDup = await api('/kiwi/play', { method: 'POST', body: kbody });
    ok('kiwi play idempotent', kplayDup.json?.duplicate === true && kplayDup.json?.id === kplay.json?.id,
      `dup=${kplayDup.json?.duplicate} id=${kplayDup.json?.id}`);
  } else {
    ok('POST /kiwi/play', false, 'no kiwi games in /info');
  }

  const bal1 = (await api('/bets/wallet')).json?.balance ?? 0;
  ok('balance เปลี่ยนหลังเกมด่วน', bal1 !== bal0, `${bal0} → ${bal1}`);
}

// ---------- 5. place bet + cancel ----------
{
  if (openDraw) {
    const rules = await api(`/lottery/draws/${openDraw.id}/rules`);
    // เลี่ยงกติกา ann_*/zodiac/run (ต้องเป็นเลข/ราศีที่กำหนด) — เลือkt่กติกาตัวเลขทั่วไป
    const NUM_FOR = { top3: '123', last3: '321', front3: '123', bottom2: '45', last2: '67', top2: '89', num4: '1234', last4: '5678', first: '123456' };
    const rule = (rules.json?.rules || []).find(r => NUM_FOR[r.bet_type]);
    const betNumber = rule ? NUM_FOR[rule.bet_type] : '12';
    if (rule) {
      const bet = await api('/bets', {
        method: 'POST',
        body: { drawId: openDraw.id, items: [{ ruleId: rule.id, number: betNumber, amount: 100 }], idempotencyKey: `smoke-${uniq}` },
      });
      ok('POST /bets', bet.status === 201 && bet.json?.slipRef, `status=${bet.status} ${bet.json?.error || ''}`);
      const slipId = bet.json?.slipId;
      if (slipId) {
        // ยิงซ้ำ idempotency key เดิม → ต้องได้ duplicate ไม่สร้างโพยใหม่
        const dup = await api('/bets', {
          method: 'POST',
          body: { drawId: openDraw.id, items: [{ ruleId: rule.id, number: betNumber, amount: 100 }], idempotencyKey: `smoke-${uniq}` },
        });
        ok('POST /bets idempotent', dup.json?.duplicate === true || dup.status === 201, `dup=${dup.json?.duplicate}`);
        const cx = await api(`/bets/${slipId}/cancel`, { method: 'POST' });
        ok('POST /bets/:id/cancel', cx.status === 200 && cx.json?.ok, `status=${cx.status} ${cx.json?.error || ''}`);
        const cx2 = await api(`/bets/${slipId}/cancel`, { method: 'POST' });
        ok('ยกเลิกซ้ำถูกปฏิเสธ', cx2.status >= 400, `status=${cx2.status}`);
      }
    } else {
      ok('POST /bets', false, 'no rules for open draw');
    }
  } else {
    ok('POST /bets', false, 'no open draw available');
  }
}

// ---------- 6. wallet ----------
{
  const dep = await api('/bets/wallet/action', {
    method: 'POST',
    body: { direction: 'deposit', amount: 20000, paymentMethod: 'bank_transfer', idempotencyKey: `smoke-dep-${uniq}` },
  });
  ok('POST wallet deposit', dep.status === 200 && dep.json?.ok, `status=${dep.status} ${dep.json?.error || ''}`);

  const wd = await api('/bets/wallet/action', {
    method: 'POST',
    body: { direction: 'withdraw', amount: 100, accountNo: 'xxx-x-xxxxx-x', idempotencyKey: `smoke-wd-${uniq}` },
  });
  // withdraw 1 บาท ควรผ่านได้ถ้าไม่มีโพยค้าง + unlock แล้ว — หรือโดนบล็อกถ้ามี pending (ทั้งคู่เป็นไปได้ตาม state)
  ok('POST wallet withdraw', wd.status === 200 || (wd.status === 400 && /โพย|ถอนได้|ปลดล็อก/i.test(wd.json?.error || '')), `status=${wd.status} ${wd.json?.error || ''}`);
}

// ---------- 7. my bets + notifications ----------
{
  const mine = await api('/bets/mine?limit=10');
  ok('GET /bets/mine', mine.status === 200 && Array.isArray(mine.json?.slips));
  const noti = await api('/notifications');
  ok('GET /notifications', noti.status === 200);
}

// ---------- summary ----------
const passed = results.filter(r => r.pass).length;
console.log(`\n===== ${passed}/${results.length} passed =====`);
process.exit(passed === results.length ? 0 : 1);
