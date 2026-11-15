import { getDb } from './src/db/index.js';
import { rulesForDraw, listDraws } from './src/services/lotteryService.js';
const db = getDb();

// 1) กติกาที่ลูกค้าเห็นจริงสำหรับแต่ละรอบที่กำลังจะเปิด/เปิดอยู่
const draws = listDraws({ upcoming: true });
console.log('=== กติกาที่ลูกค้าเห็น (ต่อรอบ upcoming) ===');
const seen = new Set();
for (const d of draws) {
  const key = `${d.type_code}:${d.category_code || '-'}`;
  if (seen.has(key)) continue;
  seen.add(key);
  const r = rulesForDraw(d.id);
  console.log(`${d.type_code}/${d.category_code || 'ทั่วไป'} (${d.draw_code}):`,
    r.rules.map(x => `${x.bet_type}(${x.name_th},x${x.payout_multiplier})`).join(' | ') || '!! ไม่มีกติกา');
}

// 2) กติกา active ทั้งหมดใน DB แยกตาม type+cat
console.log('\n=== กติกา active ใน DB ===');
const rows = db.prepare(`SELECT lt.code tc, COALESCE(c.code,'-') cc, lr.bet_type, lr.name_th, lr.payout_multiplier, lr.is_active
  FROM lottery_rules lr JOIN lottery_types lt ON lt.id=lr.lottery_type_id
  LEFT JOIN lottery_categories c ON c.id=lr.category_id
  WHERE lr.is_active=1 ORDER BY lt.code, cc, lr.bet_type`).all();
const g = {};
for (const r of rows) (g[`${r.tc}/${r.cc}`] ??= []).push(`${r.bet_type}(x${r.payout_multiplier})`);
for (const [k, v] of Object.entries(g)) console.log(k, '=>', v.join(', '));

// 3) หมวดที่มีอยู่แต่ไม่มีรอบ upcoming เลย
console.log('\n=== หมวดที่อาจไม่มีรอบ ===');
const cats = db.prepare(`SELECT lt.code tc, c.code cc, c.name_th FROM lottery_categories c JOIN lottery_types lt ON lt.id=c.lottery_type_id`).all();
for (const c of cats) {
  const n = db.prepare(`SELECT COUNT(*) n FROM lottery_draws d WHERE d.category_id=(SELECT id FROM lottery_categories WHERE lottery_type_id=(SELECT id FROM lottery_types WHERE code=?) AND code=?) AND d.status IN ('scheduled','open')`).get(c.tc, c.cc).n;
  if (!n) console.log(`${c.tc}/${c.cc} (${c.name_th}): ไม่มีรอบเปิดอยู่`);
}
process.exit(0);
