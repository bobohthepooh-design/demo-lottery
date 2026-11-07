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
  const headers = { 'Content-Type': 'application/json' };
  if (method !== 'GET') headers['x-csrf-token'] = await getCsrf();
  const res = await fetch(`/api${path}`, {
    method,
    headers,
    credentials: 'same-origin',
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch {}
  if (res.status === 401 && !path.startsWith('/auth/login') && !path.startsWith('/auth/register')) {
    window.dispatchEvent(new Event('auth:expired'));
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
