import { Router } from 'express';
import * as svc from '../services/lotteryService.js';
import { getDb } from '../db/index.js';
import { requireAuth } from '../services/authService.js';

const router = Router();

router.get('/types', (req, res) => {
  res.json({ types: svc.listLotteryTypes() });
});

router.get('/types/:id', (req, res, next) => {
  try {
    const t = svc.getLotteryType(Number(req.params.id));
    if (!t) return res.status(404).json({ error: 'ไม่พบประเภทหวย' });
    res.json({ type: t, rules: svc.listRules(t.id) });
  } catch (e) { next(e); }
});

router.get('/draws', (req, res, next) => {
  try {
    const draws = svc.listDraws({
      lotteryTypeId: req.query.type ? Number(req.query.type) : null,
      upcoming: req.query.upcoming === '1',
    });
    res.json({ draws });
  } catch (e) { next(e); }
});

router.get('/draws/:id', (req, res, next) => {
  try {
    const d = svc.getDraw(Number(req.params.id));
    if (!d) return res.status(404).json({ error: 'ไม่พบรอบหวย' });
    res.json({ draw: d });
  } catch (e) { next(e); }
});

router.get('/draws/:id/rules', requireAuth, (req, res, next) => {
  try {
    const r = svc.rulesForDraw(Number(req.params.id));
    if (!r) return res.status(404).json({ error: 'ไม่พบรอบหวย' });
    res.json({ rules: r.rules });
  } catch (e) { next(e); }
});

router.get('/results', requireAuth, (req, res) => {
  const rows = getDb().prepare(`
    SELECT lr.*, d.draw_code, d.draw_at, lt.name_th AS type_name_th, lt.code AS type_code
    FROM lottery_results lr
    JOIN lottery_draws d ON d.id = lr.draw_id
    JOIN lottery_types lt ON lt.id = d.lottery_type_id
    ORDER BY lr.published_at DESC LIMIT 100`).all();
  res.json({ results: rows });
});

export default router;
