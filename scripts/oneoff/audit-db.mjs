import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync('server/data/demo-lottery.db');
const q = (s, ...a) => db.prepare(s).all(...a);

console.log('== types ==');
console.table(q('SELECT id,code,name_th,is_active,result_mode FROM lottery_types ORDER BY id'));
console.log('== rules per type/cat ==');
console.table(q(`SELECT lt.code t, COALESCE(c.code,'-') cat, COUNT(*) n, SUM(r.is_active) act
  FROM lottery_rules r JOIN lottery_types lt ON lt.id=r.lottery_type_id
  LEFT JOIN lottery_categories c ON c.id=r.category_id GROUP BY lt.id, r.category_id ORDER BY lt.id, cat`));
console.log('== draws by type/status ==');
console.table(q(`SELECT lt.code t, d.status, COUNT(*) n FROM lottery_draws d
  JOIN lottery_types lt ON lt.id=d.lottery_type_id GROUP BY lt.code,d.status ORDER BY lt.code,d.status`));
console.log('== draws past draw_at not settled ==');
console.table(q(`SELECT d.id, d.draw_code, lt.code t, d.status, d.draw_at FROM lottery_draws d
  JOIN lottery_types lt ON lt.id=d.lottery_type_id
  WHERE d.status IN ('open','scheduled','closed') AND d.draw_at <= datetime('now')
  ORDER BY d.draw_at LIMIT 30`));
console.log('== settled draws missing result ==');
console.table(q(`SELECT d.id, d.draw_code, lt.code t FROM lottery_draws d
  JOIN lottery_types lt ON lt.id=d.lottery_type_id
  WHERE d.status='settled' AND NOT EXISTS (SELECT 1 FROM lottery_results lr WHERE lr.draw_id=d.id) LIMIT 20`));
console.log('== results on non-settled draws ==');
console.table(q(`SELECT lr.draw_id, d.draw_code, d.status FROM lottery_results lr
  JOIN lottery_draws d ON d.id=lr.draw_id WHERE d.status != 'settled' LIMIT 20`));
console.log('== pending items on settled draws ==');
console.table(q(`SELECT COUNT(*) n FROM bet_items bi JOIN bet_slips bs ON bs.id=bi.slip_id
  JOIN lottery_draws d ON d.id=bi.draw_id WHERE d.status='settled' AND bi.status='pending'`));
console.log('== pending slips on settled draws ==');
console.table(q(`SELECT COUNT(*) n FROM bet_slips bs JOIN lottery_draws d ON d.id=bs.draw_id
  WHERE d.status='settled' AND bs.status='pending'`));
console.log('== duplicate active rules same bet_type/type/cat ==');
console.table(q(`SELECT lottery_type_id, category_id, bet_type, COUNT(*) n FROM lottery_rules
  WHERE is_active=1 GROUP BY lottery_type_id, category_id, bet_type HAVING n>1`));
console.log('== bet items orphan / status mismatch ==');
console.table(q(`SELECT bi.status, COUNT(*) n, SUM(bi.amount) amt, SUM(bi.payout) pay FROM bet_items bi GROUP BY bi.status`));
console.table(q(`SELECT bs.status, COUNT(*) n, SUM(bs.total_stake) stake, SUM(bs.total_payout) pay FROM bet_slips bs GROUP BY bs.status`));
console.log('== wallet negative balances ==');
console.table(q(`SELECT COUNT(*) n FROM virtual_wallets WHERE balance < 0`));
console.log('== pending draws next 5 ==');
console.table(q(`SELECT d.draw_code, lt.code t, COALESCE(c.code,'-') cat, d.status, d.close_at, d.draw_at
  FROM lottery_draws d JOIN lottery_types lt ON lt.id=d.lottery_type_id
  LEFT JOIN lottery_categories c ON c.id=d.category_id
  WHERE lt.is_active=1 AND lt.code NOT IN ('SC','HL','KI')
    AND d.status IN ('scheduled','open','closed') AND d.draw_at > datetime('now')
  ORDER BY d.draw_at LIMIT 10`));
