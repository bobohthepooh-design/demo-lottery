import { getDb } from './src/db/index.js';
const db = getDb();
const lao = /[\u0E80-\u0EFF]/;
const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all().map(r => r.name);
for (const t of tables) {
  const cols = db.prepare(`PRAGMA table_info(${t})`).all().map(c => c.name);
  const textCols = cols.filter(c => {
    const type = db.prepare(`PRAGMA table_info(${t})`).all().find(x => x.name === c)?.type || '';
    return /TEXT|text|CHAR|BLOB/i.test(type) || true; // scan ทุก column ที่เป็น string ได้
  });
  try {
    const rows = db.prepare(`SELECT rowid AS _r, * FROM ${t}`).all();
    for (const r of rows) {
      for (const c of cols) {
        const v = r[c];
        if (typeof v === 'string' && lao.test(v)) {
          console.log(`${t}.${c} [rowid ${r._r}] = ${v.slice(0, 150)}`);
        }
      }
    }
  } catch (e) { /* skip */ }
}
console.log('done');
