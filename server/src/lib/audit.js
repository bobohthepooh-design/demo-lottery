import crypto from 'node:crypto';
import { q } from '../db/pg.js';

// audit hash-chain — แต่ละ row ผูกกับ hash ของ row ก่อนหน้า (prev_hash)
// ทำให้แก้/ลบ/แทรกแถวย้อนหลังถูกตรวจจับได้ผ่าน /admin/audit/verify
// insert ถูก serialize ผ่าน promise chain เพื่อให้ลำดับ id ตรงกับลำดับ hash
const canon = (r) => [r.prev_hash || '', r.user_id ?? '', r.action || '', r.entity_type || '',
  r.entity_id || '', r.detail || '', r.ip || '', r.user_agent || '', r.correlation_id || ''].join('|');
const hashOf = (r) => crypto.createHash('sha256').update(canon(r)).digest('hex');

let tail = Promise.resolve();

async function insertAudit(row) {
  const last = await q('SELECT hash FROM audit_logs ORDER BY id DESC LIMIT 1');
  const prev = last[0]?.hash || null;
  const full = { ...row, prev_hash: prev };
  full.hash = hashOf(full);
  await q(`INSERT INTO audit_logs
    (user_id, action, entity_type, entity_id, detail, ip, user_agent, correlation_id, prev_hash, hash)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [full.user_id, full.action, full.entity_type, full.entity_id, full.detail,
     full.ip, full.user_agent, full.correlation_id, full.prev_hash, full.hash]);
}

export function audit({ userId = null, action, entityType = null, entityId = null, detail = null, req = null }) {
  const detailJson = detail ? JSON.stringify(detail).slice(0, 4000) : null;
  const ip = req?.ip || null;
  const ua = req?.headers?.['user-agent']?.slice(0, 300) || null;
  const row = {
    user_id: userId, action, entity_type: entityType, entity_id: entityId == null ? null : String(entityId),
    detail: detailJson, ip, user_agent: ua, correlation_id: req?.requestId || null,
  };
  // fire-and-forget — audit log ไม่ block request; caller ไม่ต้อง await
  tail = tail.then(() => insertAudit(row)).catch(e => console.error('[audit] pg insert failed:', e.message));
}

// ตรวจสอบ hash chain ทั้งตาราง — คืน { ok, checked, firstBreak }
// แถวเก่า (ก่อน migration 033, hash IS NULL) ไม่อยู่ใน chain — ข้ามไป
// แถวแรกที่มี hash ต้องเป็น genesis (prev_hash NULL) ไม่เช่นนั้น = มีการลบ genesis
export async function verifyAuditChain() {
  let prevHash = null, started = false, checked = 0, hashed = 0, lastId = 0;
  for (;;) {
    const rows = await q(`SELECT id, user_id, action, entity_type, entity_id, detail, ip, user_agent,
        correlation_id, prev_hash, hash FROM audit_logs WHERE id > $1 ORDER BY id LIMIT 500`, [lastId]);
    if (!rows.length) break;
    for (const r of rows) {
      checked++;
      lastId = r.id;
      if (r.hash == null) continue; // legacy row นอก chain
      hashed++;
      if (!started) {
        if (r.prev_hash != null) return { ok: false, checked, hashed, firstBreak: { id: r.id, reason: 'missing_genesis' } };
        started = true;
      } else if (r.prev_hash !== prevHash) {
        return { ok: false, checked, hashed, firstBreak: { id: r.id, reason: 'prev_hash_mismatch', expected: prevHash, actual: r.prev_hash } };
      }
      if (hashOf(r) !== r.hash) return { ok: false, checked, hashed, firstBreak: { id: r.id, reason: 'hash_mismatch' } };
      prevHash = r.hash;
    }
  }
  return { ok: true, checked, hashed };
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
