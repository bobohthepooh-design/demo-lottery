import { getDb } from './src/db/index.js';
const db = getDb();
console.log('--- results 10 ล่าสุด ---');
console.log(db.prepare(`SELECT r.id, r.draw_id, r.source, r.published_at, d.draw_code, lt.code AS type
  FROM lottery_results r JOIN lottery_draws d ON d.id=r.draw_id JOIN lottery_types lt ON lt.id=d.lottery_type_id
  ORDER BY r.id DESC LIMIT 10`).all());
console.log('--- draws รอออกผล (open/closed/scheduled, ยังไม่ settle) ---');
console.log(db.prepare(`SELECT d.id, d.draw_code, d.status, lt.code AS type, lt.result_mode
  FROM lottery_draws d JOIN lottery_types lt ON lt.id=d.lottery_type_id
  WHERE d.status IN ('open','closed','scheduled') AND lt.code NOT IN ('SC','HL')
  ORDER BY d.draw_at DESC LIMIT 15`).all());
