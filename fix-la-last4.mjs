import { getDb } from './server/src/db/index.js';
const db = getDb();
const T = db.prepare(`SELECT id FROM lottery_types WHERE code='LA'`).get().id;
const C = db.prepare(`SELECT id FROM lottery_categories WHERE lottery_type_id=? AND code='LA'`).get(T).id;
const has = db.prepare(`SELECT id FROM lottery_rules WHERE lottery_type_id=? AND category_id=? AND bet_type='last4'`).get(T, C);
if (!has) {
  db.prepare(`INSERT INTO lottery_rules (lottery_type_id, category_id, bet_type, name_th, name_en, digits, match_config, payout_multiplier, stake_unit, min_amount, max_amount, is_active)
    VALUES (?, ?, 'last4', 'เลขท้าย 4 ตัว', 'last4', 4, '{"source":"last4","mode":"exact"}', 1000, 100, 100, 1000000, 1)`).run(T, C);
  console.log('added last4 x1000');
} else {
  db.prepare(`UPDATE lottery_rules SET is_active=1, payout_multiplier=1000 WHERE id=?`).run(has.id);
  console.log('reactivated last4 x1000');
}
console.log(db.prepare(`SELECT bet_type, name_th, payout_multiplier FROM lottery_rules WHERE lottery_type_id=? AND category_id=? AND is_active=1 ORDER BY bet_type`).all(T, C));
