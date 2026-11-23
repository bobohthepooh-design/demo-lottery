import { getDb } from './server/src/db/index.js';
const db = getDb();
// ann_top = ครึ่งหนึ่งของรางวัล 3 ตัวหลักของตลาดนั้น:
//   TH top3=600 → 300 | LA last3=700 → 350 | LADAM/HN top3=700 → 350
// ann_bottom = ครึ่งหนึ่งของรางวัล 2 ตัวหลัก (ทุกตลาด main=90 → 45)
const r1 = db.prepare(`UPDATE lottery_rules SET payout_multiplier = 350
  WHERE bet_type='ann_top' AND is_active=1 AND category_id IS NOT NULL`).run();
const r2 = db.prepare(`UPDATE lottery_rules SET payout_multiplier = 45
  WHERE bet_type='ann_bottom' AND is_active=1`).run();
console.log('ann_top→350:', r1.changes, '| ann_bottom→45:', r2.changes);
console.log(db.prepare(`SELECT COALESCE(c.code,'TH-null') cat, bet_type, payout_multiplier
  FROM lottery_rules r LEFT JOIN lottery_categories c ON c.id=r.category_id
  WHERE bet_type LIKE 'ann%' AND is_active=1 ORDER BY cat, bet_type`).all());
