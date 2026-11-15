import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync('server/data/demo-lottery.db');
const u = db.prepare(`SELECT user_id, balance FROM virtual_wallets WHERE balance > 50000 LIMIT 1`).get();
console.log('test user:', u.user_id, 'balance:', u.balance);
const m = await import('./server/src/services/kiwiService.js');
for (const [bt, picks] of [['highlow',['high']],['oddeven',['even']],['single',[3]],['pair',[1,4]],['triple',[6]]]) {
  try {
    const r = m.playKiwi(u.user_id, 'kiwi_dice', picks, bt);
    console.log(bt.padEnd(8), '→', JSON.stringify({outcome:r.outcome, payout:r.payout, picks:r.picks, drawn:r.drawn, betType:r.betType}));
  } catch (e) { console.log(bt, 'ERR', e.message); }
}
