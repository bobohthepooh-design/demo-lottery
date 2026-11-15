import { getDb } from './server/src/db/index.js';
const db = getDb();
// โมเดลใหม่: เลขอั้นไม่ใช่ประเภทแทงแยก — ปิดกติกา ann_* ทั้งหมด
const r = db.prepare(`UPDATE lottery_rules SET is_active = 0 WHERE bet_type LIKE 'ann%' AND is_active = 1`).run();
console.log('deactivated ann rules:', r.changes);
