// E2E: register → bet on LAD draw (last2) → verify debit → settle via admin not tested here
const BASE = 'http://localhost:4000/api';
const cookies = new Map();
const ch = () => [...cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
const st = r => { for (const c of r.headers.getSetCookie?.() || r.headers['set-cookie'] || []) { const [p] = c.split(';'); const i = p.indexOf('='); cookies.set(p.slice(0, i).trim(), p.slice(i + 1).trim()); } };
let csrf = null;
const g = async () => { if (!csrf) { const r = await fetch(BASE + '/csrf-token'); st(r); csrf = (await r.json()).csrfToken; } return csrf; };
const req = async (m, p, b) => { const t = m !== 'GET' ? await g() : null; const r = await fetch(BASE + p, { method: m, headers: { 'Content-Type': 'application/json', Cookie: ch(), ...(t ? { 'x-csrf-token': t } : {}) }, body: b ? JSON.stringify(b) : undefined }); st(r); return { status: r.status, json: await r.json().catch(() => null) }; };

const u = 'lad' + Date.now().toString(36);
console.log('reg', (await req('POST', '/auth/register', { username: u, email: u + '@t.com', password: 'Password123' })).status);
console.log('login', (await req('POST', '/auth/login', { username: u, password: 'Password123' })).status);
const rules = (await req('GET', '/lottery/draws/26/rules')).json.rules;
console.log('LAD rules:', rules.map(r => `${r.bet_type}(d${r.digits},x${r.payout_multiplier})`).join(', '));
const bet = await req('POST', '/bets', { drawId: 26, items: [{ ruleId: rules[0].id, number: '12', amount: 5000 }] });
console.log('bet:', bet.status, JSON.stringify(bet.json));
// wrong-digit bet should fail
const bad = await req('POST', '/bets', { drawId: 26, items: [{ ruleId: rules[0].id, number: '123', amount: 500 }] });
console.log('bad digits:', bad.status, bad.json?.error);
