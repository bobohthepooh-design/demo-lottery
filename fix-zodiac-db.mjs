import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync('server/data/demo-lottery.db');
const t = db.prepare(`SELECT id FROM lottery_types WHERE code='HR'`).get();
const rows = db.prepare(`SELECT id, bet_type, name_th FROM lottery_rules WHERE lottery_type_id=? AND bet_type LIKE 'zodiac%'`).all(t.id);
console.log(rows);
const ren = {
  'รางวัลใหญ่ — ราศีตัวแรกของผล': 'รางวัลใหญ่ — ปีนักษัตรตัวแรกของผล',
  '3 ราศีบน — 3 ตัวท้ายเรียงถูก': '3 ปีนักษัตรบน — 3 ตัวท้ายเรียงถูก',
  '2 ราศีล่าง — 2 ตัวท้ายเรียงถูก': '2 ปีนักษัตรล่าง — 2 ตัวท้ายเรียงถูก',
  'วิ่งราศี — โผล่ในผล 6 ตัวก็ถูก': 'วิ่งปีนักษัตร — โผล่ในผล 6 ตัวก็ถูก',
};
for (const [oldN, newN] of Object.entries(ren)) {
  db.prepare(`UPDATE lottery_rules SET name_th=? WHERE lottery_type_id=? AND name_th=?`).run(newN, t.id, oldN);
}
db.prepare(`UPDATE lottery_types SET description='ทายปีนักษัตรไทย — ผลรางวัลเป็นปีนักษัตร 6 ตัวเรียงลำดับ (รางวัลใหญ่/3 บน/2 ล่าง/วิ่ง) ออกรางวัลทุก 1 ชั่วโมงนาฬิกา ตลอด 24 ชั่วโมง (DEMO)' WHERE code='HR'`).run();
console.log('done');
