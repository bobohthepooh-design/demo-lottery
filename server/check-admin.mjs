import { getDb } from './src/db/index.js';
const db = getDb();
console.log(db.prepare(`PRAGMA table_info(users)`).all().map(c=>c.name).join(', '));
const u = db.prepare(`SELECT * FROM users WHERE username='admin'`).get();
console.log({...u, password_hash: u.password_hash?.slice(0,30)+'...'});
process.exit(0);
