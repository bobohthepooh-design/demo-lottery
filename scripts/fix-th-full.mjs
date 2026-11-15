import { getDb } from './server/src/db/index.js';
const db = getDb();
const T = db.prepare(`SELECT id FROM lottery_types WHERE code='TH'`).get().id;

// อัปเดต: เลขหน้า 3 ตัว เต็ง → x950 (fair 1/1000, margin เดียวกับ top3)
db.prepare(`UPDATE lottery_rules SET payout_multiplier=950, name_th='เลขหน้า 3 ตัว'
  WHERE lottery_type_id=? AND category_id IS NULL AND bet_type='front3' AND is_active=1`).run(T);

// เพิ่มกติกาโต๊ดให้ครบทุกหมวดตามโครงสร้างหวยไทยจริง
// 3 ตัวหน้าโต๊ด: sorted ของ front3 — โอกาส 6/1000 → x150 เท่ากับ 3 ตัวบนโต๊ด
// 2 ตัวบน/ล่างโต๊ด: sorted ของ top3/bottom2 — โอกาส 2/100=1/50 → fair x50 → x48 (~96%)
const ins = db.prepare(`INSERT INTO lottery_rules
  (lottery_type_id, category_id, bet_type, name_th, name_en, digits, match_config, payout_multiplier, stake_unit, min_amount, max_amount, is_active)
  VALUES (?, NULL, ?, ?, ?, ?, ?, ?, 100, 100, 1000000, 1)`);
const exists = (bt) => db.prepare(`SELECT id FROM lottery_rules WHERE lottery_type_id=? AND category_id IS NULL AND bet_type=? AND is_active=1`).get(T, bt);
const add = (bt, name, digits, cfg, mult) => { if (!exists(bt)) { ins.run(T, bt, name, bt, digits, JSON.stringify(cfg), mult); console.log('added', bt); } };
add('front3tod',  'เลขหน้า 3 ตัวโต๊ด', 3, { source: 'front3',  mode: 'sorted' }, 150);
add('top2tod',    'เลข 2 ตัวบนโต๊ด',    2, { source: 'top3',    mode: 'sorted' }, 48);
add('bottom2tod', 'เลข 2 ตัวล่างโต๊ด',   2, { source: 'bottom2', mode: 'sorted' }, 48);

console.log(db.prepare(`SELECT bet_type, name_th, digits, match_config, payout_multiplier FROM lottery_rules
  WHERE lottery_type_id=? AND category_id IS NULL AND is_active=1 ORDER BY id`).all(T));
