import { getDb } from './src/db/index.js';
const db = getDb();
const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
console.log('NOW:', now);
console.log('--- draws past draw_at without result ---');
console.log(db.prepare(`SELECT d.id, d.draw_code, d.draw_at, d.status, d.close_at, lt.code AS tc
  FROM lottery_draws d JOIN lottery_types lt ON lt.id = d.lottery_type_id
  LEFT JOIN lottery_results lr ON lr.draw_id = d.id
  WHERE d.draw_at <= ? AND d.status != 'cancelled'
  GROUP BY d.id HAVING COUNT(lr.id) = 0
  ORDER BY d.draw_at DESC LIMIT 15`).all(now));
console.log('--- last results ---');
console.log(db.prepare(`SELECT lr.id, lr.draw_id, lr.published_at, lr.source, d.draw_code, d.draw_at
  FROM lottery_results lr JOIN lottery_draws d ON d.id = lr.draw_id
  ORDER BY lr.published_at DESC LIMIT 8`).all());
console.log('--- draws settled recently (status) ---');
console.log(db.prepare(`SELECT d.id, d.draw_code, d.status, d.draw_at FROM lottery_draws d ORDER BY d.draw_at DESC LIMIT 10`).all());
