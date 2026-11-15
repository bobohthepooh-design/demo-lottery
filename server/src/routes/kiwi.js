import { Router } from 'express';
import { requireAuth, requireAgeConfirmed } from '../services/authService.js';
import * as kiwi from '../services/kiwiService.js';
import { HttpError } from '../lib/audit.js';

const router = Router();
router.use(requireAuth);

// ข้อมูลเกม (ราคา/อัตราจ่าย) — ใช้ก่อนเล่น
router.get('/info', async (req, res) => {
  res.json({ games: await kiwi.kiwiInfo() });
});

router.get('/mine', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || '50', 10), 100);
  res.json({ tickets: await kiwi.listMyKiwi(req.user.id, { limit }) });
});

// เล่น — body { game: 'kiwi'|'kiwi_vip', picks: [...] } จบในคำขอเดียว
router.post('/play', requireAgeConfirmed, async (req, res, next) => {
  try {
    const game = String(req.body?.game || '');
    res.json({ ok: true, ...(await kiwi.playKiwi(req.user.id, game, req.body?.picks, req.body?.betType, req.body?.idempotencyKey)) });
  } catch (e) { next(e); }
});

// ตรวจสอบผลย้อนหลังด้วย server_seed (provably fair)
router.post('/verify', async (req, res, next) => {
  try {
    res.json({ ok: true, ...(await kiwi.verifyKiwiSeed(String(req.body?.game || ''), String(req.body?.seed || ''))) });
  } catch (e) { next(e); }
});

export default router;
