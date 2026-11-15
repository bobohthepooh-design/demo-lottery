import { getDb } from './src/db/index.js';
const db = getDb();
console.log(db.prepare(`SELECT key, value FROM system_settings WHERE key LIKE '%price%' OR key LIKE 'hilo_mult%' ORDER BY key`).all());
process.exit(0);
