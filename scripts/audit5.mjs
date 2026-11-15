import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync('server/data/demo-lottery.db');
const q=(s,...a)=>db.prepare(s).all(...a);
console.log('== results by type/source ==');
console.table(q(`SELECT lt.code t, lr.source, COUNT(*) n, MAX(lr.published_at) last_pub FROM lottery_results lr
  JOIN lottery_draws d ON d.id=lr.draw_id JOIN lottery_types lt ON lt.id=d.lottery_type_id
  GROUP BY lt.code, lr.source ORDER BY lt.code, n DESC`));
console.log('== sample auto results ==');
console.table(q(`SELECT d.draw_code, lt.code t, lr.source, lr.published_at, substr(lr.winning_numbers,1,80) wn FROM lottery_results lr
  JOIN lottery_draws d ON d.id=lr.draw_id JOIN lottery_types lt ON lt.id=d.lottery_type_id
  WHERE lr.source='auto' ORDER BY lr.id DESC LIMIT 8`));
console.log('== TH/HN/LA settled draws: do results exist & pending items? ==');
console.table(q(`SELECT lt.code t, d.status ds, COUNT(DISTINCT d.id) draws,
  SUM(CASE WHEN lr.draw_id IS NOT NULL THEN 1 ELSE 0 END) with_result,
  (SELECT COUNT(*) FROM bet_items bi WHERE bi.draw_id=d.id AND bi.status='pending') pend_items
  FROM lottery_draws d JOIN lottery_types lt ON lt.id=d.lottery_type_id
  LEFT JOIN lottery_results lr ON lr.draw_id=d.id
  WHERE lt.code IN ('TH','LA','HN') GROUP BY lt.code, d.status`));
