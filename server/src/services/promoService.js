import { txAsync } from '../db/index.js';
import { creditTx } from './walletService.js';
import { getSetting, setSetting } from './settingsService.js';
import { notify } from './notifyService.js';
import { audit } from '../lib/audit.js';
import { q } from '../db/pg.js';

const baht = (satang) => `฿${(satang / 100).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const NET_LOSS_SQL = `SELECT bs.user_id,
      COALESCE(SUM(bs.total_stake), 0) AS stake,
      COALESCE(SUM(bs.total_payout), 0) AS payout
    FROM bet_slips bs
    WHERE bs.status IN ('won', 'lost', 'partial')
      AND bs.settled_at IS NOT NULL AND bs.settled_at >= $1
    GROUP BY bs.user_id`;

// Cashback promotion — คืนเครดิต X% ของยอดเสียสุทธิ (stake − payout)
// ของโพยที่ settled ในช่วง windowHours ล่าสุด ให้สมาชิกทุกคน
// idempotent ต่อ user ต่อ runKey (unique idempotency_key ใน virtual_transactions)
export function runCashback(opts = {}) {
  return runCashbackPg(opts);
}

async function cashbackRowsPg(since) {
  return q(NET_LOSS_SQL, [since]);
}

function computeCashback(rows, pct, minSatang) {
  const out = [];
  for (const r of rows) {
    const netLoss = r.stake - r.payout;
    if (netLoss <= 0) continue;
    const amount = Math.floor(netLoss * pct / 100);
    if (amount < minSatang) continue;
    out.push({ userId: r.user_id, amount });
  }
  return out;
}

async function creditOne(userId, amount, pct, windowHours, key) {
  await txAsync(async (d) => {
    await creditTx(d, {
      userId, type: 'promo_cashback', amount,
      description: `คืนยอดเสีย ${pct}% ย้อนหลัง ${windowHours} ชม. (promo ${key})`,
      idempotencyKey: `cashback-${key}-${userId}`,
    });
    await notify(userId, {
      type: 'promo', title: `🎁 ได้เครดิตคืนยอดเสีย +${baht(amount)}`,
      body: `ระบบคืนเครดิต ${pct}% ของยอดเสียย้อนหลัง ${windowHours} ชั่วโมง — แบบเครดิตเสมือนเพื่อการศึกษา`,
      link: '/wallet',
    }, d);
  });
  return true;
}

async function runCashbackPg({ windowHours = 24, runKey, minSatang = 100, percent = null } = {}) {
  const pct = percent ?? (Number(await getSetting('cashback_percent', 0)) || 0);
  if (pct <= 0) return { skipped: 'disabled', percent: 0, users: 0, total: 0 };
  const key = runKey || `daily-${new Date().toISOString().slice(0, 10)}`;
  const since = new Date(Date.now() - windowHours * 3600e3).toISOString().slice(0, 19).replace('T', ' ');
  const rows = await cashbackRowsPg(since);
  const targets = computeCashback(rows, pct, minSatang);
  let users = 0, total = 0;
  for (const t of targets) {
    try {
      await creditOne(t.userId, t.amount, pct, windowHours, key);
      users++; total += t.amount;
    } catch (e) {
      if (!/UNIQUE|constraint|duplicate/i.test(String(e.message))) throw e;
    }
  }
  audit({ userId: null, action: 'promo.cashback', entityType: 'system', entityId: key,
    detail: { percent: pct, windowHours, users, total }, req: null });
  return { runKey: key, percent: pct, windowHours, users, total };
}

/** เรียกจาก tick รายวัน — รันครั้งเดียวต่อวัน (วันตามเวลาไทย UTC+7) */
export function maybeDailyCashback() {
  return maybeDailyCashbackPg();
}

async function maybeDailyCashbackPg() {
  const today = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
  // active campaign (promo_campaigns) มี priority เหนือ setting cashback_percent
  const camp = await q(`SELECT * FROM promo_campaigns WHERE kind='cashback' AND active=1 ORDER BY id DESC LIMIT 1`).catch(() => []);
  const c = camp[0];
  const pct = c ? c.percent : (Number(await getSetting('cashback_percent', 0)) || 0);
  if (pct <= 0) return null;
  if (await getSetting('cashback_last_run') === today) return null;
  const r = c
    ? await runCashbackPg({ windowHours: c.window_hours, minSatang: c.min_satang, percent: c.percent, runKey: `campaign-${c.id}-${today}` })
    : await runCashbackPg({ runKey: `daily-${today}` });
  await setSetting('cashback_last_run', today, null);
  if (r.users) console.log('[cashback]', JSON.stringify(r));
  return r;
}

/** preview ยอด cashback ที่จะได้ถ้ารันตอนนี้ (ไม่เครดิตจริง) */
export function previewCashback({ windowHours = 24 } = {}) {
  return previewCashbackPg({ windowHours });
}

async function previewCashbackPg({ windowHours = 24 } = {}) {
  const pct = Number(await getSetting('cashback_percent', 0)) || 0;
  if (pct <= 0) return { percent: 0, users: 0, total: 0 };
  const since = new Date(Date.now() - windowHours * 3600e3).toISOString().slice(0, 19).replace('T', ' ');
  const rows = await cashbackRowsPg(since);
  const targets = computeCashback(rows, pct, 100);
  return { percent: pct, windowHours, users: targets.length, total: targets.reduce((a, t) => a + t.amount, 0) };
}
