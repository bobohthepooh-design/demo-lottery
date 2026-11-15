import { getDb, isPg } from '../db/index.js';
import { q, qGet, qRun } from '../db/pg.js';

// dual-mode: sqlite sync / pg async — caller ที่ await ใช้ได้ทั้งคู่
export function getSetting(key, fallback = null) {
  if (isPg()) return getSettingPg(key, fallback);
  const row = getDb().prepare('SELECT value FROM system_settings WHERE key = ?').get(key);
  if (!row) return fallback;
  try { return JSON.parse(row.value); } catch { return row.value; }
}

async function getSettingPg(key, fallback) {
  const row = await qGet('SELECT value FROM system_settings WHERE key = $1', [key]);
  if (!row) return fallback;
  try { return JSON.parse(row.value); } catch { return row.value; }
}

export function setSetting(key, value, userId = null) {
  if (isPg()) return setSettingPg(key, value, userId);
  getDb().prepare(`INSERT INTO system_settings (key, value, updated_by, updated_at)
                   VALUES (?, ?, ?, datetime('now'))
                   ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by, updated_at = datetime('now')`)
    .run(key, JSON.stringify(value), userId);
}

async function setSettingPg(key, value, userId) {
  await qRun(`INSERT INTO system_settings (key, value, updated_by, updated_at)
              VALUES ($1, $2, $3, to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS'))
              ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by,
                updated_at = to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS')`,
    [key, JSON.stringify(value), userId]);
}

export function allSettings() {
  if (isPg()) return allSettingsPg();
  return getDb().prepare('SELECT key, value, updated_at FROM system_settings ORDER BY key').all()
    .map(r => ({ key: r.key, value: (() => { try { return JSON.parse(r.value); } catch { return r.value; } })(), updatedAt: r.updated_at }));
}

async function allSettingsPg() {
  const rs = await q('SELECT key, value, updated_at FROM system_settings ORDER BY key');
  return rs.map(r => ({ key: r.key, value: (() => { try { return JSON.parse(r.value); } catch { return r.value; } })(), updatedAt: r.updated_at }));
}
