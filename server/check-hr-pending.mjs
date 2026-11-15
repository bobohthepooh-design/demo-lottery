import { getDb } from './src/db/index.js';
const db = getDb();
const rows = db.prepare(`
  SELECT bs.slip_ref, bs.status slip_status, bi.status item_status, d.draw_code, d.draw_at, d.status draw_status,
         (SELECT COUNT(*) FROM lottery_results lr WHERE lr.draw_id=d.id) has_result
  FROM bet_slips bs
  JOIN bet_items bi ON bi.slip_id = bs.id
  JOIN lottery_draws d ON d.id = bi.draw_id
  JOIN lottery_types t ON t.id = d.lottery_type_id
  WHERE t.code = 'HR' AND (bs.status = 'pending' OR bi.status = 'pending')
  ORDER BY d.draw_at DESC LIMIT 20`).all();
console.log(JSON.stringify(rows, null, 1));
// also: recent HR draws + results + pending bet counts
const draws = db.prepare(`
  SELECT d.draw_code, d.draw_at, d.status, lr.id has_res,
    (SELECT COUNT(*) FROM bet_items bi JOIN bet_slips bs ON bs.id=bi.slip_id WHERE bi.draw_id=d.id AND bs.status='pending') pending_bets
  FROM lottery_draws d JOIN lottery_types t ON t.id=d.lottery_type_id
  LEFT JOIN lottery_results lr ON lr.draw_id=d.id
  WHERE t.code='HR' ORDER BY d.draw_at DESC LIMIT 8`).all();
console.log(JSON.stringify(draws, null, 1));
process.exit(0);
