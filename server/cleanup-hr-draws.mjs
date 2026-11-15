import { getDb } from './src/db/index.js';
import { updateDrawStatus } from './src/services/lotteryService.js';

const db = getDb();
const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
const hrType = db.prepare(`SELECT id FROM lottery_types WHERE code = 'HR'`).get();
if (!hrType) { console.log('no HR type'); process.exit(0); }

// รอบที่ยังรับเดิมพันได้ (close_at ยังไม่ถึง)
const future = db.prepare(`SELECT id, draw_code, close_at, status FROM lottery_draws
  WHERE lottery_type_id = ? AND status IN ('open','scheduled') AND close_at > ?
  ORDER BY close_at ASC`).all(hrType.id, now);

console.log(`HR future draws: ${future.length}`);
future.forEach(d => console.log(' ', d.draw_code, d.close_at, d.status));

// เก็บรอบที่ใกล้ปิดสุด (รอบออนไลน์ปัจจุบัน) — ยกเลิกรอบที่เหลือ (คืนเครดิตโพยอัตโนมัติ)
const [keep, ...rest] = future;
if (keep) console.log(`keep: ${keep.draw_code}`);
for (const d of rest) {
  const r = updateDrawStatus(null, d.id, 'cancelled');
  console.log(`cancelled ${d.draw_code} refunded=${r?.refundedSlips || 0} slips ฿${(r?.refundedAmount || 0) / 100}`);
}
