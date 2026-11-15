import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync('data/demo-lottery.db');
console.log('--- bet_items ที่ใช้กติกา ann (ทั้งหมด) ---');
console.log(db.prepare(`SELECT bi.id, bi.bet_type, bi.number, bi.amount, bi.status, bi.payout,
    lr.id AS rule_id, lr.payout_multiplier, lr.is_active AS rule_active, bs.status AS slip_status
  FROM bet_items bi JOIN lottery_rules lr ON lr.id=bi.rule_id JOIN bet_slips bs ON bs.id=bi.slip_id
  WHERE bi.bet_type LIKE 'ann%' OR lr.bet_type LIKE 'ann%' ORDER BY bi.id DESC LIMIT 20`).all());
console.log('--- ann rules ทั้งหมด (รวม inactive) ---');
console.log(db.prepare(`SELECT id, bet_type, payout_multiplier, is_active, category_id FROM lottery_rules WHERE bet_type LIKE 'ann%' ORDER BY id`).all());
