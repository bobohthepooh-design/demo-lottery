import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireAgeConfirmed } from '../services/authService.js';
import * as pay from '../services/paymentService.js';
import { HttpError } from '../lib/audit.js';
import QRCode from 'qrcode';

const router = Router();
router.use(requireAuth, requireAgeConfirmed);

const depositSchema = z.object({
  amount: z.number().int().positive(),
  method: z.enum(['promptpay', 'bank_transfer']).optional(),
});
const slipSchema = z.object({
  imageBase64: z.string().min(100).max(7 * 1024 * 1024), // ~5MB binary
});
const withdrawSchema = z.object({
  amount: z.number().int().positive(),
  bankName: z.string().min(1).max(100),
  accountNo: z.string().min(5).max(30),
  accountName: z.string().min(1).max(150),
  promptpayId: z.string().max(20).optional(), // พร้อมเพย์ที่ผู้ใช้ระบุ — admin เทียบกับเบอร์ OTP ที่ verify แล้ว
});

// GET /payments — รายการคำขอของฉัน + สถานะระบบชำระเงิน
router.get('/', async (req, res, next) => {
  try {
    res.json({
      requests: await pay.listMine(req.user.id),
      paymentsConfigured: pay.isPaymentsConfigured(),
      slipVerifyConfigured: pay.isSlipVerifyConfigured(),
    });
  } catch (e) { next(e); }
});

// POST /payments/deposit — สร้างคำขอเติม → QR พร้อมเพย์ + ref
router.post('/deposit', async (req, res, next) => {
  try {
    const { amount, method } = depositSchema.parse(req.body);
    const r = await pay.createDeposit(req.user.id, { amount, method });
    const qrDataUrl = await QRCode.toDataURL(r.payload, { margin: 1, width: 280 });
    res.json({ ok: true, id: r.id, reference: r.reference, amount: r.amount, qrDataUrl, payload: r.payload });
  } catch (e) { next(e); }
});

// POST /payments/:id/slip — อัปโหลดสลิป → verify อัตโนมัติ (SlipOK) หรือรอ admin
router.post('/:id/slip', async (req, res, next) => {
  try {
    const { imageBase64 } = slipSchema.parse(req.body);
    const r = await pay.submitDepositSlip(req.user.id, Number(req.params.id), { imageBase64 });
    res.json({ ok: true, ...r });
  } catch (e) { next(e); }
});

// POST /payments/withdraw — คำขอถอน → รอแอดมินอนุมัติ
router.post('/withdraw', async (req, res, next) => {
  try {
    const body = withdrawSchema.parse(req.body);
    const r = await pay.createWithdraw(req.user.id, body);
    res.json({ ok: true, ...r });
  } catch (e) { next(e); }
});

export default router;
