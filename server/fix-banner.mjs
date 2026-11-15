import { getDb } from './src/db/index.js';
const db = getDb();
const r = db.prepare(`SELECT value FROM system_settings WHERE key='homepage_banner'`).get();
const nv = r.value.replaceAll('หวยหวยไทย', 'หวยไทย');
db.prepare(`UPDATE system_settings SET value=? WHERE key='homepage_banner'`).run(nv);
console.log(nv);
process.exit(0);
