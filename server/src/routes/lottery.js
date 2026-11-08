import { Router } from 'express';
import * as svc from '../services/lotteryService.js';
import { getDb } from '../db/index.js';
import { requireAuth } from '../services/authService.js';
import * as settings from '../services/settingsService.js';

const router = Router();

router.get('/types', (req, res) => {
  res.json({ types: svc.listLotteryTypes() });
});

// public config สำหรับหน้าแรก (ไม่ต้อง login) — เฉพาะ key ที่ปลอดภัย
router.get('/public-config', (req, res) => {
  res.json({ banner: settings.getSetting('homepage_banner', null), announcement: settings.getSetting('announcement', null) });
});

// รายการ "ตลาดหวย" แยกย่อย — type ที่มี category จะกลายเป็นหลาย market
// key = "<type_id>:<category_id|0>" ใช้เป็น query param ?market=...
router.get('/markets', (req, res) => {
  const db = getDb();
  const types = db.prepare('SELECT id, code, name_th FROM lottery_types WHERE is_active = 1 ORDER BY id').all();
  const cats = db.prepare('SELECT id, lottery_type_id, code, name_th FROM lottery_categories ORDER BY id').all();
  const markets = [];
  for (const t of types) {
    const tCats = cats.filter(c => c.lottery_type_id === t.id);
    if (!tCats.length) {
      markets.push({ key: `${t.id}:0`, type_id: t.id, category_id: null, type_code: t.code, category_code: null, name_th: t.name_th });
    }
    for (const c of tCats) {
      markets.push({ key: `${t.id}:${c.id}`, type_id: t.id, category_id: c.id, type_code: t.code, category_code: c.code, name_th: c.name_th });
    }
  }
  res.json({ markets });
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
    // ?market=<type_id>:<category_id|0> — กรองระดับตลาดหวย (ละเอียดกว่า type)
    let lotteryTypeId = req.query.type ? Number(req.query.type) : null;
    let categoryId = undefined;
    if (req.query.market) {
      const [t, c] = String(req.query.market).split(':');
      lotteryTypeId = Number(t);
      categoryId = c === '0' || c === undefined ? null : Number(c);
    }
    const draws = svc.listDraws({
      lotteryTypeId,
      categoryId,
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

router.get('/results', (req, res) => {
  const rows = getDb().prepare(`
    SELECT lr.*, d.draw_code, d.draw_at, lt.name_th AS type_name_th, lt.code AS type_code,
           c.code AS category_code, c.name_th AS category_name_th
    FROM lottery_results lr
    JOIN lottery_draws d ON d.id = lr.draw_id
    JOIN lottery_types lt ON lt.id = d.lottery_type_id
    LEFT JOIN lottery_categories c ON c.id = d.category_id
    ORDER BY d.draw_at DESC, lr.id DESC LIMIT 100`).all();
  res.json({ results: rows });
});

export default router;
