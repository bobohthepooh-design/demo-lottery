import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync('server/data/demo-lottery.db');
console.log('bet_type col:', db.prepare(`PRAGMA table_info(kiwi_tickets)`).all().map(c=>c.name).join(','));
console.log('dice rule:', db.prepare(`SELECT bet_type,name_th,min_amount,is_active FROM lottery_rules WHERE bet_type='kiwi_dice'`).all());
