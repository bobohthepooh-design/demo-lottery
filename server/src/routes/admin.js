import { Router } from 'express';
import { z } from 'zod';
import { getDb, tx } from '../db/index.js';
import { requireAuth, requireMfaVerified } from '../services/authService.js';
import { requirePerm, requireRole, invalidatePermCache } from '../middleware/rbac.js';
import { audit } from '../lib/audit.js';
import { hashPassword } from '../lib/password.js';
import * as lottery from '../services/lotteryService.js';
import * as wallet from '../services/walletService.js';
import * as settings from '../services/settingsService.js';
import { config } from '../config.js';

const router = Router();
router.use(requireAuth, requireMfaVerified, requirePerm('dashboard.admin'));

// ---------- helpers ----------
const db = () => getDb();

function memberDto(u) {
  const w = db().prepare('SELECT balance FROM virtual_wallets WHERE user_id = ?').get(u.id);
  const roles = db().prepare(`SELECT r.name FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=?`).all(u.id).map(r=>r.name);
  return { id: u.id, username: u.username, email: u.email, displayName: u.display_name, status: u.status,
    balance: w?.balance ?? 0, roles, createdAt: u.created_at, mfaEnabled: !!u.mfa_enabled };
}

// ---------- dashboard overview ----------
router.get('/overview', requirePerm('dashboard.admin'), (req, res) => {
  const d = db();
  const one = (sql, ...a) => d.prepare(sql).get(...a);
  res.json({
    members: one('SELECT COUNT(*) c FROM users').c,
    activeDraws: one(`SELECT COUNT(*) c FROM lottery_draws WHERE status='open'`).c,
    pendingBets: one(`SELECT COUNT(*) c FROM bet_items WHERE status='pending'`).c,
    totalStaked: one(`SELECT COALESCE(SUM(total_stake),0) s FROM bet_slips WHERE status='pending'`).s,
    totalPaid: one(`SELECT COALESCE(SUM(total_payout),0) s FROM bet_slips WHERE status IN ('won','partial','lost')`).s,
    walletLiability: one('SELECT COALESCE(SUM(balance),0) s FROM virtual_wallets').s,
    recentAudit: d.prepare('SELECT * FROM audit_logs ORDER BY id DESC LIMIT 10').all(),
    recentSecurity: d.prepare(`SELECT * FROM security_events ORDER BY id DESC LIMIT 10`).all(),
  });
});

// ---------- members ----------
router.get('/members', requirePerm('members.manage'), (req, res) => {
  const q = `%${(req.query.q || '').slice(0, 100)}%`;
  const rows = db().prepare(`SELECT * FROM users WHERE username LIKE ? OR email LIKE ? OR display_name LIKE ?
                             ORDER BY id DESC LIMIT 200`).all(q, q, q);
  res.json({ members: rows.map(memberDto) });
});

const memberUpdateSchema = z.object({
  status: z.enum(['active', 'locked', 'disabled']).optional(),
  displayName: z.string().max(100).optional(),
  password: z.string().min(8).max(128).optional(),
});

router.patch('/members/:id', requirePerm('members.manage'), (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const data = memberUpdateSchema.parse(req.body);
    const target = db().prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (!target) return res.status(404).json({ error: 'ไม่พบสมาชิก' });
    if (data.status) db().prepare(`UPDATE users SET status=?, updated_at=datetime('now') WHERE id=?`).run(data.status, id);
    if (data.displayName) db().prepare(`UPDATE users SET display_name=?, updated_at=datetime('now') WHERE id=?`).run(data.displayName, id);
    if (data.password) {
      db().prepare(`UPDATE users SET password_hash=?, updated_at=datetime('now') WHERE id=?`).run(hashPassword(data.password), id);
      db().prepare(`UPDATE user_sessions SET revoked_at=datetime('now') WHERE user_id=? AND revoked_at IS NULL`).run(id);
    }
    invalidatePermCache(id);
    audit({ userId: req.user.id, action: 'admin.member_update', entityType: 'user', entityId: String(id), detail: data, req });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ---------- roles ----------
router.get('/roles', requirePerm('roles.manage'), (req, res) => {
  const roles = db().prepare('SELECT * FROM roles ORDER BY id').all();
  const perms = db().prepare('SELECT * FROM permissions ORDER BY code').all();
  const rp = db().prepare('SELECT role_id, permission_id FROM role_permissions').all();
  res.json({
    roles: roles.map(r => ({ ...r, permissions: rp.filter(x => x.role_id === r.id).map(x => x.permission_id) })),
    permissions: perms,
  });
});

const rolePermSchema = z.object({
  roleId: z.number().int().positive(),
  permissionIds: z.array(z.number().int().positive()),
});

router.put('/roles/permissions', requirePerm('roles.manage'), requireRole('super_admin'), (req, res, next) => {
  try {
    const { roleId, permissionIds } = rolePermSchema.parse(req.body);
    tx((d) => {
      d.prepare('DELETE FROM role_permissions WHERE role_id = ?').run(roleId);
      const ins = d.prepare('INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)');
      for (const pid of permissionIds) ins.run(roleId, pid);
    });
    // invalidate caches for users with this role
    for (const u of db().prepare('SELECT user_id FROM user_roles WHERE role_id = ?').all(roleId)) invalidatePermCache(u.user_id);
    audit({ userId: req.user.id, action: 'admin.roles_update', entityType: 'role', entityId: String(roleId), detail: { permissionIds }, req });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ---------- lottery types & rules ----------
router.get('/lottery/types', requirePerm('lottery.manage'), (req, res) => {
  res.json({ types: lottery.listLotteryTypes({ activeOnly: false }) });
});

const typeSchema = z.object({
  code: z.string().min(1).max(20),
  name_th: z.string().min(1).max(200),
  name_en: z.string().max(200).optional(),
  description: z.string().max(500).optional(),
  is_active: z.number().int().min(0).max(1).optional(),
});

router.post('/lottery/types', requirePerm('lottery.manage'), (req, res, next) => {
  try {
    const t = typeSchema.parse(req.body);
    const r = db().prepare('INSERT INTO lottery_types (code,name_th,name_en,description,is_active) VALUES (?,?,?,?,?)')
      .run(t.code, t.name_th, t.name_en || null, t.description || null, t.is_active ?? 1);
    audit({ userId: req.user.id, action: 'admin.lottery_type_create', entityType: 'lottery_type', entityId: String(r.lastInsertRowid), req });
    res.status(201).json({ ok: true, id: Number(r.lastInsertRowid) });
  } catch (e) { next(e); }
});

router.patch('/lottery/types/:id', requirePerm('lottery.manage'), (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const t = typeSchema.partial().parse(req.body);
    const fields = Object.keys(t).filter(k => t[k] !== undefined);
    if (!fields.length) return res.status(400).json({ error: 'ไม่มีข้อมูล' });
    db().prepare(`UPDATE lottery_types SET ${fields.map(f => `${f}=?`).join(',')} WHERE id=?`)
      .run(...fields.map(f => t[f]), id);
    audit({ userId: req.user.id, action: 'admin.lottery_type_update', entityType: 'lottery_type', entityId: String(id), detail: t, req });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

const ruleSchema = z.object({
  lottery_type_id: z.number().int().positive(),
  category_id: z.number().int().positive().nullable().optional(),
  bet_type: z.string().min(1).max(50),
  name_th: z.string().min(1).max(200),
  name_en: z.string().max(200).optional(),
  digits: z.number().int().min(1).max(10),
  match_config: z.string().min(2).max(1000),
  payout_multiplier: z.number().min(0).max(100000),
  stake_unit: z.number().int().min(1).max(100000),
  min_amount: z.number().int().min(1),
  max_amount: z.number().int().min(1).nullable().optional(),
  is_active: z.number().int().min(0).max(1).optional(),
});

router.post('/lottery/rules', requirePerm('lottery.manage'), (req, res, next) => {
  try {
    const r = ruleSchema.parse(req.body);
    JSON.parse(r.match_config); // must be valid JSON
    const x = db().prepare(`INSERT INTO lottery_rules
      (lottery_type_id,category_id,bet_type,name_th,name_en,digits,match_config,payout_multiplier,stake_unit,min_amount,max_amount,is_active)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(r.lottery_type_id, r.category_id ?? null, r.bet_type, r.name_th, r.name_en || null, r.digits,
        r.match_config, r.payout_multiplier, r.stake_unit, r.min_amount, r.max_amount ?? null, r.is_active ?? 1);
    audit({ userId: req.user.id, action: 'admin.rule_create', entityType: 'lottery_rule', entityId: String(x.lastInsertRowid), req });
    res.status(201).json({ ok: true, id: Number(x.lastInsertRowid) });
  } catch (e) { next(e); }
});

router.patch('/lottery/rules/:id', requirePerm('lottery.manage'), (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const r = ruleSchema.partial().parse(req.body);
    if (r.match_config) JSON.parse(r.match_config);
    const fields = Object.keys(r).filter(k => r[k] !== undefined);
    if (!fields.length) return res.status(400).json({ error: 'ไม่มีข้อมูล' });
    db().prepare(`UPDATE lottery_rules SET ${fields.map(f => `${f}=?`).join(',')} WHERE id=?`)
      .run(...fields.map(f => r[f]), id);
    audit({ userId: req.user.id, action: 'admin.rule_update', entityType: 'lottery_rule', entityId: String(id), detail: r, req });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.get('/lottery/rules', requirePerm('lottery.manage'), (req, res) => {
  res.json({ rules: db().prepare('SELECT * FROM lottery_rules ORDER BY lottery_type_id, bet_type').all() });
});

// ---------- draws ----------
router.get('/draws', requirePerm('draws.manage'), (req, res) => {
  res.json({ draws: lottery.listDraws({ lotteryTypeId: req.query.type ? Number(req.query.type) : null }) });
});

const drawSchema = z.object({
  lottery_type_id: z.number().int().positive(),
  category_id: z.number().int().positive().nullable().optional(),
  draw_code: z.string().min(1).max(100),
  draw_at: z.string().min(10),
  close_at: z.string().min(10),
});

router.post('/draws', requirePerm('draws.manage'), (req, res, next) => {
  try {
    const d = drawSchema.parse(req.body);
    const id = lottery.createDraw(req.user.id, {
      lotteryTypeId: d.lottery_type_id, categoryId: d.category_id ?? null,
      drawCode: d.draw_code, drawAt: d.draw_at, closeAt: d.close_at,
    });
    res.status(201).json({ ok: true, id });
  } catch (e) { next(e); }
});

const statusSchema = z.object({ status: z.enum(['scheduled', 'open', 'closed', 'cancelled']) });
router.patch('/draws/:id/status', requirePerm('draws.manage'), (req, res, next) => {
  try {
    const { status } = statusSchema.parse(req.body);
    lottery.updateDrawStatus(req.user.id, Number(req.params.id), status);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

const settleSchema = z.object({
  winning_numbers: z.record(z.string(), z.string().regex(/^\d{1,10}$/)),
});
router.post('/draws/:id/settle', requirePerm('results.publish'), (req, res, next) => {
  try {
    const { winning_numbers } = settleSchema.parse(req.body);
    const result = lottery.settleDraw(req.user.id, Number(req.params.id), winning_numbers);
    res.json({ ok: true, ...result });
  } catch (e) { next(e); }
});

// ---------- bet monitoring ----------
router.get('/bets', requirePerm('bets.view_all'), (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || '100', 10), 500);
  const status = req.query.status || null;
  let sql = `SELECT bs.*, u.username, d.draw_code, d.draw_at, lt.name_th AS type_name_th
             FROM bet_slips bs JOIN users u ON u.id=bs.user_id
             JOIN lottery_draws d ON d.id=bs.draw_id JOIN lottery_types lt ON lt.id=d.lottery_type_id WHERE 1=1`;
  const args = [];
  if (status) { sql += ' AND bs.status = ?'; args.push(status); }
  if (req.query.userId) { sql += ' AND bs.user_id = ?'; args.push(Number(req.query.userId)); }
  sql += ' ORDER BY bs.id DESC LIMIT ?'; args.push(limit);
  const slips = db().prepare(sql).all(...args);
  const items = db().prepare(`SELECT bi.*, r.name_th AS bet_name_th FROM bet_items bi JOIN lottery_rules r ON r.id=bi.rule_id WHERE bi.slip_id=?`);
  res.json({ slips: slips.map(s => ({ ...s, items: items.all(s.id) })) });
});

// ---------- wallet adjust ----------
const adjustSchema = z.object({
  userId: z.number().int().positive(),
  amount: z.number().int().positive(),
  direction: z.enum(['credit', 'debit']),
  reason: z.string().min(3).max(500),
  idempotencyKey: z.string().min(8).max(100),
});
router.post('/wallet/adjust', requirePerm('wallet.adjust'), (req, res, next) => {
  try {
    const { userId, ...rest } = adjustSchema.parse(req.body);
    const result = wallet.adminAdjust({ adminId: req.user.id, targetUserId: userId, ...rest });
    res.json({ ok: true, ...result });
  } catch (e) { next(e); }
});

router.get('/wallet/transactions', requirePerm('wallet.adjust'), (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || '100', 10), 500);
  res.json({ transactions: db().prepare(`SELECT vt.*, u.username FROM virtual_transactions vt JOIN users u ON u.id=vt.user_id ORDER BY vt.id DESC LIMIT ?`).all(limit) });
});

// ---------- audit / security ----------
router.get('/audit', requirePerm('audit.view'), (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || '100', 10), 500);
  res.json({ logs: db().prepare(`SELECT al.*, u.username FROM audit_logs al LEFT JOIN users u ON u.id=al.user_id ORDER BY al.id DESC LIMIT ?`).all(limit) });
});

router.get('/security-events', requirePerm('security.view'), (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || '100', 10), 500);
  res.json({ events: db().prepare(`SELECT se.*, u.username FROM security_events se LEFT JOIN users u ON u.id=se.user_id ORDER BY se.id DESC LIMIT ?`).all(limit) });
});

// ---------- settings ----------
router.get('/settings', requirePerm('settings.manage'), (req, res) => {
  res.json({ settings: settings.allSettings() });
});
router.put('/settings/:key', requirePerm('settings.manage'), (req, res, next) => {
  try {
    const key = String(req.params.key).slice(0, 100);
    if (!/^[a-z0-9_.-]+$/i.test(key)) return res.status(400).json({ error: 'key ไม่ถูกต้อง' });
    settings.setSetting(key, req.body?.value, req.user.id);
    audit({ userId: req.user.id, action: 'admin.setting_update', entityType: 'setting', entityId: key, req });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ---------- reports ----------
router.get('/reports/summary', requirePerm('reports.view'), (req, res) => {
  const d = db();
  res.json({
    betsByType: d.prepare(`SELECT bi.bet_type, COUNT(*) c, SUM(bi.amount) stake, SUM(bi.payout) payout
                           FROM bet_items bi GROUP BY bi.bet_type ORDER BY stake DESC`).all(),
    betsByDay: d.prepare(`SELECT date(bs.created_at) day, COUNT(*) slips, SUM(bs.total_stake) stake
                          FROM bet_slips bs GROUP BY day ORDER BY day DESC LIMIT 30`).all(),
    topWinners: d.prepare(`SELECT u.username, bs.slip_ref, SUM(bi.payout) payout
                           FROM bet_items bi JOIN bet_slips bs ON bs.id=bi.slip_id
                           JOIN users u ON u.id=bs.user_id
                           WHERE bi.status='won' GROUP BY bs.id ORDER BY payout DESC LIMIT 20`).all(),
    drawsSummary: d.prepare(`SELECT d.draw_code, lt.name_th, d.status,
                             (SELECT COUNT(*) FROM bet_items bi WHERE bi.draw_id=d.id) items,
                             (SELECT COALESCE(SUM(bi.payout),0) FROM bet_items bi WHERE bi.draw_id=d.id) payout
                             FROM lottery_draws d JOIN lottery_types lt ON lt.id=d.lottery_type_id
                             ORDER BY d.id DESC LIMIT 30`).all(),
  });
});

export default router;
