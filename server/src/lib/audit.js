import { q } from '../db/pg.js';

export function audit({ userId = null, action, entityType = null, entityId = null, detail = null, req = null }) {
  const detailJson = detail ? JSON.stringify(detail).slice(0, 4000) : null;
  const ip = req?.ip || null;
  const ua = req?.headers?.['user-agent']?.slice(0, 300) || null;
  // fire-and-forget — audit log ไม่ block request; caller ไม่ต้อง await
  q(`INSERT INTO audit_logs (user_id, action, entity_type, entity_id, detail, ip, user_agent)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [userId, action, entityType, entityId, detailJson, ip, ua])
    .catch(e => console.error('[audit] pg insert failed:', e.message));
}

// auth_events — login/logout history ต่อ user (admin user mgmt + fraud review)
export function authEvent({ userId = null, event, ip = null, userAgent = null, detail = null }) {
  const detailJson = detail ? JSON.stringify(detail).slice(0, 2000) : null;
  q(`INSERT INTO auth_events (user_id, event, ip, user_agent, detail) VALUES ($1,$2,$3,$4,$5)`,
    [userId, event, ip || null, (userAgent || '').slice(0, 300) || null, detailJson])
    .catch(e => console.error('[authEvent] pg insert failed:', e.message));
}

export function securityEvent({ eventType, severity = 'info', userId = null, ip = null, detail = null }) {
  const detailJson = detail ? JSON.stringify(detail).slice(0, 2000) : null;
  q(`INSERT INTO security_events (event_type, severity, user_id, ip, detail)
     VALUES ($1,$2,$3,$4,$5)`, [eventType, severity, userId, ip, detailJson])
    .catch(e => console.error('[securityEvent] pg insert failed:', e.message));
}

export class HttpError extends Error {
  constructor(status, message, code = null) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
