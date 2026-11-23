import { txAsync, makeReference } from '../db/index.js';
import { HttpError, audit } from '../lib/audit.js';
import { getSetting } from './settingsService.js';
import { notify } from './notifyService.js';
import { qGet, q } from '../db/pg.js';
import { postJournalTx } from './ledgerService.js';

// ---------- helpers ที่ใช้ภายใน transaction (d = txAsync facade {prepare} — async เสมอ) ----------

async function getWalletTx(d, userId) {
  const w = await d.prepare('SELECT * FROM virtual_wallets WHERE user_id = ?').get(userId);
  if (!w) throw new HttpError(404, 'ไม่พบกระเป๋าเครดิต');
  return w;
}

async function insertTransaction(d, { walletId, userId, type, amount, direction, balanceAfter, description, idempotencyKey = null, createdBy = null }) {
  const ref = makeReference('TX');
  const r = await d.prepare(`INSERT INTO virtual_transactions
    (reference, wallet_id, user_id, type, amount, balance_after, direction, status, idempotency_key, description, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'completed', ?, ?, ?)`)
    .run(ref, walletId, userId, type, amount, balanceAfter, direction, idempotencyKey, description, createdBy);
  const txId = Number(r.lastInsertRowid);
  // double-entry journal — 2 ขา (house ↔ member) ใน transaction เดียวกัน
  await postJournalTx(d, { transactionId: txId, userId, type, amount, direction });
  return { id: txId, reference: ref, balanceAfter };
}

async function updateBalance(d, walletId, expectedVersion, newBalance) {
  const r = await d.prepare(`UPDATE virtual_wallets SET balance = ?, version = version + 1,
      updated_at = to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS')
                       WHERE id = ? AND version = ?`).run(newBalance, walletId, expectedVersion);
  if (r.changes === 0) throw new HttpError(409, 'เกิด race condition กรุณาลองใหม่', 'CONCURRENT_MODIFICATION');
}

// ---------- read APIs ----------

export async function getBalance(userId) {
  const w = await qGet('SELECT balance FROM virtual_wallets WHERE user_id = $1', [userId]);
  return w ? w.balance : 0;
}

export function getWallet(userId) {
  return qGet('SELECT * FROM virtual_wallets WHERE user_id = $1', [userId]);
}

export function listTransactions(userId, { limit = 50, offset = 0 } = {}) {
  return q(`SELECT id, reference, type, amount, balance_after, direction, status, description, created_at
            FROM virtual_transactions WHERE user_id = $1 ORDER BY id DESC LIMIT $2 OFFSET $3`,
    [userId, limit, offset]);
}

// ---------- withdrawable info ----------

const WITHDRAW_UNLOCK_SATANG = 10000; // ต้องเติมเครดิตสะสมขั้นต่ำ ฿100 ก่อนถอนได้

async function withdrawableInfo(d, userId, balance) {
  const u = await d.prepare('SELECT withdraw_unlocked FROM users WHERE id = ?').get(userId);
  const row = await d.prepare(`SELECT
      COALESCE(SUM(CASE WHEN type='deposit' THEN amount END),0) AS deposited,
      COALESCE(SUM(CASE WHEN type='win_credit' THEN amount END),0) AS won,
      COALESCE(SUM(CASE WHEN type='withdraw' THEN amount END),0) AS withdrawn,
      COALESCE(SUM(CASE WHEN type='initial_credit' THEN amount END),0) AS promo
    FROM virtual_transactions WHERE user_id = ?`).get(userId);
  const clawed = (await d.prepare(`SELECT COALESCE(SUM(amount),0) AS a FROM virtual_transactions
    WHERE user_id = ? AND idempotency_key LIKE 'free-credit-clawback-%'`).get(userId)).a;
  const promoCap = Number(await getSetting('initial_credit', 5000)) || 5000;
  const promoLeft = Math.min(Math.max(0, row.promo - clawed), promoCap, balance);
  const pending = await d.prepare(`SELECT COUNT(*)::int AS c, COALESCE(SUM(s.total_stake),0) AS s
    FROM bet_slips s JOIN lottery_draws dr ON dr.id = s.draw_id
    WHERE s.user_id = ? AND s.status = 'pending' AND (
      (dr.status = 'open'
        AND dr.close_at > to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS'))
      OR dr.draw_code LIKE '%-STANDING'
    )`).get(userId);
  const pendingInfo = { pendingSlips: pending.c, pendingStake: pending.s };
  if (u?.withdraw_unlocked) {
    const w = balance - promoLeft;
    return { deposited: row.deposited, won: row.won, withdrawn: row.withdrawn,
      withdrawable: w >= 5000 ? w : 0, unlocked: true, override: true, ...pendingInfo };
  }
  const withdrawable = Math.max(0, balance - promoLeft);
  return { deposited: row.deposited, won: row.won, withdrawn: row.withdrawn, withdrawable, unlocked: row.deposited >= WITHDRAW_UNLOCK_SATANG, ...pendingInfo };
}

export function getWithdrawable(userId) {
  return txAsync(async (d) => {
    const w = await getWalletTx(d, userId);
    return withdrawableInfo(d, userId, w.balance);
  });
}

// ---------- admin adjust ----------

/** Admin credit/debit adjustment. amount in satang (>0). direction credit|debit. idempotencyKey required. */
export function adminAdjust({ adminId, targetUserId, amount, direction, reason, idempotencyKey }) {
  if (!Number.isInteger(amount) || amount <= 0) throw new HttpError(400, 'จำนวนเงินไม่ถูกต้อง');
  if (!['credit', 'debit'].includes(direction)) throw new HttpError(400, 'ทิศทางไม่ถูกต้อง');
  if (!reason || reason.length < 3) throw new HttpError(400, 'กรุณาระบุเหตุผลการปรับเครดิต');

  return txAsync(async (d) => {
    if (idempotencyKey) {
      const dup = await d.prepare('SELECT id FROM virtual_transactions WHERE idempotency_key = ?').get(idempotencyKey);
      if (dup) throw new HttpError(409, 'รายการนี้ถูกดำเนินการแล้ว (duplicate)', 'DUPLICATE_TRANSACTION');
    }
    const w = await getWalletTx(d, targetUserId);
    const newBalance = direction === 'credit' ? w.balance + amount : w.balance - amount;
    if (newBalance < 0) throw new HttpError(400, 'ยอดคงเหลือไม่เพียงพอสำหรับการหักเครดิต');
    await updateBalance(d, w.id, w.version, newBalance);
    const t = await insertTransaction(d, {
      walletId: w.id, userId: targetUserId,
      type: direction === 'credit' ? 'admin_adjust' : 'admin_debit',
      amount, direction, balanceAfter: newBalance, description: reason, idempotencyKey, createdBy: adminId,
    });
    audit({ userId: adminId, action: `wallet.${direction}_adjust`, entityType: 'wallet', entityId: String(w.id),
      detail: { targetUserId, amount, reason }, req: null });
    if (direction === 'credit') {
      await notify(targetUserId, {
        type: 'credit', title: `ได้รับเครดิตจากแอดมิน +฿${(amount / 100).toLocaleString('th-TH')}`,
        body: reason, link: '/wallet',
      }, d);
    }
    return { transaction: t, balance: newBalance };
  });
}

// ---------- member wallet action ----------

/** สมาชิกเติม/ถอนเครดิตจำลองด้วยตนเอง — demo only, ไม่เกี่ยวกับเงินจริง */
export function memberWalletAction(userId, { direction, amount, description, idempotencyKey = null }) {
  if (!['deposit', 'withdraw'].includes(direction)) throw new HttpError(400, 'ประเภทรายการไม่ถูกต้อง');
  if (!Number.isInteger(amount) || amount <= 0) throw new HttpError(400, 'จำนวนเงินไม่ถูกต้อง');
  if (amount < 100) throw new HttpError(400, 'ขั้นต่ำ 1 บาท');
  if (amount > 1000000) throw new HttpError(400, 'สูงสุด 10,000 บาทต่อรายการ');
  if (idempotencyKey != null && (typeof idempotencyKey !== 'string' || idempotencyKey.length > 64))
    throw new HttpError(400, 'idempotencyKey ไม่ถูกต้อง');

  return txAsync(async (d) => {
    if (idempotencyKey) {
      const dup = await d.prepare(`SELECT id, reference, amount, balance_after, direction FROM virtual_transactions
                                    WHERE user_id = ? AND idempotency_key = ?`).get(userId, idempotencyKey);
      if (dup) return { transaction: dup, balance: dup.balance_after, duplicate: true };
    }
    const w = await getWalletTx(d, userId);
    const isCredit = direction === 'deposit';
    if (!isCredit) {
      const info = await withdrawableInfo(d, userId, w.balance);
      if (info.pendingSlips > 0) throw new HttpError(400,
        `มีโพย ${info.pendingSlips} รายการค้างผล (${(info.pendingStake / 100).toLocaleString('th-TH')} บาท) — กรุณาสปิน/ทายหรือลงผล หรือยกเลิกโพย-บัตรเกมที่ยังค้างอยู่ก่อนจึงจะถอนได้`,
        'PENDING_BETS');
      if (!info.unlocked) throw new HttpError(400, 'ต้องเติมเครดิตขั้นต่ำ ฿100 ก่อนจึงจะสามารถถอนเงินได้', 'DEPOSIT_REQUIRED');
      if (amount > info.withdrawable) throw new HttpError(400,
        info.withdrawable <= 0 ? 'ไม่มียอดเครดิตที่สามารถถอนได้' : `ถอนได้สูงสุด ฿${(info.withdrawable / 100).toFixed(2)}`,
        'WITHDRAW_LIMIT');
    }
    const newBalance = isCredit ? w.balance + amount : w.balance - amount;
    if (newBalance < 0) throw new HttpError(400, 'เครดิตไม่เพียงพอสำหรับการถอน', 'INSUFFICIENT_CREDIT');
    await updateBalance(d, w.id, w.version, newBalance);
    const t = await insertTransaction(d, {
      walletId: w.id, userId,
      type: isCredit ? 'deposit' : 'withdraw',
      amount, direction: isCredit ? 'credit' : 'debit',
      balanceAfter: newBalance,
      description, idempotencyKey,
    });
    audit({ userId, action: `wallet.${direction}`, entityType: 'wallet', entityId: String(w.id),
      detail: { amount }, req: null });
    await notify(userId, {
      type: isCredit ? 'deposit' : 'withdraw',
      title: isCredit ? `เติมเครดิตสำเร็จ +฿${(amount / 100).toLocaleString('th-TH')}` : `ถอนเครดิต ฿${(amount / 100).toLocaleString('th-TH')} สำเร็จ`,
      body: description, link: '/wallet',
    }, d);
    return { transaction: t, balance: newBalance };
  });
}

// ---------- Tx helpers — ใช้ภายใน transaction ของ caller (d = txAsync facade — await เสมอ) ----------

/** Debit bet stake — called inside bet placement transaction. Throws if insufficient. */
export async function debitForBetTx(d, { userId, slipRef, totalStake, idempotencyKey }) {
  const w = await getWalletTx(d, userId);
  if (w.balance < totalStake) throw new HttpError(400, 'เครดิตไม่เพียงพอ', 'INSUFFICIENT_CREDIT');
  const newBalance = w.balance - totalStake;
  await updateBalance(d, w.id, w.version, newBalance);
  return insertTransaction(d, {
    walletId: w.id, userId, type: 'bet_debit', amount: totalStake, direction: 'debit',
    balanceAfter: newBalance,
    description: `หักเครดิตโพย ${slipRef}`, idempotencyKey,
  });
}

/** Credit winnings/refund inside settlement transaction. */
export async function creditTx(d, { userId, type, amount, description, idempotencyKey }) {
  const w = await getWalletTx(d, userId);
  const newBalance = w.balance + amount;
  await updateBalance(d, w.id, w.version, newBalance);
  return insertTransaction(d, {
    walletId: w.id, userId, type, amount, direction: 'credit', balanceAfter: newBalance, description, idempotencyKey,
  });
}
