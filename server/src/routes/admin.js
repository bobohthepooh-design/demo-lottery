import { Router } from 'express';
import { z } from 'zod';
import { getDb, txAsync } from '../db/index.js';
import { requireAuth, requireMfaVerified } from '../services/authService.js';
import { requirePerm, requireRole, hasRole, invalidatePermCache } from '../middleware/rbac.js';
import { audit, securityEvent, HttpError } from '../lib/audit.js';
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

const router = Router();
router.use(requireAuth, requireMfaVerified, requirePerm('dashboard.admin'));

// ---------- helpers ----------
const db = () => getDb();

async function memberDto(u) {
  const w = await db().prepare('SELECT balance FROM virtual_wallets WHERE user_id = ?').get(u.id);
  const roles = (await db().prepare(`SELECT r.name FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=?`).all(u.id)).map(r=>r.name);
  return { id: u.id, username: u.username, email: u.email, displayName: u.display_name, status: u.status,
    balance: w?.balance ?? 0, roles, createdAt: u.created_at, mfaEnabled: !!u.mfa_enabled,
    withdrawUnlocked: !!u.withdraw_unlocked,
    ageConfirmed: !!u.age_confirmed, selfExcludedUntil: u.self_excluded_until,
    dailyLimitSatang: u.daily_limit_satang, monthlyLimitSatang: u.monthly_limit_satang };
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
    const slips = (await db().prepare('SELECT COUNT(*) c FROM bet_slips WHERE user_id = ?').get(id)).c;
    if (slips > 0) return res.status(400).json({ error: `ไม่สามารถลบได้ สมาชิกนี้มีประวัติโพย ${slips} รายการ` });
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
    audit({ userId: req.user.id, action: 'admin.member_delete', entityType: 'user', entityId: String(id), detail: { username: target.username }, req });
    res.json({ ok: true });
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
    await txAsync(async (d) => {
      await d.prepare('DELETE FROM role_permissions WHERE role_id = ?').run(roleId);
      for (const pid of permissionIds) await d.prepare('INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)').run(roleId, pid);
    });
    // invalidate caches for users with this role
    for (const u of await db().prepare('SELECT user_id FROM user_roles WHERE role_id = ?').all(roleId)) invalidatePermCache(u.user_id);
    audit({ userId: req.user.id, action: 'admin.roles_update', entityType: 'role', entityId: String(roleId), detail: { permissionIds }, req });
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

router.get('/lottery/rules', requirePerm('lottery.manage'), async (req, res) => {
  res.json({ rules: await db().prepare('SELECT * FROM lottery_rules ORDER BY lottery_type_id, bet_type').all() });
});

// ---------- draws ----------
router.get('/draws', requirePerm('draws.manage'), async (req, res) => {
  // includeInactiveTypes — admin ต้องเห็น/ยกเลิก/ออกผลรอบของประเภทที่ปิดอยู่ด้วย (โพยค้างต้องจัดการได้)
  res.json({ draws: await lottery.listDraws({ lotteryTypeId: req.query.type ? Number(req.query.type) : null, includeInactiveTypes: true }) });
});

// สถานะการอัปเดตผลรางวัลล่าสุดของทุกประเภท/หมวด — ล่าสุดต่อ type+category
router.get('/results/status', requirePerm('results.publish'), async (req, res) => {
  const rows = await db().prepare(`
    WITH latest AS (
      SELECT lr.id, lr.draw_id, lr.published_at, lr.source,
             d.lottery_type_id AS tid, COALESCE(d.category_id, 0) AS cid,
             ROW_NUMBER() OVER (
               PARTITION BY d.lottery_type_id, COALESCE(d.category_id, 0)
               ORDER BY COALESCE(lr.published_at, d.draw_at) DESC, lr.id DESC
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
    if (draw?.type_code === 'TH') {
      const official = await fetcher.fetchResultForDraw(drawId);
      if (!sameWinningNumbers(official.winning, winning_numbers))
        throw new HttpError(400,
          'หวยไทยต้องใช้ผลทางการที่ระบบดึงมาเท่านั้น — กรุณากด "ดึงผล" ก่อน แล้วใช้ตัวเลขที่ระบบแสดง', 'OFFICIAL_RESULT_REQUIRED');
    }
    const result = await lottery.settleDraw(req.user.id, drawId, winning_numbers);
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
    const result = await fetcher.updateDrawResult(req.user.id, Number(req.params.id), winning_numbers);
    broadcast('results');
    res.json(result);
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
  const whereSql = sql.slice(sql.indexOf('WHERE'));
  const countArgs = args.slice();
  const total = (await db().prepare(`SELECT COUNT(*) c FROM bet_slips bs ${whereSql}`).get(...countArgs)).c;
  const offset = Math.max(parseInt(req.query.offset || '0', 10) || 0, 0);
  sql += ' ORDER BY bs.id DESC LIMIT ? OFFSET ?'; args.push(limit, offset);
  const slips = await db().prepare(sql).all(...args);
  const itemsStmt = db().prepare(`SELECT bi.*, r.name_th AS bet_name_th,
                                    COALESCE(bi.payout_multiplier, r.payout_multiplier) AS payout_multiplier
                             FROM bet_items bi JOIN lottery_rules r ON r.id=bi.rule_id WHERE bi.slip_id=?`);
  res.json({ slips: await Promise.all(slips.map(async s => ({ ...s, items: await itemsStmt.all(s.id) }))), total, limit, offset });
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
    const result = await wallet.adminAdjust({ adminId: req.user.id, targetUserId: userId, ...rest });
    res.json({ ok: true, ...result });
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
  const total = (await db().prepare('SELECT COUNT(*) c FROM audit_logs').get()).c;
  const logs = await db().prepare(`SELECT al.*, u.username FROM audit_logs al LEFT JOIN users u ON u.id=al.user_id ORDER BY al.id DESC LIMIT ? OFFSET ?`).all(limit, offset);
  res.json({ logs, total, limit, offset });
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
router.put('/settings/:key', requirePerm('settings.manage'), async (req, res, next) => {
  try {
    const key = String(req.params.key).slice(0, 100);
    if (!/^[a-z0-9_.-]+$/i.test(key)) return res.status(400).json({ error: 'key ไม่ถูกต้อง' });
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
    const results = [];
    for (const uid of targets) {
      try {
        const r = await wallet.adminAdjust({ adminId: req.user.id, targetUserId: uid, amount, direction, reason, idempotencyKey: `${baseKey}-${uid}` });
        results.push({ userId: uid, ok: true, balance: r.balance });
      } catch (e) {
        results.push({ userId: uid, ok: false, error: e.message });
      }
    }
    audit({ userId: req.user.id, action: 'wallet.bulk_adjust', detail: { direction, amount, reason, total: targets.length, ok: results.filter(r => r.ok).length }, req });
    res.json({ ok: true, results, succeeded: results.filter(r => r.ok).length, failed: results.filter(r => !r.ok).length });
  } catch (e) { next(e); }
});

export default router;
