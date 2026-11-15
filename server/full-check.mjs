// Full-system smoke test: public + member + admin endpoints
import crypto from 'node:crypto';
const B32='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const b32d=s=>{let b='';for(const c of s.toUpperCase().replace(/=+$/,''))b+=B32.indexOf(c).toString(2).padStart(5,'0');const o=[];for(let i=0;i+8<=b.length;i+=8)o.push(parseInt(b.slice(i,i+8),2));return Buffer.from(o)};
const hotp=(s,c)=>{const k=b32d(s),buf=Buffer.alloc(8);buf.writeBigUInt64BE(BigInt(c));const h=crypto.createHmac('sha1',k).update(buf).digest();const o=h[h.length-1]&0xf;return String((((h[o]&0x7f)<<24)|(h[o+1]<<16)|(h[o+2]<<8)|h[o+3])%1e6).padStart(6,'0')};

const base='http://localhost:4000';
const cookies=new Map();
const store=r=>{for(const x of (r.headers.getSetCookie?.()||[])){const[p]=x.split(';');const i=p.indexOf('=');cookies.set(p.slice(0,i).trim(),p.slice(i+1).trim());}};
const cs=()=>[...cookies.entries()].map(([k,v])=>`${k}=${v}`).join('; ');
async function req(path,opts={}){const r=await fetch(base+path,{...opts,headers:{'Content-Type':'application/json',Cookie:cs(),...(opts.headers||{})}});store(r);return r;}
const j=async r=>{const t=await r.text();try{return JSON.parse(t)}catch{return{_raw:t.slice(0,120)}}};

let pass=0,fail=0;
const check=async(name,path,opts={},expect=200)=>{
  try{const r=await req(path,opts);const body=await j(r);
    const ok=r.status===expect;
    ok?pass++:fail++;
    console.log(`${ok?'PASS':'FAIL'} [${r.status}] ${name} ${ok?'':JSON.stringify(body).slice(0,140)}`);
    return{r,body};
  }catch(e){fail++;console.log(`FAIL [ERR] ${name}: ${e.message}`);return{r:null,body:null};}
};

// ---- public ----
await check('health','/api/health');
await check('csrf','/api/csrf-token');
const {body:csrfB}=await check('types','/api/lottery/types');
console.log('   types:',(csrfB.types||[]).map(t=>t.code).join(','));
await check('public-config','/api/lottery/public-config');
await check('draws upcoming','/api/lottery/draws?upcoming=1');
const {body:resB}=await check('results','/api/lottery/results');
console.log('   results count:',(resB.results||[]).length);
await check('markets','/api/lottery/markets');

// ---- member ----
const csrf=(await j(await req('/api/csrf-token'))).csrfToken;
await check('member login','/api/auth/login',{method:'POST',headers:{'x-csrf-token':csrf},body:JSON.stringify({username:'test1',password:'87654321'})});
await check('auth/me','/api/auth/me');
await check('bets/mine','/api/bets/mine?limit=5');
await check('bets/stats','/api/bets/stats');
await check('bets/wallet','/api/bets/wallet?limit=5');

// ---- admin ----
// separate cookie jar for admin
const adminCookies=new Map();
const acs=()=>[...adminCookies.entries()].map(([k,v])=>`${k}=${v}`).join('; ');
const areq=async(path,opts={})=>{const r=await fetch(base+path,{...opts,headers:{'Content-Type':'application/json',Cookie:acs(),...(opts.headers||{})}});for(const x of (r.headers.getSetCookie?.()||[])){const[p]=x.split(';');const i=p.indexOf('=');adminCookies.set(p.slice(0,i).trim(),p.slice(i+1).trim());}return r;};
const aj=async r=>{const t=await r.text();try{return JSON.parse(t)}catch{return{_raw:t.slice(0,120)}}};

const acsrf=(await aj(await areq('/api/csrf-token'))).csrfToken;
const alogin=await areq('/api/auth/login',{method:'POST',headers:{'x-csrf-token':acsrf},body:JSON.stringify({username:'admin',password:'Admin@Demo123'})});
const alj=await aj(alogin);
console.log(`${alogin.status===200?'PASS':'FAIL'} [${alogin.status}] admin login ${alogin.status===200?'':JSON.stringify(alj).slice(0,140)}`);
if(alj.requiresMfa){
  const code=hotp('EAAD622WTLYK5DYTKAVEKGHI24T2TGML',Math.floor(Date.now()/1000/30));
  const v=await areq('/api/auth/mfa/verify',{method:'POST',headers:{'x-csrf-token':acsrf},body:JSON.stringify({code})});
  console.log(`${v.status===200?'PASS':'FAIL'} [${v.status}] admin mfa verify`);
}
const acheck=async(name,path,opts={},expect=200)=>{
  try{const r=await areq(path,opts);const body=await aj(r);
    const ok=r.status===expect; ok?pass++:fail++;
    console.log(`${ok?'PASS':'FAIL'} [${r.status}] ${name} ${ok?'':JSON.stringify(body).slice(0,140)}`);
    return{r,body};
  }catch(e){fail++;console.log(`FAIL [ERR] ${name}: ${e.message}`);return{r:null,body:null};}
};
await acheck('admin overview','/api/admin/overview');
await acheck('admin draws','/api/admin/draws');
await acheck('admin lottery types','/api/admin/lottery/types');
await acheck('admin rules','/api/admin/lottery/rules');
await acheck('admin categories','/api/admin/lottery/categories');
await acheck('admin bets','/api/admin/bets?limit=5');
await acheck('admin members','/api/admin/members');
await acheck('admin roles','/api/admin/roles');
await acheck('admin settings','/api/admin/settings');
await acheck('admin wallet tx','/api/admin/wallet/transactions?limit=5');
await acheck('admin audit','/api/admin/audit?limit=5');
await acheck('admin security','/api/admin/security-events?limit=5');
await acheck('admin reports','/api/admin/reports/summary');

console.log(`\n===== RESULT: ${pass} pass, ${fail} fail =====`);
process.exit(fail?1:0);
