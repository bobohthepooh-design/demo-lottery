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
