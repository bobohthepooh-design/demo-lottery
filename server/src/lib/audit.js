import { getDb } from '../db/index.js';

export function audit({ userId = null, action, entityType = null, entityId = null, detail = null, req = null }) {
  const db = getDb();
  db.prepare(`INSERT INTO audit_logs (user_id, action, entity_type, entity_id, detail, ip, user_agent)
              VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(userId, action, entityType, entityId,
      detail ? JSON.stringify(detail).slice(0, 4000) : null,
      req?.ip || null, req?.headers?.['user-agent']?.slice(0, 300) || null);
}

export function securityEvent({ eventType, severity = 'info', userId = null, ip = null, detail = null }) {
  const db = getDb();
  db.prepare(`INSERT INTO security_events (event_type, severity, user_id, ip, detail)
              VALUES (?, ?, ?, ?, ?)`)
    .run(eventType, severity, userId, ip, detail ? JSON.stringify(detail).slice(0, 2000) : null);
}

export class HttpError extends Error {
  constructor(status, message, code = null) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
