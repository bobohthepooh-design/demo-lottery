import { getDb } from './src/db/index.js';
const db = getDb();
const now = new Date().toISOString().slice(0,19).replace('T',' ');
const issues = [];
const ok = (m) => console.log('  ✓', m);
const bad = (m) => { issues.push(m); console.log('  ✗', m); };

console.log('=== 1. รอบหวยค้างที่ไม่มีทางออกผลเอง ===');
const stuck = db.prepare(`SELECT d.draw_code, d.draw_at, lt.code tc, c.code cc, lt.result_mode
  FROM lottery_draws d JOIN lottery_types lt ON lt.id=d.lottery_type_id
  LEFT JOIN lottery_categories c ON c.id=d.category_id
  WHERE d.draw_at <= ? AND d.status IN ('open','scheduled','closed')
    AND d.id NOT IN (SELECT draw_id FROM lottery_results)
  ORDER BY d.draw_at`).all(now);
for (const s of stuck) {
  const manual = s.result_mode === 'manual' || s.cc === 'LADAM';
  (manual ? bad : ok)(`${s.draw_code} (${s.tc}/${s.cc||'-'}) เลยเวลาออกผลแล้ว${manual ? ' — ต้อง admin ออกผลเอง' : ''}`);
}
if (!stuck.length) ok('ไม่มีรอบค้าง');

console.log('\n=== 2. โพย pending บนรอบที่ปิดรับแล้ว/ยกเลิก ===');
const badSlips = db.prepare(`SELECT bs.slip_ref, bs.status, d.draw_code, d.status ds
  FROM bet_slips bs JOIN lottery_draws d ON d.id=bs.draw_id
  WHERE bs.status='pending' AND (d.status IN ('closed','cancelled','settled') OR d.close_at <= ?)`).all(now);
badSlips.length ? badSlips.forEach(s => bad(`โพย ${s.slip_ref} ยัง pending แต่รอบ ${s.draw_code} สถานะ ${s.ds}`)) : ok('ไม่มีโพยค้างบนรอบที่ปิดแล้ว');

console.log('\n=== 3. ยอดเครดิตผิดปกติ (ลบ/ไม่ลงตัว) ===');
const neg = db.prepare(`SELECT user_id, balance FROM virtual_wallets WHERE balance < 0`).all();
neg.length ? neg.forEach(w => bad(`user ${w.user_id} balance ติดลบ ${w.balance}`)) : ok('ไม่มียอดติดลบ');
const frac = db.prepare(`SELECT user_id, balance FROM virtual_wallets WHERE balance % 100 != 0`).all();
frac.length ? frac.forEach(w => bad(`user ${w.user_id} balance ไม่ลงสตางค์ ${w.balance}`)) : ok('balance เป็นสตางค์ถูกต้อง');

console.log('\n=== 4. กติกา active ที่ไม่มีรอบรองรับ (dead rules) ===');
const dead = db.prepare(`SELECT lt.code tc, COALESCE(c.code,'-') cc, COUNT(*) n FROM lottery_rules lr
  JOIN lottery_types lt ON lt.id=lr.lottery_type_id LEFT JOIN lottery_categories c ON c.id=lr.category_id
  WHERE lr.is_active=1 GROUP BY tc, cc`).all();
for (const r of dead) {
  const draws = db.prepare(`SELECT COUNT(*) n FROM lottery_draws d
    LEFT JOIN lottery_categories c ON c.id=d.category_id
    WHERE d.lottery_type_id=(SELECT id FROM lottery_types WHERE code=?)
      AND (d.category_id IS NULL AND ?='-' OR c.code=?)
      AND d.status IN ('scheduled','open')`).get(r.tc, r.cc, r.cc).n;
  if (!draws) bad(`${r.tc}/${r.cc}: มีกติกา ${r.n} รายการแต่ไม่มีรอบเปิดอยู่`);
}
ok('ตรวจ dead rules เสร็จ');

console.log('\n=== 5. ผลรางวัลที่ไม่มี field รองรับกติกา ===');
const orphan = db.prepare(`SELECT d.draw_code, r.winning_numbers FROM lottery_results r JOIN lottery_draws d ON d.id=r.draw_id
  WHERE r.winning_numbers NOT LIKE '%"%' OR r.winning_numbers IS NULL`).all();
orphan.length ? orphan.forEach(o => bad(`${o.draw_code}: winning_numbers ว่าง/ผิด format`)) : ok('ผลทุกรอบมีข้อมูล');

console.log('\n=== 6. Session/user ค้าง ===');
const sess = db.prepare(`SELECT COUNT(*) n FROM user_sessions WHERE expires_at < datetime('now') AND revoked_at IS NULL`).get().n;
sess ? console.log(`  · session หมดอายุแต่ยังไม่ revoke ${sess} รายการ`) : ok('ไม่มี session ค้าง');

console.log('\n' + (issues.length ? `พบปัญหา ${issues.length} จุด` : 'ไม่พบปัญหา — ระบบสมบูรณ์'));
process.exit(0);
