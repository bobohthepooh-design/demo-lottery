// Maker-Checker approval engine — admin back office phase 1
// การกระทำเสี่ยงสูง (เงิน/สิทธิ์/ผลรางวัล) ต้องมี admin คนที่สองอนุมัติก่อน execute
// โหมด: setting 'maker_checker' = 'auto' (default: บังคับเมื่อมี admin ≥2 คน) | 'off'
import { q, qGet, qRun } from '../db/pg.js';
import { audit, HttpError } from '../lib/audit.js';
import { makeReference, txAsync } from '../db/index.js';
import { broadcast } from './events.js';
import { invalidatePermCache } from '../middleware/rbac.js';
import { getSetting } from './settingsService.js';
import * as wallet from './walletService.js';
import * as paySvc from './paymentService.js';
import * as fetcher from './resultFetcher.js';

const now = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

// ---------- mode ----------

// จำนวน user ที่มีสิทธิ์เข้า admin portal (ผ่าน role ใดก็ได้ที่ให้ dashboard.admin)
export async function adminUserCount() {
  const r = await qGet(`SELECT COUNT(DISTINCT ur.user_id) c
    FROM user_roles ur
    JOIN role_permissions rp ON rp.role_id = ur.role_id
    JOIN permissions p ON p.id = rp.permission_id
    WHERE p.code = 'dashboard.admin'`);
  return Number(r?.c || 0);
}

export async function makerCheckerRequired() {
  const mode = await getSetting('maker_checker', 'auto');
  if (mode === 'off') return false;
  if (mode === 'always') return true;
  return (await adminUserCount()) >= 2; // auto
}

// ---------- executors (รันเมื่อ approve หรือรันตรงถ้าไม่ต้อง approval) ----------

async function execRolesUpdate(payload, actorId) {
  const { roleId, permissionIds } = payload;
  await txAsync(async (d) => {
    await d.prepare('DELETE FROM role_permissions WHERE role_id = ?').run(roleId);
    for (const pid of permissionIds) await d.prepare('INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)').run(roleId, pid);
  });
  for (const u of await q(`SELECT user_id FROM user_roles WHERE role_id = $1`, [roleId])) invalidatePermCache(u.user_id);
  audit({ userId: actorId, action: 'admin.roles_update', entityType: 'role', entityId: String(roleId), detail: { permissionIds }, req: null });
  return { ok: true };
}

async function execWalletBulkAdjust(p, actorId) {
  const results = [];
  for (const uid of p.targets) {
    try {
      const r = await wallet.adminAdjust({ adminId: actorId, targetUserId: uid, amount: p.amount, direction: p.direction, reason: p.reason, idempotencyKey: `${p.baseKey}-${uid}` });
      results.push({ userId: uid, ok: true, balance: r.balance });
    } catch (e) {
      results.push({ userId: uid, ok: false, error: e.message });
    }
  }
  return { results, succeeded: results.filter(r => r.ok).length, failed: results.filter(r => !r.ok).length };
}

const EXECUTORS = {
  'wallet.adjust': (p, actorId, ctx) => wallet.adminAdjust({
    adminId: actorId, targetUserId: p.targetUserId, amount: p.amount, direction: p.direction,
    reason: p.reason, idempotencyKey: p.idempotencyKey || `apr-${ctx.reference}`,
  }),
  'wallet.bulk_adjust': execWalletBulkAdjust,
  'payment.review': (p, actorId) => paySvc.adminReview({ adminId: actorId, paymentId: p.paymentId, action: p.action, note: p.note }),
  'roles.update': execRolesUpdate,
  'result.manual': async (p, actorId) => {
    const r = await fetcher.updateDrawResult(actorId, p.drawId, p.winningNumbers);
    broadcast('results'); // ผลเปลี่ยน — ดัน SSE ให้ member/admin UI refresh
    return r;
  },
  // ลบบัญชีสมาชิก — destructive, ต้อง maker-checker; re-check slips ตอน execute
  // (อาจมีโพยเข้ามาระหว่างรอ approve → fail ชัดเจน)
  'member.delete': async (p, actorId) => {
    const id = p.targetUserId;
    const slips = Number((await qGet('SELECT COUNT(*) c FROM bet_slips WHERE user_id=$1', [id]))?.c || 0);
    if (slips > 0) throw new HttpError(400, `ไม่สามารถลบได้ สมาชิกนี้มีประวัติโพย ${slips} รายการ`);
    await txAsync(async (d) => {
      await d.prepare('DELETE FROM virtual_transactions WHERE user_id = ?').run(id);
      await d.prepare('DELETE FROM notifications WHERE user_id = ?').run(id);
      await d.prepare('DELETE FROM chat_messages WHERE sender_id = ?').run(id); // FK ไม่ cascade — ลบทิ้งก่อนลบ user
      await d.prepare('UPDATE audit_logs SET user_id = NULL WHERE user_id = ?').run(id);
      await d.prepare('UPDATE security_events SET user_id = NULL WHERE user_id = ?').run(id);
      await d.prepare('UPDATE lottery_results SET published_by = NULL WHERE published_by = ?').run(id);
      await d.prepare('UPDATE virtual_transactions SET created_by = NULL WHERE created_by = ?').run(id);
      await d.prepare('UPDATE system_settings SET updated_by = NULL WHERE updated_by = ?').run(id);
      // user_roles / user_sessions / virtual_wallets ถูกลบตามด้วย ON DELETE CASCADE
      await d.prepare('DELETE FROM users WHERE id = ?').run(id);
    });
    invalidatePermCache(id);
    audit({ userId: actorId, action: 'admin.member_delete', entityType: 'user', entityId: String(id), detail: { username: p.username, via: 'approval' } });
    return { ok: true };
  },
};

export const APPROVAL_CATEGORIES = Object.keys(EXECUTORS);

// ---------- submit ----------

// routes เรียกตัวนี้แทนการ execute ตรง — คืน { pending:true, request } หรือ { result }
export async function submitOrExecute({ category, payload, summary, makerId, req }) {
  const executor = EXECUTORS[category];
  if (!executor) throw new HttpError(500, `ไม่มี executor สำหรับ category ${category}`);
  if (!(await makerCheckerRequired())) {
    const result = await executor(payload, makerId, { reference: 'direct' });
    return { direct: true, result };
  }
  const reference = makeReference('APR');
  const ins = await q(`INSERT INTO approval_requests (reference, category, payload, summary, maker_id)
    VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [reference, category, JSON.stringify(payload), summary, makerId]);
  const id = ins[0].id;
  audit({ userId: makerId, action: 'approval.requested', entityType: 'approval_request', entityId: reference,
    detail: { category, summary }, req });
  broadcast('approvals');
  return { pending: true, request: await getApproval(id) };
}

// ---------- decide ----------

export async function decide({ id, checkerId, approve, note, req }) {
  const r = await qGet('SELECT * FROM approval_requests WHERE id = $1', [id]);
  if (!r) throw new HttpError(404, 'ไม่พบคำขออนุมัติ');
  if (r.status !== 'pending') throw new HttpError(409, `คำขอนี้ถูกดำเนินการแล้ว (${r.status})`, 'BAD_STATE');
  if (Number(r.maker_id) === Number(checkerId))
    throw new HttpError(403, 'ผู้สร้างคำขออนุมัติคำขอของตนเองไม่ได้ (maker ≠ checker)', 'SELF_APPROVAL');

  const t = now();
  // atomic transition — กัน approve ซ้ำพร้อมกัน 2 admin
  const upd = await q(`UPDATE approval_requests
    SET status = $1, checker_id = $2, checker_note = $3, decided_at = $4, updated_at = $4
    WHERE id = $5 AND status = 'pending' RETURNING *`,
    [approve ? 'approved' : 'rejected', checkerId, note || null, t, id]);
  if (!upd.length) throw new HttpError(409, 'คำขอนี้ถูกดำเนินการแล้ว', 'BAD_STATE');
  let row = upd[0];

  audit({ userId: checkerId, action: approve ? 'approval.approved' : 'approval.rejected',
    entityType: 'approval_request', entityId: r.reference,
    detail: { category: r.category, note: note || null }, req });

  if (!approve) { broadcast('approvals'); return row; }

  // execute — ผลลัพธ์บันทึกลง request เพื่อ replay/audit ได้
  try {
    const result = await EXECUTORS[r.category](JSON.parse(r.payload), Number(r.maker_id), { reference: r.reference });
    const ex = await q(`UPDATE approval_requests
      SET status='executed', executed_at=$1, execution_result=$2, updated_at=$1
      WHERE id=$3 RETURNING *`, [now(), JSON.stringify(result ?? { ok: true }).slice(0, 2000), id]);
    row = ex[0];
    await audit({ userId: checkerId, action: 'approval.executed', entityType: 'approval_request',
      entityId: r.reference, detail: { category: r.category, makerId: r.maker_id }, req });
  } catch (e) {
    await q(`UPDATE approval_requests
      SET status='failed', executed_at=$1, execution_result=$2, updated_at=$1
      WHERE id=$3`, [now(), String(e.message || e).slice(0, 2000), id]);
    audit({ userId: checkerId, action: 'approval.execute_failed', entityType: 'approval_request',
      entityId: r.reference, detail: { category: r.category, error: e.message }, req });
    broadcast('approvals');
    throw e;
  }
  broadcast('approvals');
  return row;
}

export async function cancel({ id, userId }) {
  const upd = await q(`UPDATE approval_requests SET status='cancelled', updated_at=$1
    WHERE id=$2 AND maker_id=$3 AND status='pending' RETURNING *`, [now(), id, userId]);
  if (!upd.length) {
    const r = await qGet('SELECT status, maker_id FROM approval_requests WHERE id=$1', [id]);
    if (!r) throw new HttpError(404, 'ไม่พบคำขออนุมัติ');
    if (Number(r.maker_id) !== Number(userId)) throw new HttpError(403, 'ยกเลิกได้เฉพาะคำขอของตนเอง', 'FORBIDDEN');
    throw new HttpError(409, 'ยกเลิกได้เฉพาะคำขอที่ยังรออยู่', 'BAD_STATE');
  }
  audit({ userId, action: 'approval.cancelled', entityType: 'approval_request', entityId: String(id) });
  broadcast('approvals');
  return upd[0];
}

// ---------- query ----------

export async function listApprovals({ status = null, category = null, q: search = '', limit = 50, offset = 0 } = {}) {
  let sql = `SELECT a.*, mu.username AS maker_name, cu.username AS checker_name
    FROM approval_requests a
    LEFT JOIN users mu ON mu.id = a.maker_id
    LEFT JOIN users cu ON cu.id = a.checker_id WHERE 1=1`;
  const args = [];
  if (status) { sql += ` AND a.status = $${args.length + 1}`; args.push(status); }
  if (category) { sql += ` AND a.category = $${args.length + 1}`; args.push(category); }
  if (search) { sql += ` AND (a.reference ILIKE $${args.length + 1} OR a.summary ILIKE $${args.length + 1})`; args.push(`%${search}%`); }
  const total = (await qGet(`SELECT COUNT(*) c FROM (${sql}) t`, args)).c;
  sql += ` ORDER BY a.id DESC LIMIT $${args.length + 1} OFFSET $${args.length + 2}`;
  args.push(limit, offset);
  const rows = await q(sql, args);
  return { requests: rows.map(r => ({ ...r, payload: undefined })), total: Number(total), limit, offset };
}

export async function getApproval(id) {
  const r = await qGet(`SELECT a.*, mu.username AS maker_name, cu.username AS checker_name
    FROM approval_requests a
    LEFT JOIN users mu ON mu.id = a.maker_id
    LEFT JOIN users cu ON cu.id = a.checker_id
    WHERE a.id = $1`, [id]);
  if (!r) throw new HttpError(404, 'ไม่พบคำขออนุมัติ');
  return r;
}
