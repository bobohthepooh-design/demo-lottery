import { getDb } from './server/src/db/index.js';

const db = getDb();
const hn = db.prepare(`SELECT id FROM lottery_types WHERE code='HN'`).get();
if (!hn) throw new Error('HN type missing');

// category
db.prepare(`INSERT OR IGNORE INTO lottery_categories (lottery_type_id, code, name_th, draw_pattern) VALUES (?, 'HNST', 'ฮานอยทางการ', 'mon-thu 18:15')`).run(hn.id);
const cat = db.prepare(`SELECT id FROM lottery_categories WHERE lottery_type_id=? AND code='HNST'`).get(hn.id);

// rules — same structure as HNN (XSMB result has all 4 prizes)
const mk = (betType, nameTh, digits, source, mode, mult) => ({ betType, nameTh, digits, source, mode, mult });
const defs = [
  mk('num4', 'เลข 4 ตัว', 4, 'num4', 'exact', 800),
  mk('top3', 'เลข 3 ตัวบน', 3, 'top3', 'exact', 700),
  mk('top2', 'เลข 2 ตัวบน', 2, 'top2', 'exact', 90),
  mk('bottom2', 'เลข 2 ตัวล่าง', 2, 'bottom2', 'exact', 90),
];
const ins = db.prepare(`INSERT INTO lottery_rules
  (lottery_type_id, category_id, bet_type, name_th, name_en, digits, match_config, payout_multiplier, stake_unit, min_amount, max_amount, is_active)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, 100, 100, 1000000, 1)`);
for (const r of defs) {
  const exists = db.prepare(`SELECT id FROM lottery_rules WHERE lottery_type_id=? AND category_id=? AND bet_type=? AND is_active=1`).get(hn.id, cat.id, r.betType);
  if (!exists) ins.run(hn.id, cat.id, r.betType, r.nameTh, r.betType, r.digits, JSON.stringify({ source: r.source, mode: r.mode }), r.mult);
}

db.prepare(`UPDATE lottery_types SET description='หวยเวียดนาม ออกทุกวัน 4 รอบ: เฉพาะกิจ 16:30 • พิเศษ 17:30 • ปกติ 18:30 • VIP 19:30 น. + ฮานอยทางการ (XSMB จริง) จันทร์/พฤหัสบดี 18:15 น. (เวลาไทย)' WHERE code='HN'`).run();
console.log('HNST category id:', cat.id, '| rules:', db.prepare(`SELECT COUNT(*) c FROM lottery_rules WHERE category_id=? AND is_active=1`).get(cat.id).c);
