import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync('server/data/demo-lottery.db');
const rows = db.prepare(`SELECT d.draw_code, lt.code tc, d.draw_at, d.status, lt.result_mode
  FROM lottery_draws d JOIN lottery_types lt ON lt.id = d.lottery_type_id
  WHERE d.status NOT IN ('settled','cancelled') AND d.draw_at <= datetime('now')
  ORDER BY d.draw_at LIMIT 30`).all();
console.log('overdue unsettled:', rows.length);
rows.forEach(r => console.log(r.draw_code, r.tc, r.draw_at, r.status, r.result_mode));
const future = db.prepare(`SELECT COUNT(*) c FROM lottery_draws WHERE status NOT IN ('settled','cancelled') AND draw_at > datetime('now')`).get();
console.log('upcoming unsettled:', future.c);
