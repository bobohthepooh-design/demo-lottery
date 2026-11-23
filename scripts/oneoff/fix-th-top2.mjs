import { getDb } from './server/src/db/index.js';
const db = getDb();
const T = db.prepare(`SELECT id FROM lottery_types WHERE code='TH'`).get().id;
const r = db.prepare(`UPDATE lottery_rules SET is_active=0 WHERE lottery_type_id=? AND category_id IS NULL AND bet_type='top2' AND is_active=1`).run(T);
console.log('deactivated TH top2:', r.changes);
console.log(db.prepare(`SELECT bet_type, name_th, payout_multiplier, match_config FROM lottery_rules WHERE lottery_type_id=? AND category_id IS NULL AND is_active=1 ORDER BY id`).all(T));
