import { getDb } from '../db/index.js';
import { HttpError } from '../lib/audit.js';

const permCache = new Map(); // userId -> Set<code>, short TTL
const TTL = 30_000;

export function userPermissions(userId) {
  const hit = permCache.get(userId);
  if (hit && Date.now() - hit.at < TTL) return hit.perms;
  const db = getDb();
  const rows = db.prepare(`
    SELECT DISTINCT p.code FROM permissions p
    JOIN role_permissions rp ON rp.permission_id = p.id
    JOIN user_roles ur ON ur.role_id = rp.role_id
    WHERE ur.user_id = ?`).all(userId);
  const perms = new Set(rows.map(r => r.code));
  permCache.set(userId, { at: Date.now(), perms });
  return perms;
}

export function invalidatePermCache(userId) { permCache.delete(userId); }

export function hasRole(userId, ...names) {
  const db = getDb();
  const rows = db.prepare(`SELECT r.name FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = ?`).all(userId);
  const set = new Set(rows.map(r => r.name));
  return names.some(n => set.has(n));
}

export function requirePerm(...codes) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบ' });
    const perms = userPermissions(req.user.id);
    if (codes.some(c => perms.has(c) || perms.has('*'))) return next();
    return res.status(403).json({ error: 'ไม่มีสิทธิ์เข้าถึง', code: 'FORBIDDEN' });
  };
}

export function requireRole(...names) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบ' });
    if (hasRole(req.user.id, ...names)) return next();
    return res.status(403).json({ error: 'ไม่มีสิทธิ์เข้าถึง', code: 'FORBIDDEN' });
  };
}
