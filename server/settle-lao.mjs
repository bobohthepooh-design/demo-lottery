// One-off: settle stale Lao sub-category draws (LAD/LADAM) that have no auto source.
// Uses the same deterministic generator as Hanoi draws so results are reproducible.
import { getDb } from './src/db/index.js';
import { settleDraw } from './src/services/lotteryService.js';
import { generateHanoiResult } from './src/services/resultFetcher.js';

const db = getDb();
const nowUtc = new Date().toISOString().slice(0, 19).replace('T', ' ');
const draws = db.prepare(`
  SELECT d.*, c.code AS cat_code FROM lottery_draws d
  JOIN lottery_categories c ON c.id = d.category_id
  JOIN lottery_types lt ON lt.id = d.lottery_type_id
  WHERE lt.code = 'LA' AND c.code IN ('LAD','LADAM')
    AND d.status IN ('open','scheduled','closed') AND d.draw_at <= ?
    AND d.id NOT IN (SELECT draw_id FROM lottery_results)
  ORDER BY d.draw_at`).all(nowUtc);

for (const d of draws) {
  const g = generateHanoiResult(d.draw_code);
  const res = settleDraw(null, d.id, g.winning);
  console.log(`settled ${d.draw_code} (${d.cat_code})`, JSON.stringify(g.winning), '->', JSON.stringify(res));
}
console.log('done, draws:', draws.length);
