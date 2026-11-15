import { getDb } from './server/src/db/index.js';
const db = getDb();

// 1) ปิดกติกาโต๊ดที่แยกประเภทแทง (bet_items เก่าอ้าง rule เดิมอยู่ — settle ยังทำงานได้ปกติ)
const off = db.prepare(`UPDATE lottery_rules SET is_active=0 WHERE is_active=1 AND bet_type LIKE '%tod'`).run();
console.log('deactivated tod rules:', off.changes);

// 2) ฉีดอัตราโต๊ดลง match_config ของกติกาเต็ง 2-3 หลัก (TH/LA/HN)
//    3 หลัก → 150 | 2 หลัก → 48 (fair 1/50)
const rows = db.prepare(`SELECT r.id, r.bet_type, r.digits, r.match_config, lt.code AS tcode
  FROM lottery_rules r JOIN lottery_types lt ON lt.id = r.lottery_type_id
  WHERE r.is_active=1 AND lt.code IN ('TH','LA','HN') AND r.digits IN (2,3)
    AND r.bet_type NOT LIKE '%tod'`).all();
const upd = db.prepare('UPDATE lottery_rules SET match_config=? WHERE id=?');
let n = 0;
for (const r of rows) {
  const cfg = JSON.parse(r.match_config);
  if (!['exact', 'tail'].includes(cfg.mode) || cfg.tod != null) continue;
  cfg.tod = r.digits === 3 ? 150 : 48;
  upd.run(JSON.stringify(cfg), r.id); n++;
}
console.log('match_config.tod injected:', n);
console.log(db.prepare(`SELECT COALESCE(c.code,'-') cat, bet_type, digits, match_config, payout_multiplier
  FROM lottery_rules r LEFT JOIN lottery_categories c ON c.id=r.category_id
  WHERE r.is_active=1 AND r.bet_type IN ('front3','top3','last3','top2','bottom2','last2') ORDER BY r.lottery_type_id, r.category_id, r.bet_type`).all());
