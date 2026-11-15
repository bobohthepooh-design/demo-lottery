import { getDb } from './src/db/index.js';
const db = getDb();
const now = new Date().toISOString().slice(0,19).replace('T',' ');
console.log('now(UTC):', now);
// draws past draw time with no result
const pend = db.prepare(`
  SELECT d.draw_code, d.draw_at, d.status, t.code tc, c.code cc, c.name_th cname
  FROM lottery_draws d
  JOIN lottery_types t ON t.id=d.lottery_type_id
  LEFT JOIN lottery_categories c ON c.id=d.category_id
  WHERE d.draw_at <= ? AND d.status != 'cancelled'
    AND d.id NOT IN (SELECT draw_id FROM lottery_results)
  ORDER BY d.draw_at DESC LIMIT 30`).all(now);
console.log('--- draws past draw_at without result:', pend.length);
pend.forEach(x => console.log(x.draw_code, x.tc, x.cc||'', x.cname||'', x.draw_at, x.status));
// latest results by draw_at
const res = db.prepare(`
  SELECT d.draw_code, d.draw_at, t.code tc, c.code cc, lr.source, lr.winning_numbers
  FROM lottery_results lr JOIN lottery_draws d ON d.id=lr.draw_id
  JOIN lottery_types t ON t.id=d.lottery_type_id
  LEFT JOIN lottery_categories c ON c.id=d.category_id
  ORDER BY d.draw_at DESC LIMIT 10`).all();
console.log('--- latest results:');
res.forEach(x => console.log(x.draw_code, x.tc+'/'+(x.cc||''), x.draw_at, x.source));
// settled draws today count
process.exit(0);
