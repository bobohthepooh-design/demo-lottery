// 12 ราศีสำหรับหวยรายชั่วโมง (HR)
// canonical = ชื่อสั้นที่ใช้เก็บใน DB/ผลรางวัล — รับ 입력ได้ทั้งแบบมี/ไม่มีคำว่า "ราศี"
export const ZODIAC_SIGNS = ['เมษ', 'พฤษภ', 'เมถุน', 'กรกฎ', 'สิงห์', 'กันย์', 'ตุลย์', 'พิจิก', 'ธนู', 'มังกร', 'กุมภ์', 'มีน'];

export function normalizeZodiac(input) {
  const s = String(input || '').trim().replace(/^ราศี/, '').replace(/\s+/g, '');
  return ZODIAC_SIGNS.includes(s) ? s : null;
}
