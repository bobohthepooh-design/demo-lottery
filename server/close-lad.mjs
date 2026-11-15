import { getDb } from './src/db/index.js';
import { updateDrawStatus } from './src/services/lotteryService.js';
const db = getDb();
const draws = db.prepare(`SELECT d.id, d.draw_code, d.status FROM lottery_draws d
  JOIN lottery_categories c ON c.id=d.category_id
  WHERE c.code='LAD' AND d.status IN ('scheduled','open','closed')`).all();
for (const d of draws) {
  const r = updateDrawStatus(null, d.id, 'cancelled');
  console.log('cancelled', d.draw_code, JSON.stringify(r));
}
console.log('done,', draws.length, 'draws');
process.exit(0);
