import { getDb } from './src/db/index.js';
const db = getDb();
const t = db.prepare(`UPDATE lottery_types SET name_th='หวยไทย' WHERE code='TH'`).run();
console.log('lottery_types updated:', t.changes);
// scan all text columns for the phrase
const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all().map(r => r.name);
for (const tb of tables) {
  const cols = db.prepare(`PRAGMA table_info(${tb})`).all().filter(c => c.type === 'TEXT');
  for (const c of cols) {
    try {
      const n = db.prepare(`SELECT COUNT(*) n FROM ${tb} WHERE ${c.name} LIKE '%รัฐบาลไทย%'`).get().n;
      if (n) console.log(`${tb}.${c.name}: ${n} rows`);
    } catch {}
  }
}
process.exit(0);
