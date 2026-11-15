import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync('server/data/demo-lottery.db');
const r = db.prepare(`UPDATE lottery_rules SET is_active=0 WHERE bet_type='kiwi_zodiac'`).run();
console.log('kiwi_zodiac deactivated:', r.changes);
