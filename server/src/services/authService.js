import { getDb, tx, makeReference } from '../db/index.js';
import { getSetting } from './settingsService.js';
import { randomToken } from '../lib/password.js';
import { config } from '../config.js';
import { HttpError, audit, securityEvent } from '../lib/audit.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import { generateSecret, verifyTotp, otpauthUri } from '../lib/totp.js';

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

export function getSession(req) {
  const token = parseCookies(req)[SESSION_COOKIE];
  if (!token) return null;
  const db = getDb();
  const s = db.prepare(`SELECT s.*, u.username, u.email, u.display_name, u.status AS user_status, u.mfa_enabled
                        FROM user_sessions s JOIN users u ON u.id = s.user_id
                        WHERE s.id = ? AND s.revoked_at IS NULL AND s.expires_at > datetime('now')`)
    .get(token);
  if (!s || s.user_status !== 'active') return null;
  return s;
}

export function requireAuth(req, res, next) {
  const s = getSession(req);
  if (!s) return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบ' });
  req.session = s;
  req.user = { id: s.user_id, username: s.username, email: s.email, displayName: s.display_name, mfaEnabled: s.mfa_enabled };
  next();
}

export function requireMfaVerified(req, res, next) {
  if (req.session && req.session.mfa_verified) return next();
  return res.status(403).json({ error: 'ต้องยืนยัน MFA ก่อนใช้งานส่วนนี้', code: 'MFA_REQUIRED' });
}

function setSessionCookie(res, token) {
  const maxAge = config.sessionTtlHours * 3600 * 1000;
  res.setHeader('Set-Cookie',
    `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(maxAge / 1000)}${config.isProd ? '; Secure' : ''}`);
}

export function register({ username, email, password, displayName, ip, userAgent }) {
  if (!/^[a-zA-Z0-9_]{3,32}$/.test(username)) throw new HttpError(400, 'ชื่อผู้ใช้ต้องเป็นตัวอักษร/ตัวเลข 3-32 ตัว');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError(400, 'อีเมลไม่ถูกต้อง');
  if (password.length < 8) throw new HttpError(400, 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร');

  const db = getDb();
  const dup = db.prepare('SELECT id FROM users WHERE username = ? OR email = ?').get(username, email.toLowerCase());
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
        VALUES (?, ?, ?, 'initial_credit', ?, ?, 'credit', 'completed', ?, 'เครดิตฟรีสำหรับสมาชิกใหม่ (DEMO — ถอนได้เฉพาะเงินรางวัล)')`)
        .run(makeReference('TX'), walletId, id, initial, newBalance, `init-credit-${id}`);
      // note: initial_credit คือเครดิตฟรี — ใช้แทงได้แต่ถอนไม่ได้ (ดู walletService.withdrawableInfo)
    }
    return id;
  });

  audit({ userId, action: 'user.register', entityType: 'user', entityId: String(userId), req: null });
  return userId;
}

export function login({ username, password, ip, userAgent }) {
  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE username = ? OR email = ?')
    .get(username, (username || '').toLowerCase());

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
  const ttl = `datetime('now', '+${config.sessionTtlHours} hours')`;
  db.prepare(`INSERT INTO user_sessions (id, user_id, ip, user_agent, expires_at)
              VALUES (?, ?, ?, ?, ${ttl})`)
    .run(token, user.id, ip || null, (userAgent || '').slice(0, 300));

  const roles = db.prepare(`SELECT r.name FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = ?`)
    .all(user.id).map(r => r.name);

  audit({ userId: user.id, action: 'user.login', entityType: 'user', entityId: String(user.id), req: { ip, headers: { 'user-agent': userAgent } } });

  const isAdmin = roles.some(r => ['admin', 'super_admin'].includes(r));
  return { token, user: { id: user.id, username: user.username, email: user.email, displayName: user.display_name, roles, mfaEnabled: !!user.mfa_enabled }, requiresMfa: isAdmin && !!user.mfa_enabled };
}

export function logout(req) {
  const token = parseCookies(req)[SESSION_COOKIE];
  if (token) {
    getDb().prepare('UPDATE user_sessions SET revoked_at = datetime(\'now\') WHERE id = ?').run(token);
    audit({ userId: req.user?.id, action: 'user.logout', entityType: 'user', entityId: req.user ? String(req.user.id) : null, req });
  }
}

export function changePassword(userId, oldPassword, newPassword) {
  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user || !verifyPassword(oldPassword, user.password_hash)) throw new HttpError(400, 'รหัสผ่านเดิมไม่ถูกต้อง');
  if (newPassword.length < 8) throw new HttpError(400, 'รหัสผ่านใหม่ต้องมีอย่างน้อย 8 ตัวอักษร');
  db.prepare(`UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(hashPassword(newPassword), userId);
  db.prepare(`UPDATE user_sessions SET revoked_at = datetime('now') WHERE user_id = ? AND revoked_at IS NULL`).run(userId);
  audit({ userId, action: 'user.change_password', entityType: 'user', entityId: String(userId) });
}

export function forgotPassword({ email }) {
  // Demo mode: no email sending. Log a reset token to audit only; member can reset via admin or dev console.
  const db = getDb();
  const user = db.prepare('SELECT id FROM users WHERE email = ?').get((email || '').toLowerCase());
  if (user) {
    const token = randomToken(24);
    audit({ userId: user.id, action: 'user.password_reset_requested', entityType: 'user', entityId: String(user.id), detail: { note: 'Demo mode — token not sent externally' } });
    securityEvent({ eventType: 'password_reset_requested', userId: user.id, detail: { demo: true } });
  }
  // Always return success to avoid user enumeration
  return true;
}

function assertAdminForMfa(userId) {
  const isAdmin = getDb().prepare(`SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
    WHERE ur.user_id = ? AND r.name IN ('admin','super_admin')`).get(userId);
  if (!isAdmin) throw new HttpError(403, 'MFA ใช้ได้เฉพาะบัญชีผู้ดูแลระบบ');
}

export function setupMfa(userId) {
  assertAdminForMfa(userId);
  const db = getDb();
  const user = db.prepare('SELECT username, mfa_secret, mfa_enabled FROM users WHERE id = ?').get(userId);
  if (user.mfa_enabled) throw new HttpError(400, 'MFA เปิดใช้งานแล้ว');
  const secret = generateSecret();
  db.prepare('UPDATE users SET mfa_secret = ? WHERE id = ?').run(secret, userId);
  return { secret, uri: otpauthUri(secret, user.username) };
}

export function enableMfa(userId, code) {
  assertAdminForMfa(userId);
  const db = getDb();
  const user = db.prepare('SELECT mfa_secret FROM users WHERE id = ?').get(userId);
  if (!user?.mfa_secret) throw new HttpError(400, 'กรุณาสร้าง MFA secret ก่อน');
  if (!verifyTotp(user.mfa_secret, code)) throw new HttpError(400, 'รหัส MFA ไม่ถูกต้อง');
  db.prepare('UPDATE users SET mfa_enabled = 1 WHERE id = ?').run(userId);
  audit({ userId, action: 'user.mfa_enabled', entityType: 'user', entityId: String(userId) });
}

export function verifyMfa(sessionId, code) {
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

export function getSessionToken(req) {
  return parseCookies(req)[SESSION_COOKIE] || null;
}

export { SESSION_COOKIE, setSessionCookie, MAX_FAILED, LOCK_MINUTES };
