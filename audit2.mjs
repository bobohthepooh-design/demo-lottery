import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync('server/data/demo-lottery.db');
const q = (s, ...a) => db.prepare(s).all(...a);
console.log('== KI rules ==');
console.table(q('SELECT id,bet_type,name_th,digits,match_config,payout_multiplier,is_active FROM lottery_rules WHERE lottery_type_id=11'));
console.log('== KI draws ==');
console.table(q('SELECT id,draw_code,status,draw_at,close_at FROM lottery_draws WHERE lottery_type_id=11'));
console.log('== active rules TH/LA/HN/HR ==');
console.table(q(`SELECT r.lottery_type_id tid, COALESCE(c.code,'-') cat, r.bet_type, r.name_th, r.digits, r.match_config, r.payout_multiplier
  FROM lottery_rules r LEFT JOIN lottery_categories c ON c.id=r.category_id
  WHERE r.is_active=1 AND r.lottery_type_id IN (1,2,3,7) ORDER BY r.lottery_type_id, cat, r.bet_type`));
