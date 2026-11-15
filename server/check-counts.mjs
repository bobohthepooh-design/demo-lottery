import { getDb } from './src/db/index.js';
const db = getDb();
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map(r => r.name);
console.log('TABLES:', tables.join(', '));
for (const t of tables) {
  try {
    const c = db.prepare(`SELECT COUNT(*) c FROM "${t}"`).get().c;
    if (c > 0) console.log(`${t}: ${c}`);
  } catch {}
}
