// fix-draw-times.mjs — normalize draw_at/close_at ทุก row ให้ตรงตารางเวลาไทย
// ที่มา: ข้อมูลเก่ามี 2 convention ปนกัน (เวลาไทย-as-UTC vs UTC จริง) — สคริปต์นี้
// เทียบเวลาปัจจุบัน (UTC+7) กับเวลาที่ตารางกำหนด แล้วเลื่อน +7h เฉพาะ row ที่ยังเพี้ยน
// ใช้: docker exec demo-lottery-app-1 node /app/server/fix-draw-times.mjs [--apply]
import { q, qRun, closePool } from './src/db/pg.js';
import { scheduleFor } from './src/db/demo-data.js';

const APPLY = process.argv.includes('--apply');
const p2 = n => String(n).padStart(2, '0');

// UTC sql → เวลาผนังไทย 'YYYY-MM-DD HH:MM:SS'
function thaiWall(sqlUtc) {
  const d = new Date(String(sqlUtc).replace(' ', 'T') + 'Z');
  if (isNaN(d)) return null;
  return d.toLocaleString('sv-SE', { timeZone: 'Asia/Bangkok', hour12: false }).slice(0, 19);
}
const naiveMs = s => new Date(String(s).replace(' ', 'T')).getTime();

// เวลาที่ตารางกำหนด (เวลาไทย) ของวันที่ไทยนั้น — HR ใช้ชั่วโมงจาก draw_code
function intendedThai(typeCode, catCode, drawCode, thaiDate) {
  if (typeCode === 'HR') {
    const m = String(drawCode).match(/(\d{8})-(\d{2})$/);
    if (m) {
      const [y, mo, d] = [m[1].slice(0, 4), m[1].slice(4, 6), m[1].slice(6, 8)];
      return `${y}-${mo}-${d} ${m[2]}:00:00`;
    }
  }
  const sch = scheduleFor(typeCode, catCode);
  if (!sch || sch.kind === 'hourly') return null;
  return `${thaiDate} ${p2(sch.hour)}:${p2(sch.minute || 0)}:00`;
}

const draws = await q(`SELECT d.id, d.draw_code, d.draw_at, d.close_at, d.status,
       lt.code AS type_code, c.code AS cat_code
  FROM lottery_draws d JOIN lottery_types lt ON lt.id = d.lottery_type_id
  LEFT JOIN lottery_categories c ON c.id = d.category_id
  WHERE d.draw_code NOT LIKE '%-STANDING' ORDER BY d.draw_at`);

let ok = 0, fixed = 0, skipped = 0;
const problems = [];
for (const d of draws) {
  const curThai = thaiWall(d.draw_at);
  if (!curThai) { problems.push(`${d.draw_code}: แปลงเวลาไม่ได้`); continue; }
  const thaiDate = curThai.slice(0, 10);
  const want = intendedThai(d.type_code, d.cat_code, d.draw_code, thaiDate);
  if (!want) { skipped++; continue; }
  const diffMin = Math.round((naiveMs(curThai) - naiveMs(want)) / 60000);
  if (diffMin === 0) { ok++; continue; }
  if (diffMin === -420) {
    // เวลาไทยปัจจุบันช้ากว่าที่กำหนด 7 ชม. → row นี้เป็น UTC-origin ต้อง +7h
    if (APPLY) {
      await qRun(`UPDATE lottery_draws SET
        draw_at = to_char(draw_at::timestamp + interval '7 hours','YYYY-MM-DD HH24:MI:SS'),
        close_at = to_char(close_at::timestamp + interval '7 hours','YYYY-MM-DD HH24:MI:SS')
        WHERE id = $1`, [d.id]);
    }
    fixed++;
    console.log(`${APPLY ? 'FIX ' : 'WOULD '} ${d.draw_code} (${d.type_code}/${d.cat_code || '-'}) ${curThai} → ${want}`);
  } else {
    problems.push(`${d.draw_code} (${d.type_code}/${d.cat_code || '-'} ${d.status}): เวลาไทย ${curThai} vs กำหนด ${want} (diff ${diffMin} นาที)`);
  }
}
console.log(`\n== ${draws.length} rows: ok=${ok} fixed=${fixed} skipped=${skipped} problems=${problems.length} (apply=${APPLY})`);
for (const p of problems.slice(0, 40)) console.log(' !', p);
await closePool();
