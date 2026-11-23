import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync('server/data/demo-lottery.db');
const users = db.prepare(`SELECT u.id, u.username, w.balance FROM users u JOIN virtual_wallets w ON w.user_id=u.id`).all();
for (const u of users) {
  const row = db.prepare(`SELECT
      COALESCE(SUM(CASE WHEN type='win_credit' THEN amount END),0) won,
      COALESCE(SUM(CASE WHEN type='withdraw' THEN amount END),0) withdrawn
    FROM virtual_transactions WHERE user_id=?`).get(u.id);
  const cap = Math.max(0, row.won - row.withdrawn);
  const txs = db.prepare(`SELECT type, amount FROM virtual_transactions WHERE user_id=? ORDER BY id`).all(u.id);
  let pool = 0;
  for (const t of txs) {
    const a = Number(t.amount)||0;
    if (t.type==='win_credit') pool+=a;
    else if (['bet_debit','admin_debit','withdraw'].includes(t.type)) pool=Math.max(0,pool-a);
    else if (t.type==='bet_refund') pool=Math.min(cap,pool+a);
  }
  const oldWd = Math.max(0, Math.min(Math.max(0,row.won-row.withdrawn), u.balance));
  const newWd = Math.max(0, Math.min(pool, u.balance));
  console.log(`#${u.id} ${u.username} bal=${u.balance} old=${oldWd} new=${newWd} pool=${pool} cap=${cap}`);
}
