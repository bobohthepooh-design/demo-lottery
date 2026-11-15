import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync('server/data/demo-lottery.db');
const r = db.prepare(`UPDATE lottery_rules SET is_active=0 WHERE bet_type='kiwi_animal'`).run();
console.log('kiwi_animal rules deactivated:', r.changes);
console.log(db.prepare(`SELECT bet_type, name_th, is_active FROM lottery_rules WHERE bet_type LIKE 'kiwi%'`).all());
