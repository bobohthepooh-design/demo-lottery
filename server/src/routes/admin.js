import { Router } from 'express';
import { z } from 'zod';
import { getDb, txAsync } from '../db/index.js';
import { requireAuth, requireMfaVerified } from '../services/authService.js';
import { requirePerm, requireRole, hasRole, invalidatePermCache } from '../middleware/rbac.js';
import { audit, securityEvent, HttpError, verifyAuditChain, rebuildAuditChain } from '../lib/audit.js';
import { hashPassword } from '../lib/password.js';
import * as lottery from '../services/lotteryService.js';
import * as wallet from '../services/walletService.js';
import * as settings from '../services/settingsService.js';
import * as promo from '../services/promoService.js';
import * as fetcher from '../services/resultFetcher.js';
import { broadcast } from '../services/events.js';
import { config } from '../config.js';
import { seedDemoDraws, drawSchedulePreview } from '../db/demo-data.js';
import { notify } from '../services/notifyService.js';
import * as approvals from '../services/approvalService.js';
import * as ops from '../services/opsService.js';
import * as ledger from '../services/ledgerService.js';

const router = Router();

// บังคับ MFA สำหรับทุกบัญชีที่เข้า admin portal — mfa_enabled=0 → ต้องไป setup ก่อน
const requireAdminMfa = (req, res, next) => {
  if (!req.user?.mfaEnabled) {
    return res.status(403).json({ error: 'บัญชีผู้ดูแลต้องเปิดใช้ MFA ก่อนเข้าใช้งาน — ไปที่ โปรไฟล์ > ตั้งค่า MFA', code: 'MFA_ENROLLMENT_REQUIRED' });
  }
  next();
};

// ---------- admin IP allowlist ----------
// กำหนดได้ 2 ทาง: env ADMIN_ALLOWED_IPS (comma-separated) หรือ setting admin_allowed_ips
// รูปแบบ: "1.2.3.4" หรือ CIDR "1.2.3.0/24" — ว่างทั้งคู่ = อนุญาตทุก IP (default)
function ipToInt(ip) {
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  return ((p[0] << 24) | (p[1] << 16) | (p[2] << 8) | p[3]) >>> 0;
}
function normIp(ip) {
  const s = String(ip).replace(/^::ffff:/, '');
  return s === '::1' ? '127.0.0.1' : s; // IPv6 loopback ≡ IPv4 loopback
}
function ipAllowed(clientIp, rule) {
  const ip = normIp(clientIp);
  if (rule === ip) return true;
  if (rule.includes('/')) {
    const [base, bits] = rule.split('/');
    const b = parseInt(bits, 10);
    const bi = ipToInt(base), ii = ipToInt(ip);
    if (bi == null || ii == null || !Number.isInteger(b) || b < 0 || b > 32) return false;
    const mask = b === 0 ? 0 : (~0 << (32 - b)) >>> 0;
    return (ii & mask) === (bi & mask);
  }
  return false;
}
async function adminAllowedIpList() {
  const env = String(process.env.ADMIN_ALLOWED_IPS || '').split(',').map(s => s.trim()).filter(Boolean);
  if (env.length) return env;
  const v = await settings.getSetting('admin_allowed_ips', []);
  const arr = Array.isArray(v) ? v : String(v || '').split(',');
  return arr.map(s => String(s).trim()).filter(Boolean);
}
const adminIpGuard = async (req, res, next) => {
  try {
    const list = await adminAllowedIpList();
    if (!list.length) return next();
    const clientIp = normIp(req.ip || '');
    if (list.some(rule => ipAllowed(clientIp, rule))) return next();
    audit({ userId: req.user?.id || null, action: 'admin.ip_blocked', entityType: 'admin', detail: { ip: clientIp }, req });
    return res.status(403).json({ error: 'IP นี้ไม่ได้รับอนุญาตเข้าใช้งาน admin', code: 'IP_NOT_ALLOWED' });
  } catch (e) { next(e); }
};

router.use(adminIpGuard, requireAuth, requireMfaVerified, requireAdminMfa, requirePerm('dashboard.admin'));

// ---------- helpers ----------
const db = () => getDb();

async function memberDto(u) {
  const w = await db().prepare('SELECT balance FROM virtual_wallets WHERE user_id = ?').get(u.id);
  const roles = (await db().prepare(`SELECT r.name FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=?`).all(u.id)).map(r=>r.name);
  return { id: u.id, username: u.username, email: u.email, displayName: u.display_name, status: u.status,
    balance: w?.balance ?? 0, roles, createdAt: u.created_at, mfaEnabled: !!u.mfa_enabled,
    withdrawUnlocked: !!u.withdraw_unlocked,
    ageConfirmed: !!u.age_confirmed, selfExcludedUntil: u.self_excluded_until,
    dailyLimitSatang: u.daily_limit_satang, monthlyLimitSatang: u.monthly_limit_satang,
    kycStatus: u.kyc_status || 'none' };
}

// ป้องกัน privilege escalation — admin ธรรมดา (มี members.manage) ห้ามแก้/ลบบัญชี super_admin
async function assertCanManageTarget(req, targetId) {
  const isSuperTarget = await db().prepare(`SELECT 1 FROM user_roles ur JOIN roles r ON r.id=ur.role_id
    WHERE ur.user_id = ? AND r.name = 'super_admin'`).get(targetId);
  if (isSuperTarget && !(await hasRole(req.user.id, 'super_admin'))) {
    throw new HttpError(403, 'ไม่มีสิทธิ์จัดการบัญชี super_admin', 'FORBIDDEN');
  }
}

// ---------- dashboard overview ----------
router.get('/overview', requirePerm('dashboard.admin'), async (req, res) => {
  const d = db();
  const one = async (sql, ...a) => (await d.prepare(sql).get(...a));
  const txSum = async (type) => (await one('SELECT COALESCE(SUM(amount),0) s FROM virtual_transactions WHERE type = ?', type)).s;
  // รายรับ/รายจ่ายของระบบเครดิตจำลอง แยกตามประเภทธุรกรรม
  const money = {
    deposit: await txSum('deposit'),          // สมาชิกเติมเครดิตเอง
    adminCredit: await txSum('admin_adjust'), // admin เพิ่มเครดิตให้
    initialCredit: await txSum('initial_credit'),
    withdraw: await txSum('withdraw'),        // สมาชิกถอนเครดิต
    adminDebit: await txSum('admin_debit'),
    staked: await txSum('bet_debit'),         // ยอดเดิมพันรวม
    winnings: await txSum('win_credit'),      // ยอดจ่ายรางวัล
    refunds: await txSum('bet_refund'),       // คืนเงินคืนโพย
  };
  money.totalIn = money.deposit + money.adminCredit + money.initialCredit;
  money.totalOut = money.withdraw + money.adminDebit + money.winnings + money.refunds;
  // house margin = ยอดเดิมพัน − เงินรางวัล − เงินคืน (demo: ติดลบได้ถ้าจ่ายเกิน)
  money.houseNet = money.staked - money.winnings - money.refunds;
  // ยอดเข้า-ออก 7 วันล่าสุด (stacked bars)
  const daily = (await d.prepare(`SELECT date(created_at) AS "day",
      COALESCE(SUM(CASE WHEN direction='credit' THEN amount ELSE 0 END),0) inn,
      COALESCE(SUM(CASE WHEN direction='debit' THEN amount ELSE 0 END),0) out
    FROM virtual_transactions
    WHERE created_at >= date('now','-6 days')
    GROUP BY "day" ORDER BY "day"`).all())
    .map(r => ({ day: r.day, inn: r.inn, out: r.out }));
  res.json({
    members: (await one('SELECT COUNT(*) c FROM users')).c,
    activeDraws: (await one(`SELECT COUNT(*) c FROM lottery_draws WHERE status='open'`)).c,
    pendingBets: (await one(`SELECT COUNT(*) c FROM bet_items WHERE status='pending'`)).c,
    totalStaked: (await one(`SELECT COALESCE(SUM(total_stake),0) s FROM bet_slips WHERE status='pending'`)).s,
    totalPaid: (await one(`SELECT COALESCE(SUM(total_payout),0) s FROM bet_slips WHERE status IN ('won','partial','lost')`)).s,
    walletLiability: (await one('SELECT COALESCE(SUM(balance),0) s FROM virtual_wallets')).s,
    // รอบหวยจริงที่เลยเวลาออกรางวัลแล้วยังไม่ออกผล (ยกเว้นเกมด่วน SC/HL)
    overdueDraws: (await one(`SELECT COUNT(*) c FROM lottery_draws d
      JOIN lottery_types lt ON lt.id = d.lottery_type_id
      WHERE d.status IN ('open','scheduled','closed') AND d.draw_at <= datetime('now')
        AND lt.code NOT IN ('SC','HL','KI')
        AND d.id NOT IN (SELECT draw_id FROM lottery_results)`)).c,
    money, daily,
    recentAudit: await d.prepare('SELECT * FROM audit_logs ORDER BY id DESC LIMIT 10').all(),
    recentSecurity: await d.prepare(`SELECT * FROM security_events ORDER BY id DESC LIMIT 10`).all(),
  });
});

// ---------- members ----------
router.get('/members', requirePerm('members.manage'), async (req, res) => {
  const q = `%${(req.query.q || '').slice(0, 100)}%`;
  const limit = Math.min(parseInt(req.query.limit || '100', 10) || 100, 500);
  const offset = Math.max(parseInt(req.query.offset || '0', 10) || 0, 0);
  const where = `WHERE username LIKE ? OR email LIKE ? OR display_name LIKE ?`;
  const args = [q, q, q];
  const total = (await db().prepare(`SELECT COUNT(*) c FROM users ${where}`).get(...args)).c;
  const rows = await db().prepare(`SELECT * FROM users ${where} ORDER BY id DESC LIMIT ? OFFSET ?`).all(...args, limit, offset);
  res.json({ members: await Promise.all(rows.map(memberDto)), total, limit, offset });
});

const memberUpdateSchema = z.object({
  status: z.enum(['active', 'locked', 'disabled']).optional(),
  displayName: z.string().max(100).optional(),
  password: z.string().min(8).max(128).optional(),
  withdrawUnlocked: z.boolean().optional(),
});

router.patch('/members/:id', requirePerm('members.manage'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const data = memberUpdateSchema.parse(req.body);
    const target = await db().prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (!target) return res.status(404).json({ error: 'ไม่พบสมาชิก' });
    await assertCanManageTarget(req, id);
    if (data.status && id === req.user.id && data.status !== 'active')
      return res.status(400).json({ error: 'ไม่สามารถเปลี่ยนสถานะบัญชีของตัวเองได้' });
    if (data.status) await db().prepare(`UPDATE users SET status=?, updated_at=datetime('now') WHERE id=?`).run(data.status, id);
    if (data.displayName) await db().prepare(`UPDATE users SET display_name=?, updated_at=datetime('now') WHERE id=?`).run(data.displayName, id);
    if (data.withdrawUnlocked !== undefined) {
      await db().prepare(`UPDATE users SET withdraw_unlocked=?, updated_at=datetime('now') WHERE id=?`).run(data.withdrawUnlocked ? 1 : 0, id);
    }
    if (data.password) {
      await db().prepare(`UPDATE users SET password_hash=?, updated_at=datetime('now') WHERE id=?`).run(hashPassword(data.password), id);
      await db().prepare(`UPDATE user_sessions SET revoked_at=datetime('now') WHERE user_id=? AND revoked_at IS NULL`).run(id);
      securityEvent({ eventType: 'admin.member_password_reset', severity: 'warning', userId: id,
        ip: req.ip, detail: { by: req.user.id } });
    }
    invalidatePermCache(id);
    // ห้ามบันทึกรหัสผ่านลง audit detail — เก็บแค่สถานะว่ามีการเปลี่ยน
    const auditDetail = { ...data, password: data.password ? '(changed)' : undefined };
    audit({ userId: req.user.id, action: 'admin.member_update', entityType: 'user', entityId: String(id), detail: auditDetail, req });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.delete('/members/:id', requirePerm('members.manage'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (id === req.user.id) return res.status(400).json({ error: 'ไม่สามารถลบบัญชีของตัวเองได้' });
    const target = await db().prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (!target) return res.status(404).json({ error: 'ไม่พบสมาชิก' });
    await assertCanManageTarget(req, id);
    // pre-check ให้ feedback เร็ว — executor re-check อีกครั้งตอน approve (กันโพยเข้ามาระหว่างรอ)
    const slips = (await db().prepare('SELECT COUNT(*) c FROM bet_slips WHERE user_id = ?').get(id)).c;
    if (slips > 0) return res.status(400).json({ error: `ไม่สามารถลบได้ สมาชิกนี้มีประวัติโพย ${slips} รายการ` });
    const r = await approvals.submitOrExecute({
      category: 'member.delete',
      payload: { targetUserId: id, username: target.username },
      summary: `ลบบัญชีสมาชิก ${target.username} (#${id})`,
      makerId: req.user.id, req,
    });
    if (r.pending) return res.json({ ok: true, pendingApproval: true, approval: r.request });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// member 360° — profile + wallet + login history + sessions + payments + bets + audit
router.get('/members/:id/activity', requirePerm('members.manage'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const u = await db().prepare(`SELECT id, username, email, display_name, status, created_at,
      mfa_enabled, email_verified, age_confirmed, self_excluded_until,
      daily_limit_satang, monthly_limit_satang, withdraw_unlocked,
      kyc_status, kyc_requested_at, kyc_reviewed_at, kyc_note FROM users WHERE id = ?`).get(id);
    if (!u) return res.status(404).json({ error: 'ไม่พบสมาชิก' });
    const w = await db().prepare('SELECT balance FROM virtual_wallets WHERE user_id = ?').get(id);
    const authEvents = await db().prepare(`SELECT event, ip, user_agent, created_at FROM auth_events
      WHERE user_id = ? ORDER BY id DESC LIMIT 20`).all(id);
    const sessions = await db().prepare(`SELECT id, created_at, expires_at, ip, user_agent, mfa_verified
      FROM user_sessions WHERE user_id = ? AND revoked_at IS NULL ORDER BY created_at DESC LIMIT 10`).all(id);
    const payments = await db().prepare(`SELECT id, reference, kind, amount, status, created_at, reviewed_at
      FROM payment_requests WHERE user_id = ? ORDER BY id DESC LIMIT 10`).all(id);
    const betStats = await db().prepare(`SELECT COUNT(*) c, COALESCE(SUM(total_stake),0) s
      FROM bet_slips WHERE user_id = ?`).get(id);
    const recentBets = await db().prepare(`SELECT id, draw_id, status, total_stake, total_payout, created_at
      FROM bet_slips WHERE user_id = ? ORDER BY id DESC LIMIT 10`).all(id);
    const walletTx = await db().prepare(`SELECT reference, type, direction, amount, balance_after, description, created_at
      FROM virtual_transactions WHERE user_id = ? ORDER BY id DESC LIMIT 10`).all(id);
    const auditRows = await db().prepare(`SELECT action, entity_type, entity_id, detail, created_at
      FROM audit_logs WHERE user_id = ? ORDER BY id DESC LIMIT 15`).all(id);
    // risk flags — rule engine (riskService) + สถานะ persisted ใน risk_flags
    const { computeFlags } = await import('../services/riskService.js');
    const computed = await computeFlags(id);
    const persisted = await db().prepare(`SELECT id, code, status, score FROM risk_flags
      WHERE user_id = ? AND status IN ('open','acknowledged')`).all(id);
    const persistedByCode = Object.fromEntries(persisted.map(p => [p.code, p]));
    const riskFlags = computed.map(f => ({ ...f, flagId: persistedByCode[f.code]?.id || null,
      flagStatus: persistedByCode[f.code]?.status || null }));
    const fin = await db().prepare(`SELECT
      COALESCE(SUM(CASE WHEN kind='deposit' AND status='approved' THEN amount END),0) dep,
      COALESCE(SUM(CASE WHEN kind='withdraw' AND status='approved' THEN amount END),0) wd
      FROM payment_requests WHERE user_id = ?`).get(id);
    res.json({
      user: { ...u, balance: w?.balance ?? 0, roles: (await db().prepare(`SELECT r.name FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=?`).all(id)).map(r => r.name) },
      authEvents, sessions, payments, recentBets, walletTx, auditRows, riskFlags,
      betStats: { count: betStats?.c || 0, totalStaked: betStats?.s || 0 },
      financials: { deposit: fin.dep, withdraw: fin.wd },
    });
  } catch (e) { next(e); }
});

// ---------- KYC review (manual) ----------

router.get('/kyc', requirePerm('members.manage'), async (req, res, next) => {
  try {
    const status = ['pending', 'verified', 'rejected'].includes(req.query.status) ? req.query.status : null;
    const where = status ? 'WHERE u.kyc_status = ?' : `WHERE u.kyc_status <> 'none'`;
    const args = status ? [status] : [];
    const rows = await db().prepare(`SELECT u.id, u.username, u.display_name, u.email, u.status,
        u.kyc_status, u.kyc_requested_at, u.kyc_reviewed_at, u.kyc_note, u.email_verified, u.created_at
      FROM users u ${where} ORDER BY u.kyc_requested_at DESC NULLS LAST, u.id DESC LIMIT 200`).all(...args);
    res.json({ kyc: rows });
  } catch (e) { next(e); }
});

const kycReviewSchema = z.object({
  action: z.enum(['verify', 'reject']),
  note: z.string().max(500).optional(),
});
router.post('/kyc/:userId/review', requirePerm('members.manage'), async (req, res, next) => {
  try {
    const userId = Number(req.params.userId);
    const { action, note } = kycReviewSchema.parse(req.body);
    if (action === 'reject' && (!note || note.trim().length < 3))
      return res.status(400).json({ error: 'กรุณาระบุเหตุผลการปฏิเสธ', code: 'NOTE_REQUIRED' });
    const target = await db().prepare('SELECT id, username, kyc_status FROM users WHERE id = ?').get(userId);
    if (!target) return res.status(404).json({ error: 'ไม่พบสมาชิก' });
    if (target.kyc_status !== 'pending') return res.status(400).json({ error: `สถานะ KYC ปัจจุบันคือ ${target.kyc_status} — review ได้เฉพาะ pending` });
    const t = new Date().toISOString().replace('T', ' ').slice(0, 19);
    await db().prepare(`UPDATE users SET kyc_status=?, kyc_reviewed_by=?, kyc_reviewed_at=?, kyc_note=?, updated_at=? WHERE id=?`)
      .run(action === 'verify' ? 'verified' : 'rejected', req.user.id, t, note || null, t, userId);
    audit({ userId: req.user.id, action: `kyc.${action === 'verify' ? 'verified' : 'rejected'}`, entityType: 'user', entityId: String(userId), detail: { target: target.username, note: note || null }, req });
    broadcast('kyc');
    res.json({ ok: true, kycStatus: action === 'verify' ? 'verified' : 'rejected' });
  } catch (e) { next(e); }
});

// ---------- support / dispute tickets (admin) ----------

router.get('/tickets', requirePerm('members.manage'), async (req, res, next) => {
  try {
    const status = ['open', 'in_progress', 'resolved', 'closed'].includes(req.query.status) ? req.query.status : null;
    const where = status ? 'WHERE t.status = ?' : '';
    const args = status ? [status] : [];
    const rows = await db().prepare(`SELECT t.*, u.username, u.display_name, au.username AS admin_name
      FROM support_tickets t JOIN users u ON u.id = t.user_id
      LEFT JOIN users au ON au.id = t.admin_id
      ${where} ORDER BY t.id DESC LIMIT 200`).all(...args);
    res.json({ tickets: rows });
  } catch (e) { next(e); }
});

const ticketReplySchema = z.object({
  reply: z.string().min(1).max(3000),
  status: z.enum(['in_progress', 'resolved', 'closed']).optional(),
});
router.post('/tickets/:id/reply', requirePerm('members.manage'), async (req, res, next) => {
  try {
    const { reply, status } = ticketReplySchema.parse(req.body);
    const t = await db().prepare('SELECT id, status, user_id FROM support_tickets WHERE id = ?').get(Number(req.params.id));
    if (!t) return res.status(404).json({ error: 'ไม่พบ ticket' });
    if (t.status === 'closed') return res.status(400).json({ error: 'ticket นี้ปิดแล้ว' });
    const newStatus = status || (t.status === 'open' ? 'in_progress' : t.status);
    const resolvedAt = newStatus === 'resolved' || newStatus === 'closed' ? new Date().toISOString().replace('T', ' ').slice(0, 19) : null;
    await db().prepare(`UPDATE support_tickets SET admin_reply=?, admin_id=?, status=?, resolved_at=COALESCE(?, resolved_at), updated_at=? WHERE id=?`)
      .run(reply, req.user.id, newStatus, resolvedAt, new Date().toISOString().replace('T', ' ').slice(0, 19), t.id);
    audit({ userId: req.user.id, action: 'ticket.reply', entityType: 'support_ticket', entityId: String(t.id), detail: { status: newStatus }, req });
    broadcast('tickets');
    res.json({ ok: true, status: newStatus });
  } catch (e) { next(e); }
});

// ---------- responsible gaming — รายชื่อสมาชิกที่มีข้อจำกัด ----------

router.get('/rg/restricted', requirePerm('members.manage'), async (req, res) => {
  try {
    const rows = await db().prepare(`SELECT u.id, u.username, u.display_name, u.status,
        u.self_excluded_until, u.daily_limit_satang, u.monthly_limit_satang,
        (SELECT COALESCE(SUM(total_stake),0) FROM bet_slips b WHERE b.user_id = u.id AND b.created_at > datetime('now','-1 day')) staked_24h
      FROM users u
      WHERE u.self_excluded_until IS NOT NULL OR u.daily_limit_satang IS NOT NULL OR u.monthly_limit_satang IS NOT NULL
      ORDER BY u.id DESC LIMIT 200`).all();
    res.json({ restricted: rows });
  } catch (e) { next(e); }
});

// ---------- roles ----------
router.get('/roles', requirePerm('roles.manage'), async (req, res) => {
  const roles = await db().prepare('SELECT * FROM roles ORDER BY id').all();
  const perms = await db().prepare('SELECT * FROM permissions ORDER BY code').all();
  const rp = await db().prepare('SELECT role_id, permission_id FROM role_permissions').all();
  res.json({
    roles: roles.map(r => ({ ...r, permissions: rp.filter(x => x.role_id === r.id).map(x => x.permission_id) })),
    permissions: perms,
  });
});

const rolePermSchema = z.object({
  roleId: z.number().int().positive(),
  permissionIds: z.array(z.number().int().positive()),
});

router.put('/roles/permissions', requirePerm('roles.manage'), requireRole('super_admin'), async (req, res, next) => {
  try {
    const { roleId, permissionIds } = rolePermSchema.parse(req.body);
    const role = await db().prepare('SELECT name FROM roles WHERE id = ?').get(roleId);
    if (!role) return res.status(404).json({ error: 'ไม่พบ role' });
    const r = await approvals.submitOrExecute({
      category: 'roles.update',
      payload: { roleId, permissionIds },
      summary: `เปลี่ยนสิทธิ์ role "${role.name}" (${permissionIds.length} permissions)`,
      makerId: req.user.id, req,
    });
    if (r.pending) return res.json({ ok: true, pendingApproval: true, approval: r.request });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ---------- lottery types & rules ----------
router.get('/lottery/types', requirePerm('lottery.manage'), async (req, res) => {
  res.json({ types: await lottery.listLotteryTypes({ activeOnly: false }) });
});

const typeSchema = z.object({
  code: z.string().min(1).max(20),
  name_th: z.string().min(1).max(200),
  name_en: z.string().max(200).optional(),
  description: z.string().max(500).optional(),
  is_active: z.number().int().min(0).max(1).optional(),
  result_mode: z.enum(['auto', 'manual']).optional(),
});

router.post('/lottery/types', requirePerm('lottery.manage'), async (req, res, next) => {
  try {
    const t = typeSchema.parse(req.body);
    if (!/^[A-Z0-9_-]{2,10}$/i.test(t.code)) return res.status(400).json({ error: 'code ต้องเป็นตัวอักษร/ตัวเลข 2-10 ตัว' });
    const r = await db().prepare('INSERT INTO lottery_types (code,name_th,name_en,description,is_active,result_mode) VALUES (?,?,?,?,?,?)')
      .run(t.code, t.name_th, t.name_en || null, t.description || null, t.is_active ?? 1, t.result_mode ?? 'auto');
    audit({ userId: req.user.id, action: 'admin.lottery_type_create', entityType: 'lottery_type', entityId: String(r.lastInsertRowid), req });
    broadcast('settings');
    res.status(201).json({ ok: true, id: Number(r.lastInsertRowid) });
  } catch (e) { next(e); }
});

router.patch('/lottery/types/:id', requirePerm('lottery.manage'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const t = typeSchema.partial().parse(req.body);
    // code เป็น identity ที่ service/ผลรางวัลอ้างอิง (SC/HL/KI/HR ฯลฯ) — เปลี่ยนได้ชื่ออย่างเดียว
    delete t.code;
    const fields = Object.keys(t).filter(k => t[k] !== undefined);
    if (!fields.length) return res.status(400).json({ error: 'ไม่มีข้อมูล' });
    await db().prepare(`UPDATE lottery_types SET ${fields.map(f => `${f}=?`).join(',')} WHERE id=?`)
      .run(...fields.map(f => t[f]), id);
    audit({ userId: req.user.id, action: 'admin.lottery_type_update', entityType: 'lottery_type', entityId: String(id), detail: t, req });
    broadcast('settings');
    res.json({ ok: true });
  } catch (e) { next(e); }
});

const ruleSchema = z.object({
  lottery_type_id: z.number().int().positive(),
  category_id: z.number().int().positive().nullable().optional(),
  bet_type: z.string().min(1).max(50),
  name_th: z.string().min(1).max(200),
  name_en: z.string().max(200).optional(),
  digits: z.number().int().min(0).max(10), // 0 = ประเภทที่ไม่ใช่ตัวเลข (เช่น ราศี)
  match_config: z.string().min(2).max(1000),
  payout_multiplier: z.number().min(0).max(100000),
  stake_unit: z.number().int().min(1).max(100000),
  min_amount: z.number().int().min(1),
  max_amount: z.number().int().min(1).nullable().optional(),
  is_active: z.number().int().min(0).max(1).optional(),
});

router.post('/lottery/rules', requirePerm('lottery.manage'), async (req, res, next) => {
  try {
    const r = ruleSchema.parse(req.body);
    JSON.parse(r.match_config); // must be valid JSON
    if (!(await db().prepare('SELECT id FROM lottery_types WHERE id = ?').get(r.lottery_type_id)))
      return res.status(400).json({ error: 'ประเภทหวยไม่ถูกต้อง' });
    const dup = await db().prepare(`SELECT id FROM lottery_rules
      WHERE lottery_type_id = ? AND bet_type = ? AND COALESCE(category_id,0) = COALESCE(?,0)`)
      .get(r.lottery_type_id, r.bet_type, r.category_id ?? null);
    if (dup) return res.status(409).json({ error: `มีกติกา bet_type "${r.bet_type}" ในหมวดนี้อยู่แล้ว` });
    const x = await db().prepare(`INSERT INTO lottery_rules
      (lottery_type_id,category_id,bet_type,name_th,name_en,digits,match_config,payout_multiplier,stake_unit,min_amount,max_amount,is_active)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(r.lottery_type_id, r.category_id ?? null, r.bet_type, r.name_th, r.name_en || null, r.digits,
        r.match_config, r.payout_multiplier, r.stake_unit, r.min_amount, r.max_amount ?? null, r.is_active ?? 1);
    audit({ userId: req.user.id, action: 'admin.rule_create', entityType: 'lottery_rule', entityId: String(x.lastInsertRowid), req });
    broadcast('settings');
    res.status(201).json({ ok: true, id: Number(x.lastInsertRowid) });
  } catch (e) { next(e); }
});

// เกมด่วน (หวยขูด/ไฮโล): ราคาและอัตราจ่ายเก็บใน lottery_rules ให้ admin แก้ในหน้ากติกาได้โดยตรง
// แต่ system_settings ยังเป็น fallback — sync ทั้งสองทางกันค่าไม่ตรงกัน
// เกมหนึ่งมีหลายกติกา (hilo = base + 3 ฝั่งเดิมพัน) → ราคาเป็นราคาคงที่ต่อเกม ต้อง sync min/max ทุกกติกา
const INSTANT_GAMES = {
  scratch:   { setting: 'scratch_price',      rules: ['scratch'] },
  hilo:      { setting: 'hilo_price',         rules: ['hilo', 'hilo_low', 'hilo_high', 'hilo_eleven'] },
  kiwi:      { setting: 'kiwi_price_kiwi',    rules: ['kiwi'] },
  kiwi_vip:  { setting: 'kiwi_price_kiwi_vip', rules: ['kiwi_vip'] },
  kiwi_dice: { setting: 'kiwi_price_kiwi_dice', rules: ['kiwi_dice'] },
};
const INSTANT_GAME_OF = (bt) => {
  if (bt === 'scratch') return 'scratch';
  if (bt && bt.startsWith('hilo')) return 'hilo';
  if (bt === 'kiwi' || bt === 'kiwi_vip' || bt === 'kiwi_dice') return bt;
  return null;
};
const INSTANT_MULT_KEY = { hilo_mult_low: 'hilo_low', hilo_mult_high: 'hilo_high', hilo_mult_11: 'hilo_eleven' };

router.patch('/lottery/rules/:id', requirePerm('lottery.manage'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const r = ruleSchema.partial().parse(req.body);
    // identity fields — เปลี่ยน type/category/bet_type ไม่ได้ (โพยเก่าอ้างอิง rule_id ไว้แล้ว)
    delete r.lottery_type_id; delete r.category_id; delete r.bet_type;
    if (r.match_config) JSON.parse(r.match_config);
    const fields = Object.keys(r).filter(k => r[k] !== undefined);
    if (!fields.length) return res.status(400).json({ error: 'ไม่มีข้อมูล' });
    const existing = await db().prepare('SELECT bet_type FROM lottery_rules WHERE id = ?').get(id);
    if (!existing) throw new HttpError(404, 'ไม่พบกติกา');
    await db().prepare(`UPDATE lottery_rules SET ${fields.map(f => `${f}=?`).join(',')} WHERE id=?`)
      .run(...fields.map(f => r[f]), id);
    // sync กลับเข้า settings + เผยแพร่ราคาให้ทุกกติกาของเกมนั้น — กันราคาเพี้ยนข้ามกติกา/ข้ามหน้า
    const game = INSTANT_GAME_OF(existing?.bet_type);
    if (game && (r.min_amount != null || r.max_amount != null)) {
      // ราคาต้องมาจาก min_amount เสมอ (max_amount อย่างเดียวไม่เปลี่ยนราคา — บังคับ min=max=ราคาเดิม)
      const v = Math.round(Number(r.min_amount ?? (await db().prepare('SELECT min_amount FROM lottery_rules WHERE id = ?').get(id))?.min_amount));
      if (Number.isFinite(v) && v > 0) {
        await settings.setSetting(INSTANT_GAMES[game].setting, v, req.user.id);
        const types = INSTANT_GAMES[game].rules;
        await db().prepare(`UPDATE lottery_rules SET min_amount = ?, max_amount = ? WHERE bet_type IN (${types.map(() => '?').join(',')})`).run(v, v, ...types);
      }
    }
    const multKey = Object.keys(INSTANT_MULT_KEY).find(k => INSTANT_MULT_KEY[k] === existing?.bet_type);
    if (multKey && r.payout_multiplier != null) {
      const v = Number(r.payout_multiplier);
      if (Number.isFinite(v) && v > 0) await settings.setSetting(multKey, v, req.user.id);
    }
    audit({ userId: req.user.id, action: 'admin.rule_update', entityType: 'lottery_rule', entityId: String(id), detail: r, req });
    broadcast('settings');
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.get('/lottery/categories', requirePerm('lottery.manage'), async (req, res) => {
  res.json({ categories: await db().prepare(`SELECT c.*, lt.name_th AS type_name_th FROM lottery_categories c JOIN lottery_types lt ON lt.id=c.lottery_type_id ORDER BY c.lottery_type_id, c.id`).all() });
});

// ผลล่าสุดของแต่ละตลาด (type+category) — ไว้ preview ข้างกติกาในหน้าจัดการ
router.get('/lottery/last-results', requirePerm('lottery.manage'), async (req, res) => {
  const rows = await db().prepare(`
    SELECT DISTINCT ON (d.lottery_type_id, COALESCE(d.category_id, 0))
      d.lottery_type_id, d.category_id, d.draw_code, d.draw_at, r.winning_numbers
    FROM lottery_results r JOIN lottery_draws d ON d.id = r.draw_id
    WHERE r.winning_numbers IS NOT NULL
    ORDER BY d.lottery_type_id, COALESCE(d.category_id, 0), d.draw_at DESC`).all();
  res.json({ results: rows });
});

// เปิด/ปิดตลาดระดับหมวด — หมวดที่ปิดจะไม่แสดงใน markets/ไม่รับโพย (กติกาเดิมยังอยู่ ไม่กระทบโพยเก่า)
router.patch('/lottery/categories/:id', requirePerm('lottery.manage'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const active = req.body?.is_active ? 1 : 0;
    const cat = await db().prepare('SELECT id, name_th FROM lottery_categories WHERE id = ?').get(id);
    if (!cat) return res.status(404).json({ error: 'ไม่พบหมวดหวย' });
    await db().prepare('UPDATE lottery_categories SET is_active = ? WHERE id = ?').run(active, id);
    audit({ userId: req.user.id, action: 'admin.category_toggle', entityType: 'lottery_category', entityId: String(id), detail: { is_active: active }, req });
    broadcast('settings');
    res.json({ ok: true, is_active: active });
  } catch (e) { next(e); }
});

router.get('/lottery/rules', requirePerm('lottery.manage'), async (req, res) => {
  res.json({ rules: await db().prepare('SELECT * FROM lottery_rules ORDER BY lottery_type_id, bet_type').all() });
});

// ---------- export/import กติกาเป็น JSON (backup/ย้าย environment) ----------
router.get('/lottery/rules/export', requirePerm('lottery.manage'), async (req, res) => {
  const rows = await db().prepare(`
    SELECT lt.code AS type_code, c.code AS category_code, r.bet_type, r.name_th, r.name_en,
           r.digits, r.match_config, r.payout_multiplier, r.stake_unit, r.min_amount, r.max_amount, r.is_active
    FROM lottery_rules r
    JOIN lottery_types lt ON lt.id = r.lottery_type_id
    LEFT JOIN lottery_categories c ON c.id = r.category_id
    WHERE r.bet_type NOT LIKE '%_old_%' AND r.bet_type NOT LIKE '%_retired_%'
    ORDER BY lt.code, c.code NULLS FIRST, r.bet_type`).all();
  res.json({ version: 1, exported_at: new Date().toISOString(), rules: rows });
});

router.post('/lottery/rules/import', requirePerm('lottery.manage'), async (req, res, next) => {
  try {
    const list = Array.isArray(req.body?.rules) ? req.body.rules : [];
    if (!list.length || list.length > 500) return res.status(400).json({ error: 'ไฟล์กติกาไม่ถูกต้อง (ต้องมี rules 1-500 รายการ)' });
    let created = 0, updated = 0, skipped = 0;
    const errors = [];
    for (const r of list) {
      try {
        const t = await db().prepare('SELECT id FROM lottery_types WHERE code = ?').get(r.type_code);
        if (!t) { skipped++; continue; }
        let catId = null;
        if (r.category_code) {
          const c = await db().prepare('SELECT id FROM lottery_categories WHERE lottery_type_id = ? AND code = ?').get(t.id, r.category_code);
          if (!c) { skipped++; continue; }
          catId = c.id;
        }
        JSON.parse(r.match_config || '{}');
        const exist = await db().prepare(`SELECT id FROM lottery_rules
          WHERE lottery_type_id = ? AND bet_type = ? AND COALESCE(category_id,0) = COALESCE(?,0)`)
          .get(t.id, r.bet_type, catId);
        const vals = [r.name_th || r.bet_type, r.name_en || null, r.digits ?? 0, r.match_config || '{}',
          r.payout_multiplier ?? 100, r.stake_unit ?? 100, r.min_amount ?? 100, r.max_amount ?? null, r.is_active ?? 1];
        if (exist) {
          await db().prepare(`UPDATE lottery_rules SET name_th=?, name_en=?, digits=?, match_config=?, payout_multiplier=?, stake_unit=?, min_amount=?, max_amount=?, is_active=? WHERE id=?`)
            .run(...vals, exist.id);
          updated++;
        } else {
          await db().prepare(`INSERT INTO lottery_rules (lottery_type_id, category_id, bet_type, name_th, name_en, digits, match_config, payout_multiplier, stake_unit, min_amount, max_amount, is_active)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(t.id, catId, r.bet_type, ...vals);
          created++;
        }
      } catch (e) { errors.push(`${r.bet_type || '?'}: ${e.message}`); }
    }
    audit({ userId: req.user.id, action: 'admin.rules_import', detail: { created, updated, skipped, errors: errors.length }, req });
    broadcast('settings');
    res.json({ ok: true, created, updated, skipped, errors: errors.slice(0, 10) });
  } catch (e) { next(e); }
});

// ---------- draws ----------
router.get('/draws', requirePerm('draws.manage'), async (req, res) => {
  // includeInactiveTypes — admin ต้องเห็น/ยกเลิก/ออกผลรอบของประเภทที่ปิดอยู่ด้วย (โพยค้างต้องจัดการได้)
  const opts = {
    lotteryTypeId: req.query.type ? Number(req.query.type) : null,
    categoryId: req.query.category !== undefined ? (req.query.category === 'null' ? null : Number(req.query.category)) : undefined,
    status: req.query.status || null,
    limit: req.query.limit ? Number(req.query.limit) : 50,
    offset: req.query.offset ? Number(req.query.offset) : 0,
    includeInactiveTypes: true,
  };
  const [draws, total] = await Promise.all([
    lottery.listDraws(opts),
    lottery.countDraws(opts),
  ]);
  res.json({ draws, total, limit: opts.limit, offset: opts.offset });
});

// สถานะการอัปเดตผลรางวัลล่าสุดของทุกประเภท/หมวด — ล่าสุดต่อ type+category
router.get('/results/status', requirePerm('results.publish'), async (req, res) => {
  const rows = await db().prepare(`
    WITH latest AS (
      SELECT lr.id, lr.draw_id, lr.published_at, lr.source,
             d.lottery_type_id AS tid, COALESCE(d.category_id, 0) AS cid,
             ROW_NUMBER() OVER (
               PARTITION BY d.lottery_type_id, COALESCE(d.category_id, 0)
               ORDER BY d.draw_at DESC, lr.id DESC
             ) AS rn
      FROM lottery_results lr
      JOIN lottery_draws d ON d.id = lr.draw_id
    )
    SELECT lt.id AS type_id, lt.code AS type_code, lt.name_th AS type_name_th, lt.result_mode,
           COALESCE(c.id, 0) AS cat_key, c.code AS cat_code, c.name_th AS cat_name_th,
           l.published_at, l.source, l.draw_id, dr.draw_code
    FROM lottery_types lt
    LEFT JOIN lottery_categories c ON c.lottery_type_id = lt.id
    LEFT JOIN latest l ON l.tid = lt.id AND l.cid = COALESCE(c.id, 0) AND l.rn = 1
    LEFT JOIN lottery_draws dr ON dr.id = l.draw_id
    WHERE lt.is_active = 1 AND lt.code NOT IN ('SC','HL','KI')
    ORDER BY lt.id, cat_key`).all();
  res.json({ status: rows });
});

const drawSchema = z.object({
  lottery_type_id: z.number().int().positive(),
  category_id: z.number().int().positive().nullable().optional(),
  draw_code: z.string().min(1).max(100),
  draw_at: z.string().min(10),
  close_at: z.string().min(10),
});

router.post('/draws', requirePerm('draws.manage'), async (req, res, next) => {
  try {
    const d = drawSchema.parse(req.body);
    const id = await lottery.createDraw(req.user.id, {
      lotteryTypeId: d.lottery_type_id, categoryId: d.category_id ?? null,
      drawCode: d.draw_code, drawAt: d.draw_at, closeAt: d.close_at,
    });
    broadcast('draws');
    res.status(201).json({ ok: true, id });
  } catch (e) { next(e); }
});

// announce รองรับทุกรูปแบบที่ annEntries() อ่านได้: string '123'/'123:400' หรือ array ของ string/{num,mult}
const annSide = z.union([
  z.string().max(500),
  z.array(z.union([
    z.string().max(20),
    z.object({ num: z.string().max(10), mult: z.number().positive().max(1000000).optional() }),
  ])).max(20),
]);
const drawUpdateSchema = z.object({
  draw_code: z.string().min(1).max(100).optional(),
  draw_at: z.string().min(10).optional(),
  close_at: z.string().min(10).optional(),
  announce: z.union([
    z.object({
      top: annSide.optional(),
      bottom: annSide.optional(),
    }),
    z.null(),
  ]).optional(),
});
router.patch('/draws/:id', requirePerm('draws.manage'), async (req, res, next) => {
  try {
    const data = drawUpdateSchema.parse(req.body);
    await lottery.updateDraw(req.user.id, Number(req.params.id), {
      drawCode: data.draw_code, drawAt: data.draw_at, closeAt: data.close_at, announce: data.announce,
    });
    broadcast('draws');
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ตั้งเลขอั้นครั้งเดียวครอบคลุมหลายรอบ (status=open/scheduled, ยังไม่ปิด) — source ฟรีไม่มีเลขอั้น ต้องกรอกเอง
router.post('/draws/announce-bulk', requirePerm('draws.manage'), async (req, res, next) => {
  try {
    const { type_id, category_id, announce } = req.body || {};
    if (!type_id || !announce || typeof announce !== 'object')
      throw new HttpError(400, 'ต้องระบุ type_id และ announce {top,bottom}');
    const annJson = JSON.stringify(announce);
    // ใช้ annEntries validation เดียวกับ updateDraw — ป้องกัน format ผิด
    const top = announce.top, bottom = announce.bottom;
    const sideOk = (s) => s == null || typeof s === 'string' || (Array.isArray(s) && s.length <= 20);
    if (!sideOk(top) || !sideOk(bottom)) throw new HttpError(400, 'รูปแบบ announce ไม่ถูกต้อง');
    const catCond = category_id === null || category_id === undefined ? 'd.category_id IS NULL' : 'd.category_id = ?';
    const catArgs = category_id === null || category_id === undefined ? [] : [Number(category_id)];
    const r = await db().prepare(
      `UPDATE lottery_draws SET announce = ?, updated_at = to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS')
       WHERE lottery_type_id = ? AND ${catCond} AND status IN ('scheduled','open') AND draw_at > to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS')`
    ).run(annJson, Number(type_id), ...catArgs);
    audit({ userId: req.user.id, action: 'admin.announce_bulk', entityType: 'lottery_draw', detail: { type_id, category_id, announce, count: r.changes }, req });
    broadcast('draws');
    res.json({ ok: true, updated: r.changes });
  } catch (e) { next(e); }
});

const statusSchema = z.object({ status: z.enum(['scheduled', 'open', 'closed', 'cancelled']) });
router.patch('/draws/:id/status', requirePerm('draws.manage'), async (req, res, next) => {
  try {
    const { status } = statusSchema.parse(req.body);
    const result = await lottery.updateDrawStatus(req.user.id, Number(req.params.id), status);
    broadcast('draws');
    res.json({ ok: true, ...result });
  } catch (e) { next(e); }
});

const numVal = z.union([z.string().regex(/^\d{1,10}$/), z.array(z.string().regex(/^\d{1,10}$/)).min(1).max(20)]);
const settleSchema = z.object({
  winning_numbers: z.record(z.string(), numVal),
});
// เทียบ winning_numbers แบบไม่สนลำดับ key/array — ใช้เช็คผลทางการ
function sameWinningNumbers(a, b) {
  const norm = (o) => {
    const out = {};
    for (const k of Object.keys(o || {}).sort()) {
      const v = o[k];
      out[k] = Array.isArray(v) ? v.map(String).sort() : String(v ?? '').trim();
    }
    return JSON.stringify(out);
  };
  return norm(a) === norm(b);
}

router.post('/draws/:id/settle', requirePerm('results.publish'), async (req, res, next) => {
  try {
    const { winning_numbers } = settleSchema.parse(req.body);
    const drawId = Number(req.params.id);
    // หวยไทยต้องออกผลจากแหล่งทางการ (GLO) เท่านั้น — ห้ามกรอกเอง/ใช้ผลเทียม
    const draw = await lottery.getDraw(drawId);
    let sourceLabel = null;
    if (draw?.type_code === 'TH') {
      const official = await fetcher.fetchResultForDraw(drawId);
      if (!sameWinningNumbers(official.winning, winning_numbers))
        throw new HttpError(400,
          'หวยไทยต้องใช้ผลทางการที่ระบบดึงมาเท่านั้น — กรุณากด "ดึงผล" ก่อน แล้วใช้ตัวเลขที่ระบบแสดง', 'OFFICIAL_RESULT_REQUIRED');
      sourceLabel = official.source;
    } else if (draw && !fetcher.isManualDraw(draw)) {
      sourceLabel = await fetcher.sourceLabelForWinning(draw, winning_numbers);
    }
    const result = await lottery.settleDraw(req.user.id, drawId, winning_numbers, sourceLabel);
    broadcast('results');
    res.json({ ok: true, ...result });
  } catch (e) { next(e); }
});

// สั่งตรวจสอบ+ออกผลรางวัลอัตโนมัติทุกผลทันที (ไม่ต้องรอรอบ scheduler 15 นาที)
router.post('/draws/auto-settle', requirePerm('results.publish'), async (req, res, next) => {
  try {
    const out = await fetcher.autoSettleResults();
    if (out.settled.length) broadcast('results');
    res.json({ ok: true, ...out });
  } catch (e) { next(e); }
});

// จำลองผล settle — คืนสถิติ (โพยรอผล/ถูกรางวัล/ยอดจ่าย) โดยไม่เขียน DB
// ใช้ให้ admin ตรวจสอบก่อนกดยืนยันออกผลจริง
router.post('/draws/:id/settle-preview', requirePerm('results.publish'), async (req, res, next) => {
  try {
    const drawId = Number(req.params.id);
    const draw = await lottery.getDraw(drawId);
    if (!draw) throw new HttpError(404, 'ไม่พบรอบหวย');
    const winning = req.body?.winning_numbers;
    if (!winning || typeof winning !== 'object' || Array.isArray(winning)) {
      throw new HttpError(400, 'winning_numbers ไม่ถูกต้อง');
    }
    lottery.validateWinningNumbers(winning); // เช็ค format เดียวกับตอน settle จริง
    // merge เลขอั้น + ประเมินแบบเดียวกับ settle จริง (รวม is_tod และอัตราเฉพาะรายเลข)
    let wn = { ...winning };
    try { lottery.mergeAnnounce?.(wn, draw.announce); } catch {}
    const items = await db().prepare(`
      SELECT bi.id, bi.rule_id, bi.number, bi.amount, bi.is_tod, bi.payout_multiplier AS snap_mult, bi.match_config AS snap_cfg, r.payout_multiplier
      FROM bet_items bi
      JOIN bet_slips bs ON bs.id = bi.slip_id
      JOIN lottery_rules r ON r.id = bi.rule_id
      WHERE bi.draw_id = ? AND bi.status = 'pending'`).all(drawId);
    const ruleCache = new Map();
    let evaluated = 0, wins = 0, payout = 0, errors = 0;
    for (const it of items) {
      let rule = ruleCache.get(it.rule_id);
      if (!rule) {
        rule = await db().prepare('SELECT * FROM lottery_rules WHERE id = ?').get(it.rule_id);
        ruleCache.set(it.rule_id, rule);
      }
      try {
        const effRule = it.snap_cfg != null
          ? { ...rule, match_config: it.snap_cfg, payout_multiplier: it.snap_mult ?? rule.payout_multiplier }
          : rule;
        const ev = lottery.evaluateBet(effRule, it.number, wn, { todBet: !!it.is_tod });
        evaluated++;
        if (ev.win) { wins++; payout += Math.floor(it.amount * Number(ev.multiplier ?? effRule.payout_multiplier)); }
      } catch { errors++; }
    }
    res.json({ ok: true, pending: items.length, evaluated, errors, winningItems: wins, totalPayout: payout });
  } catch (e) { next(e); }
});

// ดึงผลอัตโนมัติจากแหล่งข้อมูล (ไทย=GLO, ฮานอย=XSMB) — admin review แล้วค่อย settle
router.post('/draws/:id/fetch-result', requirePerm('results.publish'), async (req, res, next) => {
  try {
    const preview = await fetcher.fetchResultForDraw(Number(req.params.id));
    res.json({ ok: true, ...preview });
  } catch (e) { next(e); }
});

// แก้ไขผลหลังออกผลแล้ว — ระบบคำนวณเครดิต/เดบิตส่วนต่างใหม่ทั้งโพย
router.post('/draws/:id/result', requirePerm('results.publish'), async (req, res, next) => {
  try {
    const { winning_numbers } = settleSchema.parse(req.body);
    const drawId = Number(req.params.id);
    const draw = await db().prepare(`SELECT d.draw_code, lt.name_th AS type_name FROM lottery_draws d
      JOIN lottery_types lt ON lt.id = d.lottery_type_id WHERE d.id = ?`).get(drawId);
    if (!draw) return res.status(404).json({ error: 'ไม่พบรอบ' });
    const r = await approvals.submitOrExecute({
      category: 'result.manual',
      payload: { drawId, winningNumbers: winning_numbers },
      summary: `แก้ไขผลย้อนหลัง ${draw.draw_code} (${draw.type_name})`,
      makerId: req.user.id, req,
    });
    if (r.pending) return res.json({ ok: true, pendingApproval: true, approval: r.request });
    broadcast('results');
    res.json(r.result);
  } catch (e) { next(e); }
});

// ---------- bet monitoring ----------
router.get('/bets', requirePerm('bets.view_all'), async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || '100', 10), 500);
  const status = req.query.status || null;
  let sql = `SELECT bs.*, u.username, d.draw_code, d.draw_at, lt.name_th AS type_name_th,
                    c.name_th AS category_name_th
             FROM bet_slips bs JOIN users u ON u.id=bs.user_id
             JOIN lottery_draws d ON d.id=bs.draw_id JOIN lottery_types lt ON lt.id=d.lottery_type_id
             LEFT JOIN lottery_categories c ON c.id=d.category_id WHERE 1=1`;
  const args = [];
  if (status) { sql += ' AND bs.status = ?'; args.push(status); }
  if (req.query.userId) { sql += ' AND bs.user_id = ?'; args.push(Number(req.query.userId)); }
  const q = String(req.query.q || '').trim().slice(0, 100);
  if (q) {
    sql += ` AND (bs.slip_ref ILIKE ? OR u.username ILIKE ? OR d.draw_code ILIKE ?)`;
    const like = `%${q}%`;
    args.push(like, like, like);
  }
  const whereSql = sql.slice(sql.indexOf('WHERE'));
  const countArgs = args.slice();
  const total = (await db().prepare(`SELECT COUNT(*) c FROM bet_slips bs ${whereSql}`).get(...countArgs)).c;
  const offset = Math.max(parseInt(req.query.offset || '0', 10) || 0, 0);
  sql += ' ORDER BY bs.id DESC LIMIT ? OFFSET ?'; args.push(limit, offset);
  const slips = await db().prepare(sql).all(...args);
  // batch items ทีเดียวแทน N+1 — GROUP BY slip_id ฝั่ง JS
  const slipIds = slips.map(s => s.id);
  const itemsBySlip = new Map();
  if (slipIds.length) {
    const qs = slipIds.map(() => '?').join(',');
    const allItems = await db().prepare(`SELECT bi.*, r.name_th AS bet_name_th,
        COALESCE(bi.payout_multiplier, r.payout_multiplier) AS payout_multiplier
      FROM bet_items bi JOIN lottery_rules r ON r.id=bi.rule_id
      WHERE bi.slip_id IN (${qs}) ORDER BY bi.id`).all(...slipIds);
    for (const it of allItems) {
      if (!itemsBySlip.has(it.slip_id)) itemsBySlip.set(it.slip_id, []);
      itemsBySlip.get(it.slip_id).push(it);
    }
  }
  res.json({ slips: slips.map(s => ({ ...s, items: itemsBySlip.get(s.id) || [] })), total, limit, offset });
});

// ---------- wallet adjust ----------
const adjustSchema = z.object({
  userId: z.number().int().positive(),
  amount: z.number().int().positive(),
  direction: z.enum(['credit', 'debit']),
  reason: z.string().min(3).max(500),
  idempotencyKey: z.string().min(8).max(100),
});
router.post('/wallet/adjust', requirePerm('wallet.adjust'), async (req, res, next) => {
  try {
    const { userId, ...rest } = adjustSchema.parse(req.body);
    const target = await db().prepare('SELECT username FROM users WHERE id = ?').get(userId);
    if (!target) return res.status(404).json({ error: 'ไม่พบสมาชิก' });
    const baht = (rest.amount / 100).toLocaleString('th-TH');
    const r = await approvals.submitOrExecute({
      category: 'wallet.adjust',
      payload: { targetUserId: userId, ...rest },
      summary: `ปรับเครดิต ${target.username}: ${rest.direction === 'credit' ? '+' : '-'}${baht} บาท — ${rest.reason}`,
      makerId: req.user.id, req,
    });
    if (r.pending) return res.json({ ok: true, pendingApproval: true, approval: r.request });
    res.json({ ok: true, ...r.result });
  } catch (e) { next(e); }
});

router.get('/wallet/transactions', requirePerm('wallet.adjust'), async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || '100', 10) || 100, 500);
  const offset = Math.max(parseInt(req.query.offset || '0', 10) || 0, 0);
  const total = (await db().prepare('SELECT COUNT(*) c FROM virtual_transactions').get()).c;
  const transactions = await db().prepare(`SELECT vt.*, u.username FROM virtual_transactions vt JOIN users u ON u.id=vt.user_id ORDER BY vt.id DESC LIMIT ? OFFSET ?`).all(limit, offset);
  res.json({ transactions, total, limit, offset });
});

// ---------- audit / security ----------
router.get('/audit', requirePerm('audit.view'), async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || '100', 10) || 100, 500);
  const offset = Math.max(parseInt(req.query.offset || '0', 10) || 0, 0);
  const where = [], params = [];
  const add = (cond, val) => { if (val != null && val !== '') { params.push(val); where.push(cond.replace('?', `$${params.length}`)); } };
  add('al.action = ?', req.query.action);
  add('al.entity_type = ?', req.query.entity_type);
  const uid = req.query.user_id ? parseInt(req.query.user_id, 10) : null;
  add('al.user_id = ?', Number.isFinite(uid) ? uid : null);
  add('al.correlation_id = ?', req.query.correlation_id);
  add(`al.created_at >= ?`, req.query.from);
  add(`al.created_at <= ?`, req.query.to);
  const wsql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = (await db().prepare(`SELECT COUNT(*) c FROM audit_logs al ${wsql}`).get(...params)).c;
  params.push(limit, offset);
  const logs = await db().prepare(`SELECT al.*, u.username FROM audit_logs al LEFT JOIN users u ON u.id=al.user_id ${wsql} ORDER BY al.id DESC LIMIT $${params.length - 1} OFFSET $${params.length}`).all(...params);
  res.json({ logs, total, limit, offset });
});

// ตรวจสอบ hash-chain ของ audit log — tamper evidence (แก้/ลบ/แทรกแถว → firstBreak)
router.get('/audit/verify', requirePerm('audit.view'), async (req, res) => {
  res.json(await verifyAuditChain());
});

// re-hash chain ตาม canon ปัจจุบัน — ใช้เฉพาะตอน migrate canon (ห้ามใช้ซ่อม tamper)
router.post('/audit/rebuild-chain', requirePerm('audit.view'), async (req, res, next) => {
  try {
    const r = await rebuildAuditChain();
    audit({ userId: req.user.id, action: 'admin.audit_chain_rebuild', entityType: 'system', detail: r, req });
    res.json({ ok: true, ...r });
  } catch (e) { next(e); }
});

// ---------- infra / system ----------
// health เชิงโครงสร้าง: uptime, memory, ขนาด DB, จำนวนแถวตารางหลัก, migration ล่าสุด
router.get('/infra', requirePerm('dashboard.admin'), async (req, res) => {
  const d = db();
  const mem = process.memoryUsage();
  const dbSize = await d.prepare(`SELECT pg_database_size(current_database()) s`).get();
  const mig = await d.prepare(`SELECT version, applied_at FROM schema_migrations ORDER BY applied_at DESC, version DESC LIMIT 1`).get().catch(() => null);
  const counts = {};
  for (const t of ['users', 'bet_slips', 'bet_items', 'virtual_transactions', 'audit_logs', 'security_events', 'auth_events', 'support_tickets', 'approval_requests', 'promo_campaigns']) {
    counts[t] = (await d.prepare(`SELECT COUNT(*) c FROM ${t}`).get().catch(() => ({ c: 0 }))).c;
  }
  res.json({
    uptimeSec: Math.floor(process.uptime()),
    node: process.version,
    env: config.env,
    memory: { rss: mem.rss, heapUsed: mem.heapUsed, heapTotal: mem.heapTotal },
    dbSizeBytes: dbSize?.s ?? null,
    latestMigration: mig,
    tableCounts: counts,
    pendingApprovals: counts.approval_requests != null
      ? (await d.prepare(`SELECT COUNT(*) c FROM approval_requests WHERE status='pending'`).get().catch(() => ({ c: 0 }))).c : 0,
  });
});

// ---------- backups (logical dump → server/data/backups) ----------
// เฉพาะ super_admin — backup มีข้อมูลทั้ง DB ห้ามให้ admin ธรรมดา
router.get('/backups', requireRole('super_admin'), async (req, res) => {
  res.json({ backups: ops.listBackups() });
});
router.post('/backups', requireRole('super_admin'), async (req, res, next) => {
  try {
    const r = await ops.createBackup({ note: String(req.body?.note || '').slice(0, 200) || null });
    audit({ userId: req.user.id, action: 'admin.backup_create', entityType: 'backup', entityId: r.file, detail: r, req });
    res.json({ ok: true, ...r });
  } catch (e) { next(e); }
});

// ---------- incidents ----------
const incidentSchema = z.object({
  title: z.string().min(3).max(200),
  severity: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  detail: z.string().max(2000).optional().default(''),
});
router.get('/incidents', requirePerm('dashboard.admin'), async (req, res) => {
  const status = ['open', 'mitigated', 'resolved'].includes(req.query.status) ? req.query.status : null;
  const incidents = status
    ? await db().prepare(`SELECT i.*, cu.username AS created_by_name, ru.username AS resolved_by_name FROM incidents i
        LEFT JOIN users cu ON cu.id=i.created_by LEFT JOIN users ru ON ru.id=i.resolved_by
        WHERE i.status=? ORDER BY i.id DESC LIMIT 100`).all(status)
    : await db().prepare(`SELECT i.*, cu.username AS created_by_name, ru.username AS resolved_by_name FROM incidents i
        LEFT JOIN users cu ON cu.id=i.created_by LEFT JOIN users ru ON ru.id=i.resolved_by
        ORDER BY i.id DESC LIMIT 100`).all();
  res.json({ incidents });
});
router.post('/incidents', requirePerm('dashboard.admin'), async (req, res, next) => {
  try {
    const b = incidentSchema.parse(req.body);
    const r = await db().prepare(`INSERT INTO incidents (title, severity, detail, created_by) VALUES (?,?,?,?)`)
      .run(b.title, b.severity, b.detail || null, req.user.id);
    audit({ userId: req.user.id, action: 'admin.incident_create', entityType: 'incident', entityId: String(r.lastInsertRowid ?? ''), detail: b, req });
    res.json({ ok: true });
  } catch (e) { next(e); }
});
router.patch('/incidents/:id', requirePerm('dashboard.admin'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const cur = await db().prepare('SELECT * FROM incidents WHERE id=?').get(id);
    if (!cur) return res.status(404).json({ error: 'ไม่พบ incident' });
    const status = ['open', 'mitigated', 'resolved'].includes(req.body?.status) ? req.body.status : null;
    if (!status) return res.status(400).json({ error: 'status ไม่ถูกต้อง' });
    const resolved = status === 'resolved';
    await db().prepare(`UPDATE incidents SET status=?, resolved_by=?, resolved_at=?, updated_at=datetime('now') WHERE id=?`)
      .run(status, resolved ? req.user.id : null, resolved ? new Date().toISOString().slice(0, 19).replace('T', ' ') : null, id);
    audit({ userId: req.user.id, action: 'admin.incident_update', entityType: 'incident', entityId: String(id),
      detail: { from: cur.status, to: status }, req });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ---------- risk flags ----------
router.get('/risk/flags', requirePerm('members.manage'), async (req, res, next) => {
  try {
    const { listFlags, refreshUser } = await import('../services/riskService.js');
    res.json({ flags: await listFlags({ status: req.query.status || 'open' }) });
  } catch (e) { next(e); }
});
router.post('/risk/flags/:id/refresh', requirePerm('members.manage'), async (req, res, next) => {
  try {
    const { refreshUser } = await import('../services/riskService.js');
    const f = await db().prepare('SELECT user_id FROM risk_flags WHERE id=?').get(parseInt(req.params.id, 10));
    if (!f) return res.status(404).json({ error: 'ไม่พบ flag' });
    res.json({ ok: true, ...(await refreshUser(f.user_id)) });
  } catch (e) { next(e); }
});
const flagActionSchema = z.object({
  status: z.enum(['acknowledged', 'resolved']),
  note: z.string().max(500).optional(),
});
router.post('/risk/flags/:id/status', requirePerm('members.manage'), async (req, res, next) => {
  try {
    const { setFlagStatus } = await import('../services/riskService.js');
    const b = flagActionSchema.parse(req.body);
    const f = await setFlagStatus(parseInt(req.params.id, 10), b.status, req.user.id, b.note || null);
    if (!f) return res.status(404).json({ error: 'ไม่พบ flag' });
    audit({ userId: req.user.id, action: `admin.risk_flag_${b.status}`, entityType: 'risk_flag', entityId: String(f.id),
      detail: { userId: f.user_id, code: f.code, note: b.note }, req });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ---------- ledger (double-entry journal) ----------
router.get('/ledger/accounts', requirePerm('reports.view'), async (req, res) => {
  res.json({ accounts: await ledger.accountBalances() });
});
router.get('/ledger/verify', requirePerm('reports.view'), async (req, res) => {
  res.json(await ledger.verifyLedger());
});
router.post('/ledger/rebuild', requirePerm('wallet.adjust'), async (req, res, next) => {
  try {
    const r = await ledger.rebuildJournal({ limit: Math.min(parseInt(req.body?.limit || '5000', 10) || 5000, 50000) });
    audit({ userId: req.user.id, action: 'admin.ledger_rebuild', entityType: 'system', detail: r, req });
    res.json({ ok: true, ...r });
  } catch (e) { next(e); }
});

router.get('/security-events', requirePerm('security.view'), async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || '100', 10) || 100, 500);
  const offset = Math.max(parseInt(req.query.offset || '0', 10) || 0, 0);
  const total = (await db().prepare('SELECT COUNT(*) c FROM security_events').get()).c;
  const events = await db().prepare(`SELECT se.*, u.username FROM security_events se LEFT JOIN users u ON u.id=se.user_id ORDER BY se.id DESC LIMIT ? OFFSET ?`).all(limit, offset);
  res.json({ events, total, limit, offset });
});

// ---------- settings ----------
router.get('/settings', requirePerm('settings.manage'), async (req, res) => {
  res.json({ settings: await settings.allSettings() });
});
// keys ที่กระทบ security/economy โดยตรง — admin ธรรมดาแก้ไม่ได้ (super_admin เท่านั้น)
// maker_checker: ปิดได้ = bypass approval ทั้งระบบ; initial_credit: เศรษฐกิจ; require_email_verify_for_withdraw: fraud gate
const SUPER_ONLY_SETTINGS = new Set(['maker_checker', 'initial_credit', 'require_email_verify_for_withdraw', 'admin_allowed_ips']);

router.put('/settings/:key', requirePerm('settings.manage'), async (req, res, next) => {
  try {
    const key = String(req.params.key).slice(0, 100);
    if (!/^[a-z0-9_.-]+$/i.test(key)) return res.status(400).json({ error: 'key ไม่ถูกต้อง' });
    if (SUPER_ONLY_SETTINGS.has(key) && !(await hasRole(req.user.id, 'super_admin')))
      return res.status(403).json({ error: 'key นี้เฉพาะ super_admin เท่านั้นที่แก้ไขได้', code: 'SUPER_ONLY' });
    await settings.setSetting(key, req.body?.value, req.user.id);
    // sync เกมด่วน: ราคา → min/max ของทุกกติกาในเกมนั้น, อัตราจ่าย → payout_multiplier ของกติกาฝั่งนั้น
    const priceGame = Object.keys(INSTANT_GAMES).find(g => INSTANT_GAMES[g].setting === key);
    if (priceGame) {
      const v = Math.round(Number(req.body?.value));
      if (Number.isFinite(v) && v > 0) {
        const types = INSTANT_GAMES[priceGame].rules;
        await db().prepare(`UPDATE lottery_rules SET min_amount = ?, max_amount = ? WHERE bet_type IN (${types.map(() => '?').join(',')})`).run(v, v, ...types);
      }
    }
    const multBetType = Object.keys(INSTANT_MULT_KEY).find(bt => INSTANT_MULT_KEY[bt] === key);
    if (multBetType) {
      const v = Number(req.body?.value);
      if (Number.isFinite(v) && v > 0) await db().prepare('UPDATE lottery_rules SET payout_multiplier = ? WHERE bet_type = ?').run(v, multBetType);
    }
    audit({ userId: req.user.id, action: 'admin.setting_update', entityType: 'setting', entityId: key, req });
    broadcast('settings');
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ---------- promotions: cashback คืนยอดเสีย ----------
router.get('/promotions/cashback/preview', requirePerm('settings.manage'), async (req, res) => {
  const hours = Math.min(Math.max(parseInt(req.query.hours || '24', 10) || 24, 1), 24 * 30);
  res.json({ preview: await promo.previewCashback({ windowHours: hours }) });
});
router.post('/promotions/cashback/run', requirePerm('settings.manage'), async (req, res, next) => {
  try {
    const hours = Math.min(Math.max(parseInt(req.body?.hours || '24', 10) || 24, 1), 24 * 30);
    const r = await promo.runCashback({ windowHours: hours, runKey: `manual-${Date.now()}` });
    audit({ userId: req.user.id, action: 'admin.cashback_run', entityType: 'system', entityId: String(r.runKey || 'disabled'), detail: r, req });
    broadcast('settings');
    res.json({ ok: true, ...r });
  } catch (e) { next(e); }
});

// ---------- promotion campaigns ----------
const campaignSchema = z.object({
  name: z.string().min(1).max(120),
  percent: z.number().int().min(1).max(100),
  window_hours: z.number().int().min(1).max(720).default(24),
  min_satang: z.number().int().min(0).default(100),
});

router.get('/promotions/campaigns', requirePerm('settings.manage'), async (req, res) => {
  const campaigns = await db().prepare(`SELECT pc.*, u.username AS created_by_name FROM promo_campaigns pc
    LEFT JOIN users u ON u.id = pc.created_by ORDER BY pc.id DESC`).all();
  res.json({ campaigns });
});

router.post('/promotions/campaigns', requirePerm('settings.manage'), async (req, res, next) => {
  try {
    const b = campaignSchema.parse(req.body);
    const r = await db().prepare(`INSERT INTO promo_campaigns (name, kind, percent, window_hours, min_satang, created_by)
      VALUES (?, 'cashback', ?, ?, ?, ?)`).run(b.name, b.percent, b.window_hours, b.min_satang, req.user.id);
    audit({ userId: req.user.id, action: 'admin.promo_campaign_create', entityType: 'promo_campaign', entityId: String(r.lastInsertRowid ?? ''), detail: b, req });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.patch('/promotions/campaigns/:id', requirePerm('settings.manage'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const cur = await db().prepare('SELECT * FROM promo_campaigns WHERE id = ?').get(id);
    if (!cur) return res.status(404).json({ error: 'ไม่พบแคมเปญ' });
    const b = campaignSchema.partial().parse(req.body || {});
    const active = req.body?.active;
    // เปิดใช้งานได้ครั้งละ 1 แคมเปญ — กัน cashback ซ้อนกัน
    if (active === true || active === 1 || active === '1') {
      await db().prepare(`UPDATE promo_campaigns SET active = 0, updated_at = datetime('now')`).run();
    }
    const name = b.name ?? cur.name, percent = b.percent ?? cur.percent,
      wh = b.window_hours ?? cur.window_hours, ms = b.min_satang ?? cur.min_satang;
    const act = active !== undefined ? (active === true || active === 1 || active === '1' ? 1 : 0) : cur.active;
    await db().prepare(`UPDATE promo_campaigns SET name=?, percent=?, window_hours=?, min_satang=?, active=?,
      updated_at=datetime('now') WHERE id=?`).run(name, percent, wh, ms, act, id);
    audit({ userId: req.user.id, action: 'admin.promo_campaign_update', entityType: 'promo_campaign', entityId: String(id),
      detail: { before: { name: cur.name, percent: cur.percent, active: cur.active }, after: { name, percent, active: act } }, req });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.post('/promotions/campaigns/:id/run', requirePerm('settings.manage'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const c = await db().prepare(`SELECT * FROM promo_campaigns WHERE id = ?`).get(id);
    if (!c) return res.status(404).json({ error: 'ไม่พบแคมเปญ' });
    const r = await promo.runCashback({ windowHours: c.window_hours, minSatang: c.min_satang, percent: c.percent, runKey: `campaign-${id}-manual-${Date.now()}` });
    audit({ userId: req.user.id, action: 'admin.promo_campaign_run', entityType: 'promo_campaign', entityId: String(id), detail: r, req });
    res.json({ ok: true, ...r });
  } catch (e) { next(e); }
});

// ---------- reports ----------
router.get('/reports/summary', requirePerm('reports.view'), async (req, res) => {
  const d = db();
  const one = async (sql) => (await d.prepare(sql).get());
  res.json({
    totals: {
      stake: (await one(`SELECT COALESCE(SUM(total_stake),0) s FROM bet_slips WHERE status NOT IN ('cancelled','refunded')`)).s,
      payout: (await one(`SELECT COALESCE(SUM(payout),0) p FROM bet_items WHERE status='won'`)).p,
      pendingExposure: (await one(`SELECT COALESCE(SUM(bs.total_stake),0) s
                                   FROM bet_slips bs JOIN lottery_draws dr ON dr.id = bs.draw_id
                                   WHERE bs.status='pending' AND dr.draw_code NOT LIKE '%-STANDING'`)).s,
      unplayedInstant: (await one(`SELECT COALESCE(SUM(bs.total_stake),0) s
                                   FROM bet_slips bs JOIN lottery_draws dr ON dr.id = bs.draw_id
                                   WHERE bs.status='pending' AND dr.draw_code LIKE '%-STANDING'`)).s,
      items: await one(`SELECT COUNT(*) c, SUM(CASE WHEN status='won' THEN 1 ELSE 0 END) w FROM bet_items WHERE status IN ('won','lost')`),
      slips: (await one(`SELECT COUNT(*) c FROM bet_slips WHERE status NOT IN ('cancelled','refunded')`)).c,
    },
    // รายการ = ทุกรายการที่ยังไม่ยกเลิก / ถูก = เฉพาะที่ settle แล้ว — frontend คำนวณเรทจาก won/(won+lost)
    betsByType: await d.prepare(`SELECT r.name_th AS rule_name, MIN(r.bet_type) AS bet_type,
                             lt.code AS type_code, lt.name_th AS type_name_th,
                             lc.name_th AS category_name_th,
                             COUNT(*) c,
                             SUM(CASE WHEN bi.status='won' THEN 1 ELSE 0 END) won,
                             SUM(CASE WHEN bi.status='lost' THEN 1 ELSE 0 END) lost,
                             SUM(bi.amount) stake, SUM(bi.payout) payout
                           FROM bet_items bi
                           JOIN lottery_rules r ON r.id = bi.rule_id
                           JOIN lottery_draws ld ON ld.id = bi.draw_id
                           JOIN lottery_types lt ON lt.id = ld.lottery_type_id
                           LEFT JOIN lottery_categories lc ON lc.id = ld.category_id
                           WHERE bi.status != 'cancelled'
                             AND r.bet_type NOT IN ('kiwi_zodiac','kiwi_animal') -- เกมยี่กีที่ถูกถอดแล้ว
                           GROUP BY lt.code, lt.name_th, lc.id, lc.name_th, r.name_th
                           ORDER BY stake DESC`).all(),
    betsByDay: await d.prepare(`SELECT date(bs.created_at) AS "day", COUNT(DISTINCT bs.id) slips,
                             COALESCE(SUM(bi.amount),0) stake,
                             COALESCE(SUM(CASE WHEN bi.status='won' THEN bi.payout ELSE 0 END),0) payout
                          FROM bet_slips bs JOIN bet_items bi ON bi.slip_id = bs.id
                          WHERE bs.status NOT IN ('cancelled','refunded')
                          GROUP BY "day" ORDER BY "day" DESC LIMIT 30`).all(),
    topWinners: await d.prepare(`SELECT u.username, bs.slip_ref, d.draw_code, lt.name_th AS type_name_th,
                             SUM(bi.payout) payout, COUNT(*) items
                           FROM bet_items bi JOIN bet_slips bs ON bs.id=bi.slip_id
                           JOIN users u ON u.id=bs.user_id
                           JOIN lottery_draws d ON d.id=bs.draw_id
                           JOIN lottery_types lt ON lt.id=d.lottery_type_id
                           JOIN lottery_rules rl ON rl.id=bi.rule_id
                           WHERE bi.status='won' AND rl.bet_type NOT IN ('kiwi_zodiac','kiwi_animal')
                           GROUP BY bs.id, u.username, bs.slip_ref, d.draw_code, lt.name_th ORDER BY payout DESC LIMIT 20`).all(),
    // รอบล่าสุด 1 รอบต่อประเภท/หมวด — กันรอบรายชั่วโมง (เช่น หวยราศี) ล้นตาราง
    drawsSummary: await d.prepare(`WITH ranked AS (
                               SELECT d.id, d.draw_code, lt.name_th, d.status, d.draw_at,
                                      ROW_NUMBER() OVER (PARTITION BY d.lottery_type_id, COALESCE(d.category_id, 0)
                                                         ORDER BY d.draw_at DESC, d.id DESC) AS rn
                               FROM lottery_draws d JOIN lottery_types lt ON lt.id = d.lottery_type_id
                               WHERE d.draw_code NOT LIKE '%-STANDING'
                             )
                             SELECT x.draw_code, x.name_th, x.status, x.draw_at,
                                    (SELECT COUNT(*) FROM bet_items bi WHERE bi.draw_id=x.id AND bi.status != 'cancelled') items,
                                    (SELECT COALESCE(SUM(bi.amount),0) FROM bet_items bi WHERE bi.draw_id=x.id AND bi.status != 'cancelled') stake,
                                    (SELECT COALESCE(SUM(bi.payout),0) FROM bet_items bi WHERE bi.draw_id=x.id AND bi.status='won') payout
                             FROM ranked x WHERE x.rn = 1
                             ORDER BY x.draw_at DESC`).all(),
    // กำไรต่อรอบ — settled 30 วันล่าสุด เรียงตามเวลาออกรางวัล
    profitByDraw: await d.prepare(`SELECT d.draw_code, d.draw_at, d.status,
                             lt.name_th AS type_name_th, c.name_th AS cat_name_th,
                             COUNT(bi.id) items,
                             COALESCE(SUM(bi.amount),0) stake,
                             COALESCE(SUM(CASE WHEN bi.status='won' THEN bi.payout ELSE 0 END),0) payout
                           FROM lottery_draws d
                           JOIN lottery_types lt ON lt.id = d.lottery_type_id
                           LEFT JOIN lottery_categories c ON c.id = d.category_id
                           LEFT JOIN bet_items bi ON bi.draw_id = d.id AND bi.status != 'cancelled'
                           WHERE d.draw_code NOT LIKE '%-STANDING'
                             AND d.draw_at >= to_char((now() AT TIME ZONE 'UTC') - interval '30 days','YYYY-MM-DD HH24:MI:SS')
                           GROUP BY d.id, d.draw_code, d.draw_at, d.status, lt.name_th, c.name_th
                           HAVING COUNT(bi.id) > 0
                           ORDER BY d.draw_at DESC LIMIT 50`).all(),
  });
});

// ---------- wallet reconciliation ----------
// เทียบยอด wallet จริงกับ ledger (SUM ของ transactions ที่ completed) — ต้องตรงกันทุกกระเป๋า
// ใช้ตรวจจับ ledger drift / transaction หาย / balance ถูกแก้นอกระบบ
router.get('/reports/reconciliation', requirePerm('reports.view'), async (req, res) => {
  const rows = await db().prepare(`SELECT w.id AS wallet_id, w.user_id, u.username, w.balance,
      COALESCE(SUM(CASE WHEN t.direction='credit' THEN t.amount ELSE -t.amount END),0) AS ledger
    FROM virtual_wallets w
    JOIN users u ON u.id = w.user_id
    LEFT JOIN virtual_transactions t ON t.wallet_id = w.id AND t.status = 'completed'
    GROUP BY w.id, w.user_id, u.username, w.balance`).all();
  const mismatches = rows.filter(r => Number(r.balance) !== Number(r.ledger));
  res.json({
    ok: mismatches.length === 0,
    checked: rows.length,
    mismatchCount: mismatches.length,
    mismatches: mismatches.slice(0, 50).map(r => ({
      walletId: r.wallet_id, userId: r.user_id, username: r.username,
      balance: r.balance, ledger: r.ledger, diff: r.balance - r.ledger,
    })),
  });
});

// ---------- system health ----------
// ภาพรวมสุขภาพระบบ: ผลล่าสุดแต่ละแหล่ง, รอบค้างออกผล, สถานะเปิดรับ
router.get('/health', requirePerm('dashboard.admin'), async (req, res) => {
  const d = db();
  // ผลล่าสุดของแต่ละแหล่งผล (source) + รอบที่ใช้
  const sources = await d.prepare(`SELECT lr.source, MAX(lr.published_at) AS last_at, COUNT(*) AS total
    FROM lottery_results lr GROUP BY lr.source ORDER BY last_at DESC`).all();
  const lastDraws = await d.prepare(`SELECT DISTINCT ON (lr.source)
      lr.source, d.draw_code, d.draw_at, lt.name_th AS type_name_th, c.name_th AS cat_name_th
    FROM lottery_results lr
    JOIN lottery_draws d ON d.id = lr.draw_id
    JOIN lottery_types lt ON lt.id = d.lottery_type_id
    LEFT JOIN lottery_categories c ON c.id = d.category_id
    ORDER BY lr.source, lr.published_at DESC`).all();
  const bySource = Object.fromEntries(lastDraws.map(r => [r.source, r]));
  // รอบที่เลยเวลาออกรางวัลแล้วแต่ยังไม่มีผล (ยกเว้นเกมด่วน)
  const overdue = await d.prepare(`SELECT d.id, d.draw_code, d.draw_at, d.status,
      lt.code AS type_code, lt.name_th AS type_name_th, c.name_th AS cat_name_th
    FROM lottery_draws d
    JOIN lottery_types lt ON lt.id = d.lottery_type_id
    LEFT JOIN lottery_categories c ON c.id = d.category_id
    WHERE d.status IN ('open','scheduled','closed') AND d.draw_at <= datetime('now')
      AND lt.code NOT IN ('SC','HL','KI')
      AND d.id NOT IN (SELECT draw_id FROM lottery_results)
    ORDER BY d.draw_at LIMIT 50`).all();
  const counts = {
    open: (await d.prepare(`SELECT COUNT(*) c FROM lottery_draws WHERE status='open'`).get()).c,
    scheduled: (await d.prepare(`SELECT COUNT(*) c FROM lottery_draws WHERE status='scheduled'`).get()).c,
    settledToday: (await d.prepare(`SELECT COUNT(*) c FROM lottery_results
      WHERE published_at >= date('now')`).get()).c,
    pendingBets: (await d.prepare(`SELECT COUNT(*) c FROM bet_items WHERE status='pending'`).get()).c,
  };
  res.json({
    sources: sources.map(s => ({ ...s, last: bySource[s.source] || null })),
    fetchHealth: fetcher.getSourceHealth(),
    overdue, counts,
  });
});

// ---------- draw schedule ----------
// ตารางออกรางวัลล่วงหน้าตามตารางเวลาที่กำหนด (read-only — ยังไม่สร้างรอบใน db)
router.get('/draws/schedule', requirePerm('draws.manage'), async (req, res) => {
  res.json({ schedule: await drawSchedulePreview() });
});

// เติมรอบหวยล่วงหน้าทันที (ปกติระบบทำอัตโนมัติทุก 1 นาที — ปุ่มนี้สำหรับบังคับทันที)
router.post('/draws/seed', requirePerm('draws.manage'), async (req, res) => {
  const created = await seedDemoDraws();
  audit({ userId: req.user.id, action: 'draws.seed', detail: { created }, req });
  res.json({ ok: true, created });
});

// ---------- broadcast notification ----------
const broadcastSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().max(500).optional().default(''),
  link: z.string().max(200).optional().default(''),
});
router.post('/broadcast', requirePerm('members.manage'), async (req, res, next) => {
  try {
    const { title, body, link } = broadcastSchema.parse(req.body);
    const users = await db().prepare(`SELECT id FROM users WHERE status = 'active'`).all();
    for (const u of users) notify(u.id, { type: 'system', title, body: body || null, link: link || null });
    // ส่งต่อไป Telegram channel ถ้าตั้งค่าไว้ (fire-and-forget)
    const { sendTelegram } = await import('../services/telegramService.js');
    sendTelegram(`📣 <b>${title}</b>\n${body || ''}`).catch(() => {});
    audit({ userId: req.user.id, action: 'notify.broadcast', detail: { title, recipients: users.length }, req });
    res.json({ ok: true, sent: users.length });
  } catch (e) { next(e); }
});

// ---------- bulk wallet adjust ----------
const bulkAdjustSchema = z.object({
  userIds: z.array(z.number().int().positive()).min(1).max(200).optional(),
  all: z.boolean().optional(),
  amount: z.number().int().positive(),          // สตางค์
  direction: z.enum(['credit', 'debit']),
  reason: z.string().min(3).max(500),
});
router.post('/wallet/bulk-adjust', requirePerm('wallet.adjust'), async (req, res, next) => {
  try {
    const { userIds, all, amount, direction, reason } = bulkAdjustSchema.parse(req.body);
    let targets = userIds || [];
    if (all) {
      targets = (await db().prepare(`SELECT id FROM users WHERE status = 'active'`).all()).map(u => u.id);
      if (targets.length > 200) return res.status(400).json({ error: 'สมาชิกเกิน 200 คน — เลือกเป็นกลุ่มย่อยแทน' });
    }
    if (!targets.length) return res.status(400).json({ error: 'ไม่ได้เลือกสมาชิก' });
    const baseKey = `bulk-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const baht = (amount / 100).toLocaleString('th-TH');
    const r = await approvals.submitOrExecute({
      category: 'wallet.bulk_adjust',
      payload: { targets, amount, direction, reason, baseKey },
      summary: `ปรับเครดิตหมู่ ${targets.length} คน: ${direction === 'credit' ? '+' : '-'}${baht} บาท — ${reason}`,
      makerId: req.user.id, req,
    });
    if (r.pending) return res.json({ ok: true, pendingApproval: true, approval: r.request });
    const results = r.result.results;
    res.json({ ok: true, results, succeeded: r.result.succeeded, failed: r.result.failed });
  } catch (e) { next(e); }
});

export default router;

// ---------- Payment requests (เติม/ถอนเงินจริง) ----------
import * as paySvc from '../services/paymentService.js';
router.get('/payments', requirePerm('wallet.adjust'), async (req, res, next) => {
  try {
    res.json({ requests: await paySvc.adminList({ status: req.query.status || 'pending_review', kind: req.query.kind || null }) });
  } catch (e) { next(e); }
});

// ดูรูปสลิปที่ member อัปโหลด (base64) — image อยู่ใน DB เป็น TEXT
router.get('/payments/:id/slip', requirePerm('wallet.adjust'), async (req, res, next) => {
  try {
    const p = await db().prepare('SELECT slip_image, slip_trans_ref, slip_amount, slip_error FROM payment_requests WHERE id=?').get(Number(req.params.id));
    if (!p) return res.status(404).json({ error: 'ไม่พบคำขอ' });
    res.json({ imageBase64: p.slip_image || null, slipTransRef: p.slip_trans_ref, slipAmount: p.slip_amount, slipError: p.slip_error });
  } catch (e) { next(e); }
});

const reviewSchema = z.object({ action: z.enum(['approve', 'reject']), note: z.string().max(500).optional() });
router.post('/payments/:id/review', requirePerm('wallet.adjust'), async (req, res, next) => {
  try {
    const { action, note } = reviewSchema.parse(req.body);
    const pay = await db().prepare('SELECT reference, kind, amount FROM payment_requests WHERE id = ?').get(Number(req.params.id));
    if (!pay) return res.status(404).json({ error: 'ไม่พบคำขอ' });
    const baht = (pay.amount / 100).toLocaleString('th-TH');
    const r = await approvals.submitOrExecute({
      category: 'payment.review',
      payload: { paymentId: Number(req.params.id), action, note },
      summary: `${action === 'approve' ? 'อนุมัติ' : 'ปฏิเสธ'} ${pay.kind === 'deposit' ? 'เติมเงิน' : 'ถอนเงิน'} ${baht} บาท (${pay.reference})`,
      makerId: req.user.id, req,
    });
    if (r.pending) return res.json({ ok: true, pendingApproval: true, approval: r.request });
    res.json({ ok: true, ...r.result });
  } catch (e) { next(e); }
});

// ---------- Approval Center (maker-checker) ----------

router.get('/approvals', requirePerm('approvals.view'), async (req, res, next) => {
  try {
    const status = ['pending', 'approved', 'rejected', 'executed', 'failed', 'cancelled'].includes(req.query.status) ? req.query.status : null;
    const r = await approvals.listApprovals({
      status, category: req.query.category || null, q: req.query.q || '',
      limit: Math.min(parseInt(req.query.limit || '50', 10) || 50, 200),
      offset: Math.max(parseInt(req.query.offset || '0', 10) || 0, 0),
    });
    res.json(r);
  } catch (e) { next(e); }
});

router.get('/approvals/:id', requirePerm('approvals.view'), async (req, res, next) => {
  try { res.json({ request: await approvals.getApproval(Number(req.params.id)) }); }
  catch (e) { next(e); }
});

const decideSchema = z.object({ note: z.string().max(500).optional() });
router.post('/approvals/:id/approve', requirePerm('approvals.approve'), async (req, res, next) => {
  try {
    const { note } = decideSchema.parse(req.body || {});
    const r = await approvals.decide({ id: Number(req.params.id), checkerId: req.user.id, approve: true, note, req });
    res.json({ ok: true, request: r });
  } catch (e) { next(e); }
});
router.post('/approvals/:id/reject', requirePerm('approvals.approve'), async (req, res, next) => {
  try {
    const { note } = decideSchema.parse(req.body || {});
    if (!note || note.trim().length < 3) return res.status(400).json({ error: 'กรุณาระบุเหตุผลการปฏิเสธ', code: 'NOTE_REQUIRED' });
    const r = await approvals.decide({ id: Number(req.params.id), checkerId: req.user.id, approve: false, note, req });
    res.json({ ok: true, request: r });
  } catch (e) { next(e); }
});
router.post('/approvals/:id/cancel', async (req, res, next) => {
  try { res.json({ ok: true, request: await approvals.cancel({ id: Number(req.params.id), userId: req.user.id }) }); }
  catch (e) { next(e); }
});

// ---------- Admin user management (admin.users.manage — super_admin เท่านั้น) ----------

// รายชื่อ user ที่มีสิทธิ์เข้า admin portal (role ใดก็ได้ที่ให้ dashboard.admin)
router.get('/admin-users', requirePerm('admin.users.manage'), async (req, res, next) => {
  try {
    const rows = await db().prepare(`SELECT DISTINCT u.id, u.username, u.display_name, u.status,
        u.mfa_enabled, u.email_verified, u.created_at, u.updated_at
      FROM users u
      JOIN user_roles ur ON ur.user_id = u.id
      JOIN role_permissions rp ON rp.role_id = ur.role_id
      JOIN permissions p ON p.id = rp.permission_id
      WHERE p.code = 'dashboard.admin'
      ORDER BY u.id`).all();
    const out = [];
    for (const u of rows) {
      const roles = (await db().prepare(`SELECT r.name FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = ?`).all(u.id)).map(r => r.name);
      const sess = await db().prepare(`SELECT COUNT(*) c FROM user_sessions WHERE user_id = ? AND revoked_at IS NULL AND expires_at > ?`).get(u.id, new Date().toISOString().replace('T', ' ').slice(0, 19));
      const lastLogin = await db().prepare(`SELECT created_at FROM auth_events WHERE user_id = ? AND event = 'login.success' ORDER BY id DESC LIMIT 1`).get(u.id).catch(() => null);
      out.push({ ...u, roles, activeSessions: sess?.c || 0, lastLoginAt: lastLogin?.created_at || null });
    }
    res.json({ admins: out, makerChecker: await approvals.makerCheckerRequired(), adminCount: await approvals.adminUserCount() });
  } catch (e) { next(e); }
});

const adminUserCreateSchema = z.object({
  username: z.string().min(3).max(50).regex(/^[a-zA-Z0-9_.-]+$/, 'username ใช้ได้เฉพาะ a-z 0-9 _ . -'),
  password: z.string().min(8).max(128),
  displayName: z.string().max(100).optional(),
  roleName: z.enum(['admin', 'super_admin']),
});
// สร้างบัญชีผู้ดูแลใหม่ — ใช้ได้เฉพาะ role ที่ให้สิทธิ์ admin portal
router.post('/admin-users', requirePerm('admin.users.manage'), async (req, res, next) => {
  try {
    const { username, password, displayName, roleName } = adminUserCreateSchema.parse(req.body);
    const exists = await db().prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (exists) return res.status(409).json({ error: 'username นี้ถูกใช้แล้ว' });
    const role = await db().prepare(`SELECT r.id FROM roles r
      JOIN role_permissions rp ON rp.role_id = r.id JOIN permissions p ON p.id = rp.permission_id
      WHERE r.name = ? AND p.code = 'dashboard.admin'`).get(roleName);
    if (!role) return res.status(400).json({ error: 'role นี้ไม่มีสิทธิ์ admin portal' });
    const r = await txAsync(async (d) => {
      const ins = await d.prepare(`INSERT INTO users (username, email, password_hash, display_name, status)
        VALUES (?, ?, ?, ?, 'active')`).run(username, `${username}@admin.local`, hashPassword(password), displayName || username);
      const uid = ins.lastInsertRowid;
      await d.prepare('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)').run(uid, role.id);
      await d.prepare('INSERT INTO virtual_wallets (user_id, balance) VALUES (?, 0)').run(uid);
      return uid;
    });
    audit({ userId: req.user.id, action: 'admin.user_create', entityType: 'user', entityId: String(r), detail: { username, roleName }, req });
    securityEvent({ eventType: 'admin.user_created', severity: 'warning', userId: r, ip: req.ip, detail: { by: req.user.id, username, roleName } });
    res.json({ ok: true, userId: r, note: 'บัญชีใหม่ต้อง setup MFA ก่อนเข้า admin portal' });
  } catch (e) { next(e); }
});

// reset MFA ของ admin คนอื่น — ใช้เมื่ออุปกรณ์ MFA หาย (break-glass ต้องมี admin อีกคนกด)
router.post('/admin-users/:id/reset-mfa', requirePerm('admin.users.manage'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (id === req.user.id) return res.status(400).json({ error: 'ไม่สามารถ reset MFA บัญชีตัวเองได้ — ใช้ flow ปกติ' });
    const target = await db().prepare('SELECT id, username, mfa_enabled FROM users WHERE id = ?').get(id);
    if (!target) return res.status(404).json({ error: 'ไม่พบผู้ใช้' });
    await txAsync(async (d) => {
      await d.prepare('UPDATE users SET mfa_secret = NULL, mfa_enabled = 0, updated_at = ? WHERE id = ?').run(new Date().toISOString().replace('T', ' ').slice(0, 19), id);
      await d.prepare('UPDATE user_sessions SET revoked_at = ?, mfa_verified = 0 WHERE user_id = ? AND revoked_at IS NULL').run(new Date().toISOString().replace('T', ' ').slice(0, 19), id);
    });
    invalidatePermCache(id);
    audit({ userId: req.user.id, action: 'admin.mfa_reset', entityType: 'user', entityId: String(id), detail: { target: target.username }, req });
    securityEvent({ eventType: 'admin.mfa_reset', severity: 'warning', userId: id, ip: req.ip, detail: { by: req.user.id } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

const adminStatusSchema = z.object({ status: z.enum(['active', 'disabled']) });
router.post('/admin-users/:id/status', requirePerm('admin.users.manage'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (id === req.user.id) return res.status(400).json({ error: 'ไม่สามารถปิดบัญชีตัวเองได้' });
    const { status } = adminStatusSchema.parse(req.body);
    const target = await db().prepare('SELECT username FROM users WHERE id = ?').get(id);
    if (!target) return res.status(404).json({ error: 'ไม่พบผู้ใช้' });
    await db().prepare(`UPDATE users SET status = ?, updated_at = ? WHERE id = ?`).run(status, new Date().toISOString().replace('T', ' ').slice(0, 19), id);
    if (status === 'disabled') await db().prepare(`UPDATE user_sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL`).run(new Date().toISOString().replace('T', ' ').slice(0, 19), id);
    invalidatePermCache(id);
    audit({ userId: req.user.id, action: 'admin.user_status', entityType: 'user', entityId: String(id), detail: { target: target.username, status }, req });
    securityEvent({ eventType: 'admin.user_status_changed', severity: status === 'disabled' ? 'warning' : 'info', userId: id, ip: req.ip, detail: { by: req.user.id, status } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});


// sessions ของ admin user — ดู/เพิกถอนจากระยะไกล
router.get('/admin-users/:id/sessions', requirePerm('admin.users.manage'), async (req, res, next) => {
  try {
    const sessions = await db().prepare(`SELECT id, created_at, expires_at, ip, user_agent, mfa_verified
      FROM user_sessions WHERE user_id = ? AND revoked_at IS NULL ORDER BY created_at DESC LIMIT 50`).all(Number(req.params.id));
    res.json({ sessions });
  } catch (e) { next(e); }
});
router.delete('/admin-users/:id/sessions/:sid', requirePerm('admin.users.manage'), async (req, res, next) => {
  try {
    await db().prepare(`UPDATE user_sessions SET revoked_at = ? WHERE id = ? AND user_id = ? AND revoked_at IS NULL`)
      .run(new Date().toISOString().replace('T', ' ').slice(0, 19), String(req.params.sid), Number(req.params.id));
    audit({ userId: req.user.id, action: 'admin.session_revoke', entityType: 'user_session', entityId: String(req.params.sid), detail: { targetUserId: req.params.id }, req });
    res.json({ ok: true });
  } catch (e) { next(e); }
});
