import { settleDraw } from '../services/lotteryService.js';
import { ZODIAC_SIGNS } from '../lib/zodiac.js';
import { q } from './pg.js';

/**
 * สร้างผลรางวัลตัวอย่างให้รอบที่เปิดรับอยู่ — รอบละ 1 ใบต่อประเทศ/หมวด
 * ใช้สำหรับ Demo เพื่อให้เห็นผลครบทุกประเทศบนหน้าแรก
 * Idempotent: ข้ามรอบที่ settle แล้ว (settleDraw จะ throw อยู่แล้ว — catch ไว้)
 * ผลถูกบันทึกด้วย source='demo' (adminId=null + label) ไม่ใช่ 'manual' —
 * เพื่อให้ provenance แยกผลจำลองออกจากผลที่ admin กรอกจริง
 */

const rnd = (n) => String(Math.floor(Math.random() * 10 ** n)).padStart(n, '0');

const DRAWS_SQL = `
    SELECT d.id, d.draw_code, lt.code AS type_code, c.code AS category_code
    FROM lottery_draws d
    JOIN lottery_types lt ON lt.id = d.lottery_type_id
    LEFT JOIN lottery_categories c ON c.id = d.category_id
    WHERE d.status = 'open'
      AND d.draw_at <= to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS')
    ORDER BY d.draw_at ASC`;

function winningFor(typeCode, categoryCode) {
  if (typeCode === 'TH') {
    // first/front3/last3/bottom2 เป็นรางวัลจริง — top3/top4/top2/last1/bottom1 derive จาก first ฝั่ง server
    return {
      first: rnd(6),
      front3: [rnd(3), rnd(3)],
      last3: [rnd(3), rnd(3)],
      bottom2: rnd(2),
    };
  }
  if (typeCode === 'LA') {
    // ทุกประเภทแทงเป็นตัวท้ายของเลขรางวัลหลัก — ส่งแค่ main, server derive last5..last1/bottom* ให้
    return { main: rnd(6) };
  }
  if (typeCode === 'HN') {
    return { main: rnd(6) };
  }
  if (typeCode === 'HR') {
    const pool = [...ZODIAC_SIGNS];
    const seq = [];
    for (let i = 0; i < 6; i++) seq.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    return { zodiac: seq[0], seq };
  }
  return { main: rnd(6) };
}

async function settleOpenDraws(draws) {
  const done = new Set();
  let settled = 0;
  for (const d of draws) {
    const key = `${d.type_code}:${d.category_code || ''}`;
    if (done.has(key)) continue;
    try {
      const w = winningFor(d.type_code, d.category_code);
      // adminId=null + sourceLabel='demo' → lottery_results.source='demo'
      // (ไม่ใช้ admin id เพราะผลนี้เป็น generated ไม่ใช่ admin กรอก — กัน label 'manual' เท็จ)
      await settleDraw(null, d.id, w, 'demo');
      console.log(`[demo-results] settled ${d.draw_code} (${d.type_code}${d.category_code ? '/' + d.category_code : ''}) ->`, JSON.stringify(w));
      settled++;
    } catch (e) {
      console.log(`[demo-results] skip ${d.draw_code}: ${e.message}`);
    }
    done.add(key);
  }
  console.log(`[demo-results] settled ${settled} draws`);
  return settled;
}

export async function seedDemoResults() {
  const draws = await q(DRAWS_SQL);
  return settleOpenDraws(draws);
}

if (process.argv[1] && process.argv[1].endsWith('demo-results.js')) {
  Promise.resolve(seedDemoResults()).catch(e => { console.error(e); process.exit(1); });
}
