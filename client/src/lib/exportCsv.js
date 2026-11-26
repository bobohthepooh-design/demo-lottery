// exportCsv(filename, rows, columns?) — ดาวน์โหลดข้อมูลเป็นไฟล์ CSV
// - ใส่ UTF-8 BOM (﻿) ให้ Excel เปิดภาษาไทยถูกต้อง
// - columns: string[] (ใช้เป็น key+header) หรือ [{ key, label }] — label เป็น header (ไทย)
//   ถ้าไม่ระบุ columns จะใช้ Object.keys ของ row แรก
// - escape เครื่องหมาย " , ขึ้นบรรทัดใหม่ — ค่าที่มีอักขระพิเศษจะถูกครอบด้วย "
// - ใช้กับข้อมูลที่โหลดมาแล้วฝั่ง client เท่านั้น (ไม่ fetch เพิ่ม)

const BOM = '﻿'; // UTF-8 BOM

const escapeCell = (v) => {
  const s = String(v ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const normColumns = (columns, rows) => {
  if (Array.isArray(columns) && columns.length) {
    return columns.map(c =>
      typeof c === 'string' ? { key: c, label: c } : { key: c.key, label: c.label ?? c.key });
  }
  const first = rows.find(r => r && typeof r === 'object');
  return first ? Object.keys(first).map(k => ({ key: k, label: k })) : [];
};

export function exportCsv(filename, rows, columns) {
  const list = Array.isArray(rows) ? rows : [];
  const cols = normColumns(columns, list);
  const lines = [cols.map(c => escapeCell(c.label)).join(',')];
  for (const r of list) {
    lines.push(cols.map(c => escapeCell(r?.[c.key])).join(','));
  }
  const blob = new Blob([BOM + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
}
