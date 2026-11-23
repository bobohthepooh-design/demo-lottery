import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync('server/data/demo-lottery.db');
// ดู type ทั้งหมดที่เคยใช้
console.log('tx types:', db.prepare(`SELECT type, direction, COUNT(*) c, SUM(amount) s FROM virtual_transactions GROUP BY type, direction ORDER BY type`).all());
console.log('\nper-user:');
const rows = db.prepare(`SELECT u.id, u.username, w.balance,
  COALESCE((SELECT SUM(amount) FROM virtual_transactions t WHERE t.user_id=u.id AND t.type='win_credit'),0) won,
  COALESCE((SELECT SUM(amount) FROM virtual_transactions t WHERE t.user_id=u.id AND t.type='withdraw'),0) withdrawn,
  COALESCE((SELECT SUM(amount) FROM virtual_transactions t WHERE t.user_id=u.id AND t.type='deposit'),0) dep,
  COALESCE((SELECT SUM(amount) FROM virtual_transactions t WHERE t.user_id=u.id AND t.type='initial_credit'),0) promo,
  COALESCE((SELECT SUM(amount) FROM virtual_transactions t WHERE t.user_id=u.id AND t.type='bet_refund'),0) refunds,
  COALESCE((SELECT SUM(amount) FROM virtual_transactions t WHERE t.user_id=u.id AND t.type='admin_adjust'),0) adj,
  COALESCE((SELECT SUM(amount) FROM virtual_transactions t WHERE t.user_id=u.id AND t.type='admin_debit'),0) deb
  FROM users u JOIN virtual_wallets w ON w.user_id=u.id ORDER BY u.id`).all();
for (const r of rows) {
  const netWon = Math.max(0, r.won - r.withdrawn);
  const wd = Math.max(0, Math.min(netWon, r.balance));
  console.log(`#${r.id} ${r.username} bal=${r.balance} won=${r.won} wd=${r.withdrawn} netWon=${netWon} → withdrawable=${wd} | dep=${r.dep} promo=${r.promo} refund=${r.refunds} adj=${r.adj} deb=${r.deb}`);
}
