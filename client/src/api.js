let csrfToken = null;

async function getCsrf() {
  if (!csrfToken) {
    const r = await fetch('/api/csrf-token', { credentials: 'same-origin' });
    csrfToken = (await r.json()).csrfToken;
  }
  return csrfToken;
}

export function resetCsrf() { csrfToken = null; }

export async function api(path, { method = 'GET', body } = {}) {
  const doFetch = async () => {
    const headers = { 'Content-Type': 'application/json' };
    if (method !== 'GET') headers['x-csrf-token'] = await getCsrf();
    return fetch(`/api${path}`, {
      method,
      headers,
      credentials: 'same-origin',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  };
  let res = await doFetch();
  // CSRF cookie หมุน (login ใหม่/expire) แต่ token ใน memory ยังเก่า → ขอ token ใหม่แล้ว retry ครั้งเดียว
  let json = null;
  try { json = await res.clone().json(); } catch {}
  if (res.status === 403 && json?.code === 'CSRF_FAILED') {
    resetCsrf();
    res = await doFetch();
    try { json = await res.json(); } catch {}
  } else {
    try { json = await res.json(); } catch {}
  }
  if (res.status === 401) {
    // auth:expired เฉพาะ 401 ที่หมายถึง session หมดอายุจริง —
    // ยกเว้น auth endpoints ที่ 401 เพราะ credential ผิด (login/mfa/otp)
    // ไม่งั้นแอดมินใส่รหัส MFA ผิดจะโดนเตะออกทั้งที่ session ยังดี
    const isCredentialFail =
      path.startsWith('/auth/login') || path.startsWith('/auth/register') ||
      path.startsWith('/auth/mfa/') || path.startsWith('/auth/otp') ||
      path.startsWith('/auth/phone');
    if (!isCredentialFail) window.dispatchEvent(new Event('auth:expired'));
  }
  if (!res.ok) {
    const err = new Error(json?.error || `HTTP ${res.status}`);
    err.status = res.status;
    err.code = json?.code;
    throw err;
  }
  return json;
}

export const satang = (n) => (n / 100).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const bahtToSatang = (baht) => Math.round(parseFloat(baht) * 100);
export { fmtDateTime, fmtDate, thaiDate, thaiTime, drawLabel } from './time.js';
