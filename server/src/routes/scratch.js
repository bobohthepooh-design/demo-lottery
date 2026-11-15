import { Router } from 'express';
import { requireAuth } from '../services/authService.js';
import * as scratch from '../services/scratchService.js';
import { HttpError } from '../lib/audit.js';

const router = Router();
router.use(requireAuth);

// ซื้อบัตรขูด 1 ใบ (ราคา/รางวัลกำหนดฝั่ง server)
router.post('/buy', (req, res, next) => {
  try { res.status(201).json({ ok: true, ...scratch.buyCard(req.user.id) }); }
  catch (e) { next(e); }
});

// บัตรขูดของฉัน — ใช้ resume ขูดต่อได้
router.get('/mine', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || '50', 10), 100);
  res.json({ cards: scratch.listMyCards(req.user.id, { limit }) });
});

// เปิดเผยผลหลังขูดครบ — เครดิตรางวัลทันทีถ้าถูก
router.post('/:id/reveal', (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'id ไม่ถูกต้อง');
    res.json({ ok: true, ...scratch.revealCard(req.user.id, id) });
  } catch (e) { next(e); }
});

// ตรวจสอบผลย้อนหลังด้วย server_seed ที่เผยหลัง reveal (provably fair)
router.post('/verify', (req, res, next) => {
  try { res.json({ ok: true, ...scratch.verifyScratchSeed(String(req.body?.seed || '')) }); }
  catch (e) { next(e); }
});

router.get('/:id', (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'id ไม่ถูกต้อง');
    res.json({ card: scratch.getCard(req.user.id, id) });
  } catch (e) { next(e); }
});

export default router;
