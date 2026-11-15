import { getDb } from './src/db/index.js';
const db = getDb();
const rows = db.prepare(`SELECT d.id, d.draw_code, d.status, d.draw_at, lt.code tc
  FROM lottery_draws d JOIN lottery_types lt ON lt.id = d.lottery_type_id
  WHERE lt.code IN ('SC','HL') ORDER BY d.draw_at DESC LIMIT 20`).all();
console.log(JSON.stringify(rows, null, 1));
