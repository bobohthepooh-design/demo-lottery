import { Router } from 'express';
import { z } from 'zod';
import * as svc from '../services/lotteryService.js';
import * as wallet from '../services/walletService.js';
import * as hilo from '../services/hiloService.js';
import * as scratch from '../services/scratchService.js';
import { qGet } from '../db/pg.js';
import { requireAuth, requireAgeConfirmed } from '../services/authService.js';
import { requirePerm } from '../middleware/rbac.js';
import { HttpError } from '../lib/audit.js';
import { isPaymentsConfigured } from '../services/paymentService.js';

const router = Router();
router.use(requireAuth);

const betSchema = z.object({
  drawId: z.number().int().positive(),
  items: z.array(z.object({
    ruleId: z.number().int().positive(),
    number: z.string().min(1).max(20),
    amount: z.number().int().positive(),
    tod: z.boolean().optional(),
  })).min(1).max(200),
  idempotencyKey: z.string().max(64).optional(),
});

router.post('/', requireAgeConfirmed, async (req, res, next) => {
  try {
    const data = betSchema.parse(req.body);
    const result = await svc.placeBet(req.user.id, data);
    res.status(201).json({ ok: true, ...result });
  } catch (e) { next(e); }
});

router.get('/mine', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || '50', 10), 200);
  const offset = parseInt(req.query.offset || '0', 10);
  const status = ['pending', 'won', 'lost', 'partial', 'cancelled', 'refunded'].includes(req.query.status)
    ? req.query.status : null;
  const totalRow = await qGet(`SELECT COUNT(*)::int AS c FROM bet_slips WHERE user_id = $1${status ? ' AND status = $2' : ''}`,
    status ? [req.user.id, status] : [req.user.id]);
  res.json({ slips: await svc.listMyBets(req.user.id, { limit, offset, status }), total: totalRow?.c || 0 });
});

router.get('/stats', async (req, res) => {
  res.json({ stats: await svc.myStats(req.user.id) });
});

// export ประวัติโพยเป็น CSV — Excel อ่านไทยได้ (มี BOM)
router.get('/export', async (req, res, next) => {
  try {
    const rows = await svc.exportMyBets(req.user.id);
    const esc = (v) => {
      const s = v == null ? '' : String(v);
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const baht = (satang) => (Number(satang || 0) / 100).toFixed(2);
    const head = ['slip_ref', 'bet_at', 'draw_code', 'category', 'type', 'rule', 'number', 'tod',
      'amount_baht', 'item_status', 'payout_baht', 'slip_status', 'total_stake_baht', 'total_payout_baht', 'settled_at'];
    const lines = [head.join(',')];
    for (const r of rows) {
      lines.push([
        r.slip_ref, r.bet_at, r.draw_code, r.category_name, r.type_name, r.rule_name,
        r.number, r.is_tod ? 'yes' : 'no',
        baht(r.amount), r.item_status, baht(r.payout), r.slip_status,
        baht(r.total_stake), baht(r.total_payout), r.settled_at || '',
      ].map(esc).join(','));
    }
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="bets-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send('﻿' + lines.join('\r\n'));
  } catch (e) { next(e); }
});

// เกมด่วน (สล็อต/ไฮโล) ใช้ตั๋ว/บัตรของตัวเอง — ค้นจาก slip_id แล้วยกเลิกผ่าน service นั้น
// คืน null ถ้าไม่ใช่โพยเกมด่วนที่ยกเลิกได้
async function cancelInstantBySlip(userId, slipId) {
  const hiloTicket = await qGet(`SELECT id FROM hilo_tickets WHERE slip_id = $1 AND user_id = $2 AND status = 'awaiting'`, [slipId, userId]);
  if (hiloTicket) return hilo.cancelTicket(userId, hiloTicket.id);
  const scratchCard = await qGet(`SELECT id FROM scratch_cards WHERE slip_id = $1 AND user_id = $2 AND status = 'hidden'`, [slipId, userId]);
  if (scratchCard) return scratch.cancelCard(userId, scratchCard.id);
  return null;
}

// ยกเลิกโพยของตัวเอง — เฉพาะตอนรอบยังเปิดรับ (คืนเครดิตเต็มจำนวน)
// โพยเกมด่วนที่ยังไม่ตัดสิน (ตั๋วไฮโล/บัตรสล็อต) ยกเลิกผ่านระบบเกมนั้นแทน
router.post('/:id/cancel', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'id ไม่ถูกต้อง');
    try {
      res.json({ ok: true, ...(await svc.cancelBet(req.user.id, id)) });
    } catch (e) {
      if (e?.code !== 'DRAW_CLOSED') throw e;
      const instant = await cancelInstantBySlip(req.user.id, id);
      if (!instant) throw e;
      res.json({ ok: true, ...instant });
    }
  } catch (e) { next(e); }
});

router.get('/slips/:ref', async (req, res, next) => {
  try {
    res.json({ slip: await svc.getMySlip(req.user.id, req.params.ref) });
  } catch (e) { next(e); }
});

// wallet (member view)
router.get('/wallet', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || '50', 10), 200);
  const offset = parseInt(req.query.offset || '0', 10);
  res.json({
    balance: await wallet.getBalance(req.user.id),
    withdrawable: await wallet.getWithdrawable(req.user.id),
    transactions: await wallet.listTransactions(req.user.id, { limit, offset }),
  });
});

// เติม/ถอนเครดิตจำลอง (demo only — ไม่มีเงินจริง)
const DEPOSIT_METHODS = {
  bank_transfer: 'โอนเงินเข้าธนาคาร',
  qr_promptpay: 'QR พร้อมเพย์',
  truemoney: 'TrueMoney Wallet',
};
const walletActionSchema = z.object({
  direction: z.enum(['deposit', 'withdraw']),
  amount: z.number().int().positive(),
  paymentMethod: z.enum(['bank_transfer', 'qr_promptpay', 'truemoney']).optional(),
  accountNo: z.string().max(50).optional(),
  idempotencyKey: z.string().max(64).optional(),
});
router.post('/wallet/action', async (req, res, next) => {
  try {
    // เมื่อตั้งค่า PromptPay แล้ว การเติม/ถอนต้องผ่าน /payments เท่านั้น
    // (มี QR + สลิป + admin approve) — กัน member mint เครดิตเองแล้วขอถอนเงินจริง
    if (isPaymentsConfigured())
      throw new HttpError(403, 'ระบบเติม/ถอนเงินจริงเปิดใช้งานแล้ว — กรุณาใช้เมนูชำระเงินในหน้า Wallet', 'USE_PAYMENTS');
    const { direction, amount, paymentMethod, accountNo, idempotencyKey } = walletActionSchema.parse(req.body);
    const methodLabel = DEPOSIT_METHODS[paymentMethod] || 'ช่องทางอื่น';
    const result = await wallet.memberWalletAction(req.user.id, {
      direction, amount, idempotencyKey,
      description: `${direction === 'deposit' ? 'เติมเครดิต' : 'ถอนเครดิต'} — ${methodLabel}${accountNo ? ` • ปลายทาง ${accountNo}` : ''} (DEMO)`,
    });
    res.json({ ok: true, ...result });
  } catch (e) { next(e); }
});

export default router;
