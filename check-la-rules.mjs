import { getDb } from './server/src/db/index.js';
const db = getDb();
console.log(db.prepare(`SELECT r.bet_type, r.name_th, r.is_active FROM lottery_rules r
  JOIN lottery_categories c ON c.id=r.category_id JOIN lottery_types t ON t.id=r.lottery_type_id
  WHERE t.code='LA' AND c.code='LA'`).all());
