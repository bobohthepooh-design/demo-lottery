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
  return { status: r.status, json: await r.json().catch(() => null) };
}
const csrf = (await req('/api/csrf-token')).json.csrfToken;
const H = { 'x-csrf-token': csrf, 'content-type': 'application/json' };
await req('/api/auth/login', { method: 'POST', headers: H, body: { username: 'test1', password: '87654321' } });

const picks = ['low', 'high', 'eleven'];
let tally = {};
for (let i = 0; i < 9; i++) {
  const b = await req('/api/hilo/buy', { method: 'POST', headers: H, body: {} });
  const t = b.json.ticket;
  const pick = picks[i % 3];
  const g = await req(`/api/hilo/${t.id}/guess`, { method: 'POST', headers: H, body: { pick } });
  const v = g.json;
  const won = v.side === pick;
  console.log(`pick=${pick} dice=${v.dice} sum=${v.sum} side=${v.side} result=${won ? 'WIN' : 'LOSE'} payout=${v.payout} mult=${v.mult} bal=${v.balance}`);
  tally[won ? 'win' : 'lose'] = (tally[won ? 'win' : 'lose'] || 0) + 1;
}
console.log('tally:', JSON.stringify(tally));
// invalid pick test
const b2 = await req('/api/hilo/buy', { method: 'POST', headers: H, body: {} });
const bad = await req(`/api/hilo/${b2.json.ticket.id}/guess`, { method: 'POST', headers: H, body: { pick: 'seven' } });
console.log('invalid pick →', bad.status, bad.json?.error);
const mine = await req('/api/hilo/mine');
console.log('latest ticket:', JSON.stringify(mine.json.tickets[0]).slice(0, 300));
