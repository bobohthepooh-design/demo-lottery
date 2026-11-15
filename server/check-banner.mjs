import { getDb } from './src/db/index.js';
const db = getDb();
const r = db.prepare(`SELECT value FROM system_settings WHERE key='homepage_banner'`).get();
console.log(r.value);
process.exit(0);
