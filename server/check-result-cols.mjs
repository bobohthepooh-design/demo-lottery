import { getDb } from './src/db/index.js';
const db = getDb();
console.log(db.prepare(`PRAGMA table_info(lottery_results)`).all().map(c => c.name).join(', '));
const r = db.prepare(`SELECT * FROM lottery_results ORDER BY id DESC LIMIT 1`).get();
console.log(r);
process.exit(0);
