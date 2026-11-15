import { getDb, tx } from '../db/index.js';
import { creditTx } from './walletService.js';
import { getSetting, setSetting } from './settingsService.js';
import { notify } from './notifyService.js';
import { audit } from '../lib/audit.js';

const baht = (satang) => `฿${(satang / 100).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Cashback promotion — คืนเครดิต X% ของยอดเสียสุทธิ (stake − payout)
 * ของโพยที่ settled ในช่วง windowHours ล่าสุด ให้สมาชิกทุกคน
 * idempotent ต่อ user ต่อ runKey (unique idempotency_key ใน virtual_transactions)
 */
export function runCashback({ windowHours = 24, runKey, minSatang = 100 } = {}) {
  const pct = Number(getSetting('cashback_percent', 0)) || 0;
  if (pct <= 0) return { skipped: 'disabled', percent: 0, users: 0, total: 0 };
  const key = runKey || `daily-${new Date().toISOString().slice(0, 10)}`;
  const since = new Date(Date.now() - windowHours * 3600e3).toISOString().slice(0, 19).replace('T', ' ');

  const rows = getDb().prepare(`SELECT bs.user_id,
        COALESCE(SUM(bs.total_stake), 0) AS stake,
        COALESCE(SUM(bs.total_payout), 0) AS payout
      FROM bet_slips bs
      WHERE bs.status IN ('won', 'lost', 'partial')
        AND bs.settled_at IS NOT NULL AND bs.settled_at >= ?
      GROUP BY bs.user_id`).all(since);

  let users = 0, total = 0;
  for (const r of rows) {
    const netLoss = r.stake - r.payout;
    if (netLoss <= 0) continue;
    const amount = Math.floor(netLoss * pct / 100);
    if (amount < minSatang) continue;
    try {
      tx((d) => {
        creditTx(d, {
          userId: r.user_id, type: 'promo_cashback', amount,
          description: `คืนยอดเสีย ${pct}% ย้อนหลัง ${windowHours} ชม. (promo ${key})`,
          idempotencyKey: `cashback-${key}-${r.user_id}`,
        });
        notify(r.user_id, {
          type: 'promo', title: `🎁 ได้เครดิตคืนยอดเสีย +${baht(amount)}`,
          body: `ระบบคืนเครดิต ${pct}% ของยอดเสียย้อนหลัง ${windowHours} ชั่วโมง — แบบเครดิตเสมือนเพื่อการศึกษา`,
          link: '/wallet',
        }, d);
      });
      users++; total += amount;
    } catch (e) {
      // duplicate runKey → idempotency_key ซ้ำ ข้าม user นี้
      if (!/UNIQUE|constraint/i.test(String(e.message))) throw e;
    }
  }
  audit({ userId: null, action: 'promo.cashback', entityType: 'system', entityId: key,
    detail: { percent: pct, windowHours, users, total }, req: null });
  return { runKey: key, percent: pct, windowHours, users, total };
}

/** เรียกจาก tick รายวัน — รันครั้งเดียวต่อวัน (วันตามเวลาไทย UTC+7) */
export function maybeDailyCashback() {
  const pct = Number(getSetting('cashback_percent', 0)) || 0;
  if (pct <= 0) return null;
  const today = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10); // วันที่ไทย
  if (getSetting('cashback_last_run') === today) return null;
  const r = runCashback({ runKey: `daily-${today}` });
  setSetting('cashback_last_run', today, null);
  if (r.users) console.log('[cashback]', JSON.stringify(r));
  return r;
}

/** preview ยอด cashback ที่จะได้ถ้ารันตอนนี้ (ไม่เครดิตจริง) */
export function previewCashback({ windowHours = 24 } = {}) {
  const pct = Number(getSetting('cashback_percent', 0)) || 0;
  if (pct <= 0) return { percent: 0, users: 0, total: 0 };
  const since = new Date(Date.now() - windowHours * 3600e3).toISOString().slice(0, 19).replace('T', ' ');
  const rows = getDb().prepare(`SELECT bs.user_id,
        COALESCE(SUM(bs.total_stake), 0) AS stake,
        COALESCE(SUM(bs.total_payout), 0) AS payout
      FROM bet_slips bs
      WHERE bs.status IN ('won', 'lost', 'partial')
        AND bs.settled_at IS NOT NULL AND bs.settled_at >= ?
      GROUP BY bs.user_id`).all(since);
  let users = 0, total = 0;
  for (const r of rows) {
    const netLoss = r.stake - r.payout;
    const amount = netLoss > 0 ? Math.floor(netLoss * pct / 100) : 0;
    if (amount >= 100) { users++; total += amount; }
  }
  return { percent: pct, windowHours, users, total };
}
