// One-off fix: เปลี่ยนหวยลาวพัฒนาเป็นสลากพัฒนา 5/45 (จ/พ/ศ) + ยกเลิกรอบที่ผิดวัน
import { getDb } from './src/db/index.js';

const db = getDb();
const la = db.prepare("SELECT id FROM lottery_types WHERE code='LA'").get();
const lad = db.prepare("SELECT id FROM lottery_categories WHERE lottery_type_id=? AND code='LAD'").get(la.id);

// 1) category name + pattern
console.log('cat:', db.prepare("UPDATE lottery_categories SET name_th='หวยลาวพัฒนา 5/45', draw_pattern='mon/wed/fri' WHERE id=?").run(lad.id));
db.prepare("UPDATE lottery_categories SET draw_pattern='mon-fri' WHERE lottery_type_id=? AND code='LA'").run(la.id);

// 2) rules: ปิดของเดิม + สร้าง pattana5
const old = db.prepare('SELECT id, bet_type, name_th FROM lottery_rules WHERE category_id=? AND is_active=1').all(lad.id);
console.log('old LAD rules:', old);
for (const r of old) {
  db.prepare(`UPDATE lottery_rules SET is_active=0, bet_type=? WHERE id=?`).run(`${r.bet_type}_lad_old`, r.id);
}
db.prepare(`INSERT INTO lottery_rules
  (lottery_type_id, category_id, bet_type, name_th, name_en, digits, match_config, payout_multiplier, stake_unit, min_amount, max_amount, is_active)
  VALUES (?, ?, 'pattana5', 'สลากพัฒนา 5/45', 'pattana5', 0, '{"source":"numbers","mode":"set5"}', 1000, 100, 100, 1000000, 1)`)
  .run(la.id, lad.id);
console.log('new rule inserted');

// 3) ยกเลิกรอบ LAD ที่ตกวันอังคาร/พฤหัส (เวลาไทย) ที่ยังไม่ออกผล
const draws = db.prepare(`SELECT d.id, d.draw_code, d.draw_at, d.status,
  EXISTS(SELECT 1 FROM lottery_results r WHERE r.draw_id=d.id) settled,
  EXISTS(SELECT 1 FROM bet_items bi JOIN bet_slips bs ON bs.id=bi.slip_id WHERE bi.draw_id=d.id AND bs.status!='cancelled') has_bets
  FROM lottery_draws d WHERE d.category_id=?`).all(lad.id);
let cancelled = 0, deleted = 0;
for (const d of draws) {
  const local = new Date(new Date(d.draw_at.replace(' ', 'T') + 'Z').getTime() + 7 * 3600e3);
  const wd = local.getUTCDay(); // 0=อา ... 6=ส
  const okDay = [1, 3, 5].includes(wd);
  if (okDay || d.settled) continue;
  if (d.has_bets) {
    db.prepare("UPDATE lottery_draws SET status='cancelled', updated_at=datetime('now') WHERE id=?").run(d.id);
    cancelled++;
  } else {
    db.prepare('DELETE FROM lottery_draws WHERE id=?').run(d.id);
    deleted++;
  }
  console.log('removed', d.draw_code, 'weekday', wd, d.has_bets ? '(cancelled, has bets)' : '(deleted)');
}
console.log(`done: cancelled=${cancelled} deleted=${deleted}`);

// 4) type description
db.prepare("UPDATE lottery_types SET description=? WHERE code='LA'")
  .run('หวยลาว: จ–ศ • ลาวพัฒนา 5/45: จ/พ/ศ เวลา 20:00 น.');
