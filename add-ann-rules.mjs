import { getDb } from './server/src/db/index.js';
const db = getDb();
const tid = (c) => db.prepare('SELECT id FROM lottery_types WHERE code=?').get(c)?.id;
const catId = (t, c) => db.prepare('SELECT id FROM lottery_categories WHERE lottery_type_id=? AND code=?').get(tid(t), c)?.id ?? null;

// (typeCode, catCode|null) — ann_top=เลขอั้นบน 3หลัก x100, ann_bottom=เลขอั้นล่าง 2หลัก x60
const targets = [
  ['TH', null], ['LA', 'LA'], ['LA', 'LADAM'],
  ['HN', 'HNS'], ['HN', 'HNP'], ['HN', 'HNN'], ['HN', 'HNV'], ['HN', 'HNST'],
];
const defs = [
  { betType: 'ann_top', nameTh: 'เลขอั้นบน', digits: 3, source: 'ann_top', mult: 100 },
  { betType: 'ann_bottom', nameTh: 'เลขอั้นล่าง', digits: 2, source: 'ann_bottom', mult: 60 },
];
const ins = db.prepare(`INSERT INTO lottery_rules
  (lottery_type_id, category_id, bet_type, name_th, name_en, digits, match_config, payout_multiplier, stake_unit, min_amount, max_amount, is_active)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, 100, 100, 1000000, 1)`);
let n = 0;
for (const [tc, cc] of targets) {
  const t = tid(tc); if (!t) continue;
  const cid = cc ? catId(tc, cc) : null;
  for (const r of defs) {
    const ex = db.prepare(`SELECT id FROM lottery_rules WHERE lottery_type_id=? AND COALESCE(category_id,0)=COALESCE(?,0) AND bet_type=? AND is_active=1`).get(t, cid, r.betType);
    if (ex) continue;
    ins.run(t, cid, r.betType, r.nameTh, r.betType, r.digits, JSON.stringify({ source: r.source, mode: 'exact' }), r.mult);
    n++;
  }
}
console.log('inserted ann rules:', n);
