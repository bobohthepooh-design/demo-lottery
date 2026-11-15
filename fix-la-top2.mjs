import { getDb } from './server/src/db/index.js';
const db = getDb();
const LA = db.prepare(`SELECT c.id FROM lottery_categories c JOIN lottery_types t ON t.id=c.lottery_type_id WHERE t.code='LA' AND c.code='LA'`).get().id;
const r = db.prepare(`UPDATE lottery_rules SET is_active=0 WHERE category_id=? AND bet_type='top2' AND is_active=1`).run(LA);
console.log('deactivated LA top2:', r.changes);
console.log(db.prepare(`SELECT bet_type, name_th, payout_multiplier, match_config FROM lottery_rules WHERE category_id=? AND is_active=1`).all(LA));
