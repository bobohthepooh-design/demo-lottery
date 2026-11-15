import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync('server/data/demo-lottery.db');
const r1 = db.prepare(`UPDATE lottery_rules SET payout_multiplier=300 WHERE bet_type='ann_top' AND is_active=1`).run();
const r2 = db.prepare(`UPDATE lottery_rules SET payout_multiplier=45 WHERE bet_type='ann_bottom' AND is_active=1`).run();
console.log('ann_top→x300:', r1.changes, '| ann_bottom→x45:', r2.changes);
