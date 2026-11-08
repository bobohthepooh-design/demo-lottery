import { Router } from 'express';
import { z } from 'zod';
import * as svc from '../services/lotteryService.js';
import * as wallet from '../services/walletService.js';
import { requireAuth } from '../services/authService.js';
import { requirePerm } from '../middleware/rbac.js';
import { HttpError } from '../lib/audit.js';

const router = Router();
router.use(requireAuth);

const betSchema = z.object({
  drawId: z.number().int().positive(),
  items: z.array(z.object({
    ruleId: z.number().int().positive(),
    number: z.string().min(1).max(20),
    amount: z.number().int().positive(),
  })).min(1).max(50),
  idempotencyKey: z.string().max(64).optional(),
});

router.post('/', (req, res, next) => {
  try {
    const data = betSchema.parse(req.body);
    const result = svc.placeBet(req.user.id, data);
    res.status(201).json({ ok: true, ...result });
  } catch (e) { next(e); }
});

router.get('/mine', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || '50', 10), 200);
  const offset = parseInt(req.query.offset || '0', 10);
  res.json({ slips: svc.listMyBets(req.user.id, { limit, offset }) });
});

router.get('/stats', (req, res) => {
  res.json({ stats: svc.myStats(req.user.id) });
});

// ยกเลิกโพยของตัวเอง — เฉพาะตอนรอบยังเปิดรับ (คืนเครดิตเต็มจำนวน)
router.post('/:id/cancel', (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'id ไม่ถูกต้อง');
    res.json({ ok: true, ...svc.cancelBet(req.user.id, id) });
  } catch (e) { next(e); }
});

router.get('/slips/:ref', (req, res, next) => {
  try {
    res.json({ slip: svc.getMySlip(req.user.id, req.params.ref) });
  } catch (e) { next(e); }
});

// wallet (member view)
router.get('/wallet', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || '50', 10), 200);
  const offset = parseInt(req.query.offset || '0', 10);
  res.json({
    balance: wallet.getBalance(req.user.id),
    withdrawable: wallet.getWithdrawable(req.user.id),
    transactions: wallet.listTransactions(req.user.id, { limit, offset }),
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
});
router.post('/wallet/action', (req, res, next) => {
  try {
    const { direction, amount, paymentMethod } = walletActionSchema.parse(req.body);
    const result = wallet.memberWalletAction(req.user.id, {
      direction, amount,
      description: direction === 'deposit'
        ? `เติมเครดิต — ${DEPOSIT_METHODS[paymentMethod] || 'ช่องทางอื่น'} (DEMO)`
        : 'ถอนเครดิตจำลอง',
    });
    res.json({ ok: true, ...result });
  } catch (e) { next(e); }
});

export default router;
