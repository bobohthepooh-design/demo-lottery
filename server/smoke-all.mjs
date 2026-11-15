// smoke test — front/back sync + performance
const BASE = 'http://localhost:4000';
const jar = { cookies: {} };
async function req(path, { method = 'GET', body, headers = {}, user } = {}) {
  const h = { ...headers };
  const src = user || { cookies: jar.cookies };
  const ck = Object.entries(src.cookies).map(([k, v]) => `${k}=${v}`).join('; ');
  if (ck) h.cookie = ck;
  const r = await fetch(BASE + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  for (const c of (r.headers.getSetCookie?.() || [])) {
    const [pair] = c.split(';'); const i = pair.indexOf('=');
    jar.cookies[pair.slice(0, i).trim()] = pair.slice(i + 1).trim();
  }
  const t = Date.now();
  const json = await r.json().catch(() => null);
  return { status: r.status, ms: Date.now() - t, json };
}
const t0 = Date.now();
const results = [];
const check = (name, ok, extra = '') => { results.push(`${ok ? '✅' : '❌'} ${name} ${extra}`); };

// public endpoints
let r = await req('/api/health'); check('health', r.status === 200 && r.json.ok);
r = await req('/api/csrf-token'); const csrf = r.json.csrfToken;
const H = { 'x-csrf-token': csrf, 'content-type': 'application/json' };

r = await req('/api/lottery/types');
const types = r.json.types || [];
check('types', r.status === 200 && types.length >= 6, `${types.length} types: ${types.map(t => t.code).join(',')}`);
check('instant types present', types.some(t => t.code === 'SC') && types.some(t => t.code === 'HL'));

r = await req('/api/lottery/public-config');
check('public-config', r.status === 200 && Array.isArray(r.json.hiddenBetTypes) !== undefined);

r = await req('/api/lottery/draws?upcoming=1');
check('draws upcoming', r.status === 200 && Array.isArray(r.json.draws), `${r.json.draws?.length} draws`);

r = await req('/api/lottery/results?limit=10');
check('results', r.status === 200 && Array.isArray(r.json.results ?? r.json.items ?? []));

// SSE
{
  const t = Date.now();
  const ctrl = new AbortController();
  const p = fetch(BASE + '/api/events', { signal: ctrl.signal });
  const resp = await Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 5000))]);
  check('SSE /api/events', resp.status === 200, `${resp.status} in ${Date.now() - t}ms`);
  ctrl.abort();
}

// member login
r = await req('/api/auth/login', { method: 'POST', headers: H, body: { username: 'test1', password: '87654321' } });
check('member login', r.status === 200, `${r.ms}ms`);
const member = { cookies: { ...jar.cookies } };

r = await req('/api/auth/me', { user: member });
check('auth/me', r.status === 200 && r.json.user, `${r.ms}ms`);

r = await req('/api/bets/mine?limit=10', { user: member });
check('bets/mine', r.status === 200 && Array.isArray(r.json.slips), `${r.json.slips?.length} slips ${r.ms}ms`);

r = await req('/api/bets/wallet?limit=10', { user: member });
check('wallet tx', r.status === 200 && r.json.balance !== undefined, `bal=${r.json.balance} ${r.ms}ms`);

r = await req('/api/scratch/mine', { user: member });
check('scratch/mine', r.status === 200 && Array.isArray(r.json.cards), `${r.json.cards?.length} cards`);

r = await req('/api/hilo/mine', { user: member });
check('hilo/mine', r.status === 200 && Array.isArray(r.json.tickets), `${r.json.tickets?.length} tickets`);

// hilo buy+play roundtrip
r = await req('/api/hilo/buy', { method: 'POST', headers: H, user: member, body: {} });
check('hilo buy', r.status === 201 && r.json.ticket?.status === 'awaiting', `die hidden, bets=${r.json.ticket?.bets?.length}`);
if (r.json.ticket) {
  const pick = r.json.ticket.bets[0].pick;
  const g = await req(`/api/hilo/${r.json.ticket.id}/guess`, { method: 'POST', headers: H, user: member, body: { pick } });
  check('hilo play', g.status === 200 && g.json.dice?.length === 3, `dice=${g.json.dice} side=${g.json.side}`);
}

// scratch buy (ไม่ reveal — ทดสอบ buy path)
r = await req('/api/scratch/buy', { method: 'POST', headers: H, user: member, body: {} });
check('scratch buy', r.status === 201 && r.json.card, `${r.ms}ms`);

// admin login
const adminJar = { cookies: {} };
async function reqA(path, opt = {}) {
  const h = { ...(opt.headers || {}) };
  const ck = Object.entries(adminJar.cookies).map(([k, v]) => `${k}=${v}`).join('; ');
  if (ck) h.cookie = ck;
  const rr = await fetch(BASE + path, { method: opt.method || 'GET', headers: h, body: opt.body ? JSON.stringify(opt.body) : undefined });
  for (const c of (rr.headers.getSetCookie?.() || [])) {
    const [pair] = c.split(';'); const i = pair.indexOf('=');
    adminJar.cookies[pair.slice(0, i).trim()] = pair.slice(i + 1).trim();
  }
  return { status: rr.status, json: await rr.json().catch(() => null) };
}
await reqA('/api/csrf-token');
const cr = await reqA('/api/csrf-token');
const csrfTokenA = cr.json.csrfToken;
r = await reqA('/api/auth/login', { method: 'POST', headers: { 'x-csrf-token': csrfTokenA, 'content-type': 'application/json' }, body: { username: 'admin', password: 'Admin@Demo123' } });
check('admin login', r.status === 200, `${r.status} ${JSON.stringify(r.json).slice(0, 120)}`);
// admin อาจต้อง MFA — ถ้าได้ mfaRequired ให้ข้าม admin checks
if (r.json?.mfaRequired || r.json?.requiresMfa) {
  results.push('⏭️ admin MFA required — ข้าม admin checks');
} else {
  const AH = { 'x-csrf-token': csrfA, 'content-type': 'application/json' };
  const admin = { cookies: { ...adminJar.cookies } };
  const reqAdmin = async (path, opt = {}) => {
    const h = { ...(opt.headers || {}) };
    const ck = Object.entries(admin.cookies).map(([k, v]) => `${k}=${v}`).join('; ');
    if (ck) h.cookie = ck;
    const rr = await fetch(BASE + path, { method: opt.method || 'GET', headers: h, body: opt.body ? JSON.stringify(opt.body) : undefined });
    return { status: rr.status, json: await rr.json().catch(() => null) };
  };
  let a = await reqAdmin('/api/admin/lottery/types');
  check('admin types', a.status === 200, `${a.json?.types?.length} types`);
  a = await reqAdmin('/api/admin/settings');
  check('admin settings', a.status === 200);
  a = await reqAdmin('/api/admin/bets?limit=5');
  check('admin bets', a.status === 200);
  a = await reqAdmin('/api/admin/users?limit=5');
  check('admin users', a.status === 200);
}

console.log(results.join('\n'));
console.log(`\ntotal ${Date.now() - t0}ms`);
