import { getDb } from './src/db/index.js';
const db = getDb();
db.prepare(`UPDATE lottery_types SET description = ? WHERE code = 'HR'`).run(
  'ทายดวงราศีแบบหวยไทย — ผลรางวัลเป็นราศี 6 ตัวเรียงลำดับ (รางวัลใหญ่/3 ราศีบน/2 ราศีล่าง/วิ่งราศี) ออกรางวัลทุก 1 ชั่วโมงนาฬิกา ตลอด 24 ชั่วโมง (DEMO)'
);
console.log('HR description updated:', db.prepare(`SELECT description FROM lottery_types WHERE code='HR'`).get().description);
process.exit(0);
