import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync('data/demo-lottery.db');
db.prepare(`UPDATE lottery_rules SET min_amount=1000, max_amount=1000 WHERE bet_type IN ('hilo_low','hilo_high','hilo_eleven')`).run();
console.log('done');
