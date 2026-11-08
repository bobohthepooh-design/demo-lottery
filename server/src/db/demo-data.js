import { getDb } from './index.js';

/**
 * สร้างรอบหวยตัวอย่างสำหรับ Demo — idempotent (เช็ค draw_code ก่อนสร้าง)
 * ทำให้มีรอบที่ "เปิดรับ" ทันทีหลัง seed เพื่อทดสอบระบบแทงได้เลย
 *
 * draw_at/close_at รับรูปแบบ 'YYYY-MM-DD HH:MM:SS' (เวลา local ของ server)
 * และเก็บเป็น UTC ใน DB (ระบบเปรียบเทียบเวลาด้วย UTC)
 */

const TYPE_CODES = { 1: 'TH', 2: 'LA', 3: 'HN' };

function toUtcSql(localStr) {
  // parse as server-local time → UTC 'YYYY-MM-DD HH:MM:SS'
  const d = new Date(localStr.replace(' ', 'T'));
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

function localSql(offsetMs) {
  const d = new Date(Date.now() + offsetMs);
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export function seedDemoDraws() {
  const db = getDb();
  const types = db.prepare('SELECT id, code FROM lottery_types WHERE is_active = 1').all();
  let created = 0;

  // ออกแบบรอบที่ใช้งานได้จริง:
  //  - รอบ "เปิดรับตอนนี้": close ในอีก 2 ชม., ออกผลในอีก 2.5 ชม.
  //  - รอบ "เร็วๆ นี้": เปิดในอีก 3 ชม.
  //  - รอบ "สัปดาห์หน้า": scheduled ล่วงหน้า
  const schedule = [
    { drawInH: 2.5, closeInH: 2.0, status: 'open', seq: '01' },
    { drawInH: 26.5, closeInH: 26.0, status: 'open', seq: '02' },
    { drawInH: 98.5, closeInH: 98.0, status: 'scheduled', seq: '03' },
  ];

  for (const t of types) {
    const code = TYPE_CODES[t.id] || t.code;
    schedule.forEach((s, i) => {
      const drawCode = `${code}-DEMO-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}${String(new Date().getDate()).padStart(2, '0')}-${s.seq}`;
      const exists = db.prepare('SELECT id FROM lottery_draws WHERE draw_code = ?').get(drawCode);
      if (exists) return;
      const drawAt = toUtcSql(localSql(s.drawInH * 3600e3));
      const closeAt = toUtcSql(localSql(s.closeInH * 3600e3));
      // status: ถ้าเปิดรับแล้วให้ 'open' เฉพาะรอบแรกที่ close ยังไม่ถึง
      const status = closeAt > new Date().toISOString().slice(0, 19).replace('T', ' ') ? s.status : 'scheduled';
      db.prepare(`INSERT INTO lottery_draws (lottery_type_id, draw_code, draw_at, close_at, status)
                  VALUES (?, ?, ?, ?, ?)`)
        .run(t.id, drawCode, drawAt, closeAt, status);
      created++;
    });
  }
  console.log(`[demo-data] created ${created} draws`);
  return created;
}

if (process.argv[1] && process.argv[1].endsWith('demo-data.js')) {
  seedDemoDraws();
}
