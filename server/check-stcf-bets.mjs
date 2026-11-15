import { getDb } from './src/db/index.js';
const db = getDb();
const q = (sql) => db.prepare(sql).get();
for (const code of ['ST', 'CF']) {
  const t = db.prepare(`SELECT id FROM lottery_types WHERE code=?`).get(code);
  if (!t) { console.log(code, 'no type'); continue; }
  const draws = db.prepare(`SELECT COUNT(*) n FROM lottery_draws WHERE lottery_type_id=?`).get(t.id).n;
  const slips = db.prepare(`SELECT COUNT(*) n FROM bet_slips bs JOIN lottery_draws d ON d.id=bs.draw_id WHERE d.lottery_type_id=?`).get(t.id).n;
  const items = db.prepare(`SELECT COUNT(*) n FROM bet_items bi JOIN lottery_draws d ON d.id=bi.draw_id WHERE d.lottery_type_id=?`).get(t.id).n;
  const rules = db.prepare(`SELECT COUNT(*) n FROM lottery_rules WHERE lottery_type_id=?`).get(t.id).n;
  const cats = db.prepare(`SELECT COUNT(*) n FROM lottery_categories WHERE lottery_type_id=?`).get(t.id).n;
  const tickets = code === 'CF'
    ? db.prepare(`SELECT COUNT(*) n FROM coin_tickets ct JOIN bet_slips bs ON bs.id=ct.slip_id JOIN lottery_draws d ON d.id=bs.draw_id WHERE d.lottery_type_id=?`).get(t.id).n
    : 0;
  console.log(`${code}: type_id=${t.id} draws=${draws} slips=${slips} items=${items} rules=${rules} cats=${cats} tickets=${tickets}`);
}
// kiwi_tickets ไม่เกี่ยว (KI ยังอยู่)
