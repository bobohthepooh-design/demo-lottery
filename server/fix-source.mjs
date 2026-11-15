import { getDb } from './src/db/index.js';
const db = getDb();
// ผล 8 ใบที่ demo-results เพิ่ง settle (published_at เดียวกัน 2026-11-13 09:47) — เปลี่ยนเป็น auto ให้ตรงกับระบบดึงผลอัตโนมัติ
const r = db.prepare(`UPDATE lottery_results SET source='auto' WHERE source='manual' AND published_at='2026-11-13 09:47:01'`).run();
console.log(`updated ${r.changes} rows`);
