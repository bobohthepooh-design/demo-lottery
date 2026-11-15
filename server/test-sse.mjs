import crypto from 'node:crypto';

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function b32d(s){let bits='';for(const c of s.toUpperCase().replace(/=+$/,'')){bits+=B32.indexOf(c).toString(2).padStart(5,'0');}const by=[];for(let i=0;i+8<=bits.length;i+=8)by.push(parseInt(bits.slice(i,i+8),2));return Buffer.from(by);}
function hotp(secret,counter){const key=b32d(secret);const buf=Buffer.alloc(8);buf.writeBigUInt64BE(BigInt(counter));const h=crypto.createHmac('sha1',key).update(buf).digest();const o=h[h.length-1]&0x0f;const code=((h[o]&0x7f)<<24)|(h[o+1]<<16)|(h[o+2]<<8)|h[o+3];return String(code%1e6).padStart(6,'0');}

const base = 'http://localhost:4000';
const cookies = new Map();
function storeCookies(r) {
  for (const x of (r.headers.getSetCookie?.() || [])) {
    const [p] = x.split(';'); const i = p.indexOf('=');
    cookies.set(p.slice(0,i).trim(), p.slice(i+1).trim());
  }
}
const cookieStr = () => [...cookies.entries()].map(([k,v])=>`${k}=${v}`).join('; ');
async function req(path, opts={}) {
  const r = await fetch(base+path, { ...opts, headers: { 'Content-Type':'application/json', Cookie: cookieStr(), ...(opts.headers||{}) } });
  storeCookies(r);
  return r;
}

const ac = new AbortController();
const sse = await fetch(base+'/api/events', { signal: ac.signal });
console.log('SSE status', sse.status);
const reader = sse.body.getReader();
const dec = new TextDecoder();
let buf=''; const got=[];
(async()=>{ while(true){ const {done,value}=await reader.read(); if(done)break; buf+=dec.decode(value,{stream:true}); const parts=buf.split('\n\n'); buf=parts.pop(); for(const p of parts){ if(p.includes('event: update')) got.push(p); } } })();

const csrfR = await req('/api/csrf-token');
const { csrfToken } = await csrfR.json();

const login = await req('/api/auth/login', { method:'POST', headers:{'x-csrf-token':csrfToken}, body: JSON.stringify({ username:'admin', password:'Admin@Demo123' }) });
const lj = await login.json();
console.log('login:', login.status, JSON.stringify(lj).slice(0,200));
if (lj.requiresMfa) {
  const code = hotp('EAAD622WTLYK5DYTKAVEKGHI24T2TGML', Math.floor(Date.now()/1000/30));
  const v = await req('/api/auth/mfa/verify', { method:'POST', headers:{'x-csrf-token':csrfToken}, body: JSON.stringify({ code }) });
  console.log('mfa:', v.status, (await v.text()).slice(0,200));
}

const put = await req('/api/admin/settings/test_sse_ping', { method:'PUT', headers:{'x-csrf-token':csrfToken}, body: JSON.stringify({ value: Date.now() }) });
console.log('put:', put.status, (await put.text()).slice(0,200));

await new Promise(r=>setTimeout(r,2000));
ac.abort();
console.log('SSE events received:', got.length);
got.slice(0,3).forEach(g=>console.log(g));
process.exit(0);
