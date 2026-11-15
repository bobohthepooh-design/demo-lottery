import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync('data/demo-lottery.db');
const rows = db.prepare(`SELECT d.id,d.draw_code,d.status,d.draw_at,lt.code tc,c.code cc
  FROM lottery_draws d JOIN lottery_types lt ON lt.id=d.lottery_type_id
  LEFT JOIN lottery_categories c ON c.id=d.category_id
  WHERE d.status NOT IN ('settled','cancelled') ORDER BY d.draw_at DESC LIMIT 40`).all();
console.log(JSON.stringify(rows, null, 1));
