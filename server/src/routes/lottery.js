import { Router } from 'express';
import * as svc from '../services/lotteryService.js';
import { getDb } from '../db/index.js';
import { requireAuth } from '../services/authService.js';
import * as settings from '../services/settingsService.js';
import * as scratchSvc from '../services/scratchService.js';
import * as hiloSvc from '../services/hiloService.js';
import * as luckySvc from '../services/luckyService.js';
import * as fetcher from '../services/resultFetcher.js';
import { HttpError } from '../lib/audit.js';

const router = Router();

router.get('/types', (req, res) => {
  res.json({ types: svc.listLotteryTypes() });
});

// public config สำหรับหน้าแรก (ไม่ต้อง login) — เฉพาะ key ที่ปลอดภัย
router.get('/public-config', (req, res) => {
  res.json({
    banner: settings.getSetting('homepage_banner', null),
    announcement: settings.getSetting('announcement', null),
    bettingMenuEnabled: settings.getSetting('betting_menu_enabled', true) !== false,
    hiddenBetTypes: settings.getSetting('bet_menu_hidden_types', []),
    // เกมด่วน (สตางค์/ตัวคูณ) — ให้หน้าบ้านแสดงราคา+อัตราจ่าย/รางวัลปัจจุบันจากหลังบ้าน
    instantGame: {
      scratchPrice: scratchSvc.cardPrice(),
      hiloPrice: hiloSvc.hiloPrice(),
      scratchPrizes: scratchSvc.prizeTable(),
      hiloMult: hiloSvc.hiloMultipliers(),
    },
    // โปรโมชัน — cashback % (0 = ปิด)
    cashbackPercent: Number(settings.getSetting('cashback_percent', 0)) || 0,
  });
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

// เลขเด็ด/เลขดัง — สถิติความถี่จากผลจริง (lotterychecks.com) public
router.get('/lucky', async (req, res, next) => {
  try { res.json(await luckySvc.getLuckyNumbers()); }
  catch (e) { next(e); }
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

// provably fair — คำนวณผลซ้ำจาก seed descriptor (kind + draw_code) เพื่อตรวจสอบผลที่ระบบ generate
router.get('/fairness/gen', (req, res, next) => {
  try {
    const kind = String(req.query.kind || '');
    const code = String(req.query.code || '').slice(0, 100);
    if (!code) throw new HttpError(400, 'ต้องระบุ code');
    res.json({ kind, code, winning: fetcher.generateByKind(kind, code) });
  } catch (e) { next(e); }
});

// fairness ของรอบหนึ่งๆ — บอกว่าวิธีที่ผลถูกสร้าง (deterministic/external/manual)
router.get('/draws/:id/fairness', (req, res, next) => {
  try {
    const draw = svc.getDraw(Number(req.params.id));
    if (!draw) return res.status(404).json({ error: 'ไม่พบรอบหวย' });
    const result = getDb().prepare('SELECT source FROM lottery_results WHERE draw_id = ?').get(draw.id);
    res.json({ draw_code: draw.draw_code, ...fetcher.fairnessForSource(result?.source, draw.draw_code) });
  } catch (e) { next(e); }
});

// Winners board — ผู้ชนะล่าสุด (mask ชื่อเล่นเพื่อความเป็นส่วนตัว) public สำหรับหน้า engagement
router.get('/winners', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || '30', 10) || 30, 50);
  const rows = getDb().prepare(`
    SELECT bi.number, bi.amount, bi.payout, bi.bet_type, bi.is_tod,
           r.name_th AS rule_name_th,
           bs.slip_ref, bs.settled_at,
           d.draw_code, d.draw_at, lt.code AS type_code, lt.name_th AS type_name_th,
           c.name_th AS category_name_th,
           u.display_name, u.username
    FROM bet_items bi
    JOIN bet_slips bs ON bs.id = bi.slip_id
    JOIN lottery_rules r ON r.id = bi.rule_id
    JOIN lottery_draws d ON d.id = bi.draw_id
    JOIN lottery_types lt ON lt.id = d.lottery_type_id
    LEFT JOIN lottery_categories c ON c.id = d.category_id
    JOIN users u ON u.id = bs.user_id
    WHERE bi.status = 'won' AND bi.payout > 0
    ORDER BY bs.settled_at DESC, bi.payout DESC
    LIMIT ?`).all(limit);
  // mask ชื่อ — แสดงตัวแรก + *** เท่านั้น (privacy)
  const mask = (s) => {
    const n = String(s || 'สมาชิก').trim();
    return n.length <= 1 ? n : `${n[0]}***`;
  };
  res.json({
    winners: rows.map(r => ({
      number: r.number, amount: r.amount, payout: r.payout,
      betType: r.bet_type, isTod: !!r.is_tod, ruleName: r.rule_name_th,
      slipRef: r.slip_ref, settledAt: r.settled_at,
      drawCode: r.draw_code, drawAt: r.draw_at,
      typeCode: r.type_code, typeName: r.category_name_th || r.type_name_th,
      player: mask(r.display_name || r.username),
    })),
  });
});

router.get('/results', (req, res) => {
  // เฉพาะผลล่าสุด 1 รายการต่อประเภท/หมวด — ของเก่าไม่ต้องแสดง
  const rows = getDb().prepare(`
    WITH ranked AS (
      SELECT lr.*, d.draw_code, d.draw_at, lt.name_th AS type_name_th, lt.code AS type_code,
             c.code AS category_code, c.name_th AS category_name_th,
             ROW_NUMBER() OVER (
               PARTITION BY lt.id, COALESCE(c.id, 0)
               ORDER BY COALESCE(lr.published_at, d.draw_at) DESC, lr.id DESC
             ) AS rn
      FROM lottery_results lr
      JOIN lottery_draws d ON d.id = lr.draw_id
      JOIN lottery_types lt ON lt.id = d.lottery_type_id
      LEFT JOIN lottery_categories c ON c.id = d.category_id
    )
    SELECT * FROM ranked WHERE rn = 1
    ORDER BY COALESCE(published_at, draw_at) DESC`).all();
  res.json({ results: rows.map(r => ({ ...r, fairness: fetcher.fairnessForSource(r.source, r.draw_code) })) });
});

export default router;
