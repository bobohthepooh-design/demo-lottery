import { getDb } from './src/db/index.js';
const db = getDb();
const rows = db.prepare(`SELECT d.draw_code, d.draw_at, d.status, r.winning_numbers, r.source
                         FROM lottery_draws d
                         LEFT JOIN lottery_results r ON r.draw_id = d.id
                         WHERE d.lottery_type_id = (SELECT id FROM lottery_types WHERE code='HR')
                         ORDER BY d.draw_at DESC LIMIT 15`).all();
for (const r of rows) console.log(r.draw_code, '|', r.status, '|', r.source || '-', '|', r.winning_numbers || '(ยังไม่มีผล)');
const pend = db.prepare(`SELECT COUNT(*) c FROM bet_items bi JOIN lottery_rules lr ON lr.id=bi.rule_id JOIN bet_slips bs ON bs.id=bi.slip_id JOIN lottery_draws d ON d.id=bs.draw_id WHERE d.lottery_type_id=(SELECT id FROM lottery_types WHERE code='HR')`).get();
console.log('HR bet items total:', pend.c);
process.exit(0);
