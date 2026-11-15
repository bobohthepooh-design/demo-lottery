import { getDb } from './server/src/db/index.js';
const db = getDb();
const T = db.prepare(`SELECT id FROM lottery_types WHERE code='HN'`).get().id;
// รวมศูนย์: top2 ทุกหมวดฮานอย = 2 ตัวท้ายของ top3 (tail) — แทน field top2 ที่มาจากรางวัลคนละตัว
const upd = db.prepare(`UPDATE lottery_rules SET match_config=?
  WHERE lottery_type_id=? AND category_id=? AND bet_type='top2' AND is_active=1`);
for (const code of ['HNN', 'HNST']) {
  const C = db.prepare(`SELECT id FROM lottery_categories WHERE lottery_type_id=? AND code=?`).get(T, code)?.id;
  if (!C) continue;
  const r = upd.run(JSON.stringify({ source: 'top3', mode: 'tail', tod: 45 }), T, C);
  console.log(code, 'top2 → tail of top3:', r.changes);
}
console.log(db.prepare(`SELECT c.code, bet_type, match_config FROM lottery_rules r
  JOIN lottery_categories c ON c.id=r.category_id WHERE r.lottery_type_id=? AND r.bet_type='top2' AND r.is_active=1`).all(T));
