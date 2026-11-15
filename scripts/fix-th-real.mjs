import { getDb } from './server/src/db/index.js';
const db = getDb();
const T = db.prepare(`SELECT id FROM lottery_types WHERE code='TH'`).get().id;

// อัตราจริงตลาดหวยออนไลน์ไทย: เต็ง 3 ตัว = 900, 2 ตัว = 90, วิ่งบน 3.2, วิ่งล่าง 4.2
// โต๊ด = เต็ง ÷ จำนวน permutation (3หลัก÷6=150, 2หลัก÷2=45)
const set = db.prepare(`UPDATE lottery_rules SET payout_multiplier=?, match_config=? WHERE lottery_type_id=? AND category_id IS NULL AND bet_type=? AND is_active=1`);
const cfg = (tod) => JSON.stringify({ source: null, mode: 'exact', tod }); // source ใส่ทีหลัง
const rules = [
  // [bet_type, mult, source, tod]
  ['front3',  900, 'front3',  150],
  ['top3',    900, 'top3',    150],
  ['bottom2',  90, 'bottom2',  45],
];
for (const [bt, mult, src, tod] of rules) {
  const r = set.run(mult, JSON.stringify({ source: src, mode: 'exact', tod }), T, bt);
  console.log(bt, '→ x' + mult, 'tod x' + tod, `(${r.changes})`);
}
console.log(db.prepare(`SELECT bet_type, name_th, payout_multiplier, match_config FROM lottery_rules WHERE lottery_type_id=? AND category_id IS NULL AND is_active=1 ORDER BY id`).all(T));
