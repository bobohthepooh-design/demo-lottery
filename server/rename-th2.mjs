import { getDb } from './src/db/index.js';
const db = getDb();
const rows = db.prepare(`SELECT key, value FROM system_settings WHERE value LIKE '%รัฐบาลไทย%'`).all();
for (const r of rows) {
  const nv = r.value.replaceAll('รัฐบาลไทย', 'หวยไทย');
  db.prepare(`UPDATE system_settings SET value=? WHERE key=?`).run(nv, r.key);
  console.log('updated', r.key);
}
process.exit(0);
