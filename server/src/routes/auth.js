import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import * as auth from '../services/authService.js';
import { config } from '../config.js';
import { getBalance, getWallet, listTransactions } from '../services/walletService.js';
import { getDb } from '../db/index.js';
import { getSetting } from '../services/settingsService.js';
import { randomToken } from '../lib/password.js';
import { audit } from '../lib/audit.js';

const router = Router();

const loginLimiter = rateLimit({
  windowMs: config.rateLimitWindowMs,
  max: config.loginRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'พยายามเข้าสู่ระบบบ่อยเกินไป กรุณารอสักครู่' },
});

const registerSchema = z.object({
  username: z.string().min(3).max(32),
  email: z.string().email().max(200).optional(),
  password: z.string().min(8).max(128),
  displayName: z.string().max(100).optional(),
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
const mfaCodeSchema = z.object({ code: z.string().regex(/^\d{6}$/) });

router.post('/register', (req, res, next) => {
  try {
    const data = registerSchema.parse(req.body);
    const email = data.email || `${data.username.toLowerCase()}@demo.local`;
    const userId = auth.register({ ...data, email, ip: req.ip, userAgent: req.headers['user-agent'] });
    res.status(201).json({ ok: true, userId, message: 'สมัครสมาชิกสำเร็จ กรุณาเข้าสู่ระบบ' });
  } catch (e) { next(e); }
});

router.post('/login', loginLimiter, (req, res, next) => {
  try {
    const data = loginSchema.parse(req.body);
    const result = auth.login({ ...data, ip: req.ip, userAgent: req.headers['user-agent'] });
    auth.setSessionCookie(res, result.token);
    const needsMfa = result.user.mfaEnabled;
    res.json({
      ok: true,
      user: result.user,
      requiresMfa: needsMfa,
      mfaVerified: !needsMfa,
    });
  } catch (e) { next(e); }
});

router.post('/logout', (req, res) => {
  auth.logout(req);
  res.setHeader('Set-Cookie', 'dl_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
  res.json({ ok: true });
});

router.get('/me', auth.requireAuth, (req, res) => {
  const balance = getBalance(req.user.id);
  const roles = getDb().prepare(`SELECT r.name FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=?`)
    .all(req.user.id).map(r => r.name);
  res.json({
    user: { ...req.user, roles, mfaVerified: !!req.session.mfa_verified },
    balance,
    currency: 'THB',
    demoNotice: getSetting('demo_notice', ''),
  });
});

router.post('/change-password', auth.requireAuth, (req, res, next) => {
  try {
    const data = changePwSchema.parse(req.body);
    auth.changePassword(req.user.id, data.oldPassword, data.newPassword);
    res.json({ ok: true, message: 'เปลี่ยนรหัสผ่านสำเร็จ กรุณาเข้าสู่ระบบใหม่' });
  } catch (e) { next(e); }
});

router.post('/forgot-password', (req, res, next) => {
  try {
    const data = forgotSchema.parse(req.body);
    auth.forgotPassword({ email: data.email });
    res.json({ ok: true, message: 'หากอีเมลนี้มีในระบบ เราจะส่งลิงก์รีเซ็ตรหัสผ่าน (Demo: ไม่ได้ส่งอีเมลจริง)' });
  } catch (e) { next(e); }
});

router.post('/mfa/setup', auth.requireAuth, (req, res, next) => {
  try { res.json(auth.setupMfa(req.user.id)); } catch (e) { next(e); }
});

router.post('/mfa/enable', auth.requireAuth, (req, res, next) => {
  try {
    const { code } = mfaCodeSchema.parse(req.body);
    auth.enableMfa(req.user.id, code);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.post('/mfa/verify', (req, res, next) => {
  try {
    const { code } = mfaCodeSchema.parse(req.body);
    const sessionId = auth.getSessionToken(req);
    if (!sessionId) return res.status(401).json({ error: 'ไม่พบ session' });
    auth.verifyMfa(sessionId, code);
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
    let user = db.prepare('SELECT id, username FROM users WHERE email = ?').get(email);
    if (!user) {
      const db2 = getDb();
      let username;
      do { username = `line${randomBytes(4).toString('hex')}`; }
      while (db2.prepare('SELECT id FROM users WHERE username = ?').get(username));
      const password = randomToken(24); // ไม่เคยใช้ — บัญชี LINE ล็อกอินผ่าน OAuth เท่านั้น
      auth.register({
        username, email, password,
        displayName: String(profile.displayName || username).slice(0, 100),
        ip: req.ip, userAgent: req.headers['user-agent'],
      });
      user = db.prepare('SELECT id, username FROM users WHERE email = ?').get(email);
      audit({ userId: user.id, action: 'user.register_line', entityType: 'user', entityId: String(user.id), req });
    }

    // 4) สร้าง session ตรง (ไม่ผ่าน password login)
    const token = randomToken(32);
    db.prepare(`INSERT INTO user_sessions (id, user_id, ip, user_agent, expires_at)
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

export default router;
