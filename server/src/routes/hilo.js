import { Router } from 'express';
import { requireAuth } from '../services/authService.js';
import * as hilo from '../services/hiloService.js';
import { HttpError } from '../lib/audit.js';

const router = Router();
router.use(requireAuth);

// ซื้อรอบใหม่ — body ว่าง
router.post('/buy', (req, res, next) => {
  try { res.status(201).json({ ok: true, ...hilo.buyTicket(req.user.id) }); }
  catch (e) { next(e); }
});

router.get('/mine', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || '50', 10), 100);
  res.json({ tickets: hilo.listMyTickets(req.user.id, { limit }) });
});

// เล่นจบในคำขอเดียว — body { pick: 'high'|'low'|'eleven' } ซื้อ+ทาย+เปิดเต๋าทันที
router.post('/play', (req, res, next) => {
  try {
    const pick = String(req.body?.pick || '');
    res.json({ ok: true, ...hilo.playTicket(req.user.id, pick) });
  } catch (e) { next(e); }
});

// ทาย — body { pick: 'high'|'low' } → settle ทันที (สำหรับตั๋ว awaiting ที่ซื้อไว้ก่อน)
router.post('/:id/guess', (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'id ไม่ถูกต้อง');
    const pick = String(req.body?.pick || '');
    res.json({ ok: true, ...hilo.guessTicket(req.user.id, id, pick) });
  } catch (e) { next(e); }
});

// ตรวจสอบผลย้อนหลังด้วย server_seed ที่เผยหลัง reveal (provably fair)
router.post('/verify', (req, res, next) => {
  try { res.json({ ok: true, ...hilo.verifyHiloSeed(String(req.body?.seed || '')) }); }
  catch (e) { next(e); }
});

router.get('/:id', (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'id ไม่ถูกต้อง');
    const rows = hilo.listMyTickets(req.user.id, { limit: 200 });
    const t = rows.find(x => x.id === id);
    if (!t) throw new HttpError(404, 'ไม่พบตั๋ว');
    res.json({ ticket: t });
  } catch (e) { next(e); }
});

export default router;
