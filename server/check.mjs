import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync('data/demo-lottery.db');
const rows = db.prepare(`SELECT lt.code t, COALESCE(c.code,'-') cat, r.bet_type, r.name_th, r.payout_multiplier, r.digits, r.is_active
  FROM lottery_rules r JOIN lottery_types lt ON lt.id=r.lottery_type_id
  LEFT JOIN lottery_categories c ON c.id=r.category_id
  ORDER BY lt.id, cat, r.bet_type`).all();
for (const r of rows.filter(x => x.is_active)) console.log(`${r.t}/${r.cat}  ${r.bet_type.padEnd(10)} ${r.name_th}  ${r.digits}หลัก x${r.payout_multiplier}`);
console.log('--- inactive:', rows.filter(x => !x.is_active).length);
// draws per category open
console.log(db.prepare(`SELECT lt.code t, COALESCE(c.code,'-') cat, COUNT(*) n, SUM(status='open') open
  FROM lottery_draws d JOIN lottery_types lt ON lt.id=d.lottery_type_id LEFT JOIN lottery_categories c ON c.id=d.category_id
  GROUP BY lt.id, cat ORDER BY lt.id, cat`).all());
