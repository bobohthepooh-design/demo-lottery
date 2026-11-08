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

export function seedDemoDraws() {
  const db = getDb();
  const types = db.prepare('SELECT id, code FROM lottery_types WHERE is_active = 1').all();
  let created = 0;
  const ymd = (() => { const d = new Date(); const p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`; })();

  for (const t of types) {
    const cats = db.prepare('SELECT id, code FROM lottery_categories WHERE lottery_type_id = ?').all(t.id);
    const targets = cats.length ? cats : [{ id: null, code: t.code }];
    for (const c of targets) {
      for (const s of schedule) {
        const drawCode = `${c.code}-DEMO-${ymd}-${s.seq}`;
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
