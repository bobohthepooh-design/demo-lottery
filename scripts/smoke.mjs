// Smoke test: register → login → csrf → admin create draw → member bet → settle → check payout
const BASE = 'http://localhost:4000/api';
const cookies = new Map();
function cookieHeader() { return [...cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; '); }
function storeCookies(res) {
  const all = res.headers.getSetCookie ? res.headers.getSetCookie() : [res.headers.get('set-cookie')].filter(Boolean);
  for (const c of all) {
    const [pair] = c.split(';');
    const i = pair.indexOf('=');
    cookies.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
  }
}
function clearCookies() { cookies.clear(); }

async function req(method, path, body, headers = {}) {
  const csrf = !['GET', 'HEAD', 'OPTIONS'].includes(method) ? await getCsrf() : null;
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookieHeader(),
      ...(csrf ? { 'x-csrf-token': csrf } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  storeCookies(res);
  let json = null;
  try { json = await res.json(); } catch {}
  return { status: res.status, json };
}

let csrfToken = null;
async function getCsrf() {
  if (!csrfToken) {
    const r = await fetch(BASE + '/csrf-token', { headers: { Cookie: cookieHeader() } });
    storeCookies(r);
    csrfToken = (await r.json()).csrfToken;
  }
  return csrfToken;
}

const out = [];
function check(name, cond, extra = '') {
  out.push(`${cond ? 'PASS' : 'FAIL'} ${name} ${extra}`);
  if (!cond) process.exitCode = 1;
}

// 1. health
let r = await req('GET', '/health');
check('health', r.status === 200);

// 2. register member
const uname = 'member' + Date.now().toString(36);
r = await req('POST', '/auth/register', { username: uname, email: `${uname}@test.local`, password: 'Password123', displayName: 'Test Member' });
check('register', r.status === 201, JSON.stringify(r.json));

// 3. login member
r = await req('POST', '/auth/login', { username: uname, password: 'Password123' });
check('login member', r.status === 200 && r.json.user.username === uname, JSON.stringify(r.json));

// 4. me + balance (initial credit 10000 satang = 100 THB)
r = await req('GET', '/auth/me');
check('me balance=10000', r.json?.balance === 10000, `balance=${r.json?.balance}`);

// 5. admin login (fresh jar)
clearCookies(); csrfToken = null;
r = await req('POST', '/auth/login', { username: 'admin', password: 'Admin@Demo123' });
check('login admin', r.status === 200, JSON.stringify(r.json));

// admin needs MFA? admin has no mfa_enabled → requiresMfa false. Admin routes require mfa_verified — admin without MFA can't access admin API!
// Check: requireMfaVerified blocks session.mfa_verified=0. So admin must setup+enable MFA first.
r = await req('POST', '/auth/mfa/setup');
check('mfa setup', r.status === 200 && r.json.secret, JSON.stringify(r.json));

// generate TOTP code for secret
import crypto from 'node:crypto';
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function b32dec(s){let b='';for(const c of s){b+=B32.indexOf(c).toString(2).padStart(5,'0')}const o=[];for(let i=0;i+8<=b.length;i+=8)o.push(parseInt(b.slice(i,i+8),2));return Buffer.from(o)}
function hotp(sec,c){const k=b32dec(sec);const buf=Buffer.alloc(8);buf.writeBigUInt64BE(BigInt(c));const h=crypto.createHmac('sha1',k).update(buf).digest();const o=h[h.length-1]&15;return String((((h[o]&127)<<24)|(h[o+1]<<16)|(h[o+2]<<8)|h[o+3])%1e6).padStart(6,'0')}
const secret = r.json.secret;
const code = hotp(secret, Math.floor(Date.now()/1000/30));
r = await req('POST', '/auth/mfa/enable', { code });
check('mfa enable', r.status === 200, JSON.stringify(r.json));

// re-login to get mfa_verified session
clearCookies(); csrfToken = null;
r = await req('POST', '/auth/login', { username: 'admin', password: 'Admin@Demo123' });
check('admin relogin requiresMfa', r.json?.requiresMfa === true);
// session id = dl_session cookie value; verify mfa via API needs session token = cookie value
r = await req('POST', '/auth/mfa/verify', { code: hotp(secret, Math.floor(Date.now()/1000/30)) });
check('mfa verify', r.status === 200, JSON.stringify(r.json));

// 6. admin create draw (type TH id=1)
const now = Date.now();
const drawAt = new Date(now - 3600e3).toISOString().slice(0,19).replace('T',' ');
const closeAt = new Date(now + 3600e3).toISOString().slice(0,19).replace('T',' ');
r = await req('POST', '/admin/draws', { lottery_type_id: 1, draw_code: 'TEST-' + Date.now(), draw_at: drawAt, close_at: closeAt });
check('admin create draw', r.status === 201, JSON.stringify(r.json));
const drawId = r.json?.id;

r = await req('PATCH', `/admin/draws/${drawId}/status`, { status: 'open' });
check('open draw', r.status === 200, JSON.stringify(r.json));

// 7. member place bet — need rule id for 2top of type 1
clearCookies(); csrfToken = null;
r = await req('POST', '/auth/login', { username: uname, password: 'Password123' });
check('member relogin', r.status === 200);

r = await req('GET', '/lottery/types/1');
const rule2top = r.json.rules.find(x => x.bet_type === '2top');
const rule3top = r.json.rules.find(x => x.bet_type === '3top');
check('rules loaded', !!rule2top && !!rule3top);

r = await req('POST', '/bets', { drawId, items: [
  { ruleId: rule2top.id, number: '42', amount: 1000 },
  { ruleId: rule3top.id, number: '123', amount: 500 },
]});
check('place bet', r.status === 201, JSON.stringify(r.json));
const slipRef = r.json?.slipRef;
check('balance deducted', r.json?.balance === 8500, `balance=${r.json?.balance}`);

// 8. insufficient balance bet
r = await req('POST', '/bets', { drawId, items: [{ ruleId: rule2top.id, number: '43', amount: 999999 }] });
check('insufficient credit rejected', r.status === 400, JSON.stringify(r.json));

// 9. admin settle draw: top3=12345 → top3 result '345'? winning_numbers {top3:'345', bottom2:'67'}
// bet 2top '42' tail of top3 '345' → '45' no. bet 3top '123' vs top3 '345' tail '345' no. Let's craft win:
clearCookies(); csrfToken = null;
r = await req('POST', '/auth/login', { username: 'admin', password: 'Admin@Demo123' });
// need fresh mfa verify? session new → mfa_verified=0 → admin API 403. verify again:
await req('POST', '/auth/mfa/verify', { code: hotp(secret, Math.floor(Date.now()/1000/30)) });

r = await req('POST', `/admin/draws/${drawId}/settle`, { winning_numbers: { top3: '542', bottom2: '67' } });
check('settle draw', r.status === 200, JSON.stringify(r.json));
// 2top '42' vs top3 '542' tail '42' → WIN (1000*100=100000). 3top '123' vs '542' no.

// 10. member check balance & slip
clearCookies(); csrfToken = null;
r = await req('POST', '/auth/login', { username: uname, password: 'Password123' });
r = await req('GET', '/auth/me');
check('balance after win', r.json?.balance === 10000 - 1500 + 100000, `balance=${r.json?.balance}`);
r = await req('GET', `/bets/slips/${slipRef}`);
check('slip partial', r.json?.slip?.status === 'partial', r.json?.slip?.status);

console.log(out.join('\n'));
