import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync('server/data/demo-lottery.db');
for (const id of [1,9,13,14]) {
  const u = db.prepare(`SELECT id, username, withdraw_unlocked FROM users WHERE id=?`).get(id);
  const w = db.prepare(`SELECT balance FROM virtual_wallets WHERE user_id=?`).get(id);
  console.log(`#${id} ${u.username} unlocked=${u.withdraw_unlocked} balance=${w.balance/100} บาท`);
}
