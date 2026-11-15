const BASE = 'http://localhost:4000';
const jar = { cookies: {} };
async function req(path, { method = 'GET', body, headers = {} } = {}) {
  const h = { ...headers };
  const ck = Object.entries(jar.cookies).map(([k, v]) => `${k}=${v}`).join('; ');
  if (ck) h.cookie = ck;
  const r = await fetch(BASE + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  for (const c of (r.headers.getSetCookie?.() || [])) {
    const [pair] = c.split(';');
    const i = pair.indexOf('=');
    jar.cookies[pair.slice(0, i).trim()] = pair.slice(i + 1).trim();
  }
  return { status: r.status, json: await r.json().catch(() => null), headers: r.headers };
}
const csrf = (await req('/api/csrf-token')).json.csrfToken;
const login = await req('/api/auth/login', { method: 'POST', headers: { 'x-csrf-token': csrf, 'content-type': 'application/json' }, body: { username: 'test1', password: '87654321' } });
console.log('login', login.status, login.json?.user?.username);

const buy = await req('/api/scratch/buy', { method: 'POST', headers: { 'x-csrf-token': csrf, 'content-type': 'application/json' }, body: {} });
const b = buy.json;
console.log('buy', buy.status, 'card', b.card?.id, 'slip', b.slipRef, 'bal', b.balance, 'grid', b.card?.grid?.join(','));

const rev = await req(`/api/scratch/${b.card.id}/reveal`, { method: 'POST', headers: { 'x-csrf-token': csrf, 'content-type': 'application/json' }, body: {} });
const v = rev.json;
console.log('reveal', rev.status, JSON.stringify(v.outcome), 'bal', v.balance);

const mine = await req('/api/bets/mine?limit=3');
for (const s of mine.json?.slips || []) console.log('slip', s.slip_ref, s.status, s.type_name_th, 'stake', s.total_stake, 'payout', s.total_payout);

const cards = await req('/api/scratch/mine');
console.log('cards', cards.json?.cards?.length, cards.json?.cards?.[0]?.status, cards.json?.cards?.[0]?.slipRef);
