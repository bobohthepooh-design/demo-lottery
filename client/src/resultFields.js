// helpers แสดงผลรางวัล — ใช้ร่วมกันระหว่าง Results page, Home cards และอื่นๆ
// ผลจากแหล่งต่างกันเก็บ top3 เป็น array (ไทย) หรือ string (ลาว/ฮานอย) — normalize ก่อนแสดง
export const asList = (v) => Array.isArray(v) ? v.join(' ') : (v ?? '');

// สรุปผลทุก field ที่มี — ครบทุกประเภทการแทงของแต่ละตลาด
export function resultSummary(w) {
  if (!w) return null;
  const parts = [];
  const pushArr = (label, v) => { if (v) parts.push(`${label}: ${asList(v)}`); };
  pushArr('รางวัลที่ 1', w.first ?? w.p1);
  // รางวัลที่ 2-5 ไม่แสดง — เก็บในข้อมูลแต่ไม่ใช่ประเภทที่แทง
  if (w.near1?.length) parts.push(`เลขอั้น: ${asList(w.near1)}`);
  if (w.p2) parts.push(`อ.2: ${asList(w.p2)}`);
  if (w.p3) parts.push(`อ.3: ${asList(w.p3)}`);
  if (w.p4) parts.push(`อ.4: ${asList(w.p4)}`);
  if (w.p5) parts.push(`อ.5: ${asList(w.p5)}`);
  if (w.main) parts.push(`เลขหลัก: ${w.main}`);
  if (w.db5) parts.push(`DB 5: ${w.db5}`);
  if (w.num4) parts.push(`4 ตัว: ${asList(w.num4)}`);
  if (w.last4) parts.push(`ท้าย 4: ${asList(w.last4)}`);
  if (w.top4) parts.push(`บน 4: ${w.top4}`);
  if (w.top3) parts.push(`บน 3: ${asList(w.top3)}`);
  if (w.front3) parts.push(`หน้า 3: ${asList(w.front3)}`);
  if (w.last3) parts.push(`ท้าย 3: ${asList(w.last3)}`);
  if (w.top2) parts.push(`บน 2: ${asList(w.top2)}`);
  if (w.bottom2) parts.push(`ล่าง 2: ${asList(w.bottom2)}`);
  else if (w.last2) parts.push(`ท้าย 2: ${asList(w.last2)}`);
  if (w.last1) parts.push(`ท้าย 1: ${w.last1}`);
  if (w.bottom1) parts.push(`ล่าง 1: ${w.bottom1}`);
  if (w.zodiac) parts.push(`ราศี: ${w.zodiac}`);
  if (w.seq?.length) parts.push(`ลำดับ: ${w.seq.join('-')}`);
  if (w.numbers?.length) parts.push(`เลข: ${asList(w.numbers)}`);
  return parts;
}

// ผลย่อสำหรับตาราง — เลขหลักที่คนดูบ่อยสุดของแต่ละประเภท
export function compactSummary(w) {
  if (!w) return null;
  const parts = [];
  const push = (v) => { if (v !== undefined && v !== null && v !== '') parts.push(asList(v)); };
  const firstOf = (v) => (Array.isArray(v) ? v[0] : v);
  if (w.first || w.p1) parts.push(`รางวัล1: ${firstOf(w.first ?? w.p1)}`);
  if (w.p2) parts.push(`อ.2 ${firstOf(w.p2)}`);
  if (w.last4) parts.push(`ท้าย4 ${asList(w.last4)}`);
  if (w.db5) parts.push(`DB5 ${w.db5}`);
  if (w.main || w.num4) parts.push(asList(w.main || w.num4));
  if (w.zodiac) parts.push(w.zodiac);
  push(w.top3 ?? w.last3 ?? w.front3);
  push(w.bottom2 ?? w.last2 ?? w.top2);
  return parts.length ? parts.join('  ·  ') : null;
}

// เลขเด่นสำหรับ hero display — รางวัลใหญ่/เลขหลัก แสดงตัวใหญ่กลาง
export function heroNumbers(w) {
  if (!w) return [];
  const out = [];
  const firstOf = (v) => (Array.isArray(v) ? v[0] : v);
  const first = firstOf(w.first ?? w.p1);
  if (first) out.push({ label: 'รางวัลที่ 1', num: first });
  const main = w.main || w.num4 || w.db5;
  if (main) out.push({ label: w.db5 && !w.main && !w.num4 ? 'DB 5 ตัว' : (w.num4 && !w.main ? 'เลข 4 ตัว' : 'เลขหลัก'), num: main });
  const top = asList(w.top3 ?? w.last3 ?? w.front3);
  if (top) out.push({ label: 'เลขบน 3 ตัว', num: top });
  const bot = w.bottom2 ?? w.last2 ?? w.top2;
  if (bot) out.push({ label: 'เลขล่าง 2 ตัว', num: asList(bot) });
  return out.slice(0, 4);
}
