import { getDb } from './src/db/index.js';
const db = getDb();
for (const t of ['lottery_categories', 'lottery_draws']) {
  console.log('===', t, '===');
  console.log(db.prepare(`SELECT sql FROM sqlite_master WHERE name='${t}'`).get().sql);
}
console.log('\nLAD/LADAM upcoming draws:');
console.log(db.prepare(`SELECT d.id, d.draw_code, d.draw_at, d.status,
  (SELECT COUNT(*) FROM bet_slips bs WHERE bs.draw_id=d.id AND bs.status NOT IN ('cancelled','refunded')) slips
  FROM lottery_draws d JOIN lottery_categories c ON c.id=d.category_id
  WHERE c.code IN ('LAD','LADAM') AND d.status IN ('scheduled','open') ORDER BY d.draw_at`).all());
process.exit(0);
