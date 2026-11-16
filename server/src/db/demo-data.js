import { q } from './pg.js';

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
function scheduleFor(typeCode, catCode) {
  if (typeCode === 'TH') return { kind: 'monthly', days: [1, 16], hour: 15, closeHour: 14, skipHoliday: false };
  if (typeCode === 'LA') {
    if (catCode === 'LAD') return { kind: 'weekly', weekdays: [1, 2, 3, 4, 5], hour: 20, minute: 30, closeHour: 19, closeMinute: 30, skipHoliday: true }; // ค่ำ จ–ศ
    if (catCode === 'LADAM') return { kind: 'daily', hour: 9, minute: 0, closeHour: 8, closeMinute: 0, skipHoliday: true }; // เช้า ทุกวัน
    return { kind: 'weekly', weekdays: [1, 2, 3, 4, 5], hour: 20, minute: 0, closeHour: 19, closeMinute: 0, skipHoliday: true }; // หวยลาวหลัก จ–ศ
  }
  if (typeCode === 'HN') {
    // ฮานอยทางการ (Xổ số kiến thiết Thủ đô): ออกเฉพาะ จันทร์+พฤหัสบดี 18:15–18:30 (เวลาไทย)
    if (catCode === 'HNST') return { kind: 'weekly', weekdays: [1, 4], hour: 18, minute: 15, closeHour: 17, closeMinute: 45, skipHoliday: true };
    // เวลาตามตลาดหวยฮานอยทั่วไป — เฉพาะกิจ 16:30 / พิเศษ 17:30 / ปกติ 18:30 / VIP 19:30 (เวลาไทย)
    const h = { HNS: 16, HNP: 17, HNN: 18, HNV: 19 }[catCode] || 18;
    // HNN ใช้ผล XSMB จริง — ออกรางวัลเฉพาะ จันทร์–เสาร์ (ไม่มีวันอาทิตย์) จึงห้ามสร้างรอบวันอาทิตย์
    if (catCode === 'HNN') return { kind: 'weekly', weekdays: [1, 2, 3, 4, 5, 6], hour: h, minute: 30, closeHour: h - 1, closeMinute: 30, skipHoliday: true };
    // ปิดรับก่อนออกรางวัล 1 ชม. (เช่น ออก 18:30 → ปิด 17:30) — ห้ามให้ close_at == draw_at
    return { kind: 'daily', hour: h, minute: 30, closeHour: h - 1, closeMinute: 30, skipHoliday: true };
  }
  if (typeCode === 'HR') return { kind: 'hourly', closeBeforeMin: 30, skipHoliday: false }; // หวยราศี — ทายราศี ทุกชั่วโมง
  return { kind: 'daily', hour: 20, closeHour: 19, skipHoliday: true };
}

const UPCOMING_PER_TARGET = 5;
// หมวดที่ปิดให้บริการ — ไม่สร้างรอบใหม่
// LAD: หวยลาวพัฒนา 5/45 (จ-ศ 20:00) ไม่มีแหล่งผลแยกจากหวยลาวหลัก
// LADAM: "ลาวพัฒนาเช้า" ไม่มีอยู่ในหวยจริง — ผลเป็น generated ล้วน ไม่ใช่ตลาดจริง
const DISABLED_CATS = new Set(['LADAM']);
// เกมด่วน (ขูด/ไฮโล) ใช้ standing draw ถาวรอยู่แล้ว — ไม่ต้องสร้างรอบตามตาราง
const INSTANT_TYPES = new Set(['SC', 'HL', 'KI']);

// สร้างวันที่ออกรางวัลลำดับถัดไป count ครั้ง (ข้ามวันที่ผ่านมาแล้ว/วันหยุด)
function occurrences(sch, count = UPCOMING_PER_TARGET) {
  const out = [];
  const base = new Date(); base.setHours(0, 0, 0, 0);
  const now = new Date();
  if (sch.kind === 'hourly') {
    // ออกรางวัลทุกชั่วโมงนาฬิกา (นาที 0) — ปิดรับก่อนเวลาออกรางวัล closeBeforeMin นาที
    const first = new Date(now); first.setMinutes(0, 0, 0); first.setHours(first.getHours() + 1);
    for (let i = 0; i < 24 * 40 && out.length < count; i++) {
      const draw = new Date(first); draw.setHours(first.getHours() + i);
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
      // รายชั่วโมง (ราศี) สร้างล่วงหน้าแค่รอบเดียว — ให้เหลือรอบเปิดรับปัจจุบัน ไม่ให้รอบซ้อนหลายใบ
      const upcomingCount = sch.kind === 'hourly' ? 1 : UPCOMING_PER_TARGET;
      for (const { draw, close } of occurrences(sch, upcomingCount)) {
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

export async function seedDemoDraws() {
  const types = (await q('SELECT id, code FROM lottery_types WHERE is_active = 1'))
    .map(t => ({ ...t, cats: [] }));
  for (const t of types) {
    t.cats = await q('SELECT id, code FROM lottery_categories WHERE lottery_type_id = $1', [t.id]);
  }
  let created = 0;
  for (const p of planDraws(types)) {
    if (await q('SELECT id FROM lottery_draws WHERE draw_code = $1', [p.drawCode]).then(r => r[0])) continue;
    const status = p.closeAt > nowUtc() ? 'open' : 'scheduled';
    await q(`INSERT INTO lottery_draws (lottery_type_id, category_id, draw_code, draw_at, close_at, status)
              VALUES ($1, $2, $3, $4, $5, $6)`,
      [p.lotteryTypeId, p.categoryId, p.drawCode, p.drawAt, p.closeAt, status]);
    created++;
  }
  console.log(`[demo-data] created ${created} draws`);
  return created;
}

if (process.argv[1] && process.argv[1].endsWith('demo-data.js')) {
  Promise.resolve(seedDemoDraws()).catch(e => { console.error(e); process.exit(1); });
}
