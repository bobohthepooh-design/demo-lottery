// แปลงเวลาที่เก็บเป็น UTC 'YYYY-MM-DD HH:MM:SS' เป็น local time ของผู้ใช้
export function fmtDateTime(s) {
  if (!s) return '';
  const d = new Date(String(s).replace(' ', 'T') + 'Z');
  if (isNaN(d)) return s;
  return d.toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
}
export function fmtDate(s) {
  if (!s) return '';
  const d = new Date(String(s).replace(' ', 'T') + 'Z');
  return isNaN(d) ? s : d.toLocaleDateString('th-TH');
}

const TH_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

function toDate(s) {
  return new Date(String(s).replace(' ', 'T') + 'Z');
}

// "8 พ.ย. 2569" (พ.ศ.)
export function thaiDate(s) {
  const d = toDate(s);
  if (isNaN(d)) return '';
  return `${d.getDate()} ${TH_MONTHS[d.getMonth()]} ${d.getFullYear() + 543}`;
}

// "18:00"
export function thaiTime(s) {
  const d = toDate(s);
  if (isNaN(d)) return '';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// ชื่อรอบแบบคนอ่าน: "หวยฮานอย — ฮานอยปกติ • งวด 8 พ.ย. 2569 เวลา 18:00 น."
export function drawLabel(d) {
  if (!d) return '';
  const name = [d.type_name_th, d.category_name_th].filter(Boolean).join(' — ');
  return `${name} • งวด ${thaiDate(d.draw_at)} เวลา ${thaiTime(d.draw_at)} น.`;
}
