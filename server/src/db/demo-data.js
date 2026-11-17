import { q, qRun } from './pg.js';

/**
 * สร้างรอบหวยตัวอย่างสำหรับ Demo — idempotent (เช็ค draw_code ก่อนสร้าง)
 *
 * ตารางออกผลรางวัลจริง (เวลาประเทศไทย):
 *  - หวยไทย:        วันที่ 1 และ 16 ของทุกเดือน เวลา 15:00 (ปิดรับ 14:00)
 *  - หวยลาว:            จันทร์–ศุกร์ เวลา 20:00 (ปิดรับ 19:00) หยุดเสาร์-อาทิตย์
 *  - ลาวพัฒนา (ค่ำ):   จันทร์–ศุกร์ เวลา 20:30 (ปิดรับ 19:30)
 *  - ลาวพัฒนาเช้า:      ทุกวัน เวลา 09:00 (ปิดรับ 08:00) — ตลาดแยกต่างหาก
 *  - ฮานอยเฉพาะกิจ:  ทุกวัน เวลา 16:30 (ปิดรับ 15:30)
 *  - ฮานอยพิเศษ:     ทุกวัน เวลา 17:30 (ปิดรับ 16:30)
 *  - ฮานอยปกติ:      ทุกวัน เวลา 18:30 (ปิดรับ 17:30)
 *  - ฮานอย VIP:      ทุกวัน เวลา 19:30 (ปิดรับ 18:30)
 *  - หวยราศี:        ทุกชั่วโมงนาฬิกา (ปิดรับก่อนออกรางวัล 30 นาที) — ตลอด 24 ชม. ผลเป็นดวงราศี
 *  - ข้ามวันหยุดราชการไทย (ยกเว้นหวยไทยที่ออก 1/16 เสมอ)
 *
 * draw_at/close_at เป็นเวลา local ของ server → แปลงเป็น UTC ก่อนเก็บ
 */

function toUtcSql(localStr) {
  const d = new Date(localStr.replace(' ', 'T'));
  return d.toISOString().slice(0, 19).replace('T', ' ');
}
function localDateSql(d, hour, minute = 0) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(hour)}:${p(minute)}:00`;
}
const ymdKey = (d) => {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

// วันหยุดราชการไทย — แก้ไข/เพิ่มได้ที่นี่ (รวมวันหยุดยาวนักขัตฤกษ์)
const TH_HOLIDAYS = new Set([
  // 2026
  '2026-01-01', '2026-02-16',                       // ปีใหม่, มาฆบูชา
  '2026-04-06',                                     // จักรี
  '2026-04-13', '2026-04-14', '2026-04-15',         // สงกรานต์
  '2026-05-01', '2026-05-04',                       // แรงงาน, ฉัตรมงคล
  '2026-05-31',                                     // วิสาขบูชา
  '2026-06-03',                                     // วันแม่แห่งชาติ
  '2026-07-28', '2026-07-29',                       // วันเฉลิมพระชนมพรรษา ร.10, อาสาฬหบูชา
  '2026-10-13', '2026-10-23',                       // วันปิยมหาราช, จุฬาลงกรณ์
  '2026-12-05', '2026-12-07',                       // วันพ่อแห่งชาติ, วันพระราชทานดินแดน
  // 2027
  '2027-01-01', '2027-03-06',                       // ปีใหม่, มาฆบูชา
  '2027-04-06',                                     // จักรี
  '2027-04-13', '2027-04-14', '2027-04-15',         // สงกรานต์
  '2027-05-01', '2027-05-04',                       // แรงงาน, ฉัตรมงคล
  '2027-05-20',                                     // วิสาขบูชา
  '2027-06-03',                                     // วันแม่แห่งชาติ
  '2027-07-19', '2027-07-28',                       // อาสาฬหบูชา, วัน ร.10
  '2027-10-13', '2027-10-23',                       // ปิยมหาราช, จุฬาลงกรณ์
  '2027-12-05', '2027-12-07',                       // วันพ่อ, วันดินแดน
]);
const isHoliday = (d) => TH_HOLIDAYS.has(ymdKey(d));

// ตารางเวลาตามประเภท/หมวด — kind: monthly(วันที่ของเดือน) | weekly(วันในสัปดาห์) | daily | hourly
export function scheduleFor(typeCode, catCode) {
  if (typeCode === 'TH') return { kind: 'monthly', days: [1, 16], hour: 15, closeHour: 14, skipHoliday: false };
  if (typeCode === 'GS') return { kind: 'monthly', days: [1, 16], hour: 15, closeHour: 14, skipHoliday: false }; // government's Savings Bank Bond (ออก 1&16 — วัน/เวลาเดียวกับหวยไทย)
  if (typeCode === 'LA') {
    if (catCode === 'LAD') return { kind: 'weekly', weekdays: [1, 2, 3, 4, 5], hour: 20, minute: 30, closeHour: 19, closeMinute: 30, skipHoliday: true }; // ค่ำ จ–ศ
    if (catCode === 'LADAM') return { kind: 'daily', hour: 9, minute: 0, closeHour: 8, closeMinute: 0, skipHoliday: true }; // เช้า ทุกวัน
    if (catCode === 'LAM') return { kind: 'daily', hour: 8, minute: 30, closeHour: 7, closeMinute: 30, skipHoliday: true }; // หวยลาวเช้า ออก 08:30 ทุกวัน
    if (catCode === 'LADT') return { kind: 'daily', hour: 12, minute: 30, closeHour: 11, closeMinute: 30, skipHoliday: true }; // ลาวพัฒนาเที่ยง ออก 12:30 ทุกวัน
    return { kind: 'weekly', weekdays: [1, 2, 3, 4, 5], hour: 20, minute: 0, closeHour: 19, closeMinute: 0, skipHoliday: true }; // หวยลาวหลัก จ–ศ
  }
  if (typeCode === 'HN') {
    // หวยฮานอยทุกตลาดไม่ออกรางวัลวันอาทิตย์ (XSMB/lotterychecks ไม่มีข้อมูล) → จ.–ส.
    if (catCode === 'HNM') return { kind: 'weekly', weekdays: [1, 2, 3, 4, 5, 6], hour: 8, minute: 30, closeHour: 7, closeMinute: 30, skipHoliday: true }; // ฮานอยเช้า ออก 08:30 จ.–ส.
    // ฮานอยทางการ (Xổ số kiến thiết Thủ đô): ออกเฉพาะ จันทร์+พฤหัสบดี 18:15–18:30 (เวลาไทย)
    if (catCode === 'HNST') return { kind: 'weekly', weekdays: [1, 4], hour: 18, minute: 15, closeHour: 17, closeMinute: 45, skipHoliday: true };
    // เวลาตามตลาดหวยฮานอยทั่วไป — เฉพาะกิจ 16:30 / พิเศษ 17:30 / ปกติ 18:30 / VIP 19:30 (เวลาไทย)
    const h = { HNS: 16, HNP: 17, HNN: 18, HNV: 19 }[catCode] || 18;
    // HNN ใช้ผล XSMB จริง — ออกรางวัลเฉพาะ จันทร์–เสาร์ (ไม่มีวันอาทิตย์) จึงห้ามสร้างรอบวันอาทิตย์
    if (catCode === 'HNN') return { kind: 'weekly', weekdays: [1, 2, 3, 4, 5, 6], hour: h, minute: 30, closeHour: h - 1, closeMinute: 30, skipHoliday: true };
    // ปิดรับก่อนออกรางวัล 1 ชม. (เช่น ออก 18:30 → ปิด 17:30) — ห้ามให้ close_at == draw_at
    // หวยฮานอยไม่ออกรางวัลวันอาทิตย์ → จ.–ส. เท่านั้น
    return { kind: 'weekly', weekdays: [1, 2, 3, 4, 5, 6], hour: h, minute: 30, closeHour: h - 1, closeMinute: 30, skipHoliday: true };
  }
  if (typeCode === 'HR') return { kind: 'hourly', closeBeforeMin: 30, skipHoliday: false }; // หวยราศี — ทายราศี ทุกชั่วโมง
  return { kind: 'daily', hour: 20, closeHour: 19, skipHoliday: true };
}

// ระยะสร้างรอบล่วงหน้าแยกตามความถี่ตลาด — horizon = เวลาที่ผู้เล่นวางแผนแทงได้จริง + buffer ล่ม/ปัญหาแหล่งผล
// hourly: 3 ชม. (3 รอบ — รายชั่วโมงไม่มีใครวางแผนล่วงหน้าไกล) | daily/weekly: 5 วัน | monthly: 2 ครั้งถัดไป (~1-1.5 เดือน)
function upcomingSpec(sch) {
  if (sch.kind === 'hourly') return { count: 3, horizonH: 4 };
  if (sch.kind === 'monthly') return { count: 2, horizonH: 24 * 60 };
  return { count: 60, horizonH: 24 * 5 }; // daily/weekly: เติมจนมีรอบครอบ 5 วันข้างหน้า
}
// หมวดที่ปิดให้บริการ — ไม่สร้างรอบใหม่
// LAD: หวยลาวพัฒนา 5/45 (จ-ศ 20:00) ไม่มีแหล่งผลแยกจากหวยลาวหลัก
// LADAM: "ลาวพัฒนาเช้า" ไม่มีอยู่ในหวยจริง — ผลเป็น generated ล้วน ไม่ใช่ตลาดจริง
const DISABLED_CATS = new Set(['LADAM']);
// เกมด่วน (ขูด/ไฮโล) ใช้ standing draw ถาวรอยู่แล้ว — ไม่ต้องสร้างรอบตามตาราง
const INSTANT_TYPES = new Set(['SC', 'HL', 'KI']);

// สร้างวันที่ออกรางวัลลำดับถัดไปตาม spec {count, horizonH} — หยุดเมื่อครบจำนวนหรือเกิน horizon (ข้ามวันที่ผ่านมาแล้ว/วันหยุด)
function occurrences(sch, { count, horizonH }) {
  const out = [];
  const base = new Date(); base.setHours(0, 0, 0, 0);
  const now = new Date();
  const horizonEnd = now.getTime() + horizonH * 3600e3;
  if (sch.kind === 'hourly') {
    // ออกรางวัลทุกชั่วโมงนาฬิกา (นาที 0) — ปิดรับก่อนเวลาออกรางวัล closeBeforeMin นาที
    const first = new Date(now); first.setMinutes(0, 0, 0); first.setHours(first.getHours() + 1);
    for (let i = 0; i < 24 * 40 && out.length < count; i++) {
      const draw = new Date(first); draw.setHours(first.getHours() + i);
      if (draw.getTime() > horizonEnd) break;
      const close = new Date(draw); close.setMinutes(close.getMinutes() - (sch.closeBeforeMin || 30));
      if (close <= now) continue;
      out.push({ draw, close });
    }
    return out;
  }
  for (let i = 0; i < 400 && out.length < count; i++) {
    const day = new Date(base); day.setDate(base.getDate() + i);
    if (sch.skipHoliday && isHoliday(day)) continue;
    if (sch.kind === 'monthly' && !sch.days.includes(day.getDate())) continue;
    if (sch.kind === 'weekly' && !sch.weekdays.includes(day.getDay())) continue;
    const close = new Date(day); close.setHours(sch.closeHour, sch.closeMinute || 0, 0);
    if (close <= new Date()) continue; // เลยเวลาปิดรับแล้ว
    const draw = new Date(day); draw.setHours(sch.hour, sch.minute || 0, 0);
    if (draw.getTime() > horizonEnd) break;
    out.push({ draw, close });
  }
  return out;
}

function drawCodeFor(typeCode, catCode, dt) {
  const p = n => String(n).padStart(2, '0');
  const yyyymmdd = `${dt.getFullYear()}${p(dt.getMonth() + 1)}${p(dt.getDate())}`;
  if (typeCode === 'TH') {
    const yyyymm = `${dt.getFullYear()}${p(dt.getMonth() + 1)}`;
    return `TH-DEMO-${yyyymm}-${p(dt.getDate())}`; // รูปแบบเดิม TH-DEMO-202611-16
  }
  if (typeCode === 'HR') return `HR-DEMO-${yyyymmdd}-${p(dt.getHours())}`; // รายชั่วโมง — แยกตามชั่วโมง
  return `${catCode}-DEMO-${yyyymmdd}`;
}

// targets = [{id, code}] ของ type + cats[{id, code}] — คืนแผนรอบที่จะสร้าง (ยังไม่เช็คซ้ำใน db)
function planDraws(types) {
  const plans = [];
  for (const t of types) {
    if (INSTANT_TYPES.has(t.code)) continue; // เกมด่วนไม่มีรอบตามตาราง
    const cats = t.cats.length ? t.cats : [{ id: null, code: t.code }];
    for (const c of cats) {
      if (DISABLED_CATS.has(c.code)) continue;
      const sch = scheduleFor(t.code, c.code);
      for (const { draw, close } of occurrences(sch, upcomingSpec(sch))) {
        plans.push({
          lotteryTypeId: t.id, categoryId: c.id,
          drawCode: drawCodeFor(t.code, c.code, draw),
          drawAt: toUtcSql(localDateSql(draw, draw.getHours(), draw.getMinutes())),
          closeAt: toUtcSql(localDateSql(close, close.getHours(), close.getMinutes())),
        });
      }
    }
  }
  return plans;
}

const nowUtc = () => new Date().toISOString().slice(0, 19).replace('T', ' ');

// แผนตารางออกรางวัลล่วงหน้า (ยังไม่ insert) — สำหรับหน้า admin ดูตารางเวลา
export async function drawSchedulePreview() {
  const types = (await q('SELECT id, code, name_th FROM lottery_types WHERE is_active = 1'))
    .map(t => ({ ...t, cats: [] }));
  for (const t of types) {
    t.cats = await q('SELECT id, code, name_th FROM lottery_categories WHERE lottery_type_id = $1 AND is_active = 1', [t.id]);
  }
  const typeById = Object.fromEntries(types.map(t => [t.id, t]));
  const catById = {};
  for (const t of types) for (const c of t.cats) catById[c.id] = c;
  return planDraws(types).map(p => {
    const t = typeById[p.lotteryTypeId];
    const c = p.categoryId ? catById[p.categoryId] : null;
    return {
      ...p,
      type_code: t?.code, type_name_th: t?.name_th,
      category_code: c?.code || null, category_name_th: c?.name_th || null,
    };
  }).sort((a, b) => a.drawAt.localeCompare(b.drawAt));
}

export async function seedDemoDraws() {
  const types = (await q('SELECT id, code FROM lottery_types WHERE is_active = 1'))
    .map(t => ({ ...t, cats: [] }));
  for (const t of types) {
    t.cats = await q('SELECT id, code FROM lottery_categories WHERE lottery_type_id = $1 AND is_active = 1', [t.id]);
  }
  // กันซ้ำ 2 ชั้น: draw_code (unique) + (type, category, draw_at) — กันกรณี code ฝังชั่วโมงแล้วเวลาเลื่อน
  const existing = await q('SELECT draw_code, lottery_type_id, category_id, draw_at FROM lottery_draws');
  const codes = new Set(existing.map(r => r.draw_code));
  const slots = new Set(existing.map(r => `${r.lottery_type_id}|${r.category_id ?? ''}|${r.draw_at}`));
  let created = 0;
  const plans = planDraws(types);
  // horizon สูงสุดต่อ (type,cat) — ใช้เก็บกวาดรอบ DEMO ที่อยู่นอกระยะกำหนด
  const horizonBySlot = new Map();
  for (const p of plans) {
    const slot = `${p.lotteryTypeId}|${p.categoryId ?? ''}`;
    if (!horizonBySlot.has(slot) || p.drawAt > horizonBySlot.get(slot)) horizonBySlot.set(slot, p.drawAt);
  }
  for (const p of plans) {
    const slot = `${p.lotteryTypeId}|${p.categoryId ?? ''}|${p.drawAt}`;
    if (codes.has(p.drawCode) || slots.has(slot)) continue;
    const status = p.closeAt > nowUtc() ? 'open' : 'scheduled';
    await q(`INSERT INTO lottery_draws (lottery_type_id, category_id, draw_code, draw_at, close_at, status)
              VALUES ($1, $2, $3, $4, $5, $6)`,
      [p.lotteryTypeId, p.categoryId, p.drawCode, p.drawAt, p.closeAt, status]);
    created++;
  }
  // ลบรอบ DEMO ที่เลย horizon และไม่มีโพยผูก — กัน list รอบถัดไปยาวเกินจำเป็น (รอบที่มีโพย/ผล/ยกเลิกแล้วไม่แตะ)
  let pruned = 0;
  for (const [slot, maxAt] of horizonBySlot) {
    const [tid, cid] = slot.split('|');
    const r = await qRun(`DELETE FROM lottery_draws d
        WHERE d.lottery_type_id = $1 AND d.category_id IS NOT DISTINCT FROM $2::bigint
          AND d.status IN ('open','scheduled') AND d.draw_at > $3
          AND d.draw_code LIKE '%DEMO%'
          AND NOT EXISTS (SELECT 1 FROM bet_slips bs WHERE bs.draw_id = d.id)`,
      [Number(tid), cid === '' ? null : Number(cid), maxAt]);
    pruned += r.changes || 0;
  }
  console.log(`[demo-data] created ${created} draws${pruned ? `, pruned ${pruned} beyond-horizon` : ''}`);
  return created;
}

if (process.argv[1] && process.argv[1].endsWith('demo-data.js')) {
  Promise.resolve(seedDemoDraws()).catch(e => { console.error(e); process.exit(1); });
}
