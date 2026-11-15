import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync('data/demo-lottery.db');
const rows = db.prepare(`SELECT t.code, r.bet_type, r.name_th, r.payout_multiplier, r.min_amount, r.max_amount, r.is_active
  FROM lottery_rules r JOIN lottery_types t ON t.id = r.lottery_type_id
  WHERE t.code IN ('SC','HL') ORDER BY t.code, r.bet_type`).all();
console.log(JSON.stringify(rows, null, 1));
