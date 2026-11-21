import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import * as auth from '../services/authService.js';
import { config } from '../config.js';
import { getBalance, getWallet, listTransactions } from '../services/walletService.js';
import { getDb, txAsync } from '../db/index.js';
import { getSetting } from '../services/settingsService.js';
import { randomToken, hashPassword } from '../lib/password.js';
import { audit, HttpError } from '../lib/audit.js';

const router = Router();

const loginLimiter = rateLimit({
  windowMs: config.rateLimitWindowMs,
  max: config.loginRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'พยายามเข้าสู่ระบบบ่อยเกินไป กรุณารอสักครู่' },
});

const authFlowLimiter = rateLimit({
  windowMs: config.rateLimitWindowMs,
  max: config.loginRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'ทำรายการยืนยันตัวตนบ่อยเกินไป กรุณารอสักครู่' },
});

const registerSchema = z.object({
  username: z.string().min(3).max(32),
  email: z.preprocess(v => (typeof v === 'string' && !v.trim() ? undefined : v), z.string().email().max(200).optional()),
  password: z.string().min(8).max(128),
  displayName: z.string().max(100).optional(),
  ageConfirmed: z.literal(true),
});
const loginSchema = z.object({
  username: z.string().min(1).max(200),
  password: z.string().min(1).max(128),
});
const changePwSchema = z.object({
  oldPassword: z.string().min(1).max(128),
  newPassword: z.string().min(8).max(128),
});
const forgotSchema = z.object({ email: z.string().email().max(200) });
const resetPasswordSchema = z.object({
  token: z.string().regex(/^[a-f0-9]{64}$/i),
  newPassword: z.string().min(8).max(128),
});
const otpRequestSchema = z.object({
  phone: z.string().min(9).max(15),
  purpose: z.enum(['register', 'login']),
});
const otpVerifySchema = z.object({
  phone: z.string().min(9).max(15),
  code: z.string().regex(/^\d{6}$/),
  purpose: z.enum(['register', 'login']),
  displayName: z.string().max(100).optional(),
  ageConfirmed: z.boolean().optional(),
});
const mfaCodeSchema = z.object({ code: z.string().regex(/^\d{6}$/) });

router.post('/register', authFlowLimiter, async (req, res, next) => {
  try {
    const data = registerSchema.parse(req.body);
    const email = data.email || `${data.username.toLowerCase()}@demo.local`;
    const userId = await auth.register({ ...data, email, ip: req.ip, userAgent: req.headers['user-agent'] });
    await getDb().prepare('UPDATE users SET age_confirmed = 1 WHERE id = ?').run(userId);
    res.status(201).json({ ok: true, userId, message: 'สมัครสมาชิกสำเร็จ กรุณาเข้าสู่ระบบ' });
  } catch (e) { next(e); }
});

router.post('/login', loginLimiter, async (req, res, next) => {
  try {
    const data = loginSchema.parse(req.body);
    const result = await auth.login({ ...data, ip: req.ip, userAgent: req.headers['user-agent'] });
    auth.setSessionCookie(res, result.token);
    const needsMfa = result.requiresMfa;
    res.json({
      ok: true,
      user: result.user,
      requiresMfa: needsMfa,
      mfaVerified: !needsMfa,
    });
  } catch (e) { next(e); }
});

router.post('/logout', async (req, res) => {
  await auth.logout(req);
  res.setHeader('Set-Cookie', 'dl_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
  res.json({ ok: true });
});

router.get('/me', auth.requireAuth, async (req, res) => {
  const balance = await getBalance(req.user.id);
  const roles = (await getDb().prepare(`SELECT r.name FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=?`)
    .all(req.user.id)).map(r => r.name);
  res.json({
    user: { ...req.user, roles, mfaVerified: !!req.session.mfa_verified },
    balance,
    currency: 'THB',
    demoNotice: await getSetting('demo_notice', ''),
  });
});

// Responsible gambling — ตั้งวงเงินเดิมพัน + self-exclusion (แก้กลับ/ลดเวลาไม่ได้)
const rgSchema = z.object({
  dailyLimitBaht: z.number().min(0).max(10_000_000).nullable().optional(),
  monthlyLimitBaht: z.number().min(0).max(100_000_000).nullable().optional(),
  selfExcludeDays: z.union([z.literal(1), z.literal(7), z.literal(30), z.literal(36500)]).nullable().optional(),
});
router.patch('/me/responsible-gambling', auth.requireAuth, async (req, res, next) => {
  try {
    const data = rgSchema.parse(req.body);
    const db = getDb();
    const u = await db.prepare('SELECT self_excluded_until FROM users WHERE id = ?').get(req.user.id);
    if (!u) throw new HttpError(404, 'ไม่พบผู้ใช้');
    // self-exclusion: ตั้งได้เท่านั้น (ขยายเวลาได้) — ยกเลิกเองไม่ได้จนกว่าจะหมดเวลา
    if (data.selfExcludeDays) {
      const until = data.selfExcludeDays === 36500 ? 'permanent' : new Date(Date.now() + data.selfExcludeDays * 864e5).toISOString().slice(0, 19).replace('T', ' ');
      const cur = u.self_excluded_until;
      const curActive = cur === 'permanent' || (cur && cur > new Date().toISOString().slice(0, 19).replace('T', ' '));
      if (curActive && !(data.selfExcludeDays === 36500 && cur !== 'permanent')) {
        // อนุญาตเฉพาะการต่อเวลา (36500 = ถาวร) — ห้ามลด/ยกเลิก
        if (!(data.selfExcludeDays === 36500)) throw new HttpError(400, 'อยู่ในช่วงระงับแล้ว — ต่อเวลาได้เฉพาะ "ถาวร" เท่านั้น');
      }
      await db.prepare('UPDATE users SET self_excluded_until = ? WHERE id = ?').run(until, req.user.id);
      audit({ userId: req.user.id, action: 'user.self_exclude', entityType: 'user', entityId: String(req.user.id), detail: { until } });
    }
    if (data.dailyLimitBaht !== undefined)
      await db.prepare('UPDATE users SET daily_limit_satang = ? WHERE id = ?').run(data.dailyLimitBaht === null ? null : Math.round(data.dailyLimitBaht * 100), req.user.id);
    if (data.monthlyLimitBaht !== undefined)
      await db.prepare('UPDATE users SET monthly_limit_satang = ? WHERE id = ?').run(data.monthlyLimitBaht === null ? null : Math.round(data.monthlyLimitBaht * 100), req.user.id);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ค่าที่ผู้ใช้ตั้งเอง — ภาษา (th เท่านั้น) + timezone (IANA) สำหรับแสดงผล
const prefsSchema = z.object({
  language: z.literal('th').optional(),
  timezone: z.string().max(60).optional(),
});
router.patch('/me/prefs', auth.requireAuth, async (req, res, next) => {
  try {
    const data = prefsSchema.parse(req.body);
    const db = getDb();
    if (data.language !== undefined) {
      await db.prepare('UPDATE users SET language = ? WHERE id = ?').run(data.language, req.user.id);
    }
    if (data.timezone !== undefined) {
      // validate IANA timezone
      try { new Intl.DateTimeFormat('en', { timeZone: data.timezone }); }
      catch { throw new HttpError(400, 'Timezone ไม่ถูกต้อง'); }
      await db.prepare('UPDATE users SET timezone = ? WHERE id = ?').run(data.timezone, req.user.id);
    }
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ยืนยันอายุ 18+ สำหรับบัญชีเก่า/LINE ที่ยังไม่ได้ยืนยัน (บังคับก่อนใช้งานต่อ — frontend แสดง banner)
router.post('/me/confirm-age', auth.requireAuth, async (req, res) => {
  await getDb().prepare('UPDATE users SET age_confirmed = 1 WHERE id = ? AND age_confirmed = 0').run(req.user.id);
  res.json({ ok: true });
});

router.post('/change-password', auth.requireAuth, async (req, res, next) => {
  try {
    const data = changePwSchema.parse(req.body);
    await auth.changePassword(req.user.id, data.oldPassword, data.newPassword, req);
    res.json({ ok: true, message: 'เปลี่ยนรหัสผ่านสำเร็จ กรุณาเข้าสู่ระบบใหม่' });
  } catch (e) { next(e); }
});

router.post('/forgot-password', authFlowLimiter, async (req, res, next) => {
  try {
    const data = forgotSchema.parse(req.body);
    const r = await auth.forgotPassword({ email: data.email, ip: req.ip });
    res.json({ ok: true, message: 'หากอีเมลนี้มีในระบบ เราจะส่งลิงก์รีเซ็ตรหัสผ่าน (Demo: ไม่ได้ส่งอีเมลจริง)', ...r });
  } catch (e) { next(e); }
});

router.post('/reset-password', authFlowLimiter, async (req, res, next) => {
  try {
    const data = resetPasswordSchema.parse(req.body);
    await auth.resetPassword({ ...data, req });
    res.json({ ok: true, message: 'ตั้งรหัสผ่านใหม่สำเร็จ — เข้าสู่ระบบได้เลย' });
  } catch (e) { next(e); }
});

// ขอ OTP — DEMO: ไม่ได้ส่ง SMS จริง ส่งรหัสกลับใน response (devCode) ให้ frontend แสดง
router.post('/otp/request', authFlowLimiter, async (req, res, next) => {
  try {
    const data = otpRequestSchema.parse(req.body);
    const r = await auth.requestOtp({ ...data, ip: req.ip });
    res.json({ ok: true, ...r, message: r.devCode
      ? 'ส่งรหัส OTP แล้ว (Demo: รหัสแสดงด้านล่าง ไม่ได้ส่ง SMS จริง)'
      : 'ระบบบันทึกรหัส OTP แล้ว — รหัสจะส่งผ่านช่องทางที่ลงทะเบียนไว้' });
  } catch (e) { next(e); }
});

// ยืนยัน OTP — สมัครใหม่ (purpose=register) หรือเข้าสู่ระบบ (purpose=login)
router.post('/otp/verify', authFlowLimiter, async (req, res, next) => {
  try {
    const data = otpVerifySchema.parse(req.body);
    if (data.purpose === 'register' && data.ageConfirmed !== true)
      throw new HttpError(400, 'ต้องยืนยันว่าอายุ 18 ปีขึ้นไป');
    const result = await auth.verifyOtpLogin({ ...data, ip: req.ip, userAgent: req.headers['user-agent'] });
    if (data.purpose === 'register' && result.user?.id)
      await getDb().prepare('UPDATE users SET age_confirmed = 1 WHERE id = ?').run(result.user.id);
    auth.setSessionCookie(res, result.token);
    const needsMfa = result.requiresMfa;
    res.json({ ok: true, user: result.user, requiresMfa: needsMfa, mfaVerified: !needsMfa });
  } catch (e) { next(e); }
});

router.post('/mfa/setup', auth.requireAuth, async (req, res, next) => {
  try { res.json(await auth.setupMfa(req.user.id)); } catch (e) { next(e); }
});

router.post('/mfa/enable', auth.requireAuth, async (req, res, next) => {
  try {
    const { code } = mfaCodeSchema.parse(req.body);
    await auth.enableMfa(req.user.id, code);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.post('/mfa/verify', loginLimiter, async (req, res, next) => {
  try {
    const { code } = mfaCodeSchema.parse(req.body);
    const sessionId = auth.getSessionToken(req);
    if (!sessionId) return res.status(401).json({ error: 'ไม่พบ session' });
    await auth.verifyMfa(sessionId, code);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ---------- LINE Login (OAuth2) — ใช้ได้เมื่อ config LINE_CHANNEL_ID/SECRET ----------
const LINE_STATE_COOKIE = 'dl_line_state';
const lineRedirectUri = (req) =>
  config.line.callbackUrl || `${req.protocol}://${req.get('host')}/api/auth/line/callback`;

router.get('/line', (req, res) => {
  if (!config.line.channelId) return res.status(404).json({ error: 'ยังไม่ได้เปิดใช้งาน LINE Login' });
  const state = randomBytes(16).toString('hex');
  res.setHeader('Set-Cookie', `${LINE_STATE_COOKIE}=${state}; Path=/api/auth; HttpOnly; SameSite=Lax; Max-Age=600`);
  const url = 'https://access.line.me/oauth2/v2.1/authorize?' + new URLSearchParams({
    response_type: 'code',
    client_id: config.line.channelId,
    redirect_uri: lineRedirectUri(req),
    state,
    scope: 'profile openid',
  });
  res.redirect(url);
});

router.get('/line/callback', async (req, res) => {
  const fail = (msg) => res.redirect(`/?line_error=${encodeURIComponent(msg)}`);
  try {
    const { code, state, error: lineError } = req.query;
    if (lineError) return fail('ผู้ใช้ยกเลิกการเข้าสู่ระบบ LINE');
    const cookies = auth.parseCookies(req);
    const savedState = cookies[LINE_STATE_COOKIE];
    res.setHeader('Set-Cookie', `${LINE_STATE_COOKIE}=; Path=/api/auth; HttpOnly; SameSite=Lax; Max-Age=0`);
    if (!code || !state || !savedState || state !== savedState) return fail('การยืนยันตัวตน LINE ไม่สำเร็จ กรุณาลองใหม่');

    // 1) exchange code → access token
    const tokenRes = await fetch('https://api.line.me/oauth2/v2.1/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: String(code),
        redirect_uri: lineRedirectUri(req),
        client_id: config.line.channelId,
        client_secret: config.line.channelSecret,
      }),
    });
    const tok = await tokenRes.json();
    if (!tok.access_token) return fail('เชื่อมต่อ LINE ไม่สำเร็จ');

    // 2) profile
    const profRes = await fetch('https://api.line.me/v2/profile', {
      headers: { Authorization: `Bearer ${tok.access_token}` },
    });
    const profile = await profRes.json();
    if (!profile.userId) return fail('ไม่สามารถอ่านข้อมูลโปรไฟล์ LINE ได้');

    // 3) หา/สร้างบัญชี (email จำลองจาก LINE userId — ไม่เก็บรหัสผ่านจริง)
    const db = getDb();
    const email = `line_${profile.userId}@line.local`;
    let user = await db.prepare('SELECT id, username, status FROM users WHERE email = ?').get(email);
    if (user && user.status !== 'active') return fail('บัญชีนี้ถูกระงับการใช้งาน');
    if (!user) {
      let username;
      do { username = `line${randomBytes(4).toString('hex')}`; }
      while (await db.prepare('SELECT id FROM users WHERE username = ?').get(username));
      const password = randomToken(24); // ไม่เคยใช้ — บัญชี LINE ล็อกอินผ่าน OAuth เท่านั้น
      await auth.register({
        username, email, password,
        displayName: String(profile.displayName || username).slice(0, 100),
        ip: req.ip, userAgent: req.headers['user-agent'],
      });
      user = await db.prepare('SELECT id, username FROM users WHERE email = ?').get(email);
      audit({ userId: user.id, action: 'user.register_line', entityType: 'user', entityId: String(user.id), req });
    }

    // 4) สร้าง session ตรง (ไม่ผ่าน password login)
    const token = randomToken(32);
    await db.prepare(`INSERT INTO user_sessions (id, user_id, ip, user_agent, expires_at)
                VALUES (?, ?, ?, ?, datetime('now', '+${config.sessionTtlHours} hours'))`)
      .run(token, user.id, req.ip || null, String(req.headers['user-agent'] || '').slice(0, 300));
    auth.setSessionCookie(res, token);
    audit({ userId: user.id, action: 'user.login_line', entityType: 'user', entityId: String(user.id), req });
    res.redirect('/');
  } catch (e) {
    console.error('[line-auth]', e);
    fail('เกิดข้อผิดพลาดในการเข้าสู่ระบบ LINE');
  }
});

// ---------- PDPA: data export + account deletion ----------
// export: snapshot ข้อมูลทั้งหมดที่ผูกกับบัญชี (ไม่รวม password_hash/mfa_secret)
router.get('/me/export', auth.requireAuth, async (req, res, next) => {
  try {
    const db = getDb();
    const uid = req.user.id;
    const user = await db.prepare(`SELECT id, username, email, display_name, phone, status,
        created_at, updated_at, timezone, language, age_confirmed, withdraw_unlocked,
        daily_limit_satang, monthly_limit_satang, self_excluded_until
      FROM users WHERE id = ?`).get(uid);
    if (!user) throw new HttpError(404, 'ไม่พบบัญชี');
    const [wallet, transactions, slips, notifications, auditLogs, roles] = await Promise.all([
      db.prepare('SELECT balance, version, updated_at FROM virtual_wallets WHERE user_id = ?').get(uid),
      db.prepare(`SELECT reference, type, amount, balance_after, direction, status, description, created_at
                  FROM virtual_transactions WHERE user_id = ? ORDER BY id`).all(uid),
      db.prepare(`SELECT id, slip_ref, draw_id, status, total_stake, total_payout, created_at, settled_at
                  FROM bet_slips WHERE user_id = ? ORDER BY id`).all(uid),
      db.prepare('SELECT type, title, body, link, read_at, created_at FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 500').all(uid),
      db.prepare(`SELECT action, entity_type, entity_id, detail, created_at FROM audit_logs WHERE user_id = ? ORDER BY id`).all(uid),
      db.prepare(`SELECT r.name FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=?`).all(uid),
    ]);
    res.json({
      exportedAt: new Date().toISOString(),
      user: { ...user, roles: roles.map(r => r.name) },
      wallet,
      transactions,
      betSlips: slips,
      notifications,
      auditLogs,
    });
  } catch (e) { next(e); }
});

// delete: anonymize บัญชี (PDPA erasure) — เก็บ ledger/ประวัติการเงินไว้เพื่อ audit
// แต่ลบ PII ทั้งหมด: username/email/phone/display_name/password/mfa/session
// บล็อก: admin roles + มีโพยที่ยกเลิกได้ค้างอยู่ + require confirm:true
router.delete('/me', auth.requireAuth, async (req, res, next) => {
  try {
    if (req.body?.confirm !== true) throw new HttpError(400, 'ต้องส่ง { confirm: true } เพื่อยืนยันการลบบัญชี', 'CONFIRM_REQUIRED');
    const db = getDb();
    const uid = req.user.id;
    const roles = (await db.prepare(`SELECT r.name FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=?`).all(uid)).map(r => r.name);
    if (roles.some(r => r !== 'member')) throw new HttpError(403, 'บัญชีผู้ดูแลระบบลบบัญชีเองไม่ได้ — ติดต่อ super admin', 'ADMIN_ACCOUNT');
    const pending = await db.prepare(`SELECT COUNT(*)::int AS c FROM bet_slips s JOIN lottery_draws d ON d.id = s.draw_id
      WHERE s.user_id = ? AND s.status = 'pending' AND d.status = 'open'
        AND d.close_at > to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS')`).get(uid);
    if ((pending?.c || 0) > 0) throw new HttpError(400, 'มีโพยที่ยังรับเดิมพันอยู่ — กรุณารอผลหรือยกเลิกก่อนลบบัญชี', 'PENDING_BETS');
    const u = await db.prepare('SELECT phone FROM users WHERE id = ?').get(uid);
    await txAsync(async (d) => {
      if (u?.phone) await d.prepare('DELETE FROM otp_codes WHERE phone = ?').run(u.phone);
      await d.prepare('UPDATE user_sessions SET revoked_at = to_char(now() AT TIME ZONE \'UTC\',\'YYYY-MM-DD HH24:MI:SS\') WHERE user_id = ? AND revoked_at IS NULL').run(uid);
      await d.prepare(`UPDATE users SET username = ?, email = ?, display_name = 'ผู้ใช้ที่ลบข้อมูล',
          phone = NULL, password_hash = ?, mfa_secret = NULL, mfa_enabled = 0,
          failed_login_count = 0, locked_until = NULL, status = 'disabled',
          self_excluded_until = NULL, daily_limit_satang = NULL, monthly_limit_satang = NULL,
          timezone = NULL, language = NULL, updated_at = to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS')
        WHERE id = ?`).run(`deleted_${uid}`, `deleted_${uid}@deleted.local`, hashPassword(randomToken(24)), uid);
      // bet_slips เก็บ user_id เดิมไว้เพื่อ ledger — แต่ไม่เหลือ PII ผูกกับ id นี้แล้ว
    });
    audit({ userId: uid, action: 'user.delete_account', entityType: 'user', entityId: String(uid), detail: { anonymized: true } });
    res.setHeader('Set-Cookie', 'dl_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
    res.json({ ok: true, message: 'ลบบัญชีและลบข้อมูลส่วนตัวแล้ว — ประวัติการเงินยังถูกเก็บตามกฎหมาย' });
  } catch (e) { next(e); }
});

export default router;
