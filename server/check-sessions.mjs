import { getDb } from './src/db/index.js';
const db = getDb();
console.log('--- sessions ล่าสุด 10 ---');
for (const s of db.prepare(`SELECT s.id, s.user_id, u.username, s.created_at, s.expires_at, s.revoked_at, s.mfa_verified
  FROM user_sessions s JOIN users u ON u.id = s.user_id ORDER BY s.rowid DESC LIMIT 10`).all())
  console.log(JSON.stringify(s));
console.log('--- นับ session ---');
console.log('active:', db.prepare(`SELECT COUNT(*) c FROM user_sessions WHERE revoked_at IS NULL AND expires_at > datetime('now')`).get().c);
console.log('expired:', db.prepare(`SELECT COUNT(*) c FROM user_sessions WHERE expires_at <= datetime('now')`).get().c);
console.log('revoked:', db.prepare(`SELECT COUNT(*) c FROM user_sessions WHERE revoked_at IS NOT NULL`).get().c);
console.log('--- locked users ---');
console.log(db.prepare(`SELECT id,username,failed_login_count,locked_until FROM users WHERE locked_until IS NOT NULL`).all());
console.log('--- session per user (active) ---');
console.log(db.prepare(`SELECT user_id, COUNT(*) c FROM user_sessions WHERE revoked_at IS NULL AND expires_at > datetime('now') GROUP BY user_id`).all());
console.log('now(utc):', db.prepare(`SELECT datetime('now') n`).get().n);
