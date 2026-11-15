import { getDb } from './src/db/index.js';
import { verifyPassword } from './src/lib/password.js';
const db = getDb();
const u = db.prepare(`SELECT password_hash FROM users WHERE username='admin'`).get();
console.log('Admin@Demo123 ->', verifyPassword('Admin@Demo123', u.password_hash));
console.log('admin ->', verifyPassword('admin', u.password_hash));
process.exit(0);
