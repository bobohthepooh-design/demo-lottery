import { txAsync, makeReference } from '../db/index.js';
import { q, qGet } from '../db/pg.js';
import { config } from '../config.js';
import { HttpError, audit } from '../lib/audit.js';
import { notify } from './notifyService.js';
import * as wallet from './walletService.js';

// ================= PromptPay EMV QR payload =================
// EMVCo payload สำหรับพร้อมเพย์ — https://www.emvco.com + spec PromptPay ของ BOT
function crc16(str) {
  let crc = 0xffff;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}
const tlv = (id, val) => `${id}${String(val.length).padStart(2, '0')}${val}`;

export function promptPayPayload(promptPayId, amountSatang) {
  const id = String(promptPayId || '').replace(/[-\s]/g, '');
  let proxyId, proxyVal;
  if (/^0\d{9}$/.test(id)) { proxyId = '01'; proxyVal = '0066' + id.slice(1); }        // เบอร์มือถือ
  else if (/^\d{13}$/.test(id)) { proxyId = '02'; proxyVal = id; }                      // บัตร ปชช.
  else if (/^\d{15}$/.test(id)) { proxyId = '03'; proxyVal = id; }                      // e-Wallet
  else throw new HttpError(500, 'PROMPTPAY_ID ไม่ถูกต้อง — ต้องเป็นเบอร์ 0xxxxxxxxx / เลข 13 หลัก / e-Wallet 15 หลัก');
  const aid = 'A000000677010111';
  const merchant = tlv('00', aid) + tlv(proxyId, proxyVal);
  const amount = (amountSatang / 100).toFixed(2);
  let payload = tlv('00', '01') + tlv('01', '12') + tlv('29', merchant)
    + tlv('52', '0000') + tlv('53', '764') + tlv('54', amount) + tlv('58', 'TH') + '6304';
  return payload + crc16(payload);
}

// ================= Slip verification (SlipOK) =================
const SLIPOK_URL = (branch) => `https://api.slipok.com/api/line/apikey/${branch}`;

async function verifySlipWithSlipOk(imageBase64, branchId, apiKey) {
  const b64 = imageBase64.replace(/^data:image\/\w+;base64,/, '');
  const buf = Buffer.from(b64, 'base64');
  if (buf.length < 100 || buf.length > 5 * 1024 * 1024) throw new HttpError(400, 'ไฟล์สลิปไม่ถูกต้อง (ขนาด 100B–5MB)');
  const fd = new FormData();
  fd.append('files', new Blob([buf], { type: 'image/jpeg' }), 'slip.jpg');
  fd.append('log', '1');
  const res = await fetch(SLIPOK_URL(branchId), {
    method: 'POST',
    headers: { 'x-authorization': apiKey },
    body: fd,
    signal: AbortSignal.timeout(20000),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.success) {
    const msg = json.message || json.data?.message || `SlipOK HTTP ${res.status}`;
    throw new HttpError(422, `ตรวจสลิปไม่ผ่าน: ${msg}`, 'SLIP_VERIFY_FAILED');
  }
  const d = json.data || {};
  return {
    transRef: d.transRef || d.trans_ref || null,
    amount: d.amount != null ? Math.round(parseFloat(d.amount) * 100) : null, // satang
    receiver: d.receiver || null,
    sender: d.sender || null,
    datetime: d.date || d.transTimestamp || null,
    raw: d,
  };
}

// ================= Deposit =================
export async function createDeposit(userId, { amount, method = 'promptpay' }) {
  if (!Number.isInteger(amount) || amount < 100) throw new HttpError(400, 'ขั้นต่ำเติม 1 บาท');
  if (amount > 100000000) throw new HttpError(400, 'สูงสุด 1,000,000 บาทต่อรายการ');
  const promptPayId = config.promptPayId;
  if (!promptPayId) throw new HttpError(503, 'ระบบชำระเงินยังไม่พร้อมใช้งาน (ยังไม่ได้ตั้ง PROMPTPAY_ID)');
  return txAsync(async (d) => {
    // กันสร้างคำขอค้างเยอะเกิน
    const pend = await d.prepare(`SELECT COUNT(*) c FROM payment_requests WHERE user_id=? AND kind='deposit' AND status IN ('pending_slip','pending_review')`).get(userId);
    if (pend.c >= 3) throw new HttpError(400, 'มีคำขอเติมเงินค้างอยู่ 3 รายการแล้ว — รอผลหรือให้แอดมินตรวจสอบก่อน', 'TOO_MANY_PENDING');
    const ref = makeReference('PAY');
    const payload = promptPayPayload(promptPayId, amount);
    const row = await d.prepare(`INSERT INTO payment_requests
      (reference,user_id,kind,amount,method,status,promptpay_payload,promptpay_id)
      VALUES (?,?,?,?,?,'pending_slip',?,?) RETURNING id,reference,created_at`)
      .get(ref, userId, 'deposit', amount, method, payload, promptPayId);
    return { id: row.id, reference: row.reference, amount, payload, createdAt: row.created_at };
  });
}

export async function submitDepositSlip(userId, paymentId, { imageBase64 }) {
  const p = await qGet(`SELECT * FROM payment_requests WHERE id=? AND user_id=? AND kind='deposit'`, [paymentId, userId]);
  if (!p) throw new HttpError(404, 'ไม่พบคำขอเติมเงิน');
  if (p.status !== 'pending_slip') throw new HttpError(400, `คำขอนี้สถานะ ${p.status} แล้ว`, 'BAD_STATE');
  // กันสลิปซ้ำ: ถ้า transRef เคยใช้กับ payment ที่ approved/pending_review แล้ว → reject
  const prov = config.slipokBranchId && config.slipokApiKey;
  let slip = null, verifyErr = null;
  if (prov) {
    try { slip = await verifySlipWithSlipOk(imageBase64, config.slipokBranchId, config.slipokApiKey); }
    catch (e) { verifyErr = e.message; }
  }
  return txAsync(async (d) => {
    // re-check status ใน tx กัน race
    const cur = await d.prepare(`SELECT status FROM payment_requests WHERE id=?`).get(paymentId);
    if (cur.status !== 'pending_slip') throw new HttpError(400, 'สถานะคำขอเปลี่ยนแล้ว', 'BAD_STATE');
    if (slip?.transRef) {
      const dup = await d.prepare(`SELECT id FROM payment_requests WHERE slip_trans_ref=? AND id<>? AND status IN ('approved','pending_review')`).get(slip.transRef, paymentId);
      if (dup) throw new HttpError(409, 'สลิปนี้ถูกใช้กับคำขออื่นแล้ว', 'DUP_SLIP');
    }
    const amountOk = slip?.amount != null && slip.amount === p.amount;
    const autoApprove = prov && slip && amountOk;
    const status = autoApprove ? 'approved' : 'pending_review';
    await d.prepare(`UPDATE payment_requests SET status=?, slip_trans_ref=?, slip_amount=?, slip_payer=?, slip_receiver=?, slip_datetime=?, slip_raw=?, slip_error=?, reviewed_at=CASE WHEN ?='approved' THEN strftime('%Y-%m-%d %H:%M:%S','now') ELSE reviewed_at END WHERE id=?`)
      .run(status, slip?.transRef || null, slip?.amount || null,
        slip?.sender ? JSON.stringify(slip.sender) : null,
        slip?.receiver ? JSON.stringify(slip.receiver) : null,
        slip?.datetime || null, slip?.raw ? JSON.stringify(slip.raw) : null,
        verifyErr || (slip && !amountOk ? `ยอดสลิป ${slip.amount != null ? slip.amount / 100 : '?'} บาท ไม่ตรงกับคำขอ ${p.amount / 100} บาท` : null),
        status, paymentId);
    if (autoApprove) {
      const r = await wallet.memberWalletAction(userId, {
        direction: 'deposit', amount: p.amount,
        idempotencyKey: `pay-${p.reference}`,
        description: `เติมเครดิตผ่านพร้อมเพย์ — ${p.reference} (สลิป ${slip.transRef})`,
      });
      await notify(userId, { type: 'deposit', title: `เติมเครดิตสำเร็จ +฿${(p.amount / 100).toLocaleString('th-TH')}`, body: `PromptPay ${p.reference} — ตรวจสลิปอัตโนมัติผ่าน`, link: '/wallet' }, d);
      return { status: 'approved', credited: true, balance: r.balance, transRef: slip.transRef };
    }
    await notify(userId, { type: 'system', title: 'ส่งสลิปแล้ว — รอแอดมินตรวจสอบ', body: verifyErr || 'ระบบไม่สามารถยืนยันสลิปอัตโนมัติได้ แอดมินจะตรวจสอบและเติมเครดิตให้', link: '/wallet' }, d);
    return { status: 'pending_review', credited: false, reason: verifyErr || 'ยอดไม่ตรง/ไม่มีข้อมูลสลิป' };
  });
}

// ================= Withdraw =================
export async function createWithdraw(userId, { amount, bankName, accountNo, accountName, promptpayId }) {
  if (!Number.isInteger(amount) || amount < 10000) throw new HttpError(400, 'ขั้นต่ำถอน 100 บาท');
  if (!bankName || !accountNo || !accountName) throw new HttpError(400, 'กรุณากรอกข้อมูลบัญชีธนาคารให้ครบ');
  // PromptPay ID ของผู้ใช้ (ถ้าระบุ) — normalize เหลือ digits; admin ใช้เทียบกับเบอร์ที่ verify OTP
  const ppId = promptpayId ? String(promptpayId).replace(/\D/g, '') : null;
  if (ppId && ppId.length < 9) throw new HttpError(400, 'PromptPay ID ไม่ถูกต้อง');
  // กันคำขอถอนค้างหลายรายการ
  const pend = await qGet(`SELECT COUNT(*) c, COALESCE(SUM(amount),0) s FROM payment_requests WHERE user_id=? AND kind='withdraw' AND status='pending_review'`, [userId]);
  if (pend.c >= 2) throw new HttpError(400, 'มีคำขอถอนเงินรออนุมัติอยู่แล้ว', 'TOO_MANY_PENDING');
  const wd = await wallet.getWithdrawable(userId);
  const pendingSum = pend.s || 0;
  if (amount + pendingSum > wd.withdrawable) throw new HttpError(400,
    `ถอนได้สูงสุด ฿${((wd.withdrawable - pendingSum) / 100).toFixed(2)} (รวมคำขอที่รออนุมัติแล้ว)`, 'WITHDRAW_LIMIT');
  const ref = makeReference('WDR');
  const row = await q(`INSERT INTO payment_requests (reference,user_id,kind,amount,method,status,bank_name,bank_account_no,bank_account_name,promptpay_id) VALUES (?,?, 'withdraw',?,'bank_transfer','pending_review',?,?,?,?,?) RETURNING id,reference,created_at`,
    [ref, userId, amount, bankName, accountNo, accountName, ppId]);
  await notify(userId, { type: 'withdraw', title: `ส่งคำขอถอน ฿${(amount / 100).toLocaleString('th-TH')} แล้ว`, body: `รอแอดมินอนุมัติ — ${bankName} ${accountNo}`, link: '/wallet' });
  return { id: row[0].id, reference: ref, amount, status: 'pending_review' };
}

// ================= Queries =================
export async function listMine(userId) {
  return q(`SELECT id,reference,kind,amount,method,status,bank_name,bank_account_no,bank_account_name,promptpay_id,slip_trans_ref,slip_error,admin_note,created_at,reviewed_at FROM payment_requests WHERE user_id=? ORDER BY id DESC LIMIT 50`, [userId]);
}
export async function adminList({ status = 'pending_review', kind = null, limit = 100 } = {}) {
  let sql = `SELECT pr.*, u.username, u.email, u.phone, u.display_name FROM payment_requests pr JOIN users u ON u.id=pr.user_id`;
  const params = [];
  const where = [];
  if (status === 'pending') where.push(`pr.status IN ('pending_slip','pending_review')`);
  else if (status !== 'all') { where.push(`pr.status=?`); params.push(status); }
  if (kind) { where.push(`pr.kind=?`); params.push(kind); }
  if (where.length) sql += ' WHERE ' + where.join(' AND ');
  sql += ` ORDER BY pr.id DESC LIMIT ?`;
  params.push(limit);
  return q(sql, params);
}

export async function adminReview({ adminId, paymentId, action, note }) {
  const p = await qGet(`SELECT * FROM payment_requests WHERE id=?`, [paymentId]);
  if (!p) throw new HttpError(404, 'ไม่พบคำขอ');
  if (p.status !== 'pending_review' && p.status !== 'pending_slip') throw new HttpError(400, `สถานะ ${p.status} แล้ว`, 'BAD_STATE');
  if (action === 'approve') {
    if (p.kind === 'deposit') {
      // เติมเครดิต (manual approve — ครอบคลุมสลิปที่ verify ไม่ผ่าน/ไม่มี API)
      const r = await wallet.memberWalletAction(p.user_id, {
        direction: 'deposit', amount: p.amount,
        idempotencyKey: `pay-${p.reference}`,
        description: `เติมเครดิตผ่านพร้อมเพย์ — ${p.reference} (แอดมินอนุมัติ${note ? ': ' + note : ''})`,
      });
      await q(`UPDATE payment_requests SET status='approved', admin_note=?, reviewed_by=?, reviewed_at=strftime('%Y-%m-%d %H:%M:%S','now') WHERE id=?`, [note || null, adminId, paymentId]);
      await notify(p.user_id, { type: 'deposit', title: `เติมเครดิตสำเร็จ +฿${(p.amount / 100).toLocaleString('th-TH')}`, body: `คำขอ ${p.reference} ได้รับอนุมัติ`, link: '/wallet' });
      return { ok: true, credited: true, balance: r.balance };
    }
    // withdraw approve → หักเครดิตตอนนี้ (memberWalletAction direction=withdraw)
    const r = await wallet.memberWalletAction(p.user_id, {
      direction: 'withdraw', amount: p.amount,
      idempotencyKey: `wdr-${p.reference}`,
      description: `ถอนเงิน — ${p.bank_name} ${p.bank_account_no} ${p.bank_account_name} — ${p.reference} (แอดมินอนุมัติ${note ? ': ' + note : ''})`,
    });
    await q(`UPDATE payment_requests SET status='approved', admin_note=?, reviewed_by=?, reviewed_at=strftime('%Y-%m-%d %H:%M:%S','now') WHERE id=?`, [note || null, adminId, paymentId]);
    await notify(p.user_id, { type: 'withdraw', title: `อนุมัติถอน ฿${(p.amount / 100).toLocaleString('th-TH')} แล้ว`, body: `โอนไปยัง ${p.bank_name} ${p.bank_account_no} — ติดต่อแอดมินหากเงินไม่เข้า`, link: '/wallet' });
    return { ok: true, debited: true, balance: r.balance };
  }
  // reject
  await q(`UPDATE payment_requests SET status='rejected', admin_note=?, reviewed_by=?, reviewed_at=strftime('%Y-%m-%d %H:%M:%S','now') WHERE id=?`, [note || null, adminId, paymentId]);
  await notify(p.user_id, { type: 'system', title: `${p.kind === 'deposit' ? 'เติมเงิน' : 'ถอนเงิน'}ถูกปฏิเสธ`, body: note || `คำขอ ${p.reference} ไม่ผ่านการตรวจสอบ`, link: '/wallet' });
  return { ok: true, rejected: true };
}

export const isPaymentsConfigured = () => !!(config.promptPayId);
export const isSlipVerifyConfigured = () => !!(config.slipokBranchId && config.slipokApiKey);
