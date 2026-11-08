import { getDb, tx, makeReference } from '../db/index.js';
import { HttpError, audit } from '../lib/audit.js';

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
    return { transaction: t, balance: newBalance };
  });
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
