import { getDb } from './server/src/db/index.js';
const db = getDb();
const TH = db.prepare(`SELECT id FROM lottery_types WHERE code='TH'`).get().id;

// อัปเดตอัตราจ่ายตามกติกาหวยไทย
const upd = db.prepare(`UPDATE lottery_rules SET payout_multiplier = ? WHERE lottery_type_id = ? AND category_id IS NULL AND bet_type = ? AND is_active = 1`);
upd.run(950, TH, 'top3');      // 3 ตัวบน
upd.run(95,  TH, 'bottom2');   // 2 ตัวล่าง
upd.run(3.2, TH, 'run_top');   // วิ่งบน
upd.run(4.2, TH, 'run_bottom');// วิ่งล่าง
// ปรับชื่อให้ตรงกติกา
db.prepare(`UPDATE lottery_rules SET name_th='เลข 2 ตัวล่าง' WHERE lottery_type_id=? AND bet_type='bottom2' AND is_active=1`).run(TH);

// เพิ่มกติกาที่ขาด: 3 ตัวโต๊ด (ไม่สนลำดับ) + 2 ตัวบน (ท้าย 2 ของเลข 3 ตัวบน)
const ins = db.prepare(`INSERT INTO lottery_rules
  (lottery_type_id, category_id, bet_type, name_th, name_en, digits, match_config, payout_multiplier, stake_unit, min_amount, max_amount, is_active)
  VALUES (?, NULL, ?, ?, ?, ?, ?, ?, 100, 100, 1000000, 1)`);
const has = (bt) => db.prepare(`SELECT id FROM lottery_rules WHERE lottery_type_id=? AND category_id IS NULL AND bet_type=? AND is_active=1`).get(TH, bt);
if (!has('3tod')) ins.run(TH, '3tod', 'เลข 3 ตัวโต๊ด', '3tod', 3, JSON.stringify({ source: 'top3', mode: 'sorted' }), 150);
if (!has('top2')) ins.run(TH, 'top2', 'เลข 2 ตัวบน', 'top2', 2, JSON.stringify({ source: 'top3', mode: 'tail' }), 95);

console.log(db.prepare(`SELECT bet_type, name_th, digits, match_config, payout_multiplier FROM lottery_rules WHERE lottery_type_id=? AND category_id IS NULL AND is_active=1 ORDER BY id`).all(TH));
