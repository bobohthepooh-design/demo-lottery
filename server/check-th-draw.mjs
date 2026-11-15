import { getDb } from './src/db/index.js';
const db = getDb();
const d = db.prepare(`SELECT draw_code, draw_at, close_at, status FROM lottery_draws WHERE draw_code='TH-DEMO-202611-16'`).get();
console.log(d);
const s = db.prepare(`SELECT slip_ref, status, created_at, total_stake FROM bet_slips WHERE slip_ref='BET-20261108-1V9U8B'`).get();
console.log(s);
const items = db.prepare(`SELECT bi.bet_number, bi.status, lr.bet_type, lr.name_th FROM bet_items bi JOIN lottery_rules lr ON lr.id=bi.rule_id JOIN bet_slips bs ON bs.id=bi.slip_id WHERE bs.slip_ref='BET-20261108-1V9U8B'`).all();
console.log(items);
process.exit(0);
