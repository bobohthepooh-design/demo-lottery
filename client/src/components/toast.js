// ระบบ toast ง่ายๆ — ใช้ได้ทุกหน้าโดยไม่ต้องผ่าน context
// เรียก: toast('ข้อความ') | toast('ข้อความ', 'success'|'error'|'info')
export function toast(message, kind = 'info') {
  window.dispatchEvent(new CustomEvent('app:toast', { detail: { message: String(message), kind } }));
}
