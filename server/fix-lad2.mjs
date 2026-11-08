// One-off fix: หวยลาวพัฒนาเปลี่ยนเป็นหวยเลข (3บน/2ล่าง) ค่ำ จ–ศ 20:30 + เพิ่มลาวพัฒนาเช้า ทุกวัน 09:00
import { getDb } from './src/db/index.js';

const db = getDb();
const la = db.prepare("SELECT id FROM lottery_types WHERE code='LA'").get();

// 1) categories
db.prepare("UPDATE lottery_categories SET name_th='หวยลาวพัฒนา', draw_pattern='mon-fri 20:30' WHERE lottery_type_id=? AND code='LAD'").run(la.id);
db.prepare(`INSERT OR IGNORE INTO lottery_categories (lottery_type_id, code, name_th, draw_pattern) VALUES (?, 'LADAM', 'หวยลาวพัฒนาเช้า', 'daily 09:00')`).run(la.id);
const cats = db.prepare('SELECT id, code FROM lottery_categories WHERE lottery_type_id=?').all(la.id);
console.log('categories:', cats);

// 2) rules: ปิดของเดิมทุกหมวดลาว แล้วสร้างใหม่ top3/bottom2
for (const c of cats) {
  const old = db.prepare('SELECT id, bet_type FROM lottery_rules WHERE category_id=? AND is_active=1').all(c.id);
  for (const r of old) {
    db.prepare('UPDATE lottery_rules SET is_active=0, bet_type=? WHERE id=?').run(`${r.bet_type}_la_old`, r.id);
  }
  for (const [bt, name, digits, src, mult] of [
    ['top3', 'เลข 3 ตัวบน', 3, 'top3', 900],
    ['bottom2', 'เลข 2 ตัวล่าง', 2, 'bottom2', 100],
  ]) {
    db.prepare(`INSERT INTO lottery_rules
      (lottery_type_id, category_id, bet_type, name_th, name_en, digits, match_config, payout_multiplier, stake_unit, min_amount, max_amount, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 100, 100, 1000000, 1)`)
      .run(la.id, c.id, bt, name, bt, digits, JSON.stringify({ source: src, mode: 'exact' }), mult);
  }
  console.log(c.code, 'rules reset');
}

// 3) ลบรอบ LAD ที่ยังไม่ออกผล (schedule เดิมผิด) — รอบที่ settle แล้วเก็บเป็นประวัติ
const lad = cats.find(c => c.code === 'LAD');
const bad = db.prepare(`SELECT d.id, d.draw_code FROM lottery_draws d
  WHERE d.category_id=? AND d.status != 'settled'`).all(lad.id);
const withBets = db.prepare(`SELECT 1 FROM bet_slips WHERE draw_id=? LIMIT 1`);
let del = 0, canc = 0;
for (const d of bad) {
  if (withBets.get(d.id)) {
    db.prepare("UPDATE lottery_draws SET status='cancelled', updated_at=datetime('now') WHERE id=?").run(d.id);
    canc++;
  } else {
    db.prepare('DELETE FROM lottery_draws WHERE id=?').run(d.id);
    del++;
  }
}
console.log(`LAD draws removed: deleted=${del} cancelled=${canc}`);

// 4) type description
db.prepare("UPDATE lottery_types SET description=? WHERE code='LA'")
  .run('หวยลาว: จ–ศ 20:00 • ลาวพัฒนา: จ–ศ 20:30 • ลาวพัฒนาเช้า: ทุกวัน 09:00 น.');
console.log('done');
