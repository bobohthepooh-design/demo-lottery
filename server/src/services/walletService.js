import { getDb, tx, makeReference } from '../db/index.js';
import { HttpError, audit } from '../lib/audit.js';
import { getSetting } from './settingsService.js';
import { notify } from './notifyService.js';

function getWalletTx(d, userId) {
  const w = d.prepare('SELECT * FROM virtual_wallets WHERE user_id = ?').get(userId);
  if (!w) throw new HttpError(404, 'ไม่พบกระเป๋าเครดิต');
  return w;
}

function insertTransaction(d, { walletId, userId, type, amount, direction, balanceAfter, description, idempotencyKey = null, createdBy = null }) {
  const ref = makeReference('TX');
  const r = d.prepare(`INSERT INTO virtual_transactions
    (reference, wallet_id, user_id, type, amount, balance_after, direction, status, idempotency_key, description, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'completed', ?, ?, ?)`)
    .run(ref, walletId, userId, type, amount, balanceAfter, direction, idempotencyKey, description, createdBy);
  return { id: Number(r.lastInsertRowid), reference: ref, balanceAfter };
}

function updateBalance(d, walletId, expectedVersion, newBalance) {
  const r = d.prepare(`UPDATE virtual_wallets SET balance = ?, version = version + 1, updated_at = datetime('now')
                       WHERE id = ? AND version = ?`).run(newBalance, walletId, expectedVersion);
  if (r.changes === 0) throw new HttpError(409, 'เกิด race condition กรุณาลองใหม่', 'CONCURRENT_MODIFICATION');
}

export function getBalance(userId) {
  const w = getDb().prepare('SELECT balance FROM virtual_wallets WHERE user_id = ?').get(userId);
  return w ? w.balance : 0;
}

export function getWallet(userId) {
  return getDb().prepare('SELECT * FROM virtual_wallets WHERE user_id = ?').get(userId);
}

export function listTransactions(userId, { limit = 50, offset = 0 } = {}) {
  return getDb().prepare(`SELECT id, reference, type, amount, balance_after, direction, status, description, created_at
                          FROM virtual_transactions WHERE user_id = ? ORDER BY id DESC LIMIT ? OFFSET ?`)
    .all(userId, limit, offset);
}

/** Admin credit/debit adjustment. amount in satang (>0). direction credit|debit. idempotencyKey required. */
export function adminAdjust({ adminId, targetUserId, amount, direction, reason, idempotencyKey }) {
  if (!Number.isInteger(amount) || amount <= 0) throw new HttpError(400, 'จำนวนเงินไม่ถูกต้อง');
  if (!['credit', 'debit'].includes(direction)) throw new HttpError(400, 'ทิศทางไม่ถูกต้อง');
  if (!reason || reason.length < 3) throw new HttpError(400, 'กรุณาระบุเหตุผลการปรับเครดิต');

  return tx((d) => {
    // idempotency check
    if (idempotencyKey) {
      const dup = d.prepare('SELECT id FROM virtual_transactions WHERE idempotency_key = ?').get(idempotencyKey);
      if (dup) throw new HttpError(409, 'รายการนี้ถูกดำเนินการแล้ว (duplicate)', 'DUPLICATE_TRANSACTION');
    }
    const w = getWalletTx(d, targetUserId);
    const newBalance = direction === 'credit' ? w.balance + amount : w.balance - amount;
    if (newBalance < 0) throw new HttpError(400, 'ยอดคงเหลือไม่เพียงพอสำหรับการหักเครดิต');
    updateBalance(d, w.id, w.version, newBalance);
    const t = insertTransaction(d, {
      walletId: w.id, userId: targetUserId,
      type: direction === 'credit' ? 'admin_adjust' : 'admin_debit',
      amount, direction, balanceAfter: newBalance, description: reason, idempotencyKey, createdBy: adminId,
    });
    audit({ userId: adminId, action: `wallet.${direction}_adjust`, entityType: 'wallet', entityId: String(w.id),
      detail: { targetUserId, amount, reason }, req: null });
    if (direction === 'credit') {
      notify(targetUserId, {
        type: 'credit', title: `ได้รับเครดิตจากแอดมิน +฿${(amount / 100).toLocaleString('th-TH')}`,
        body: reason, link: '/wallet',
      }, d);
    }
    return { transaction: t, balance: newBalance };
  });
}

const WITHDRAW_UNLOCK_SATANG = 10000; // ต้องเติมเครดิตสะสมขั้นต่ำ ฿100 ก่อนถอนได้

/** ยอดที่ถอนได้ = เงินรางวัล − ยอดที่ถอนไปแล้ว (เฉพาะ win_credit ถอนได้
 *  ระบบ/adjust/เงินฝากไม่สามารถถอนได้โดยตรง) */
function withdrawableInfo(d, userId, balance) {
  const u = d.prepare('SELECT withdraw_unlocked FROM users WHERE id = ?').get(userId);
  const row = d.prepare(`SELECT
      COALESCE(SUM(CASE WHEN type='deposit' THEN amount END),0) AS deposited,
      COALESCE(SUM(CASE WHEN type='win_credit' THEN amount END),0) AS won,
      COALESCE(SUM(CASE WHEN type='withdraw' THEN amount END),0) AS withdrawn,
      COALESCE(SUM(CASE WHEN type='initial_credit' THEN amount END),0) AS promo
    FROM virtual_transactions WHERE user_id = ?`).get(userId);
  const netWon = Math.max(0, row.won - row.withdrawn);
  // เครดิตแถมสมัครใหม่ (initial_credit) ไม่หักออกจากยอด/ประวัติธุรกรรม
  // แต่ห้ามรวมในยอดถอนได้: promoLeft = ส่วนที่ยังไม่ถูกหักไปแล้วและยังเหลือในยอด
  const clawed = d.prepare(`SELECT COALESCE(SUM(amount),0) AS a FROM virtual_transactions
    WHERE user_id = ? AND idempotency_key LIKE 'free-credit-clawback-%'`).get(userId).a;
  const promoCap = Number(getSetting('initial_credit', 5000)) || 5000;
  const promoLeft = Math.min(Math.max(0, row.promo - clawed), promoCap, balance);
  // admin ปลดล็อกให้รายคน → ถอนได้ยอดสุทธิ − เครดิตแถมที่เหลือ (เช่น 1310 − 50 = 1260)
  if (u?.withdraw_unlocked) {
    const w = balance - promoLeft;
    return { deposited: row.deposited, won: row.won, withdrawn: row.withdrawn,
      withdrawable: w >= 5000 ? w : 0, unlocked: true, override: true };
  }
  const withdrawable = Math.max(0, Math.min(netWon, balance));
  return { deposited: row.deposited, won: row.won, withdrawn: row.withdrawn, withdrawable, unlocked: row.deposited >= WITHDRAW_UNLOCK_SATANG };
}

export function getWithdrawable(userId) {
  const d = getDb();
  const w = getWalletTx(d, userId);
  return withdrawableInfo(d, userId, w.balance);
}

/** สมาชิกเติม/ถอนเครดิตจำลองด้วยตนเอง — demo only, ไม่เกี่ยวกับเงินจริง */
export function memberWalletAction(userId, { direction, amount, description }) {
  if (!['deposit', 'withdraw'].includes(direction)) throw new HttpError(400, 'ประเภทรายการไม่ถูกต้อง');
  if (!Number.isInteger(amount) || amount <= 0) throw new HttpError(400, 'จำนวนเงินไม่ถูกต้อง');
  if (amount < 100) throw new HttpError(400, 'ขั้นต่ำ 1 บาท');
  if (amount > 1000000) throw new HttpError(400, 'สูงสุด 10,000 บาทต่อรายการ');

  return tx((d) => {
    const w = getWalletTx(d, userId);
    const isCredit = direction === 'deposit';
    if (!isCredit) {
      const info = withdrawableInfo(d, userId, w.balance);
      if (!info.unlocked) throw new HttpError(400, 'ต้องเติมเครดิตขั้นต่ำ ฿100 ก่อนจึงจะสามารถถอนเงินได้', 'DEPOSIT_REQUIRED');
      if (amount > info.withdrawable) throw new HttpError(400,
        info.withdrawable <= 0 ? 'ยังไม่มีเงินรางวัลที่สามารถถอนได้ (ถอนได้เฉพาะเงินรางวัลจากการถูกหวย)' : `ถอนได้สูงสุด ฿${(info.withdrawable / 100).toFixed(2)}`,
        'WITHDRAW_LIMIT');
    }
    const newBalance = isCredit ? w.balance + amount : w.balance - amount;
    if (newBalance < 0) throw new HttpError(400, 'เครดิตไม่เพียงพอสำหรับการถอน', 'INSUFFICIENT_CREDIT');
    updateBalance(d, w.id, w.version, newBalance);
    const t = insertTransaction(d, {
      walletId: w.id, userId,
      type: isCredit ? 'deposit' : 'withdraw',
      amount, direction: isCredit ? 'credit' : 'debit',
      balanceAfter: newBalance,
      description,
    });
    audit({ userId, action: `wallet.${direction}`, entityType: 'wallet', entityId: String(w.id),
      detail: { amount }, req: null });
    notify(userId, {
      type: isCredit ? 'deposit' : 'withdraw',
      title: isCredit ? `เติมเครดิตสำเร็จ +฿${(amount / 100).toLocaleString('th-TH')}` : `ถอนเครดิต ฿${(amount / 100).toLocaleString('th-TH')} สำเร็จ`,
      body: description, link: '/wallet',
    }, d);
    return { transaction: t, balance: newBalance };
  });
}

/** Debit bet stake — called inside bet placement transaction. Throws if insufficient. */
export function debitForBetTx(d, { userId, slipRef, totalStake, idempotencyKey }) {
  const w = getWalletTx(d, userId);
  if (w.balance < totalStake) throw new HttpError(400, 'เครดิตไม่เพียงพอ', 'INSUFFICIENT_CREDIT');
  const newBalance = w.balance - totalStake;
  updateBalance(d, w.id, w.version, newBalance);
  return insertTransaction(d, {
    walletId: w.id, userId, type: 'bet_debit', amount: totalStake, direction: 'debit',
    balanceAfter: newBalance,
    description: `หักเครดิตโพย ${slipRef}`, idempotencyKey,
  });
}

/** Credit winnings/refund inside settlement transaction. */
export function creditTx(d, { userId, type, amount, description, idempotencyKey }) {
  const w = getWalletTx(d, userId);
  const newBalance = w.balance + amount;
  updateBalance(d, w.id, w.version, newBalance);
  return insertTransaction(d, {
    walletId: w.id, userId, type, amount, direction: 'credit', balanceAfter: newBalance, description, idempotencyKey,
  });
}
