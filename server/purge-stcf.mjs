import { getDb } from './src/db/index.js';
const db = getDb();
const types = db.prepare(`SELECT id, code FROM lottery_types WHERE code IN ('ST','CF')`).all();
for (const t of types) {
  const drawIds = db.prepare(`SELECT id FROM lottery_draws WHERE lottery_type_id=?`).all(t.id).map(r => r.id);
  const ph = drawIds.map(() => '?').join(',');
  if (drawIds.length) {
    db.prepare(`DELETE FROM bet_items WHERE draw_id IN (${ph})`).run(...drawIds);
    db.prepare(`DELETE FROM bet_slips WHERE draw_id IN (${ph})`).run(...drawIds);
    db.prepare(`DELETE FROM lottery_results WHERE draw_id IN (${ph})`).run(...drawIds);
    db.prepare(`DELETE FROM lottery_draws WHERE lottery_type_id=?`).run(t.id);
  }
  db.prepare(`DELETE FROM lottery_rules WHERE lottery_type_id=?`).run(t.id);
  db.prepare(`DELETE FROM lottery_categories WHERE lottery_type_id=?`).run(t.id);
  db.prepare(`DELETE FROM lottery_types WHERE id=?`).run(t.id);
  console.log(`purged ${t.code} (type_id=${t.id}, draws=${drawIds.length})`);
}
// settings ที่เกี่ยวกับ coin
db.prepare(`DELETE FROM settings WHERE key LIKE 'coin_%'`).run();
console.log('done');
