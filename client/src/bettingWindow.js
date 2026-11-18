// กฎเปิดรับแทง — ต้องตรงกับ BETTING_WINDOW_HOURS ใน server/src/services/lotteryService.js
// ตลาดรายเดือน (ไทย/ออมสิน ออก 1&16) เปิดล่วงหน้า 14 วัน — หวยรายวัน/รายชั่วโมงเปิดล่วงหน้า 24 ชม.
export const BETTING_WINDOW_HOURS = 24;
export const MONTHLY_WINDOW_HOURS = 24 * 14;
const MONTHLY_TYPES = new Set(['TH', 'GS']);

export function windowHoursFor(typeCode) {
  return MONTHLY_TYPES.has(typeCode) ? MONTHLY_WINDOW_HOURS : BETTING_WINDOW_HOURS;
}

// เวลาเปิดรับ (UTC 'YYYY-MM-DD HH:MM:SS') = close_at - window — parse fail คืน null (ถือว่าเปิดได้เลย)
export function bettingOpenAtSql(closeAtSql, typeCode) {
  const t = Date.parse(String(closeAtSql || '').replace(' ', 'T') + 'Z');
  return Number.isFinite(t)
    ? new Date(t - windowHoursFor(typeCode) * 3600e3).toISOString().slice(0, 19).replace('T', ' ')
    : null;
}

const nowSqlUtc = () => new Date().toISOString().slice(0, 19).replace('T', ' ');

// รอบที่แทงได้จริงตอนนี้: status=open + ยังไม่ปิดรับ + อยู่ในหน้าต่างรับแทงของตลาดนั้น
export function isBettingOpen(draw, nowSql = nowSqlUtc()) {
  if (!draw || draw.status !== 'open' || !(draw.close_at > nowSql)) return false;
  const opens = bettingOpenAtSql(draw.close_at, draw.type_code);
  return !opens || nowSql >= opens;
}

// เวลาเปิดรับเป็นเวลาไทย 'YYYY-MM-DD HH:MM' — 'HH:MM' ถ้าเป็นวันนี้, 'DD/MM HH:MM' ถ้าเป็นวันอื่น
export function thaiHM(sqlUtc) {
  const t = Date.parse(String(sqlUtc || '').replace(' ', 'T') + 'Z');
  if (!Number.isFinite(t)) return '--:--';
  const d = new Date(t + 7 * 3600e3);
  const hm = d.toISOString().slice(11, 16);
  const today = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
  return d.toISOString().slice(0, 10) === today ? hm : `${d.toISOString().slice(8, 10)}/${d.toISOString().slice(5, 7)} ${hm}`;
}
