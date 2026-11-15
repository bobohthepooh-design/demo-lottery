import { getDb } from './src/db/index.js';
const db = getDb();
console.log(db.prepare(`SELECT code, name_th, result_mode FROM lottery_types ORDER BY id`).all());
