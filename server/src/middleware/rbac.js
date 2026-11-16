import { HttpError } from '../lib/audit.js';
import { q } from '../db/pg.js';

const permCache = new Map(); // userId -> {at, perms}
const TTL = 30_000;

async function userPermissionsPg(userId) {
  const hit = permCache.get(userId);
  if (hit && Date.now() - hit.at < TTL) return hit.perms;
  const rows = await q(`
    SELECT DISTINCT p.code FROM permissions p
    JOIN role_permissions rp ON rp.permission_id = p.id
    JOIN user_roles ur ON ur.role_id = rp.role_id
    WHERE ur.user_id = $1`, [userId]);
  const perms = new Set(rows.map(r => r.code));
  permCache.set(userId, { at: Date.now(), perms });
  return perms;
}

export function userPermissions(userId) {
  return userPermissionsPg(userId);
}

export function invalidatePermCache(userId) { permCache.delete(userId); }

async function hasRolePg(userId, names) {
  const rows = await q(`SELECT r.name FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = $1`, [userId]);
  const set = new Set(rows.map(r => r.name));
  return names.some(n => set.has(n));
}

export function hasRole(userId, ...names) {
  return hasRolePg(userId, names);
}

export function requirePerm(...codes) {
  return async (req, res, next) => {
    try {
      if (!req.user) return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบ' });
      const perms = await userPermissions(req.user.id);
      if (codes.some(c => perms.has(c) || perms.has('*'))) return next();
      return res.status(403).json({ error: 'ไม่มีสิทธิ์เข้าถึง', code: 'FORBIDDEN' });
    } catch (e) { next(e); }
  };
}

export function requireRole(...names) {
  return async (req, res, next) => {
    try {
      if (!req.user) return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบ' });
      if (await hasRole(req.user.id, ...names)) return next();
      return res.status(403).json({ error: 'ไม่มีสิทธิ์เข้าถึง', code: 'FORBIDDEN' });
    } catch (e) { next(e); }
  };
}
