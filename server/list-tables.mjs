import { getDb } from './src/db/index.js';
const db = getDb();
console.log(db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map(r => r.name).join(', '));
process.exit(0);
