import { getDb } from './src/db/index.js';
const db = getDb();
for (const t of ['virtual_wallets', 'user_sessions']) {
  console.log('===', t, '===');
  console.log(db.prepare(`SELECT sql FROM sqlite_master WHERE name='${t}'`).get().sql);
}
process.exit(0);
