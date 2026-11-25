import { q, qGet, qRun } from '../db/pg.js';
import { HttpError } from '../lib/audit.js';

export function getSetting(key, fallback = null) {
  return getSettingPg(key, fallback);
}

async function getSettingPg(key, fallback) {
  const row = await qGet('SELECT value FROM system_settings WHERE key = $1', [key]);
  if (!row) return fallback;
  try { return JSON.parse(row.value); } catch { return row.value; }
}

export function setSetting(key, value, userId = null) {
  return setSettingPg(key, value, userId);
}

async function setSettingPg(key, value, userId) {
  await qRun(`INSERT INTO system_settings (key, value, updated_by, updated_at)
              VALUES ($1, $2, $3, to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS'))
              ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by,
                updated_at = to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS')`,
    [key, JSON.stringify(value), userId]);
}

// admin เปิด/ปิดระบบแทง — ใช้ร่วมกันทุก mutation ที่มีเงินเดิมพัน
// betting_menu_enabled=false → ปิดรับเดิมพันทั้งหมด (blind mode)
// bet_menu_hidden_types=[codes] → ปิดเฉพาะประเภท (เช่น 'HR','SC','HL','KI','LA','HN','TH','GS')
export async function assertBettingAllowed(typeCode = null) {
  const menuOn = (await getSetting('betting_menu_enabled', true)) !== false;
  if (!menuOn) throw new HttpError(403, 'ระบบปิดรับเดิมพันชั่วคราวโดยผู้ดูแล', 'BET_MENU_DISABLED');
  if (typeCode) {
    const hidden = await getSetting('bet_menu_hidden_types', []);
    if (Array.isArray(hidden) && hidden.includes(typeCode))
      throw new HttpError(403, 'ประเภทนี้ถูกปิดให้บริการโดยผู้ดูแล', 'BET_TYPE_HIDDEN');
  }
}

export function allSettings() {
  return allSettingsPg();
}

async function allSettingsPg() {
  const rs = await q('SELECT key, value, updated_at FROM system_settings ORDER BY key');
  return rs.map(r => ({ key: r.key, value: (() => { try { return JSON.parse(r.value); } catch { return r.value; } })(), updatedAt: r.updated_at }));
}
