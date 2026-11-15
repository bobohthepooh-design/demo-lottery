import { getDb } from './src/db/index.js';
import { fetchLotteryChecks } from './src/services/resultFetcher.js';
const db = getDb();

// 1) ตรวจว่าแต่ละหมวดฮานอยมี result source จริง
for (const [cat, key] of [['HNS','hanoi-adhoc'],['HNP','hanoi-special'],['HNV','hanoi-vip']]) {
  try {
    const r = await fetchLotteryChecks(key);
    console.log(`${cat} <- ${key}: date=${r.date} winning=${JSON.stringify(r.winning)}`);
  } catch (e) { console.log(`${cat} <- ${key}: FAIL ${e.message}`); }
}

// 2) ตรวจกติกาแยกตามหมวด — top2 ต้องมีเฉพาะ HNN
const rules = db.prepare(`SELECT c.code cc, lr.bet_type, lr.is_active FROM lottery_rules lr
  JOIN lottery_types lt ON lt.id=lr.lottery_type_id
  JOIN lottery_categories c ON c.id=lr.category_id
  WHERE lt.code='HN' ORDER BY c.code, lr.bet_type`).all();
const byCat = {};
for (const r of rules) (byCat[r.cc] ??= []).push(`${r.bet_type}${r.is_active ? '' : '(ปิด)'}`);
for (const [c, rs] of Object.entries(byCat)) console.log(c, '=>', rs.join(', '));

// 3) ยืนยันไม่มีรอบ LAD ใหม่ + เหลือแค่ LADAM ของลาวพัฒนา
console.log('\nLao dev draws ยังไม่ settle/cancel:',
  db.prepare(`SELECT COUNT(*) c FROM lottery_draws d JOIN lottery_categories c ON c.id=d.category_id WHERE c.code IN ('LAD','LADAM') AND d.status IN ('scheduled','open','closed')`).get().c);
process.exit(0);
