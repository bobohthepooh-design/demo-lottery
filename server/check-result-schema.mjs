import { getDb } from './src/db/index.js';
const db = getDb();
console.log(db.prepare(`SELECT sql FROM sqlite_master WHERE name='lottery_results'`).get().sql);
console.log('--- recent results ---');
console.log(db.prepare(`SELECT id, draw_id, source, published_at FROM lottery_results ORDER BY id DESC LIMIT 5`).all());
