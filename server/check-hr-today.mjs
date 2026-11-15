import { getDb } from './src/db/index.js';
const db = getDb();
const rows = db.prepare(`
  SELECT d.draw_code, d.draw_at, lr.published_at, lr.winning_numbers
  FROM lottery_draws d
  JOIN lottery_types t ON t.id=d.lottery_type_id
  LEFT JOIN lottery_results lr ON lr.draw_id=d.id
  WHERE t.code='HR' AND d.draw_at >= '2026-11-09 17:00:00'
  ORDER BY d.draw_at`).all();
rows.forEach(r => console.log(r.draw_code, r.draw_at, '->', r.published_at || 'NO RESULT'));
process.exit(0);
