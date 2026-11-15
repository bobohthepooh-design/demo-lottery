import crypto from 'node:crypto';
import { config } from '../config.js';
import { parseCookies, getSession } from '../services/authService.js';
import { HttpError } from '../lib/audit.js';

const COOKIE = 'dl_csrf';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function sign(value) {
  return crypto.createHmac('sha256', config.sessionSecret).update(value).digest('base64url');
}

/** Ensure a CSRF cookie exists; returns { cookieValue, token }. */
export function ensureCsrf(req, res) {
  const existing = parseCookies(req)[COOKIE];
  const value = existing && /^[a-f0-9]{32,64}$/.test(existing) ? existing : crypto.randomBytes(24).toString('hex');
  if (!existing) {
    res.append('Set-Cookie', `${COOKIE}=${value}; Path=/; SameSite=Lax; Max-Age=86400${req.secure ? '; Secure' : ''}`);
  }
  return { cookieValue: value, token: `${value}.${sign(value)}` };
}

export function csrfTokenEndpoint(req, res) {
  const existing = parseCookies(req)[COOKIE];
  if (existing && /^[a-f0-9]{32,64}$/.test(existing)) {
    return res.json({ csrfToken: `${existing}.${sign(existing)}` });
  }
  const { token } = ensureCsrf(req, res);
  res.json({ csrfToken: token });
}

/** Double-submit + HMAC check on mutating requests. */
export function csrfProtection(req, res, next) {
  if (SAFE_METHODS.has(req.method)) return next();
  const cookies = parseCookies(req);
  const cookieVal = cookies[COOKIE];
  const header = req.get('x-csrf-token') || '';
  const [val, sig] = header.split('.');
  if (!cookieVal || val !== cookieVal || !sig || sig !== sign(cookieVal)) {
    return res.status(403).json({ error: 'CSRF token ไม่ถูกต้องหรือหมดอายุ', code: 'CSRF_FAILED' });
  }
  next();
}
