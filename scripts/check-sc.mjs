import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync('server/data/demo-lottery.db', { readOnly: true });
console.log(db.prepare("SELECT code,name_th,name_en,description FROM lottery_types WHERE code='SC'").get());
console.log(db.prepare("SELECT bet_type,name_th,name_en FROM lottery_rules WHERE bet_type='scratch'").get());
