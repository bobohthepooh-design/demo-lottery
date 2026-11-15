import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync('server/data/demo-lottery.db');
// 1) ยกเลิก KI-DEMO draws ที่ seedDemoDraws สร้างผิด (KI เป็น instant game ไม่มีรอบ)
const ki = db.prepare(`UPDATE lottery_draws SET status='cancelled', updated_at=datetime('now')
  WHERE draw_code LIKE 'KI-DEMO-%' AND status != 'cancelled'`).run();
console.log('KI-DEMO cancelled:', ki.changes);
// 2) แก้ close_at >= draw_at ของรอบฮานอยที่ seed ผิด (ปิดรับต้องก่อนออก 1 ชม.)
const hn = db.prepare(`UPDATE lottery_draws SET close_at = datetime(draw_at, '-1 hour'), updated_at=datetime('now')
  WHERE lottery_type_id = 3 AND status NOT IN ('settled','cancelled') AND close_at >= draw_at`).run();
console.log('HN close_at fixed:', hn.changes);
console.log(db.prepare(`SELECT draw_code, close_at, draw_at FROM lottery_draws WHERE close_at >= draw_at AND status NOT IN ('settled','cancelled') AND draw_code NOT LIKE '%STANDING'`).all());
