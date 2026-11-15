import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync('server/data/demo-lottery.db');
console.log('pending HR slips:', db.prepare(`SELECT COUNT(*) c FROM bet_items bi JOIN bet_slips s ON s.id=bi.slip_id JOIN lottery_draws d ON d.id=s.draw_id JOIN lottery_types t ON t.id=d.lottery_type_id WHERE t.code='HR' AND s.status='pending'`).get().c);
console.log('HR rules:', db.prepare(`SELECT bet_type,name_th FROM lottery_rules r JOIN lottery_types t ON t.id=r.lottery_type_id WHERE t.code='HR'`).all());
console.log('recent HR result:', db.prepare(`SELECT winning_numbers FROM lottery_results WHERE draw_id IN (SELECT id FROM lottery_draws WHERE lottery_type_id=(SELECT id FROM lottery_types WHERE code='HR')) ORDER BY id DESC LIMIT 1`).get());
