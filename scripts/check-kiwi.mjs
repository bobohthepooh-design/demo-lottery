import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync('server/data/demo-lottery.db');
console.log(db.prepare("SELECT bet_type, name_th, min_amount, is_active FROM lottery_rules WHERE bet_type LIKE 'kiwi%'").all());
