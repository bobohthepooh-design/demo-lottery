import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync('server/data/demo-lottery.db');
const rows = db.prepare(`SELECT lt.code AS ltype, r.bet_type, r.name_th, r.payout_multiplier, r.digits, r.match_config
  FROM lottery_rules r JOIN lottery_types lt ON lt.id = r.lottery_type_id
  WHERE r.is_active = 1 ORDER BY lt.code, r.bet_type`).all();
const g = {};
for (const r of rows) (g[r.ltype] ??= []).push(r);
for (const [t, rs] of Object.entries(g)) {
  console.log(`=== ${t} (${rs.length} active)`);
  const seen = new Set();
  for (const r of rs) {
    const key = `${r.bet_type}|${r.digits}d|x${r.payout_multiplier}`;
    if (!seen.has(key)) { seen.add(key); console.log(`  ${key}  ${r.name_th}  ${r.match_config}`); }
  }
}
