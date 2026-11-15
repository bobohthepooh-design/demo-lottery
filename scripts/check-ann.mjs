import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync('data/demo-lottery.db');
console.log(db.prepare(`SELECT lt.code AS type, COALESCE(c.code,'-') AS cat, r.bet_type, r.payout_multiplier, r.category_id
  FROM lottery_rules r JOIN lottery_types lt ON lt.id=r.lottery_type_id
  LEFT JOIN lottery_categories c ON c.id=r.category_id
  WHERE r.is_active=1 AND r.bet_type NOT LIKE 'ann%' AND r.bet_type NOT LIKE 'zodiac%'
  ORDER BY lt.id, r.category_id, r.bet_type`).all());
