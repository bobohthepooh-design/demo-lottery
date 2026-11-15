import { getDb } from './src/db/index.js';
const db = getDb();
// ยกเลิกรอบ demo ของเกมด่วนทั้งหมด — เหลือแค่ STANDING draw ที่เกมใช้จริง
const r = db.prepare(`UPDATE lottery_draws SET status = 'cancelled', updated_at = datetime('now')
  WHERE draw_code LIKE 'SC-DEMO-%' OR draw_code LIKE 'HL-DEMO-%'`).run();
console.log('cancelled:', r.changes);
const left = db.prepare(`SELECT draw_code, status FROM lottery_draws d
  JOIN lottery_types lt ON lt.id = d.lottery_type_id
  WHERE lt.code IN ('SC','HL') AND d.status != 'cancelled'`).all();
console.log('remaining:', JSON.stringify(left));
process.exit(0);
