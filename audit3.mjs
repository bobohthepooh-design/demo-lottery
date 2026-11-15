import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync('server/data/demo-lottery.db');
const q=(s,...a)=>db.prepare(s).all(...a);
console.log('== HN draw close vs draw (latest per cat) ==');
console.table(q(`SELECT c.code cat, d.draw_code, d.close_at, d.draw_at, d.status FROM lottery_draws d
  JOIN lottery_categories c ON c.id=d.category_id JOIN lottery_types lt ON lt.id=d.lottery_type_id
  WHERE lt.code='HN' AND d.draw_at > datetime('now') ORDER BY c.code, d.draw_at LIMIT 12`));
console.log('== KI-DEMO draws with bets? ==');
console.table(q(`SELECT d.draw_code, COUNT(bi.id) items FROM lottery_draws d
  LEFT JOIN bet_items bi ON bi.draw_id=d.id WHERE d.draw_code LIKE 'KI-DEMO%' GROUP BY d.id`));
console.log('== bets on KI draws ==');
console.table(q(`SELECT bs.slip_ref, bi.bet_type, bi.number, bs.status FROM bet_items bi JOIN bet_slips bs ON bs.id=bi.slip_id JOIN lottery_draws d ON d.id=bi.draw_id WHERE d.lottery_type_id=11 LIMIT 10`));
console.log('== announce usage ==');
console.table(q(`SELECT id, draw_code, announce FROM lottery_draws WHERE announce IS NOT NULL LIMIT 10`));
console.log('== ann_* active rules ==');
console.table(q(`SELECT id, bet_type, name_th, is_active FROM lottery_rules WHERE bet_type LIKE 'ann_%'`));
console.log('== RG fields on users ==');
console.table(q(`SELECT COUNT(*) n, SUM(self_excluded_until IS NOT NULL) excl, SUM(daily_limit_satang IS NOT NULL) dl, SUM(monthly_limit_satang IS NOT NULL) ml FROM users`));
