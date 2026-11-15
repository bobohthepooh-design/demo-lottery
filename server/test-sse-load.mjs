// SSE client ค้างไว้ + admin ยิง settings broadcast → วัด latency ของ member API ระหว่าง/หลัง broadcast
const BASE = 'http://localhost:4000';
const jar = { cookies: {} };
async function req(path, { method = 'GET', body, headers = {} } = {}) {
  const h = { ...headers };
  const ck = Object.entries(jar.cookies).map(([k, v]) => `${k}=${v}`).join('; ');
  if (ck) h.cookie = ck;
  const t0 = Date.now();
  const r = await fetch(BASE + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  const ms = Date.now() - t0;
  for (const c of (r.headers.getSetCookie?.() || [])) {
    const [pair] = c.split(';');
    const i = pair.indexOf('=');
    jar.cookies[pair.slice(0, i).trim()] = pair.slice(i + 1).trim();
  }
  return { status: r.status, ms, json: await r.json().catch(() => null), headers: r.headers };
}
const csrf = (await req('/api/csrf-token')).json.csrfToken;
const H = { 'x-csrf-token': csrf, 'content-type': 'application/json' };
await req('/api/auth/login', { method: 'POST', headers: H, body: { username: 'test1', password: '87654321' } });

// เปิด SSE ค้าง (เหมือน browser)
const es = await fetch(BASE + '/api/events', { headers: { cookie: Object.entries(jar.cookies).map(([k,v])=>k+'='+v).join('; ') } });
console.log('SSE', es.status);
// อ่าน body แบบ stream ค้างไว้
const reader = es.body.getReader();
reader.read().then(() => {});

// admin login + mfa + PUT (แยก jar)
const ajar = { cookies: {} };
async function areq(path, opt = {}) {
  const h = { ...(opt.headers||{}) };
  const ck = Object.entries(ajar.cookies).map(([k,v])=>k+'='+v).join('; ');
  if (ck) h.cookie = ck;
  const r = await fetch(BASE+path, {method:opt.method||'GET', headers:h, body:opt.body?JSON.stringify(opt.body):undefined});
  for (const c of (r.headers.getSetCookie?.()||[])) { const [p]=c.split(';'); const i=p.indexOf('='); ajar.cookies[p.slice(0,i).trim()]=p.slice(i+1).trim(); }
  return {status:r.status, json:await r.json().catch(()=>null)};
}
const acsrf = (await areq('/api/csrf-token')).json.csrfToken;
const AH = {'x-csrf-token':acsrf,'content-type':'application/json'};
await areq('/api/auth/login',{method:'POST',headers:AH,body:{username:'admin',password:'Admin@Demo123'}});
const { getDb } = await import('./src/db/index.js');
const admin = getDb().prepare(`SELECT mfa_secret FROM users WHERE username='admin'`).get();
function b32d(s){const A='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';let b=0,v=0,o=[];for(const c of s){v=(v<<5)|A.indexOf(c);b+=5;if(b>=8){b-=8;o.push((v>>b)&255)}}return Buffer.from(o)}
const { createHmac } = await import('node:crypto');
const key=b32d(admin.mfa_secret), ctr=Math.floor(Date.now()/1000/30), buf=Buffer.alloc(8); buf.writeBigUInt64BE(BigInt(ctr));
const h=createHmac('sha1',key).update(buf).digest(), off=h[19]&15;
const code=String(((h.readUInt32BE(off)&0x7fffffff)%1000000)).padStart(6,'0');
await areq('/api/auth/mfa/verify',{method:'POST',headers:AH,body:{code}});

// วัด member latency ก่อน-ระหว่าง-หลัง PUT หลายครั้งติดกัน (จำลอง admin กดหลาย checkbox)
for (let i=0;i<3;i++){
  const putP = areq('/api/admin/settings/bet_menu_hidden_types',{method:'PUT',headers:AH,body:{value:['TH','LA']}});
  // ระหว่าง broadcast วัด member endpoints
  const m1 = await req('/api/lottery/public-config');
  const m2 = await req('/api/lottery/draws?upcoming=1');
  const m3 = await req('/api/bets/mine');
  await putP;
  console.log(`round${i}: PUT concurrent — public-config ${m1.ms}ms, draws ${m2.ms}ms, bets ${m3.ms}ms`);
}
// restore
await areq('/api/admin/settings/bet_menu_hidden_types',{method:'PUT',headers:AH,body:{value:[]}});
console.log('done');
process.exit(0);
