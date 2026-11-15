import { getDb } from './src/db/index.js';
const db = getDb();
console.log('--- types ---');
console.log(db.prepare('SELECT id,code,name_th,result_mode,is_active FROM lottery_types').all());
console.log('--- categories ---');
console.log(db.prepare('SELECT id,lottery_type_id,code,name_th FROM lottery_categories').all());
console.log('--- pending draws (no result, past draw_at) ---');
console.log(db.prepare(`SELECT d.id, d.draw_code, d.draw_at, d.status, c.code AS cat, lt.result_mode
  FROM lottery_draws d
  JOIN lottery_types lt ON lt.id = d.lottery_type_id
  LEFT JOIN lottery_categories c ON c.id = d.category_id
  WHERE d.draw_at <= '2026-11-10 07:00:00'
    AND d.status IN ('open','scheduled','closed')
    AND d.id NOT IN (SELECT draw_id FROM lottery_results)
  ORDER BY d.draw_at`).all());
