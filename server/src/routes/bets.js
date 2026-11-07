import { Router } from 'express';
import { z } from 'zod';
import * as svc from '../services/lotteryService.js';
import * as wallet from '../services/walletService.js';
import { requireAuth } from '../services/authService.js';
import { requirePerm } from '../middleware/rbac.js';

const router = Router();
router.use(requireAuth);

const betSchema = z.object({
  drawId: z.number().int().positive(),
  items: z.array(z.object({
    ruleId: z.number().int().positive(),
    number: z.string().min(1).max(10),
    amount: z.number().int().positive(),
  })).min(1).max(50),
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
    transactions: wallet.listTransactions(req.user.id, { limit, offset }),
  });
});

export default router;
