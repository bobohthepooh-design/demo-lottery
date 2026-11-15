import { getDb } from './src/db/index.js';
import { verifyTotp, otpauthUri } from './src/lib/totp.js';
import crypto from 'node:crypto';

// replicate hotp to print current code
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function b32d(s){let bits='';for(const c of s.toUpperCase().replace(/=+$/,'')){bits+=B32.indexOf(c).toString(2).padStart(5,'0');}const by=[];for(let i=0;i+8<=bits.length;i+=8)by.push(parseInt(bits.slice(i,i+8),2));return Buffer.from(by);}
function hotp(secret,counter){const key=b32d(secret);const buf=Buffer.alloc(8);buf.writeBigUInt64BE(BigInt(counter));const h=crypto.createHmac('sha1',key).update(buf).digest();const o=h[h.length-1]&0x0f;const code=((h[o]&0x7f)<<24)|(h[o+1]<<16)|(h[o+2]<<8)|h[o+3];return String(code%1e6).padStart(6,'0');}

const db = getDb();
const u = db.prepare(`SELECT username, mfa_secret, mfa_enabled FROM users WHERE username='admin'`).get();
console.log('mfa_enabled:', u.mfa_enabled);
const counter = Math.floor(Date.now()/1000/30);
console.log('current TOTP code:', hotp(u.mfa_secret, counter));
console.log('otpauth URI:', otpauthUri(u.mfa_secret, u.username));
process.exit(0);
