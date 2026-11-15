import { getDb } from './server/src/db/index.js';
const db = getDb();
const T = db.prepare(`SELECT id FROM lottery_types WHERE code='TH'`).get().id;
const names = { front3: 'เลข 3 ตัวหน้า', top3: 'เลข 3 ตัวหลัง' };
for (const [bt, name] of Object.entries(names)) {
  const r = db.prepare(`UPDATE lottery_rules SET name_th=? WHERE lottery_type_id=? AND category_id IS NULL AND bet_type=? AND is_active=1`).run(name, T, bt);
  console.log(bt, '→', name, `(${r.changes})`);
}
