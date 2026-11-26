// แปลงเวลาที่เก็บเป็น UTC 'YYYY-MM-DD HH:MM:SS' เป็นเวลาที่ผู้ใช้เลือก
// default = timezone ของอุปกรณ์ — ผู้ใช้เปลี่ยนได้ในโปรไฟล์ (เก็บ app_tz + sync server)

export function getTz() {
  try { return localStorage.getItem('app_tz') || undefined; } catch { return undefined; }
}
export function setTz(z) {
  try { localStorage.setItem('app_tz', z || ''); } catch {}
  window.dispatchEvent(new Event('tzchange'));
}

function toDate(s) {
  return new Date(String(s).replace(' ', 'T') + 'Z');
}

export function fmtDateTime(s) {
  if (!s) return '';
  const d = toDate(s);
  if (isNaN(d)) return s;
  return d.toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short', timeZone: getTz() });
}
export function fmtDate(s) {
  if (!s) return '';
  const d = toDate(s);
  return isNaN(d) ? s : d.toLocaleDateString('th-TH', { timeZone: getTz() });
}

const TH_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

// parts ตาม timezone ที่เลือก — ใช้ en-US เพื่อให้ parse ง่ายแล้ว map เป็นไทย/พ.ศ.
function dtf(s, opts) {
  const d = toDate(s);
  if (isNaN(d)) return null;
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: getTz(), ...opts }).formatToParts(d);
  const o = {};
  for (const p of parts) o[p.type] = p.value;
  return o;
}

// "8 พ.ย. 2569" (พ.ศ. ตาม timezone ที่เลือก)
export function thaiDate(s) {
  const p = dtf(s, { day: 'numeric', month: 'numeric', year: 'numeric' });
  if (!p) return '';
  return `${+p.day} ${TH_MONTHS[+p.month - 1]} ${+p.year + 543}`;
}

// "18:00"
export function thaiTime(s) {
  const p = dtf(s, { hour: '2-digit', minute: '2-digit', hour12: false });
  if (!p) return '';
  return `${p.hour}:${p.minute}`;
}

// ชื่อรอบแบบคนอ่าน: "หวยฮานอยปกติ • งวด 8 พ.ย. 2569 เวลา 18:00 น."
// ถ้ามีชื่อหมวด (เช่น หวยลาวพัฒนา, ฮานอย VIP) ใช้ชื่อหมวดอย่างเดียว — ไม่ต่อท้ายชื่อประเภทซ้ำ
export function drawLabel(d) {
  if (!d) return '';
  const name = d.category_name_th || d.type_name_th || '';
  // เกมด่วน (สล็อต/ไฮโล/ยี่กี) ใช้ STANDING draw ที่ไม่มีรอบจริง — ไม่แสดงวันที่ 1 ม.ค.
  if (String(d.draw_code || '').endsWith('-STANDING')) return name || 'เกมด่วน';
  return `${name} • งวด ${thaiDate(d.draw_at)} เวลา ${thaiTime(d.draw_at)} น.`;
}
