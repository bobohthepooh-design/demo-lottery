import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import * as auth from '../services/authService.js';
import { config } from '../config.js';
import { getBalance, getWallet, listTransactions } from '../services/walletService.js';
import { getDb } from '../db/index.js';
import { getSetting } from '../services/settingsService.js';

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
  email: z.string().email().max(200),
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
    const userId = auth.register({ ...data, ip: req.ip, userAgent: req.headers['user-agent'] });
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

export default router;
