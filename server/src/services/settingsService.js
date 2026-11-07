import { getDb } from '../db/index.js';

export function getSetting(key, fallback = null) {
  const row = getDb().prepare('SELECT value FROM system_settings WHERE key = ?').get(key);
  if (!row) return fallback;
  try { return JSON.parse(row.value); } catch { return row.value; }
}

export function setSetting(key, value, userId = null) {
  getDb().prepare(`INSERT INTO system_settings (key, value, updated_by, updated_at)
                   VALUES (?, ?, ?, datetime('now'))
                   ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by, updated_at = datetime('now')`)
    .run(key, JSON.stringify(value), userId);
}

export function allSettings() {
  return getDb().prepare('SELECT key, value, updated_at FROM system_settings ORDER BY key').all()
    .map(r => ({ key: r.key, value: (() => { try { return JSON.parse(r.value); } catch { return r.value; } })(), updatedAt: r.updated_at }));
}
