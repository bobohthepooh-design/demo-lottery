import { q, qRun } from '../db/pg.js';

// ---------- double-entry journal ----------
// ทุก virtual_transaction มี journal 2 ขา: Dr house:<cat> / Cr member:<uid> (เครดิตเข้า)
// หรือกลับกัน (เดบิตออก) — debit รวม = credit รวมเสมอ = amount
// house accounts เป็นบัญชีคู่ (counterparty) ของเครดิตเสมือน — ไม่ใช่เงินจริง

const HOUSE_ACCOUNT = {
  initial_credit: 'house:promo_expense',
  admin_adjust: 'house:adjustments',
  admin_debit: 'house:adjustments',
  bet_debit: 'house:betting_hold',
  bet_refund: 'house:betting_hold',
  win_credit: 'house:payout_expense',
  deposit: 'house:float',
  withdraw: 'house:float',
  promo_cashback: 'house:promo_expense',
};
export const houseAccountFor = (type) => HOUSE_ACCOUNT[type] || 'house:misc';
export const memberAccountFor = (userId) => `member:${userId}:wallet`;

// เรียกภายใน transaction เดียวกับ insertTransaction — d = txAsync facade
// (ส่ง d=null → ใช้ qRun autocommit สำหรับ backfill ทีละรายการ)
export async function postJournalTx(d, { transactionId, userId, type, amount, direction }) {
  const memberAcct = memberAccountFor(userId);
  const houseAcct = houseAccountFor(type);
  // เครดิตเข้า member: Dr house / Cr member — เดบิตออก: Dr member / Cr house
  const legs = direction === 'credit'
    ? [{ account: houseAcct, debit: amount, credit: 0 }, { account: memberAcct, debit: 0, credit: amount }]
    : [{ account: memberAcct, debit: amount, credit: 0 }, { account: houseAcct, debit: 0, credit: amount }];
  for (const l of legs) {
    if (d) await d.prepare(`INSERT INTO journal_entries (transaction_id, account, debit, credit) VALUES (?,?,?,?)`)
      .run(transactionId, l.account, l.debit, l.credit);
    else await qRun(`INSERT INTO journal_entries (transaction_id, account, debit, credit) VALUES ($1,$2,$3,$4)`,
      [transactionId, l.account, l.debit, l.credit]);
  }
}

// backfill journal ให้ transactions ที่ยังไม่มี (ข้อมูลก่อนมี ledger)
export async function rebuildJournal({ limit = 5000 } = {}) {
  const missing = await q(`SELECT vt.id, vt.user_id, vt.type, vt.amount, vt.direction
    FROM virtual_transactions vt
    WHERE NOT EXISTS (SELECT 1 FROM journal_entries je WHERE je.transaction_id = vt.id)
    ORDER BY vt.id LIMIT $1`, [limit]);
  let posted = 0;
  for (const t of missing) {
    await postJournalTx(null, { transactionId: t.id, userId: t.user_id, type: t.type, amount: t.amount, direction: t.direction });
    posted++;
  }
  return { posted, scanned: missing.length };
}

// ยอดรวมต่อ account (debit − credit ตามธรรมเนียม: debit balance = Dr−Cr)
export async function accountBalances() {
  return q(`SELECT account,
      COALESCE(SUM(debit),0)::bigint AS debit_total,
      COALESCE(SUM(credit),0)::bigint AS credit_total,
      (COALESCE(SUM(debit),0) - COALESCE(SUM(credit),0))::bigint AS balance
    FROM journal_entries GROUP BY account ORDER BY account`);
}

// ตรวจความถูกต้อง: ทุก transaction ต้องมี journal ครบ 2 ขา และ debit=credit
export async function verifyLedger() {
  const unbalanced = await q(`SELECT je.transaction_id,
      COALESCE(SUM(je.debit),0)::bigint AS d, COALESCE(SUM(je.credit),0)::bigint AS c
    FROM journal_entries je GROUP BY je.transaction_id
    HAVING COALESCE(SUM(je.debit),0) <> COALESCE(SUM(je.credit),0) LIMIT 20`);
  const missing = await q(`SELECT COUNT(*)::int c FROM virtual_transactions vt
    WHERE NOT EXISTS (SELECT 1 FROM journal_entries je WHERE je.transaction_id = vt.id)`);
  const global = await q(`SELECT COALESCE(SUM(debit),0)::bigint d, COALESCE(SUM(credit),0)::bigint c FROM journal_entries`);
  return {
    ok: unbalanced.length === 0 && missing[0].c === 0 && global[0].d === global[0].c,
    unbalancedTransactions: unbalanced,
    transactionsMissingJournal: missing[0].c,
    globalDebit: global[0].d, globalCredit: global[0].c,
  };
}
