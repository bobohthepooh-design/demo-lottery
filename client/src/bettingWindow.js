// กฎเปิดรับแทง — ต้องตรงกับ BETTING_WINDOW_HOURS ใน server/src/services/lotteryService.js
export const BETTING_WINDOW_HOURS = 24;

// เวลาเปิดรับ (UTC 'YYYY-MM-DD HH:MM:SS') = close_at - 24 ชม. — parse fail คืน null (ถือว่าเปิดได้เลย)
export function bettingOpenAtSql(closeAtSql) {
  const t = Date.parse(String(closeAtSql || '').replace(' ', 'T') + 'Z');
  return Number.isFinite(t) ? new Date(t - BETTING_WINDOW_HOURS * 3600e3).toISOString().slice(0, 19).replace('T', ' ') : null;
}

const nowSqlUtc = () => new Date().toISOString().slice(0, 19).replace('T', ' ');

// รอบที่แทงได้จริงตอนนี้: status=open + ยังไม่ปิดรับ + อยู่ในหน้าต่าง 24 ชม.ก่อนปิดรับ
export function isBettingOpen(draw, nowSql = nowSqlUtc()) {
  if (!draw || draw.status !== 'open' || !(draw.close_at > nowSql)) return false;
  const opens = bettingOpenAtSql(draw.close_at);
  return !opens || nowSql >= opens;
}

// เวลาเปิดรับเป็นเวลาไทย 'HH:MM' — สำหรับแสดง "เปิดรับ 19:00 น."
export function thaiHM(sqlUtc) {
  const t = Date.parse(String(sqlUtc || '').replace(' ', 'T') + 'Z');
  if (!Number.isFinite(t)) return '--:--';
  return new Date(t + 7 * 3600e3).toISOString().slice(11, 16);
}
