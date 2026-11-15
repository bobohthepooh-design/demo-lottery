import { getDb } from './src/db/index.js';
const db = getDb();
console.log('now UTC:', new Date().toISOString());
console.log('now ICT:', new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Bangkok' }));
const t = db.prepare(`SELECT code, result_mode, is_active FROM lottery_types`).all();
console.log(t);
const hr = db.prepare(`SELECT COUNT(*) n, MIN(draw_at) mn, MAX(draw_at) mx FROM lottery_draws d JOIN lottery_types t ON t.id=d.lottery_type_id WHERE t.code='HR' AND d.draw_at <= datetime('now') AND d.status != 'cancelled' AND d.id NOT IN (SELECT draw_id FROM lottery_results)`).get();
console.log('HR pending past draws:', hr);
process.exit(0);
