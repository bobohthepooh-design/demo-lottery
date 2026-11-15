import { getDb } from './server/src/db/index.js';
const db = getDb();
// เลข 4 ตัวตรง: โอกาส 1/10,000 → อัตรายุติธรรม x10,000
// ใช้ margin เดียวกับหวยไทย (950/1000 ≈ 95%) → x9,500
const r = db.prepare(`UPDATE lottery_rules SET payout_multiplier = 9500
  WHERE bet_type IN ('num4','last4') AND is_active = 1`).run();
console.log('num4/last4 → x9500:', r.changes);
console.log(db.prepare(`SELECT COALESCE(c.code,'TH') cat, bet_type, payout_multiplier FROM lottery_rules r
  LEFT JOIN lottery_categories c ON c.id=r.category_id
  WHERE r.is_active=1 AND r.bet_type IN ('num4','last4')`).all());
