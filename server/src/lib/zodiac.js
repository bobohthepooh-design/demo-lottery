// 12 ปีนักษัตรไทยสำหรับหวยรายชั่วโมง (HR)
// canonical = ชื่อสั้นที่ใช้เก็บใน DB/ผลรางวัล — รับ input ได้ทั้งแบบมี/ไม่มีคำว่า "ปี"/"ราศี"
export const ZODIAC_SIGNS = ['ชวด', 'ฉลู', 'ขาล', 'เถาะ', 'มะโรง', 'มะเส็ง', 'มะเมีย', 'มะแม', 'วอก', 'ระกา', 'จอ', 'กุน'];

export function normalizeZodiac(input) {
  const s = String(input || '').trim().replace(/^(ปี|ราศี)/, '').replace(/\s+/g, '');
  return ZODIAC_SIGNS.includes(s) ? s : null;
}
