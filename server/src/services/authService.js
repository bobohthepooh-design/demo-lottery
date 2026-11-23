import { txAsync, makeReference } from '../db/index.js';
import { getSetting } from './settingsService.js';
import { randomToken } from '../lib/password.js';
import { config } from '../config.js';
import { HttpError, audit, securityEvent, authEvent } from '../lib/audit.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import { generateSecret, verifyTotp, otpauthUri } from '../lib/totp.js';
import { encryptSecret, decryptSecret } from '../lib/secretBox.js';
import { isPasswordBreached } from '../lib/haveibeenpwned.js';
import { randomInt, createHash } from 'node:crypto';
import { q, qGet, qRun } from '../db/pg.js';

const SESSION_COOKIE = 'dl_session';
const MAX_FAILED = 5;
const LOCK_MINUTES = 15;

export function parseCookies(req) {
  const out = {};
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i > -1) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

// ---------- session ----------

const SESSION_SELECT = `SELECT s.*, u.username, u.email, u.display_name, u.status AS user_status, u.mfa_enabled,
                        u.age_confirmed, u.self_excluded_until, u.daily_limit_satang, u.monthly_limit_satang, u.email_verified, u.phone
                 FROM user_sessions s JOIN users u ON u.id = s.user_id
                 WHERE s.id = $1 AND s.revoked_at IS NULL
                   AND s.expires_at > to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS')`;

export async function getSession(req) {
  const token = parseCookies(req)[SESSION_COOKIE];
  if (!token) return null;
  const s = await qGet(SESSION_SELECT, [token]);
  if (!s || s.user_status !== 'active') return null;
  return s;
}

export async function requireAuth(req, res, next) {
  try {
    const s = await getSession(req);
    if (!s) return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบ' });
    const renewed = await qRun(
      `UPDATE user_sessions SET expires_at = to_char((now() AT TIME ZONE 'UTC') + interval '${config.sessionTtlHours} hours','YYYY-MM-DD HH24:MI:SS')
       WHERE id = $1 AND expires_at < to_char((now() AT TIME ZONE 'UTC') + interval '6 hours','YYYY-MM-DD HH24:MI:SS')`,
      [s.id]);
    if (renewed.changes) setSessionCookie(res, s.id);
    req.session = s;
    req.user = { id: s.user_id, username: s.username, email: s.email, displayName: s.display_name, mfaEnabled: s.mfa_enabled,
      ageConfirmed: !!s.age_confirmed, selfExcludedUntil: s.self_excluded_until,
      dailyLimitSatang: s.daily_limit_satang, monthlyLimitSatang: s.monthly_limit_satang, emailVerified: !!s.email_verified, phone: s.phone };
    next();
  } catch (e) { next(e); }
}

export function requireMfaVerified(req, res, next) {
  if (req.session && req.session.mfa_verified) return next();
  return res.status(403).json({ error: 'ต้องยืนยัน MFA ก่อนใช้งานส่วนนี้', code: 'MFA_REQUIRED' });
}

// บังคับยืนยันอายุ 18+ ก่อนเดิมพัน/เล่นเกม — ใช้กับ route สร้างโพยเท่านั้น
// (cancel/reveal/guess ปล่อยไว้เพื่อให้คืนเครดิต/ตัดสินโพยเดิมได้เสมอ)
export function requireAgeConfirmed(req, res, next) {
  if (req.user?.ageConfirmed) return next();
  return res.status(403).json({
    error: 'ต้องยืนยันว่าอายุ 18 ปีขึ้นไปก่อนเดิมพันหรือเล่นเกม',
    code: 'AGE_CONFIRMATION_REQUIRED',
  });
}

export function setSessionCookie(res, token) {
  const maxAge = config.sessionTtlHours * 3600 * 1000;
  // Secure เฉพาะตอน request เป็น HTTPS จริง — LAN test ผ่าน http ต้อง set cookie ได้
  const secure = res.req ? res.req.secure : config.isProd;
  res.setHeader('Set-Cookie',
    `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(maxAge / 1000)}${secure ? '; Secure' : ''}`);
}

// ---------- register / login ----------

const USER_BY_CRED_PG = 'SELECT * FROM users WHERE LOWER(username) = LOWER($1) OR email = $2';

// รหัสผ่าน policy: ≥10 ตัว + ต้องมีตัวอักษรและตัวเลข (ใช้ตอนสมัคร/เปลี่ยน/รีเซ็ต — รหัสเก่าไม่กระทบ)
export function assertPasswordPolicy(pw) {
  if (!pw || pw.length < 10 || pw.length > 128) throw new HttpError(400, 'รหัสผ่านต้องมี 10-128 ตัวอักษร');
  if (!/[A-Za-zก-๙]/.test(pw) || !/\d/.test(pw)) throw new HttpError(400, 'รหัสผ่านต้องมีทั้งตัวอักษรและตัวเลข');
}

// HIBP k-anonymity: reject รหัสที่เคยรั่วไหล (fail-open ถ้าตรวจไม่ได้ —
// LAN/offline ไม่ควร block user; ตั้ง HIBP_CHECK=false เพื่อปิดทั้งระบบ)
async function assertPasswordNotBreached(pw) {
  if (!config.hibpCheck) return;
  const { breached } = await isPasswordBreached(pw);
  if (breached === true) throw new HttpError(400, 'รหัสผ่านนี้เคยรั่วไหลในการรั่วไหลข้อมูล — กรุณาใช้รหัสอื่น');
}

// promo abuse guard: ไอพีเดียวกันสมัครเกิน 3 บัญชีใน 7 วัน → ไม่ให้เครดิตเริ่มต้น (บัญชียังสร้างได้)
// excludeUserId: กันนับตัวเอง (เช็คหลัง INSERT แล้ว)
async function promoAbuseCheck(ip, d, excludeUserId = null) {
  if (!ip) return false;
  const c = (await d.prepare(`SELECT COUNT(*)::int c FROM users WHERE signup_ip = ? AND id <> ? AND created_at > to_char((now() AT TIME ZONE 'UTC') - interval '7 days','YYYY-MM-DD HH24:MI:SS')`).get(ip, excludeUserId || 0)).c;
  return c >= 3;
}
async function grantInitialCredit(d, userId, walletId) {
  const initial = Number(await getSetting('initial_credit', config.initialCredit)) || 0;
  if (initial <= 0) return;
  await d.prepare('UPDATE virtual_wallets SET balance = ?, version = version + 1 WHERE id = ?').run(initial, walletId);
  await d.prepare(`INSERT INTO virtual_transactions
    (reference, wallet_id, user_id, type, amount, balance_after, direction, status, idempotency_key, description)
    VALUES (?, ?, ?, 'initial_credit', ?, ?, 'credit', 'completed', ?, 'เครดิตแถมสำหรับสมาชิกใหม่')`)
    .run(makeReference('TX'), walletId, userId, initial, initial, `init-credit-${userId}`);
}

export async function register({ username, email, password, displayName, termsAccepted, ip, userAgent }) {
  if (!/^[a-zA-Z0-9_]{3,32}$/.test(username)) throw new HttpError(400, 'ชื่อผู้ใช้ต้องเป็นตัวอักษร/ตัวเลข 3-32 ตัว');
  const mail = (email || '').trim().toLowerCase();
  if (mail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) throw new HttpError(400, 'อีเมลไม่ถูกต้อง');
  assertPasswordPolicy(password);
  await assertPasswordNotBreached(password);
  if (termsAccepted !== true) throw new HttpError(400, 'ต้องยอมรับข้อกำหนดการใช้งานและนโยบายความเป็นส่วนตัว');
  const finalEmail = mail || `${username.toLowerCase()}@member.local`;
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

  const dup = await qGet('SELECT id FROM users WHERE LOWER(username) = LOWER($1) OR email = $2',
    [username, finalEmail]);
  if (dup) throw new HttpError(409, 'ชื่อผู้ใช้หรืออีเมลนี้ถูกใช้งานแล้ว');

  const userId = await txAsync(async (d) => {
    const r = await d.prepare(`INSERT INTO users (username, email, password_hash, display_name, terms_accepted_at, terms_version, signup_ip)
                               VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(username, finalEmail, hashPassword(password), displayName || username, now, config.termsVersion, ip || null);
    const id = Number(r.lastInsertRowid);
    const memberRole = await d.prepare(`SELECT id FROM roles WHERE name = 'member'`).get();
    if (memberRole) await d.prepare('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)').run(id, memberRole.id);
    const wallet = await d.prepare('INSERT INTO virtual_wallets (user_id, balance) VALUES (?, 0)').run(id);
    const walletId = Number(wallet.lastInsertRowid);
    if (!(await promoAbuseCheck(ip, d, id))) await grantInitialCredit(d, id, walletId);
    else securityEvent({ eventType: 'promo.abuse_suspected', severity: 'warning', userId: id, ip, detail: { reason: 'same_ip_multi_register' } });
    return id;
  });

  audit({ userId, action: 'user.register', entityType: 'user', entityId: String(userId), req: null });
  return userId;
}

export async function login({ username, password, ip, userAgent }) {
  const user = await qGet(USER_BY_CRED_PG, [username, (username || '').toLowerCase()]);

  if (!user) {
    securityEvent({ eventType: 'login.failed_unknown_user', severity: 'warning', ip, detail: { username } });
    authEvent({ event: 'login.failed_unknown', ip, userAgent, detail: { username } });
    throw new HttpError(401, 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
  }
  if (user.status !== 'active') {
    authEvent({ userId: user.id, event: 'login.blocked', ip, userAgent, detail: { reason: `status=${user.status}` } });
    throw new HttpError(403, 'บัญชีนี้ถูกระงับการใช้งาน');
  }
  if (user.locked_until && user.locked_until > new Date().toISOString().replace('T', ' ').slice(0, 19)) {
    authEvent({ userId: user.id, event: 'login.blocked', ip, userAgent, detail: { reason: 'locked' } });
    throw new HttpError(423, 'บัญชีถูกล็อกชั่วคราว กรุณาลองใหม่ภายหลัง');
  }

  const ok = verifyPassword(password, user.password_hash);
  if (!ok) {
    const fails = user.failed_login_count + 1;
    const lock = fails >= MAX_FAILED;
    await qRun(`UPDATE users SET failed_login_count = $1, locked_until = $2,
        updated_at = to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS') WHERE id = $3`,
      [lock ? 0 : fails, lock ? new Date(Date.now() + LOCK_MINUTES * 60000).toISOString().replace('T', ' ').slice(0, 19) : null, user.id]);
    securityEvent({ eventType: 'login.failed', severity: lock ? 'critical' : 'warning', userId: user.id, ip });
    authEvent({ userId: user.id, event: 'login.failed', ip, userAgent, detail: { locked: lock } });
    if (lock) audit({ userId: user.id, action: 'user.locked_bruteforce', entityType: 'user', entityId: String(user.id) });
    throw new HttpError(401, 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
  }

  await qRun(`UPDATE users SET failed_login_count = 0, locked_until = NULL,
      updated_at = to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS') WHERE id = $1`, [user.id]);

  const token = randomToken(32);
  await qRun(`INSERT INTO user_sessions (id, user_id, ip, user_agent, expires_at)
              VALUES ($1, $2, $3, $4, to_char((now() AT TIME ZONE 'UTC') + interval '${config.sessionTtlHours} hours','YYYY-MM-DD HH24:MI:SS'))`,
    [token, user.id, ip || null, (userAgent || '').slice(0, 300)]);

  const roles = (await q(`SELECT r.name FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = $1`, [user.id])).map(r => r.name);

  audit({ userId: user.id, action: 'user.login', entityType: 'user', entityId: String(user.id), req: { ip, headers: { 'user-agent': userAgent } } });
  authEvent({ userId: user.id, event: 'login.success', ip, userAgent, detail: { via: 'password' } });

  // member ที่เปิด MFA ไว้เองก็ต้องยืนยัน MFA ตอน login (admin เหมือนเดิม — middleware บังคับต่อ)
  return { token, user: { id: user.id, username: user.username, email: user.email, displayName: user.display_name, roles, mfaEnabled: !!user.mfa_enabled, emailVerified: !!user.email_verified }, requiresMfa: !!user.mfa_enabled };
}

export function logout(req) {
  const token = parseCookies(req)[SESSION_COOKIE];
  if (!token) return;
  qRun(`UPDATE user_sessions SET revoked_at = to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS') WHERE id = $1`, [token])
    .catch(e => console.error('[logout] pg:', e.message));
  audit({ userId: req.user?.id, action: 'user.logout', entityType: 'user', entityId: req.user ? String(req.user.id) : null, req });
  if (req.user?.id) authEvent({ userId: req.user.id, event: 'logout', ip: req.ip, userAgent: req.headers?.['user-agent'] });
}

export async function changePassword(userId, oldPassword, newPassword, req = null) {
  const user = await qGet('SELECT * FROM users WHERE id = $1', [userId]);
  if (!user || !verifyPassword(oldPassword, user.password_hash)) throw new HttpError(400, 'รหัสผ่านเดิมไม่ถูกต้อง');
  assertPasswordPolicy(newPassword);
  await assertPasswordNotBreached(newPassword);
  await qRun(`UPDATE users SET password_hash = $1,
      updated_at = to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS') WHERE id = $2`,
    [hashPassword(newPassword), userId]);
  await qRun(`UPDATE user_sessions SET revoked_at = to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS')
              WHERE user_id = $1 AND revoked_at IS NULL`, [userId]);
  audit({ userId, action: 'user.change_password', entityType: 'user', entityId: String(userId), req });
  securityEvent({ eventType: 'password.changed', userId, ip: req?.ip || null, detail: { sessions_revoked: true } });
}

export async function forgotPassword({ email, ip }) {
  const user = await qGet('SELECT id, email FROM users WHERE email = $1', [(email || '').trim().toLowerCase()]);
  if (user) {
    const token = randomToken();
    const tokenHash = createHash('sha256').update(`password-reset:${token}`).digest('hex');
    await txAsync(async (d) => {
      await d.prepare(`UPDATE password_reset_tokens
        SET used_at = ?
        WHERE user_id = ? AND used_at IS NULL`).run(new Date().toISOString().replace('T', ' ').slice(0, 19), user.id);
      await d.prepare(`INSERT INTO password_reset_tokens (user_id, token_hash, expires_at, request_ip)
        VALUES (?, ?, to_char((now() AT TIME ZONE 'UTC') + interval '30 minutes','YYYY-MM-DD HH24:MI:SS'), ?)`)
        .run(user.id, tokenHash, ip || null);
    });
    // ส่งลิงก์รีเซ็ตทางอีเมลจริงถ้าตั้งค่า SMTP แล้ว; ไม่งั้น demo echo เฉพาะ private IP
    const { sendMail, mailConfigured } = await import('./mailer.js');
    let mailed = false;
    if (mailConfigured() && user.email && !user.email.endsWith('@member.local') && !user.email.endsWith('@phone.local') && !user.email.endsWith('@line.local')) {
      const link = `${config.clientOrigin}/reset-password?token=${token}`;
      await sendMail({ to: user.email, subject: 'รีเซ็ตรหัสผ่าน — Demo Lottery',
        text: `รีเซ็ตรหัสผ่านของคุณโดยเปิดลิงก์นี้ (หมดอายุใน 30 นาที):\n${link}\nหากไม่ได้เป็นผู้ขอ ให้เพิกเฉยข้อความนี้`,
        html: `<div style="font-family:sans-serif;max-width:480px;margin:auto"><h2 style="color:#f4c94e">รีเซ็ตรหัสผ่าน</h2><p>กดปุ่มด้านล่างเพื่อตั้งรหัสผ่านใหม่ (ลิงก์หมดอายุใน 30 นาที)</p><p><a href="${link}" style="display:inline-block;background:#f4c94e;color:#1a1206;font-weight:700;padding:12px 24px;border-radius:8px;text-decoration:none">ตั้งรหัสผ่านใหม่</a></p><p style="font-size:12px;color:#888;word-break:break-all">${link}</p><p style="font-size:12px;color:#888">หากไม่ได้เป็นผู้ขอ ให้เพิกเฉยข้อความนี้</p></div>` });
      mailed = true;
    }
    audit({ userId: user.id, action: 'user.password_reset_requested', entityType: 'user', entityId: String(user.id), detail: { mailed } });
    securityEvent({ eventType: 'password_reset_requested', userId: user.id, ip, detail: { mailed } });
    return { ...(canEchoOtp(ip) && !mailed ? { devResetToken: token } : {}), mailed };
  }
  return {};
}

export async function resetPassword({ token, newPassword, req = null }) {
  assertPasswordPolicy(newPassword);
  await assertPasswordNotBreached(newPassword);
  const tokenHash = createHash('sha256').update(`password-reset:${token}`).digest('hex');
  const userId = await txAsync(async (d) => {
    const reset = await d.prepare(`SELECT id, user_id, expires_at, used_at FROM password_reset_tokens
      WHERE token_hash = ? FOR UPDATE`).get(tokenHash);
    const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
    if (!reset || reset.used_at || reset.expires_at <= now)
      throw new HttpError(400, 'ลิงก์รีเซ็ตรหัสผ่านไม่ถูกต้อง หมดอายุ หรือถูกใช้แล้ว');

    await d.prepare(`UPDATE password_reset_tokens SET used_at = ? WHERE id = ?`).run(now, reset.id);
    await d.prepare(`UPDATE users SET password_hash = ?, failed_login_count = 0, locked_until = NULL, updated_at = ? WHERE id = ?`)
      .run(hashPassword(newPassword), now, reset.user_id);
    await d.prepare(`UPDATE user_sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL`)
      .run(now, reset.user_id);
    return reset.user_id;
  });
  audit({ userId, action: 'user.password_reset_completed', entityType: 'user', entityId: String(userId), req });
  securityEvent({ eventType: 'password_reset_completed', userId, ip: req?.ip || null, detail: { sessions_revoked: true } });
  return true;
}

// ---------- MFA (admin required; member voluntary — เปิดใช้เองได้ในโปรไฟล์) ----------

export async function setupMfa(userId) {
  const user = await qGet('SELECT username, mfa_secret, mfa_enabled FROM users WHERE id = $1', [userId]);
  if (user.mfa_enabled) throw new HttpError(400, 'MFA เปิดใช้งานแล้ว');
  const secret = generateSecret();
  await qRun('UPDATE users SET mfa_secret = $1 WHERE id = $2', [encryptSecret(secret), userId]);
  return { secret, uri: otpauthUri(secret, user.username) };
}

export async function enableMfa(userId, code) {
  const user = await qGet('SELECT mfa_secret FROM users WHERE id = $1', [userId]);
  const plain = user?.mfa_secret ? decryptSecret(user.mfa_secret) : null;
  if (!plain) throw new HttpError(400, 'กรุณาสร้าง MFA secret ก่อน');
  if (!verifyTotp(plain, code)) throw new HttpError(400, 'รหัส MFA ไม่ถูกต้อง');
  await qRun('UPDATE users SET mfa_enabled = 1 WHERE id = $1', [userId]);
  audit({ userId, action: 'user.mfa_enabled', entityType: 'user', entityId: String(userId) });
  securityEvent({ eventType: 'mfa.enabled', userId, detail: { admin_only: true } });
}

export async function verifyMfa(sessionId, code) {
  const s = await qGet('SELECT s.id, u.mfa_secret, u.mfa_enabled FROM user_sessions s JOIN users u ON u.id = s.user_id WHERE s.id = $1', [sessionId]);
  const plain = s?.mfa_secret ? decryptSecret(s.mfa_secret) : null;
  if (!s || !s.mfa_enabled || !plain) throw new HttpError(400, 'ไม่ต้องยืนยัน MFA');
  if (!verifyTotp(plain, code)) {
    securityEvent({ eventType: 'mfa.failed', severity: 'warning', detail: { sessionId } });
    throw new HttpError(401, 'รหัส MFA ไม่ถูกต้อง');
  }
  await qRun('UPDATE user_sessions SET mfa_verified = 1 WHERE id = $1', [sessionId]);
  audit({ action: 'user.mfa_verified', entityType: 'session', entityId: sessionId });
}

export function getSessionToken(req) {
  return parseCookies(req)[SESSION_COOKIE] || null;
}

// ---------- Phone/Email + OTP ----------
// channel='phone' → ส่ง SMS ไม่ได้จริง (dev echo บน private IP) | channel='email' → ส่งโค้ดเข้าทางอีเมลจริงผ่าน SMTP

const OTP_TTL_MINUTES = 5;
const OTP_MAX_ATTEMPTS = 5;
const OTP_MAX_PER_10MIN = 5;

const hashOtp = (code) => createHash('sha256').update(`otp:${code}`).digest('hex');

// normalize เบอร์ไทย: รับ 0xxxxxxxxx, +66xxxxxxxxx, 66xxxxxxxxx, หรือ 9 หลักหลัง +66 → '0xxxxxxxxx'
export function normalizePhone(raw) {
  let d = String(raw || '').replace(/\D/g, '');
  if (d.startsWith('66') && d.length === 11) d = '0' + d.slice(2);
  else if (d.length === 9 && /^[689]/.test(d)) d = '0' + d;
  if (d.startsWith('0') && d.length === 10) return d;
  throw new HttpError(400, 'เบอร์โทรไม่ถูกต้อง — ใส่เบอร์ไทย 10 หลัก เช่น 0812345678');
}

const SESSION_EXPIRES_PG = (h) => `to_char((now() AT TIME ZONE 'UTC') + interval '${h} hours','YYYY-MM-DD HH24:MI:SS')`;
const OTP_EXPIRES_PG = (m) => `to_char((now() AT TIME ZONE 'UTC') + interval '${m} minutes','YYYY-MM-DD HH24:MI:SS')`;

// P0: devCode (OTP echo) เปิดเฉพาะ client ใน private/LAN — ถ้า deploy public internet
// request จาก IP สาธารณะจะไม่ได้รับรหัสใน response อีกต่อไป (ต้องทำ SMS provider จริง)
const PRIVATE_IP = /^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|::1|f[cd][0-9a-f]*:|fe80)/i;
export function canEchoOtp(ip) {
  return config.otpDevEcho && PRIVATE_IP.test(String(ip || ''));
}

async function createSessionToken(userId, ip, userAgent) {
  const token = randomToken(32);
  await qRun(`INSERT INTO user_sessions (id, user_id, ip, user_agent, expires_at)
              VALUES ($1, $2, $3, $4, ${SESSION_EXPIRES_PG(config.sessionTtlHours)})`,
    [token, userId, ip || null, (userAgent || '').slice(0, 300)]);
  authEvent({ userId, event: 'login.success', ip, userAgent, detail: { via: 'otp' } });
  return token;
}

async function userPayload(user) {
  const roles = (await q(`SELECT r.name FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = $1`, [user.id])).map(r => r.name);
  return { id: user.id, username: user.username, email: user.email, displayName: user.display_name, roles, mfaEnabled: !!user.mfa_enabled, emailVerified: !!user.email_verified, phone: user.phone || null };
}

export function normalizeEmail(raw) {
  const e = String(raw || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) || e.length > 200) throw new HttpError(400, 'อีเมลไม่ถูกต้อง');
  return e;
}

// channel: 'phone' (default) | 'email' — target เก็บในคอลัมน์ phone (เป็น string key เฉยๆ) + channel แยก
export async function requestOtp({ channel = 'phone', target, purpose, ip }) {
  const ch = channel === 'email' ? 'email' : 'phone';
  const t = ch === 'email' ? normalizeEmail(target) : normalizePhone(target);
  const recent = (await qGet(`SELECT COUNT(*)::int AS c FROM otp_codes
    WHERE phone = $1 AND channel = $2 AND purpose = $3 AND created_at > to_char((now() AT TIME ZONE 'UTC') - interval '10 minutes','YYYY-MM-DD HH24:MI:SS')`, [t, ch, purpose])).c;
  if (recent >= OTP_MAX_PER_10MIN) {
    securityEvent({ eventType: 'otp.rate_limited', severity: 'warning', ip, detail: { target: t, channel: ch, purpose } });
    throw new HttpError(429, 'ขอรหัส OTP บ่อยเกินไป กรุณารอสักครู่');
  }
  await qRun('UPDATE otp_codes SET used = 1 WHERE phone = $1 AND channel = $2 AND purpose = $3 AND used = 0', [t, ch, purpose]);
  const code = String(randomInt(100000, 1000000));
  await qRun(`INSERT INTO otp_codes (phone, code, purpose, expires_at, ip, channel) VALUES ($1, $2, $3, ${OTP_EXPIRES_PG(OTP_TTL_MINUTES)}, $4, $5)`,
    [t, hashOtp(code), purpose, ip || null, ch]);
  // email channel → ส่งรหัสจริงผ่าน SMTP (ถ้าตั้งค่าไว้); phone → demo echo เท่านั้น
  let mailed = false;
  if (ch === 'email') {
    const { sendMail, mailConfigured } = await import('./mailer.js');
    if (mailConfigured()) {
      await sendMail({ to: t, subject: 'รหัส OTP เข้าสู่ระบบ — Demo Lottery',
        text: `รหัส OTP ของคุณคือ ${code} (หมดอายุใน ${OTP_TTL_MINUTES} นาที)\nหากไม่ได้เป็นผู้ขอ ให้เพิกเฉยข้อความนี้`,
        html: `<div style="font-family:sans-serif;max-width:480px;margin:auto"><h2 style="color:#f4c94e">รหัส OTP ของคุณ</h2><div style="font-size:32px;font-weight:800;letter-spacing:8px;color:#f4c94e">${code}</div><p>หมดอายุใน ${OTP_TTL_MINUTES} นาที — หากไม่ได้เป็นผู้ขอ ให้เพิกเฉยข้อความนี้</p></div>` });
      mailed = true;
    }
  }
  audit({ action: 'user.otp_requested', entityType: ch, entityId: t, detail: { purpose, mailed } });
  securityEvent({ eventType: 'otp.requested', ip, detail: { target: t, channel: ch, purpose } });
  return { channel: ch, ...(canEchoOtp(ip) || (ch === 'email' && !mailed) ? { devCode: code } : {}), expiresInSec: OTP_TTL_MINUTES * 60, mailed };
}

async function consumeOtp(target, code, purpose, channel = 'phone') {
  const row = await qGet(`SELECT * FROM otp_codes WHERE phone = $1 AND channel = $2 AND purpose = $3 AND used = 0
    ORDER BY id DESC LIMIT 1`, [target, channel, purpose]);
  if (!row) throw new HttpError(400, 'กรุณาขอรหัส OTP ก่อน');
  if (row.expires_at <= new Date().toISOString().replace('T', ' ').slice(0, 19)) {
    await qRun('UPDATE otp_codes SET used = 1 WHERE id = $1', [row.id]);
    throw new HttpError(400, 'รหัส OTP หมดอายุแล้ว กรุณาขอรหัสใหม่');
  }
  if (row.attempts >= OTP_MAX_ATTEMPTS) {
    await qRun('UPDATE otp_codes SET used = 1 WHERE id = $1', [row.id]);
    securityEvent({ eventType: 'otp.too_many_attempts', severity: 'warning', detail: { target } });
    throw new HttpError(429, 'กรอกรหัสผิดหลายครั้งเกินไป กรุณาขอรหัสใหม่');
  }
  await qRun('UPDATE otp_codes SET attempts = attempts + 1 WHERE id = $1', [row.id]);
  if (row.code !== hashOtp(String(code))) {
    securityEvent({ eventType: 'otp.failed', severity: 'warning', detail: { target, purpose } });
    throw new HttpError(401, 'รหัส OTP ไม่ถูกต้อง');
  }
  await qRun('UPDATE otp_codes SET used = 1 WHERE id = $1', [row.id]);
}

// สมัครด้วย OTP (เบอร์หรืออีเมล): สร้าง user (password สุ่ม ใช้ไม่ได้) + wallet + เครดิตฟรี
async function registerOtpUser({ channel, target, displayName, ip }) {
  const isEmail = channel === 'email';
  const username = isEmail
    ? `e${createHash('sha256').update(target).digest('hex').slice(0, 10)}`
    : `u${target.slice(1)}`;
  const email = isEmail ? target : `phone_${target.slice(1)}@phone.local`;
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
  const userId = await txAsync(async (d) => {
    const r = await d.prepare(`INSERT INTO users (username, email, password_hash, display_name, phone,
        terms_accepted_at, terms_version, signup_ip, email_verified)
                               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(username, email, hashPassword(randomToken(24)), (displayName || (isEmail ? target.split('@')[0] : `สมาชิก${target.slice(-4)}`)).slice(0, 100),
        isEmail ? null : target, now, config.termsVersion, ip || null, isEmail ? 1 : 0);
    const id = Number(r.lastInsertRowid);
    const memberRole = await d.prepare(`SELECT id FROM roles WHERE name = 'member'`).get();
    if (memberRole) await d.prepare('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)').run(id, memberRole.id);
    const wallet = await d.prepare('INSERT INTO virtual_wallets (user_id, balance) VALUES (?, 0)').run(id);
    const walletId = Number(wallet.lastInsertRowid);
    if (!(await promoAbuseCheck(ip, d, id))) await grantInitialCredit(d, id, walletId);
    else securityEvent({ eventType: 'promo.abuse_suspected', severity: 'warning', userId: id, ip, detail: { reason: 'same_ip_multi_register' } });
    return id;
  });
  audit({ userId, action: isEmail ? 'user.register_email' : 'user.register_phone', entityType: 'user', entityId: String(userId), detail: { target } });
  return userId;
}

export async function verifyOtpLogin({ channel = 'phone', target, code, purpose, displayName, ip, userAgent }) {
  const ch = channel === 'email' ? 'email' : 'phone';
  const t = ch === 'email' ? normalizeEmail(target) : normalizePhone(target);
  await consumeOtp(t, code, purpose, ch);

  let user;
  if (purpose === 'register') {
    const dupCol = ch === 'email' ? 'email' : 'phone';
    const dup = await qGet(`SELECT id FROM users WHERE ${dupCol} = $1`, [t]);
    if (dup) throw new HttpError(409, ch === 'email' ? 'อีเมลนี้สมัครสมาชิกแล้ว กรุณาเข้าสู่ระบบ' : 'เบอร์นี้สมัครสมาชิกแล้ว กรุณาเข้าสู่ระบบ');
    const id = await registerOtpUser({ channel: ch, target: t, displayName, ip });
    user = await qGet('SELECT * FROM users WHERE id = $1', [id]);
  } else {
    const dupCol = ch === 'email' ? 'email' : 'phone';
    user = await qGet(`SELECT * FROM users WHERE ${dupCol} = $1`, [t]);
    if (!user) throw new HttpError(404, ch === 'email' ? 'ยังไม่มีบัญชีที่ใช้อีเมลนี้ กรุณาสมัครสมาชิกก่อน' : 'ยังไม่มีบัญชีที่ใช้เบอร์นี้ กรุณาสมัครสมาชิกก่อน');
    if (user.status !== 'active') throw new HttpError(403, 'บัญชีนี้ถูกระงับการใช้งาน');
    if (user.locked_until && user.locked_until > new Date().toISOString().replace('T', ' ').slice(0, 19)) {
      throw new HttpError(423, 'บัญชีถูกล็อกชั่วคราว กรุณาลองใหม่ภายหลัง');
    }
  }

  const token = await createSessionToken(user.id, ip, userAgent);
  const payload = await userPayload(user);
  audit({ userId: user.id, action: purpose === 'register' ? 'user.login_otp_register' : 'user.login_otp',
    entityType: 'user', entityId: String(user.id), req: { ip, headers: { 'user-agent': userAgent } } });
  securityEvent({ eventType: purpose === 'register' ? 'login.otp_register' : 'login.otp',
    userId: user.id, ip, detail: { target: t, channel: ch } });
  return { token, user: payload, requiresMfa: !!user.mfa_enabled };
}

// ---------- sessions (member self-service) ----------
export async function listSessions(userId, currentToken) {
  const rows = await q(`SELECT id, ip, user_agent, created_at, expires_at, mfa_verified FROM user_sessions
    WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS')
    ORDER BY created_at DESC LIMIT 20`, [userId]);
  return rows.map(s => ({ ...s, current: s.id === currentToken }));
}
export async function revokeSession(userId, sessionId, currentToken) {
  if (sessionId === currentToken) throw new HttpError(400, 'ไม่สามารถเพิกถอน session ปัจจุบันได้ — ใช้ logout แทน');
  const r = await qRun(`UPDATE user_sessions SET revoked_at = to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS')
    WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL`, [sessionId, userId]);
  if (!r.changes) throw new HttpError(404, 'ไม่พบ session');
  audit({ userId, action: 'user.session_revoked', entityType: 'session', entityId: String(sessionId) });
}
export async function revokeOtherSessions(userId, currentToken) {
  const r = await qRun(`UPDATE user_sessions SET revoked_at = to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS')
    WHERE user_id = $1 AND id <> $2 AND revoked_at IS NULL`, [userId, currentToken]);
  audit({ userId, action: 'user.sessions_revoked_others', entityType: 'user', entityId: String(userId), detail: { count: r.changes } });
  return r.changes;
}

// ---------- MFA disable (member) ----------
export async function disableMfa(userId, code) {
  const user = await qGet('SELECT mfa_secret, mfa_enabled FROM users WHERE id = $1', [userId]);
  const plain = user?.mfa_enabled && user?.mfa_secret ? decryptSecret(user.mfa_secret) : null;
  if (!plain) throw new HttpError(400, 'ยังไม่ได้เปิด MFA');
  if (!verifyTotp(plain, code)) throw new HttpError(400, 'รหัส MFA ไม่ถูกต้อง');
  await qRun('UPDATE users SET mfa_enabled = 0, mfa_secret = NULL WHERE id = $1', [userId]);
  await qRun('UPDATE user_sessions SET mfa_verified = 0 WHERE user_id = $1', [userId]);
  audit({ userId, action: 'user.mfa_disabled', entityType: 'user', entityId: String(userId) });
  securityEvent({ eventType: 'mfa.disabled', userId });
}

// ---------- email verification ----------
export async function requestEmailVerification(userId, ip) {
  const user = await qGet('SELECT email, email_verified FROM users WHERE id = $1', [userId]);
  if (!user) throw new HttpError(404, 'ไม่พบผู้ใช้');
  if (user.email_verified) throw new HttpError(400, 'ยืนยันอีเมลแล้ว');
  if (user.email.endsWith('@member.local') || user.email.endsWith('@phone.local'))
    throw new HttpError(400, 'บัญชีนี้ใช้อีเมลชั่วคราว — สมัครด้วยอีเมลจริงเพื่อรับการยืนยัน');
  const recent = (await qGet(`SELECT COUNT(*)::int c FROM email_verifications
    WHERE user_id = $1 AND created_at > to_char((now() AT TIME ZONE 'UTC') - interval '10 minutes','YYYY-MM-DD HH24:MI:SS')`, [userId])).c;
  if (recent >= 3) throw new HttpError(429, 'ขอยืนยันซ้ำบ่อยเกินไป กรุณารอสักครู่');
  const token = randomToken(32);
  const tokenHash = createHash('sha256').update(`email-verify:${token}`).digest('hex');
  await qRun(`INSERT INTO email_verifications (user_id, token_hash, expires_at)
    VALUES ($1, $2, to_char((now() AT TIME ZONE 'UTC') + interval '30 minutes','YYYY-MM-DD HH24:MI:SS'))`, [userId, tokenHash]);
  const { sendMail, mailConfigured } = await import('./mailer.js');
  const link = `${config.clientOrigin}/verify-email?token=${token}`;
  let mailed = false;
  if (mailConfigured()) {
    await sendMail({ to: user.email, subject: 'ยืนยันอีเมล — Demo Lottery',
      text: `ยืนยันอีเมลของคุณโดยเปิดลิงก์นี้ (หมดอายุใน 30 นาที):\n${link}`,
      html: `<div style="font-family:sans-serif;max-width:480px;margin:auto"><h2 style="color:#f4c94e">ยืนยันอีเมล</h2><p>กดปุ่มด้านล่างเพื่อยืนยันอีเมลของคุณ (ลิงก์หมดอายุใน 30 นาที)</p><p><a href="${link}" style="display:inline-block;background:#f4c94e;color:#1a1206;font-weight:700;padding:12px 24px;border-radius:8px;text-decoration:none">ยืนยันอีเมล</a></p><p style="font-size:12px;color:#888;word-break:break-all">${link}</p></div>` });
    mailed = true;
  }
  audit({ userId, action: 'user.email_verify_requested', entityType: 'user', entityId: String(userId), detail: { mailed } });
  return { mailed, ...(canEchoOtp(ip) && !mailed ? { devToken: token } : {}) };
}

export async function verifyEmailToken(token, req = null) {
  const tokenHash = createHash('sha256').update(`email-verify:${token}`).digest('hex');
  const userId = await txAsync(async (d) => {
    const row = await d.prepare(`SELECT id, user_id, expires_at, used_at FROM email_verifications
      WHERE token_hash = ? ORDER BY id DESC LIMIT 1`).get(tokenHash);
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    if (!row || row.used_at || row.expires_at <= now) throw new HttpError(400, 'ลิงก์ยืนยันอีเมลไม่ถูกต้อง หมดอายุ หรือถูกใช้แล้ว');
    await d.prepare('UPDATE email_verifications SET used_at = ? WHERE id = ?').run(now, row.id);
    await d.prepare('UPDATE users SET email_verified = 1 WHERE id = ?').run(row.user_id);
    return row.user_id;
  });
  audit({ userId, action: 'user.email_verified', entityType: 'user', entityId: String(userId), req });
  return true;
}

export { SESSION_COOKIE, MAX_FAILED, LOCK_MINUTES };
