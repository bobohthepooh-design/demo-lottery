import { getDb, tx, txAsync, isPg, makeReference } from '../db/index.js';
import { getSetting } from './settingsService.js';
import { randomToken } from '../lib/password.js';
import { config } from '../config.js';
import { HttpError, audit, securityEvent } from '../lib/audit.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import { generateSecret, verifyTotp, otpauthUri } from '../lib/totp.js';
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

const NOW_SQLITE = "datetime('now')";
const SESSION_SELECT = `SELECT s.*, u.username, u.email, u.display_name, u.status AS user_status, u.mfa_enabled,
                        u.age_confirmed, u.self_excluded_until, u.daily_limit_satang, u.monthly_limit_satang
                 FROM user_sessions s JOIN users u ON u.id = s.user_id
                 WHERE s.id = ? AND s.revoked_at IS NULL AND s.expires_at > datetime('now')`;

export function getSession(req) {
  const token = parseCookies(req)[SESSION_COOKIE];
  if (!token) return null;
  if (isPg()) return getSessionPg(token);
  const s = getDb().prepare(SESSION_SELECT).get(token);
  if (!s || s.user_status !== 'active') return null;
  return s;
}
async function getSessionPg(token) {
  const s = await qGet(SESSION_SELECT, [token]);
  if (!s || s.user_status !== 'active') return null;
  return s;
}

export function requireAuth(req, res, next) {
  if (isPg()) return requireAuthPg(req, res, next);
  const s = getSession(req);
  if (!s) return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบ' });
  const renewed = getDb().prepare(
    `UPDATE user_sessions SET expires_at = datetime('now', '+${config.sessionTtlHours} hours')
     WHERE id = ? AND expires_at < datetime('now', '+6 hours')`
  ).run(s.id);
  if (renewed.changes) setSessionCookie(res, s.id);
  req.session = s;
  req.user = { id: s.user_id, username: s.username, email: s.email, displayName: s.display_name, mfaEnabled: s.mfa_enabled,
    ageConfirmed: !!s.age_confirmed, selfExcludedUntil: s.self_excluded_until,
    dailyLimitSatang: s.daily_limit_satang, monthlyLimitSatang: s.monthly_limit_satang };
  next();
}

async function requireAuthPg(req, res, next) {
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
      dailyLimitSatang: s.daily_limit_satang, monthlyLimitSatang: s.monthly_limit_satang };
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

const USER_BY_CRED_SQLITE = 'SELECT * FROM users WHERE username = ? COLLATE NOCASE OR email = ?';
const USER_BY_CRED_PG = 'SELECT * FROM users WHERE LOWER(username) = LOWER($1) OR email = $2';

export function register({ username, email, password, displayName, ip, userAgent }) {
  if (!/^[a-zA-Z0-9_]{3,32}$/.test(username)) throw new HttpError(400, 'ชื่อผู้ใช้ต้องเป็นตัวอักษร/ตัวเลข 3-32 ตัว');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError(400, 'อีเมลไม่ถูกต้อง');
  if (password.length < 8) throw new HttpError(400, 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร');

  if (isPg()) return registerPg({ username, email, password, displayName });
  const db = getDb();
  const dup = db.prepare('SELECT id FROM users WHERE username = ? COLLATE NOCASE OR email = ?').get(username, email.toLowerCase());
  if (dup) throw new HttpError(409, 'ชื่อผู้ใช้หรืออีเมลนี้ถูกใช้งานแล้ว');

  const userId = tx((d) => {
    const r = d.prepare(`INSERT INTO users (username, email, password_hash, display_name) VALUES (?, ?, ?, ?)`)
      .run(username, email.toLowerCase(), hashPassword(password), displayName || username);
    const id = Number(r.lastInsertRowid);
    const memberRole = d.prepare(`SELECT id FROM roles WHERE name = 'member'`).get();
    if (memberRole) d.prepare('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)').run(id, memberRole.id);
    const wallet = d.prepare('INSERT INTO virtual_wallets (user_id, balance) VALUES (?, 0)').run(id);
    const walletId = Number(wallet.lastInsertRowid);
    const initial = getSetting('initial_credit', config.initialCredit);
    if (initial > 0) {
      const newBalance = initial;
      d.prepare('UPDATE virtual_wallets SET balance = ?, version = version + 1 WHERE id = ?').run(newBalance, walletId);
      d.prepare(`INSERT INTO virtual_transactions
        (reference, wallet_id, user_id, type, amount, balance_after, direction, status, idempotency_key, description)
        VALUES (?, ?, ?, 'initial_credit', ?, ?, 'credit', 'completed', ?, 'เครดิตแถมสำหรับสมาชิกใหม่ (DEMO — ถอนได้เฉพาะเงินรางวัล)')`)
        .run(makeReference('TX'), walletId, id, initial, newBalance, `init-credit-${id}`);
    }
    return id;
  });

  audit({ userId, action: 'user.register', entityType: 'user', entityId: String(userId), req: null });
  return userId;
}

async function registerPg({ username, email, password, displayName }) {
  const dup = await qGet('SELECT id FROM users WHERE LOWER(username) = LOWER($1) OR email = $2',
    [username, email.toLowerCase()]);
  if (dup) throw new HttpError(409, 'ชื่อผู้ใช้หรืออีเมลนี้ถูกใช้งานแล้ว');

  const userId = await txAsync(async (d) => {
    const r = await d.prepare(`INSERT INTO users (username, email, password_hash, display_name) VALUES (?, ?, ?, ?)`)
      .run(username, email.toLowerCase(), hashPassword(password), displayName || username);
    const id = Number(r.lastInsertRowid);
    const memberRole = await d.prepare(`SELECT id FROM roles WHERE name = 'member'`).get();
    if (memberRole) await d.prepare('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)').run(id, memberRole.id);
    const wallet = await d.prepare('INSERT INTO virtual_wallets (user_id, balance) VALUES (?, 0)').run(id);
    const walletId = Number(wallet.lastInsertRowid);
    const initial = Number(await getSetting('initial_credit', config.initialCredit)) || 0;
    if (initial > 0) {
      await d.prepare('UPDATE virtual_wallets SET balance = ?, version = version + 1 WHERE id = ?').run(initial, walletId);
      await d.prepare(`INSERT INTO virtual_transactions
        (reference, wallet_id, user_id, type, amount, balance_after, direction, status, idempotency_key, description)
        VALUES (?, ?, ?, 'initial_credit', ?, ?, 'credit', 'completed', ?, 'เครดิตแถมสำหรับสมาชิกใหม่ (DEMO — ถอนได้เฉพาะเงินรางวัล)')`)
        .run(makeReference('TX'), walletId, id, initial, initial, `init-credit-${id}`);
    }
    return id;
  });

  audit({ userId, action: 'user.register', entityType: 'user', entityId: String(userId), req: null });
  return userId;
}

export function login({ username, password, ip, userAgent }) {
  if (isPg()) return loginPg({ username, password, ip, userAgent });
  const db = getDb();
  const user = db.prepare(USER_BY_CRED_SQLITE).get(username, (username || '').toLowerCase());

  if (!user) {
    securityEvent({ eventType: 'login.failed_unknown_user', severity: 'warning', ip, detail: { username } });
    throw new HttpError(401, 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
  }
  if (user.status !== 'active') throw new HttpError(403, 'บัญชีนี้ถูกระงับการใช้งาน');
  if (user.locked_until && user.locked_until > new Date().toISOString().replace('T', ' ').slice(0, 19)) {
    throw new HttpError(423, 'บัญชีถูกล็อกชั่วคราว กรุณาลองใหม่ภายหลัง');
  }

  const ok = verifyPassword(password, user.password_hash);
  if (!ok) {
    const fails = user.failed_login_count + 1;
    const lock = fails >= MAX_FAILED;
    db.prepare(`UPDATE users SET failed_login_count = ?, locked_until = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(lock ? 0 : fails, lock ? new Date(Date.now() + LOCK_MINUTES * 60000).toISOString().replace('T', ' ').slice(0, 19) : null, user.id);
    securityEvent({ eventType: 'login.failed', severity: lock ? 'critical' : 'warning', userId: user.id, ip });
    if (lock) audit({ userId: user.id, action: 'user.locked_bruteforce', entityType: 'user', entityId: String(user.id) });
    throw new HttpError(401, 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
  }

  db.prepare(`UPDATE users SET failed_login_count = 0, locked_until = NULL, updated_at = datetime('now') WHERE id = ?`).run(user.id);

  const token = randomToken(32);
  db.prepare(`INSERT INTO user_sessions (id, user_id, ip, user_agent, expires_at)
              VALUES (?, ?, ?, ?, datetime('now', '+${config.sessionTtlHours} hours'))`)
    .run(token, user.id, ip || null, (userAgent || '').slice(0, 300));

  const roles = db.prepare(`SELECT r.name FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = ?`)
    .all(user.id).map(r => r.name);

  audit({ userId: user.id, action: 'user.login', entityType: 'user', entityId: String(user.id), req: { ip, headers: { 'user-agent': userAgent } } });

  const isAdmin = roles.some(r => ['admin', 'super_admin'].includes(r));
  return { token, user: { id: user.id, username: user.username, email: user.email, displayName: user.display_name, roles, mfaEnabled: !!user.mfa_enabled }, requiresMfa: isAdmin && !!user.mfa_enabled };
}

async function loginPg({ username, password, ip, userAgent }) {
  const user = await qGet(USER_BY_CRED_PG, [username, (username || '').toLowerCase()]);

  if (!user) {
    securityEvent({ eventType: 'login.failed_unknown_user', severity: 'warning', ip, detail: { username } });
    throw new HttpError(401, 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
  }
  if (user.status !== 'active') throw new HttpError(403, 'บัญชีนี้ถูกระงับการใช้งาน');
  if (user.locked_until && user.locked_until > new Date().toISOString().replace('T', ' ').slice(0, 19)) {
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

  const isAdmin = roles.some(r => ['admin', 'super_admin'].includes(r));
  return { token, user: { id: user.id, username: user.username, email: user.email, displayName: user.display_name, roles, mfaEnabled: !!user.mfa_enabled }, requiresMfa: isAdmin && !!user.mfa_enabled };
}

export function logout(req) {
  const token = parseCookies(req)[SESSION_COOKIE];
  if (!token) return;
  if (isPg()) {
    qRun(`UPDATE user_sessions SET revoked_at = to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS') WHERE id = $1`, [token])
      .catch(e => console.error('[logout] pg:', e.message));
  } else {
    getDb().prepare('UPDATE user_sessions SET revoked_at = datetime(\'now\') WHERE id = ?').run(token);
  }
  audit({ userId: req.user?.id, action: 'user.logout', entityType: 'user', entityId: req.user ? String(req.user.id) : null, req });
}

export function changePassword(userId, oldPassword, newPassword, req = null) {
  if (isPg()) return changePasswordPg(userId, oldPassword, newPassword, req);
  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user || !verifyPassword(oldPassword, user.password_hash)) throw new HttpError(400, 'รหัสผ่านเดิมไม่ถูกต้อง');
  if (newPassword.length < 8) throw new HttpError(400, 'รหัสผ่านใหม่ต้องมีอย่างน้อย 8 ตัวอักษร');
  db.prepare(`UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(hashPassword(newPassword), userId);
  db.prepare(`UPDATE user_sessions SET revoked_at = datetime('now') WHERE user_id = ? AND revoked_at IS NULL`).run(userId);
  audit({ userId, action: 'user.change_password', entityType: 'user', entityId: String(userId), req });
  securityEvent({ eventType: 'password.changed', userId, ip: req?.ip || null,
    detail: { sessions_revoked: true } });
}
async function changePasswordPg(userId, oldPassword, newPassword, req) {
  const user = await qGet('SELECT * FROM users WHERE id = $1', [userId]);
  if (!user || !verifyPassword(oldPassword, user.password_hash)) throw new HttpError(400, 'รหัสผ่านเดิมไม่ถูกต้อง');
  if (newPassword.length < 8) throw new HttpError(400, 'รหัสผ่านใหม่ต้องมีอย่างน้อย 8 ตัวอักษร');
  await qRun(`UPDATE users SET password_hash = $1,
      updated_at = to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS') WHERE id = $2`,
    [hashPassword(newPassword), userId]);
  await qRun(`UPDATE user_sessions SET revoked_at = to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS')
              WHERE user_id = $1 AND revoked_at IS NULL`, [userId]);
  audit({ userId, action: 'user.change_password', entityType: 'user', entityId: String(userId), req });
  securityEvent({ eventType: 'password.changed', userId, ip: req?.ip || null, detail: { sessions_revoked: true } });
}

export function forgotPassword({ email }) {
  if (isPg()) return forgotPasswordPg(email);
  const db = getDb();
  const user = db.prepare('SELECT id FROM users WHERE email = ?').get((email || '').toLowerCase());
  if (user) {
    audit({ userId: user.id, action: 'user.password_reset_requested', entityType: 'user', entityId: String(user.id), detail: { note: 'Demo mode — token not sent externally' } });
    securityEvent({ eventType: 'password_reset_requested', userId: user.id, detail: { demo: true } });
  }
  return true;
}
async function forgotPasswordPg(email) {
  const user = await qGet('SELECT id FROM users WHERE email = $1', [(email || '').toLowerCase()]);
  if (user) {
    audit({ userId: user.id, action: 'user.password_reset_requested', entityType: 'user', entityId: String(user.id), detail: { note: 'Demo mode — token not sent externally' } });
    securityEvent({ eventType: 'password_reset_requested', userId: user.id, detail: { demo: true } });
  }
  return true;
}

// ---------- MFA (admin only) ----------

async function assertAdminForMfa(userId) {
  if (isPg()) {
    const isAdmin = await qGet(`SELECT 1 AS x FROM user_roles ur JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = $1 AND r.name IN ('admin','super_admin')`, [userId]);
    if (!isAdmin) throw new HttpError(403, 'MFA ใช้ได้เฉพาะบัญชีผู้ดูแลระบบ');
    return;
  }
  const isAdmin = getDb().prepare(`SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
    WHERE ur.user_id = ? AND r.name IN ('admin','super_admin')`).get(userId);
  if (!isAdmin) throw new HttpError(403, 'MFA ใช้ได้เฉพาะบัญชีผู้ดูแลระบบ');
}

export function setupMfa(userId) {
  if (isPg()) return setupMfaPg(userId);
  assertAdminForMfa(userId);
  const db = getDb();
  const user = db.prepare('SELECT username, mfa_secret, mfa_enabled FROM users WHERE id = ?').get(userId);
  if (user.mfa_enabled) throw new HttpError(400, 'MFA เปิดใช้งานแล้ว');
  const secret = generateSecret();
  db.prepare('UPDATE users SET mfa_secret = ? WHERE id = ?').run(secret, userId);
  return { secret, uri: otpauthUri(secret, user.username) };
}
async function setupMfaPg(userId) {
  await assertAdminForMfa(userId);
  const user = await qGet('SELECT username, mfa_secret, mfa_enabled FROM users WHERE id = $1', [userId]);
  if (user.mfa_enabled) throw new HttpError(400, 'MFA เปิดใช้งานแล้ว');
  const secret = generateSecret();
  await qRun('UPDATE users SET mfa_secret = $1 WHERE id = $2', [secret, userId]);
  return { secret, uri: otpauthUri(secret, user.username) };
}

export function enableMfa(userId, code) {
  if (isPg()) return enableMfaPg(userId, code);
  assertAdminForMfa(userId);
  const db = getDb();
  const user = db.prepare('SELECT mfa_secret FROM users WHERE id = ?').get(userId);
  if (!user?.mfa_secret) throw new HttpError(400, 'กรุณาสร้าง MFA secret ก่อน');
  if (!verifyTotp(user.mfa_secret, code)) throw new HttpError(400, 'รหัส MFA ไม่ถูกต้อง');
  db.prepare('UPDATE users SET mfa_enabled = 1 WHERE id = ?').run(userId);
  audit({ userId, action: 'user.mfa_enabled', entityType: 'user', entityId: String(userId) });
  securityEvent({ eventType: 'mfa.enabled', userId, detail: { admin_only: true } });
}
async function enableMfaPg(userId, code) {
  await assertAdminForMfa(userId);
  const user = await qGet('SELECT mfa_secret FROM users WHERE id = $1', [userId]);
  if (!user?.mfa_secret) throw new HttpError(400, 'กรุณาสร้าง MFA secret ก่อน');
  if (!verifyTotp(user.mfa_secret, code)) throw new HttpError(400, 'รหัส MFA ไม่ถูกต้อง');
  await qRun('UPDATE users SET mfa_enabled = 1 WHERE id = $1', [userId]);
  audit({ userId, action: 'user.mfa_enabled', entityType: 'user', entityId: String(userId) });
  securityEvent({ eventType: 'mfa.enabled', userId, detail: { admin_only: true } });
}

export function verifyMfa(sessionId, code) {
  if (isPg()) return verifyMfaPg(sessionId, code);
  const db = getDb();
  const s = db.prepare('SELECT s.id, u.mfa_secret, u.mfa_enabled FROM user_sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ?').get(sessionId);
  if (!s || !s.mfa_enabled || !s.mfa_secret) throw new HttpError(400, 'ไม่ต้องยืนยัน MFA');
  if (!verifyTotp(s.mfa_secret, code)) {
    securityEvent({ eventType: 'mfa.failed', severity: 'warning', detail: { sessionId } });
    throw new HttpError(401, 'รหัส MFA ไม่ถูกต้อง');
  }
  db.prepare(`UPDATE user_sessions SET mfa_verified = 1 WHERE id = ?`).run(sessionId);
  audit({ action: 'user.mfa_verified', entityType: 'session', entityId: sessionId });
}
async function verifyMfaPg(sessionId, code) {
  const s = await qGet('SELECT s.id, u.mfa_secret, u.mfa_enabled FROM user_sessions s JOIN users u ON u.id = s.user_id WHERE s.id = $1', [sessionId]);
  if (!s || !s.mfa_enabled || !s.mfa_secret) throw new HttpError(400, 'ไม่ต้องยืนยัน MFA');
  if (!verifyTotp(s.mfa_secret, code)) {
    securityEvent({ eventType: 'mfa.failed', severity: 'warning', detail: { sessionId } });
    throw new HttpError(401, 'รหัส MFA ไม่ถูกต้อง');
  }
  await qRun('UPDATE user_sessions SET mfa_verified = 1 WHERE id = $1', [sessionId]);
  audit({ action: 'user.mfa_verified', entityType: 'session', entityId: sessionId });
}

export function getSessionToken(req) {
  return parseCookies(req)[SESSION_COOKIE] || null;
}

// ---------- Phone + OTP (demo: รหัสแสดงบนจอ ไม่ได้ส่ง SMS จริง) ----------

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

const SESSION_EXPIRES_SQLITE = (h) => `datetime('now', '+${h} hours')`;
const SESSION_EXPIRES_PG = (h) => `to_char((now() AT TIME ZONE 'UTC') + interval '${h} hours','YYYY-MM-DD HH24:MI:SS')`;
const OTP_EXPIRES_PG = (m) => `to_char((now() AT TIME ZONE 'UTC') + interval '${m} minutes','YYYY-MM-DD HH24:MI:SS')`;

function createSessionToken(userId, ip, userAgent) {
  if (isPg()) return createSessionTokenPg(userId, ip, userAgent);
  const db = getDb();
  const token = randomToken(32);
  db.prepare(`INSERT INTO user_sessions (id, user_id, ip, user_agent, expires_at)
              VALUES (?, ?, ?, ?, ${SESSION_EXPIRES_SQLITE(config.sessionTtlHours)})`)
    .run(token, userId, ip || null, (userAgent || '').slice(0, 300));
  return token;
}
async function createSessionTokenPg(userId, ip, userAgent) {
  const token = randomToken(32);
  await qRun(`INSERT INTO user_sessions (id, user_id, ip, user_agent, expires_at)
              VALUES ($1, $2, $3, $4, ${SESSION_EXPIRES_PG(config.sessionTtlHours)})`,
    [token, userId, ip || null, (userAgent || '').slice(0, 300)]);
  return token;
}

function userPayload(user) {
  if (isPg()) return userPayloadPg(user);
  const roles = getDb().prepare(`SELECT r.name FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = ?`)
    .all(user.id).map(r => r.name);
  return { id: user.id, username: user.username, email: user.email, displayName: user.display_name, roles, mfaEnabled: !!user.mfa_enabled };
}
async function userPayloadPg(user) {
  const roles = (await q(`SELECT r.name FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = $1`, [user.id])).map(r => r.name);
  return { id: user.id, username: user.username, email: user.email, displayName: user.display_name, roles, mfaEnabled: !!user.mfa_enabled };
}

export function requestOtp({ phone, purpose, ip }) {
  if (isPg()) return requestOtpPg({ phone, purpose, ip });
  const p = normalizePhone(phone);
  const db = getDb();
  const recent = db.prepare(`SELECT COUNT(*) AS c FROM otp_codes
    WHERE phone = ? AND purpose = ? AND created_at > datetime('now', '-10 minutes')`).get(p, purpose).c;
  if (recent >= OTP_MAX_PER_10MIN) {
    securityEvent({ eventType: 'otp.rate_limited', severity: 'warning', ip, detail: { phone: p, purpose } });
    throw new HttpError(429, 'ขอรหัส OTP บ่อยเกินไป กรุณารอสักครู่');
  }
  db.prepare(`UPDATE otp_codes SET used = 1 WHERE phone = ? AND purpose = ? AND used = 0`).run(p, purpose);
  const code = String(randomInt(100000, 1000000));
  db.prepare(`INSERT INTO otp_codes (phone, code, purpose, expires_at, ip) VALUES (?, ?, ?, datetime('now', '+${OTP_TTL_MINUTES} minutes'), ?)`)
    .run(p, hashOtp(code), purpose, ip || null);
  audit({ action: 'user.otp_requested', entityType: 'phone', entityId: p, detail: { purpose } });
  securityEvent({ eventType: 'otp.requested', ip, detail: { phone: p, purpose } });
  return { ...(config.otpDevEcho ? { devCode: code } : {}), expiresInSec: OTP_TTL_MINUTES * 60 };
}

async function requestOtpPg({ phone, purpose, ip }) {
  const p = normalizePhone(phone);
  const recent = (await qGet(`SELECT COUNT(*)::int AS c FROM otp_codes
    WHERE phone = $1 AND purpose = $2 AND created_at > to_char((now() AT TIME ZONE 'UTC') - interval '10 minutes','YYYY-MM-DD HH24:MI:SS')`, [p, purpose])).c;
  if (recent >= OTP_MAX_PER_10MIN) {
    securityEvent({ eventType: 'otp.rate_limited', severity: 'warning', ip, detail: { phone: p, purpose } });
    throw new HttpError(429, 'ขอรหัส OTP บ่อยเกินไป กรุณารอสักครู่');
  }
  await qRun('UPDATE otp_codes SET used = 1 WHERE phone = $1 AND purpose = $2 AND used = 0', [p, purpose]);
  const code = String(randomInt(100000, 1000000));
  await qRun(`INSERT INTO otp_codes (phone, code, purpose, expires_at, ip) VALUES ($1, $2, $3, ${OTP_EXPIRES_PG(OTP_TTL_MINUTES)}, $4)`,
    [p, hashOtp(code), purpose, ip || null]);
  audit({ action: 'user.otp_requested', entityType: 'phone', entityId: p, detail: { purpose } });
  securityEvent({ eventType: 'otp.requested', ip, detail: { phone: p, purpose } });
  return { ...(config.otpDevEcho ? { devCode: code } : {}), expiresInSec: OTP_TTL_MINUTES * 60 };
}

function consumeOtp(phone, code, purpose) {
  if (isPg()) return consumeOtpPg(phone, code, purpose);
  const db = getDb();
  const row = db.prepare(`SELECT * FROM otp_codes WHERE phone = ? AND purpose = ? AND used = 0
    ORDER BY id DESC LIMIT 1`).get(phone, purpose);
  if (!row) throw new HttpError(400, 'กรุณาขอรหัส OTP ก่อน');
  if (row.expires_at <= new Date().toISOString().replace('T', ' ').slice(0, 19)) {
    db.prepare('UPDATE otp_codes SET used = 1 WHERE id = ?').run(row.id);
    throw new HttpError(400, 'รหัส OTP หมดอายุแล้ว กรุณาขอรหัสใหม่');
  }
  if (row.attempts >= OTP_MAX_ATTEMPTS) {
    db.prepare('UPDATE otp_codes SET used = 1 WHERE id = ?').run(row.id);
    securityEvent({ eventType: 'otp.too_many_attempts', severity: 'warning', detail: { phone } });
    throw new HttpError(429, 'กรอกรหัสผิดหลายครั้งเกินไป กรุณาขอรหัสใหม่');
  }
  db.prepare('UPDATE otp_codes SET attempts = attempts + 1 WHERE id = ?').run(row.id);
  if (row.code !== hashOtp(String(code))) {
    securityEvent({ eventType: 'otp.failed', severity: 'warning', detail: { phone, purpose } });
    throw new HttpError(401, 'รหัส OTP ไม่ถูกต้อง');
  }
  db.prepare('UPDATE otp_codes SET used = 1 WHERE id = ?').run(row.id);
}
async function consumeOtpPg(phone, code, purpose) {
  const row = await qGet(`SELECT * FROM otp_codes WHERE phone = $1 AND purpose = $2 AND used = 0
    ORDER BY id DESC LIMIT 1`, [phone, purpose]);
  if (!row) throw new HttpError(400, 'กรุณาขอรหัส OTP ก่อน');
  if (row.expires_at <= new Date().toISOString().replace('T', ' ').slice(0, 19)) {
    await qRun('UPDATE otp_codes SET used = 1 WHERE id = $1', [row.id]);
    throw new HttpError(400, 'รหัส OTP หมดอายุแล้ว กรุณาขอรหัสใหม่');
  }
  if (row.attempts >= OTP_MAX_ATTEMPTS) {
    await qRun('UPDATE otp_codes SET used = 1 WHERE id = $1', [row.id]);
    securityEvent({ eventType: 'otp.too_many_attempts', severity: 'warning', detail: { phone } });
    throw new HttpError(429, 'กรอกรหัสผิดหลายครั้งเกินไป กรุณาขอรหัสใหม่');
  }
  await qRun('UPDATE otp_codes SET attempts = attempts + 1 WHERE id = $1', [row.id]);
  if (row.code !== hashOtp(String(code))) {
    securityEvent({ eventType: 'otp.failed', severity: 'warning', detail: { phone, purpose } });
    throw new HttpError(401, 'รหัส OTP ไม่ถูกต้อง');
  }
  await qRun('UPDATE otp_codes SET used = 1 WHERE id = $1', [row.id]);
}

// สมัครด้วยเบอร์+OTP: สร้าง user (password สุ่ม ใช้ไม่ได้) + wallet +เครดิตฟรี
function registerPhoneUser(phone, displayName) {
  if (isPg()) return registerPhoneUserPg(phone, displayName);
  const db = getDb();
  const username = `u${phone.slice(1)}`;
  const email = `phone_${phone.slice(1)}@phone.local`;
  const userId = tx((d) => {
    const r = d.prepare(`INSERT INTO users (username, email, password_hash, display_name, phone)
                         VALUES (?, ?, ?, ?, ?)`)
      .run(username, email, hashPassword(randomToken(24)), (displayName || `สมาชิก${phone.slice(-4)}`).slice(0, 100), phone);
    const id = Number(r.lastInsertRowid);
    const memberRole = d.prepare(`SELECT id FROM roles WHERE name = 'member'`).get();
    if (memberRole) d.prepare('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)').run(id, memberRole.id);
    const wallet = d.prepare('INSERT INTO virtual_wallets (user_id, balance) VALUES (?, 0)').run(id);
    const walletId = Number(wallet.lastInsertRowid);
    const initial = getSetting('initial_credit', config.initialCredit);
    if (initial > 0) {
      d.prepare('UPDATE virtual_wallets SET balance = ?, version = version + 1 WHERE id = ?').run(initial, walletId);
      d.prepare(`INSERT INTO virtual_transactions
        (reference, wallet_id, user_id, type, amount, balance_after, direction, status, idempotency_key, description)
        VALUES (?, ?, ?, 'initial_credit', ?, ?, 'credit', 'completed', ?, 'เครดิตฟรีสำหรับสมาชิกใหม่ (DEMO — ถอนได้เฉพาะเงินรางวัล)')`)
        .run(makeReference('TX'), walletId, id, initial, initial, `init-credit-${id}`);
    }
    return id;
  });
  audit({ userId, action: 'user.register_phone', entityType: 'user', entityId: String(userId), detail: { phone } });
  return userId;
}
async function registerPhoneUserPg(phone, displayName) {
  const username = `u${phone.slice(1)}`;
  const email = `phone_${phone.slice(1)}@phone.local`;
  const userId = await txAsync(async (d) => {
    const r = await d.prepare(`INSERT INTO users (username, email, password_hash, display_name, phone)
                               VALUES (?, ?, ?, ?, ?)`)
      .run(username, email, hashPassword(randomToken(24)), (displayName || `สมาชิก${phone.slice(-4)}`).slice(0, 100), phone);
    const id = Number(r.lastInsertRowid);
    const memberRole = await d.prepare(`SELECT id FROM roles WHERE name = 'member'`).get();
    if (memberRole) await d.prepare('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)').run(id, memberRole.id);
    const wallet = await d.prepare('INSERT INTO virtual_wallets (user_id, balance) VALUES (?, 0)').run(id);
    const walletId = Number(wallet.lastInsertRowid);
    const initial = Number(await getSetting('initial_credit', config.initialCredit)) || 0;
    if (initial > 0) {
      await d.prepare('UPDATE virtual_wallets SET balance = ?, version = version + 1 WHERE id = ?').run(initial, walletId);
      await d.prepare(`INSERT INTO virtual_transactions
        (reference, wallet_id, user_id, type, amount, balance_after, direction, status, idempotency_key, description)
        VALUES (?, ?, ?, 'initial_credit', ?, ?, 'credit', 'completed', ?, 'เครดิตแถมสำหรับสมาชิกใหม่ (DEMO — ถอนได้เฉพาะเงินรางวัล)')`)
        .run(makeReference('TX'), walletId, id, initial, initial, `init-credit-${id}`);
    }
    return id;
  });
  audit({ userId, action: 'user.register_phone', entityType: 'user', entityId: String(userId), detail: { phone } });
  return userId;
}

export function verifyOtpLogin({ phone, code, purpose, displayName, ip, userAgent }) {
  if (isPg()) return verifyOtpLoginPg({ phone, code, purpose, displayName, ip, userAgent });
  const p = normalizePhone(phone);
  consumeOtp(p, code, purpose);
  const db = getDb();

  let user;
  if (purpose === 'register') {
    const dup = db.prepare('SELECT id FROM users WHERE phone = ?').get(p);
    if (dup) throw new HttpError(409, 'เบอร์นี้สมัครสมาชิกแล้ว กรุณาเข้าสู่ระบบ');
    const id = registerPhoneUser(p, displayName);
    user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  } else {
    user = db.prepare('SELECT * FROM users WHERE phone = ?').get(p);
    if (!user) throw new HttpError(404, 'ยังไม่มีบัญชีที่ใช้เบอร์นี้ กรุณาสมัครสมาชิกก่อน');
    if (user.status !== 'active') throw new HttpError(403, 'บัญชีนี้ถูกระงับการใช้งาน');
    if (user.locked_until && user.locked_until > new Date().toISOString().replace('T', ' ').slice(0, 19)) {
      throw new HttpError(423, 'บัญชีถูกล็อกชั่วคราว กรุณาลองใหม่ภายหลัง');
    }
  }

  const token = createSessionToken(user.id, ip, userAgent);
  const payload = userPayload(user);
  audit({ userId: user.id, action: purpose === 'register' ? 'user.login_phone_register' : 'user.login_phone',
    entityType: 'user', entityId: String(user.id), req: { ip, headers: { 'user-agent': userAgent } } });
  securityEvent({ eventType: purpose === 'register' ? 'login.phone_register' : 'login.phone_otp',
    userId: user.id, ip, detail: { phone: p } });
  const isAdmin = payload.roles.some(r => ['admin', 'super_admin'].includes(r));
  return { token, user: payload, requiresMfa: isAdmin && !!user.mfa_enabled };
}

async function verifyOtpLoginPg({ phone, code, purpose, displayName, ip, userAgent }) {
  const p = normalizePhone(phone);
  await consumeOtp(p, code, purpose);

  let user;
  if (purpose === 'register') {
    const dup = await qGet('SELECT id FROM users WHERE phone = $1', [p]);
    if (dup) throw new HttpError(409, 'เบอร์นี้สมัครสมาชิกแล้ว กรุณาเข้าสู่ระบบ');
    const id = await registerPhoneUser(p, displayName);
    user = await qGet('SELECT * FROM users WHERE id = $1', [id]);
  } else {
    user = await qGet('SELECT * FROM users WHERE phone = $1', [p]);
    if (!user) throw new HttpError(404, 'ยังไม่มีบัญชีที่ใช้เบอร์นี้ กรุณาสมัครสมาชิกก่อน');
    if (user.status !== 'active') throw new HttpError(403, 'บัญชีนี้ถูกระงับการใช้งาน');
    if (user.locked_until && user.locked_until > new Date().toISOString().replace('T', ' ').slice(0, 19)) {
      throw new HttpError(423, 'บัญชีถูกล็อกชั่วคราว กรุณาลองใหม่ภายหลัง');
    }
  }

  const token = await createSessionToken(user.id, ip, userAgent);
  const payload = await userPayload(user);
  audit({ userId: user.id, action: purpose === 'register' ? 'user.login_phone_register' : 'user.login_phone',
    entityType: 'user', entityId: String(user.id), req: { ip, headers: { 'user-agent': userAgent } } });
  securityEvent({ eventType: purpose === 'register' ? 'login.phone_register' : 'login.phone_otp',
    userId: user.id, ip, detail: { phone: p } });
  const isAdmin = payload.roles.some(r => ['admin', 'super_admin'].includes(r));
  return { token, user: payload, requiresMfa: isAdmin && !!user.mfa_enabled };
}

export { SESSION_COOKIE, MAX_FAILED, LOCK_MINUTES };
