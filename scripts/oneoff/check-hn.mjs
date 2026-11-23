import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync('server/data/demo-lottery.db');
const rows = db.prepare(`SELECT d.draw_code, d.draw_at, d.close_at, d.status
  FROM lottery_draws d JOIN lottery_categories c ON c.id = d.category_id
  WHERE c.code IN ('HNS','HNP','HNN','HNV') AND d.draw_at > datetime('now')
  ORDER BY d.draw_at LIMIT 8`).all();
console.log(rows);
