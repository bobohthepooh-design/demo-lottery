// ค่าเริ่มต้นของแบนเนอร์หน้าแรก — admin แก้ไขได้ที่ /admin/banner
// โครงสร้างต้องตรงกับที่หน้าแรกอ่าน
export const DEFAULT_BANNER = {
  enabled: true,
  emoji: '🎰',
  title: 'หวยออนไลน์ ครบทุกตลาด',
  markets: 'หวยรัฐบาลไทย • หวยลาว & ลาวพัฒนา • ฮานอย 4 รอบ/วัน',
  promo: 'แทงง่ายๆ จ่ายสูงสุด x1,000 เท่า — รับเครดิตทดลองเมื่อสมัคร',
  cta_bet: '🎟️ แทงหวยเลย',
  cta_register: 'สมัครรับเครดิตทดลอง',
  show_stats: true,
};

export function mergeBanner(saved) {
  return { ...DEFAULT_BANNER, ...(saved && typeof saved === 'object' ? saved : {}) };
}
