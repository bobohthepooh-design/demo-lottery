import { getDb } from '../db/index.js';
import { config } from '../config.js';
import { q } from '../db/pg.js';

// dual-mode: DATABASE_URL ตั้งไว้ = PostgreSQL (async fire-and-forget), ไม่ตั้ง = SQLite (sync)
const isPg = () => !!config.databaseUrl;

export function audit({ userId = null, action, entityType = null, entityId = null, detail = null, req = null }) {
  const detailJson = detail ? JSON.stringify(detail).slice(0, 4000) : null;
  const ip = req?.ip || null;
  const ua = req?.headers?.['user-agent']?.slice(0, 300) || null;
  if (isPg()) {
    // fire-and-forget — audit log ไม่ block request; caller ไม่ต้อง await
    q(`INSERT INTO audit_logs (user_id, action, entity_type, entity_id, detail, ip, user_agent)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [userId, action, entityType, entityId, detailJson, ip, ua])
      .catch(e => console.error('[audit] pg insert failed:', e.message));
    return;
  }
  const db = getDb();
  db.prepare(`INSERT INTO audit_logs (user_id, action, entity_type, entity_id, detail, ip, user_agent)
              VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(userId, action, entityType, entityId, detailJson, ip, ua);
}

export function securityEvent({ eventType, severity = 'info', userId = null, ip = null, detail = null }) {
  const detailJson = detail ? JSON.stringify(detail).slice(0, 2000) : null;
  if (isPg()) {
    q(`INSERT INTO security_events (event_type, severity, user_id, ip, detail)
       VALUES ($1,$2,$3,$4,$5)`, [eventType, severity, userId, ip, detailJson])
      .catch(e => console.error('[securityEvent] pg insert failed:', e.message));
    return;
  }
  const db = getDb();
  db.prepare(`INSERT INTO security_events (event_type, severity, user_id, ip, detail)
              VALUES (?, ?, ?, ?, ?)`)
    .run(eventType, severity, userId, ip, detailJson);
}

export class HttpError extends Error {
  constructor(status, message, code = null) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
