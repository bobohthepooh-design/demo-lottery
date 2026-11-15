import { getDb } from './server/src/db/index.js';
const db = getDb();
const tid = (c) => db.prepare('SELECT id FROM lottery_types WHERE code=?').get(c)?.id;
const catId = (t, c) => db.prepare('SELECT id FROM lottery_categories WHERE lottery_type_id=? AND code=?').get(tid(t), c)?.id ?? null;

const setRule = db.prepare(`UPDATE lottery_rules SET payout_multiplier=?, match_config=?
  WHERE lottery_type_id=? AND COALESCE(category_id,0)=COALESCE(?,0) AND bet_type=? AND is_active=1`);
const setName = db.prepare(`UPDATE lottery_rules SET name_th=? WHERE lottery_type_id=? AND COALESCE(category_id,0)=COALESCE(?,0) AND bet_type=? AND is_active=1`);
const deact = db.prepare(`UPDATE lottery_rules SET is_active=0 WHERE lottery_type_id=? AND COALESCE(category_id,0)=COALESCE(?,0) AND bet_type=? AND is_active=1`);
const ins = db.prepare(`INSERT INTO lottery_rules
  (lottery_type_id, category_id, bet_type, name_th, name_en, digits, match_config, payout_multiplier, stake_unit, min_amount, max_amount, is_active)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, 100, 100, 1000000, 1)`);
const has = (t, c, bt) => db.prepare(`SELECT id FROM lottery_rules WHERE lottery_type_id=? AND COALESCE(category_id,0)=COALESCE(?,0) AND bet_type=? AND is_active=1`).get(t, c, bt);
const cfg = (source, mode, tod) => JSON.stringify({ source, mode, ...(tod ? { tod } : {}) });

// ============ ฮานอยทุกหมวด — เหมือนหวยไทย: 3บน/โต๊ด, 2บน/ล่าง, วิ่งบน/ล่าง (+เลข 4 ตัว) ============
for (const c of ['HNS', 'HNP', 'HNN', 'HNV', 'HNST']) {
  const T = tid('HN'), C = catId('HN', c); if (!C) continue;
  setRule.run(1000, cfg('num4', 'exact'), T, C, 'num4');
  // top3/top2/bottom2 — คง source/mode เดิมของแต่ละหมวด แก้แค่ multiplier + tod
  for (const [bt, mult, tod] of [['top3', 850, 140], ['top2', 90, 45], ['bottom2', 90, 45]]) {
    const row = db.prepare(`SELECT match_config FROM lottery_rules WHERE lottery_type_id=? AND category_id=? AND bet_type=? AND is_active=1`).get(T, C, bt);
    if (row) { const j = JSON.parse(row.match_config); j.tod = tod; setRule.run(mult, JSON.stringify(j), T, C, bt); }
  }
  if (!has(T, C, 'run_top'))    ins.run(T, C, 'run_top',    'เลขวิ่งบน',   'run_top',    1, cfg('top3',    'digit_contains'), 3.2);
  if (!has(T, C, 'run_bottom')) ins.run(T, C, 'run_bottom', 'เลขวิ่งล่าง', 'run_bottom', 1, cfg('bottom2', 'digit_contains'), 4.2);
}

// ============ หวยลาวหลัก — 3ตัวตรง/โต๊ด, 2ตัวบน(ท้ายรางวัล), 2ตัวล่าง(หมื่น-พัน) — ไม่มีเลข 4 ตัว ============
{
  const T = tid('LA'), C = catId('LA', 'LA');
  deact.run(T, C, 'last4');
  setRule.run(900, cfg('last3', 'exact', 150), T, C, 'last3'); setName.run('เลข 3 ตัว', T, C, 'last3');
  setRule.run(90,  cfg('last2', 'exact', 45),  T, C, 'last2'); setName.run('เลข 2 ตัวบน', T, C, 'last2');
  // bottom2 — มี row เก่า inactive ค้าง (unique index) → reactivate + ปรับค่าแทนการ insert
  const old = db.prepare(`SELECT id, match_config, is_active FROM lottery_rules WHERE lottery_type_id=? AND category_id=? AND bet_type='bottom2'`).get(T, C);
  if (old?.is_active !== 1) {
    db.prepare(`UPDATE lottery_rules SET is_active=1, name_th='เลข 2 ตัวล่าง', match_config=?, payout_multiplier=90 WHERE id=?`)
      .run(cfg('bottom2', 'exact', 45), old.id);
  } else {
    const j = JSON.parse(old.match_config); j.tod = 45; setRule.run(90, JSON.stringify(j), T, C, 'bottom2');
  }
}

// ============ หวยลาวพัฒนาเช้า — 3บน/โต๊ด, 2บน/ล่าง, วิ่งบน/ล่าง (+เลข 4 ตัว) ============
{
  const T = tid('LA'), C = catId('LA', 'LADAM');
  setRule.run(1000, cfg('num4', 'exact'), T, C, 'num4');
  for (const [bt, mult, tod] of [['top3', 900, 150], ['top2', 90, 45], ['bottom2', 90, 45]]) {
    const row = db.prepare(`SELECT match_config FROM lottery_rules WHERE lottery_type_id=? AND category_id=? AND bet_type=? AND is_active=1`).get(T, C, bt);
    if (row) { const j = JSON.parse(row.match_config); j.tod = tod; setRule.run(mult, JSON.stringify(j), T, C, bt); }
  }
  if (!has(T, C, 'run_top'))    ins.run(T, C, 'run_top',    'เลขวิ่งบน',   'run_top',    1, cfg('top3',    'digit_contains'), 3.2);
  if (!has(T, C, 'run_bottom')) ins.run(T, C, 'run_bottom', 'เลขวิ่งล่าง', 'run_bottom', 1, cfg('bottom2', 'digit_contains'), 4.2);
}

console.log('--- LA ---');
console.log(db.prepare(`SELECT bet_type, name_th, payout_multiplier, match_config FROM lottery_rules r JOIN lottery_categories c ON c.id=r.category_id JOIN lottery_types t ON t.id=r.lottery_type_id WHERE t.code='LA' AND c.code IN ('LA','LADAM') AND r.is_active=1 ORDER BY c.code, r.bet_type`).all());
console.log('--- HN (HNN sample) ---');
console.log(db.prepare(`SELECT bet_type, name_th, payout_multiplier, match_config FROM lottery_rules r JOIN lottery_categories c ON c.id=r.category_id JOIN lottery_types t ON t.id=r.lottery_type_id WHERE t.code='HN' AND c.code='HNN' AND r.is_active=1 ORDER BY r.bet_type`).all());
