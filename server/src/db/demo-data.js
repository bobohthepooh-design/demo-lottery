import { getDb } from './index.js';

/**
 * สร้างรอบหวยตัวอย่างสำหรับ Demo — idempotent (เช็ค draw_code ก่อนสร้าง)
 * สร้างรอบให้ทุก lottery_category (หวยลาว/ลาวพัฒนา, ฮานอย 4 เฉพาะกิจ)
 *
 * draw_at/close_at เป็นเวลา local ของ server → แปลงเป็น UTC ก่อนเก็บ
 */

function toUtcSql(localStr) {
  const d = new Date(localStr.replace(' ', 'T'));
  return d.toISOString().slice(0, 19).replace('T', ' ');
}
function localSql(offsetMs) {
  const d = new Date(Date.now() + offsetMs);
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

const schedule = [
  { drawInH: 2.5, closeInH: 2.0, status: 'open', seq: '01' },
  { drawInH: 26.5, closeInH: 26.0, status: 'open', seq: '02' },
  { drawInH: 98.5, closeInH: 98.0, status: 'scheduled', seq: '03' },
];

// หวยรัฐบาลไทยออกทุกวันที่ 1 และ 16 ของเดือน — ออกรางวัล 15:00 น. (เวลาท้องถิ่น)
const TH_DRAW_HOUR = 15;
const TH_CLOSE_HOUR = 14;
const TH_UPCOMING = 4; // สร้างล่วงหน้า 4 งวด (1, 16 ของเดือนถัด ๆ ไป)

function thaiDrawDates() {
  const dates = [];
  const now = new Date();
  let y = now.getFullYear(), m = now.getMonth();
  while (dates.length < TH_UPCOMING) {
    for (const day of [1, 16]) {
      const dt = new Date(y, m, day, TH_DRAW_HOUR, 0, 0);
      if (dt > now) dates.push(dt);
      if (dates.length >= TH_UPCOMING) break;
    }
    m += 1; if (m > 11) { m = 0; y += 1; }
  }
  return dates;
}

function localDateSql(d, hour) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(hour)}:00:00`;
}

export function seedDemoDraws() {
  const db = getDb();
  const types = db.prepare('SELECT id, code FROM lottery_types WHERE is_active = 1').all();
  let created = 0;
  const ymd = (() => { const d = new Date(); const p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`; })();

  for (const t of types) {
    const cats = db.prepare('SELECT id, code FROM lottery_categories WHERE lottery_type_id = ?').all(t.id);
    const targets = cats.length ? cats : [{ id: null, code: t.code }];

    // หวยไทย: ออกทุกวันที่ 1 และ 16 ของเดือน
    if (t.code === 'TH') {
      for (const c of targets) {
        for (const dt of thaiDrawDates()) {
          const p = n => String(n).padStart(2, '0');
          const yyyymm = `${dt.getFullYear()}${p(dt.getMonth() + 1)}`;
          const drawCode = `TH-DEMO-${yyyymm}-${p(dt.getDate())}`;
          if (db.prepare('SELECT id FROM lottery_draws WHERE draw_code = ?').get(drawCode)) continue;
          const drawAt = toUtcSql(localDateSql(dt, TH_DRAW_HOUR));
          const closeAt = toUtcSql(localDateSql(dt, TH_CLOSE_HOUR));
          const nowUtc = new Date().toISOString().slice(0, 19).replace('T', ' ');
          const status = closeAt > nowUtc ? 'open' : 'scheduled';
          db.prepare(`INSERT INTO lottery_draws (lottery_type_id, category_id, draw_code, draw_at, close_at, status)
                      VALUES (?, ?, ?, ?, ?, ?)`)
            .run(t.id, c.id, drawCode, drawAt, closeAt, status);
          created++;
        }
      }
      continue;
    }

    for (const c of targets) {
      // นับรอบที่ยังไม่ถึงเวลาปิด — สร้างเพิ่มเฉพาะเมื่อมีไม่ครบ schedule.length รอบ
      // (idempotent สำหรับการรันอัตโนมัติทุกวัน)
      const nowUtc = new Date().toISOString().slice(0, 19).replace('T', ' ');
      const upcoming = db.prepare(`SELECT COUNT(*) c FROM lottery_draws
        WHERE lottery_type_id = ? AND COALESCE(category_id,0) = COALESCE(?,0)
          AND status IN ('scheduled','open') AND close_at > ?`)
        .get(t.id, c.id, nowUtc).c;
      let need = Math.max(0, schedule.length - upcoming);
      for (const s of schedule) {
        if (need <= 0) break;
        const seq = String(upcoming + (schedule.length - need) + 1).padStart(2, '0');
        need--;
        const drawCode = `${c.code}-DEMO-${ymd}-${seq}`;
        if (db.prepare('SELECT id FROM lottery_draws WHERE draw_code = ?').get(drawCode)) continue;
        const drawAt = toUtcSql(localSql(s.drawInH * 3600e3));
        const closeAt = toUtcSql(localSql(s.closeInH * 3600e3));
        const status = closeAt > new Date().toISOString().slice(0, 19).replace('T', ' ') ? s.status : 'scheduled';
        db.prepare(`INSERT INTO lottery_draws (lottery_type_id, category_id, draw_code, draw_at, close_at, status)
                    VALUES (?, ?, ?, ?, ?, ?)`)
          .run(t.id, c.id, drawCode, drawAt, closeAt, status);
        created++;
      }
    }
  }
  console.log(`[demo-data] created ${created} draws`);
  return created;
}

if (process.argv[1] && process.argv[1].endsWith('demo-data.js')) {
  seedDemoDraws();
}
