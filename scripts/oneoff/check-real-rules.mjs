import { getDb } from './server/src/db/index.js';
const db = getDb();
for (const code of ['LA', 'LADAM', 'HNN', 'HNS', 'HNP', 'HNV', 'HNST']) {
  const rows = db.prepare(`SELECT r.bet_type, r.name_th, r.payout_multiplier, r.match_config FROM lottery_rules r
    JOIN lottery_categories c ON c.id=r.category_id JOIN lottery_types t ON t.id=r.lottery_type_id
    WHERE r.is_active=1 AND ((t.code='LA' AND c.code=?) OR (t.code='HN' AND c.code=?)) ORDER BY r.bet_type`).all(code, code);
  console.log(`\n== ${code} ==`);
  for (const r of rows) console.log(` ${r.bet_type.padEnd(10)} ${r.name_th.padEnd(16)} x${r.payout_multiplier}  ${r.match_config}`);
}
