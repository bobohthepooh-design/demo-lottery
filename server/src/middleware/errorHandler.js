import { audit, securityEvent, HttpError } from '../lib/audit.js';

export function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, code: err.code || undefined });
  }
  if (err?.type === 'entity.parse.failed' || err?.type === 'entity.too.large') {
    return res.status(400).json({ error: 'รูปแบบข้อมูลไม่ถูกต้อง' });
  }
  // never leak internals
  console.error('[error]', err);
  securityEvent({ eventType: 'unhandled_error', severity: 'warning', ip: req.ip, detail: { message: String(err?.message || err).slice(0, 300) } });
  res.status(500).json({ error: 'เกิดข้อผิดพลาดภายในระบบ กรุณาลองใหม่' });
}

export function notFound(req, res) {
  res.status(404).json({ error: 'ไม่พบ resource ที่ร้องขอ' });
}
