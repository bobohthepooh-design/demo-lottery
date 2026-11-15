import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync('server/data/demo-lottery.db');
console.log(db.prepare(`SELECT t.bet_type, t.picks, t.drawn, t.hits, t.payout, s.status, s.total_stake, s.total_payout
  FROM kiwi_tickets t JOIN bet_slips s ON s.id=t.slip_id WHERE t.game='kiwi_dice' ORDER BY t.id DESC LIMIT 5`).all());
console.log('wallet:', db.prepare(`SELECT balance FROM virtual_wallets WHERE user_id=1`).get());
console.log('neg wallets:', db.prepare(`SELECT COUNT(*) c FROM virtual_wallets WHERE balance<0`).get().c);
