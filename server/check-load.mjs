import { getDb } from './src/db/index.js';
const db = getDb();
const q = (s) => db.prepare(s).get();
console.log('bet_slips:', q('SELECT COUNT(*) c FROM bet_slips').c);
console.log('bet_items:', q('SELECT COUNT(*) c FROM bet_items').c);
console.log('scratch_cards:', q('SELECT COUNT(*) c FROM scratch_cards').c);
console.log('pending slips:', q(`SELECT COUNT(*) c FROM bet_slips WHERE status='pending'`).c);
console.log('pending items ต่อ draw (top5):');
for (const r of db.prepare(`SELECT bi.draw_id, COUNT(*) c FROM bet_items bi JOIN bet_slips bs ON bs.id=bi.slip_id WHERE bs.status='pending' GROUP BY bi.draw_id ORDER BY c DESC LIMIT 5`).all())
  console.log(' ', JSON.stringify(r));
console.log('lottery_results:', q('SELECT COUNT(*) c FROM lottery_results').c);
console.log('lottery_draws:', q('SELECT COUNT(*) c FROM lottery_draws').c);
console.log('db file size:', require('node:fs').statSync('data/demo-lottery.db').size);
// เวลา settle ล่าสุด — ดูว่า auto-settle ทำงานหนักไหม
console.log('settled slips ล่าสุด:');
for (const r of db.prepare(`SELECT slip_ref, settled_at, total_stake FROM bet_slips WHERE settled_at IS NOT NULL ORDER BY settled_at DESC LIMIT 5`).all())
  console.log(' ', JSON.stringify(r));
