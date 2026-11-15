import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync('server/data/demo-lottery.db');
const q=(s,...a)=>db.prepare(s).all(...a);
console.log('== draws close_at >= draw_at ==');
console.table(q(`SELECT d.id, d.draw_code, lt.code t, d.status, d.close_at, d.draw_at FROM lottery_draws d
  JOIN lottery_types lt ON lt.id=d.lottery_type_id WHERE d.close_at >= d.draw_at AND d.status NOT IN ('settled','cancelled')`));
console.log('== draws settled but close>=draw historical ==');
console.table(q(`SELECT COUNT(*) n FROM lottery_draws WHERE close_at >= draw_at`));
console.log('== pending bet_items older than 3 days ==');
console.table(q(`SELECT bi.draw_id, d.draw_code, COUNT(*) n FROM bet_items bi JOIN lottery_draws d ON d.id=bi.draw_id
  WHERE bi.status='pending' AND d.draw_at < datetime('now','-3 days') GROUP BY bi.draw_id LIMIT 10`));
console.log('== slips pending on closed draws (awaiting result) ==');
console.table(q(`SELECT d.draw_code, lt.code t, COUNT(*) n FROM bet_slips bs JOIN lottery_draws d ON d.id=bs.draw_id
  JOIN lottery_types lt ON lt.id=d.lottery_type_id WHERE bs.status='pending' AND d.status='closed' GROUP BY d.id LIMIT 15`));
console.log('== result sources distribution ==');
console.table(q(`SELECT source, COUNT(*) n FROM lottery_results GROUP BY source ORDER BY n DESC`));
