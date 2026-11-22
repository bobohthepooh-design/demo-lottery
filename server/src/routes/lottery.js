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

router.get('/types', async (req, res) => {
  res.json({ types: await svc.listLotteryTypes() });
});

// public config สำหรับหน้าแรก (ไม่ต้อง login) — เฉพาะ key ที่ปลอดภัย
router.get('/public-config', async (req, res) => {
  res.json({
    banner: await settings.getSetting('homepage_banner', null),
    announcement: await settings.getSetting('announcement', null),
    bettingMenuEnabled: (await settings.getSetting('betting_menu_enabled', true)) !== false,
    hiddenBetTypes: await settings.getSetting('bet_menu_hidden_types', []),
    // เกมด่วน (สตางค์/ตัวคูณ) — ให้หน้าบ้านแสดงราคา+อัตราจ่าย/รางวัลปัจจุบันจากหลังบ้าน
    instantGame: {
      scratchPrice: await scratchSvc.cardPrice(),
      hiloPrice: await hiloSvc.hiloPrice(),
      scratchPrizes: await scratchSvc.prizeTable(),
      hiloMult: await hiloSvc.hiloMultipliers(),
    },
    // โปรโมชัน — cashback % (0 = ปิด)
    cashbackPercent: Number(await settings.getSetting('cashback_percent', 0)) || 0,
  });
});

// รายการ "ตลาดหวย" แยกย่อย — type ที่มี category จะกลายเป็นหลาย market
// key = "<type_id>:<category_id|0>" ใช้เป็น query param ?market=...
router.get('/markets', async (req, res) => {
  const db = getDb();
  const types = await db.prepare('SELECT id, code, name_th FROM lottery_types WHERE is_active = 1 ORDER BY id').all();
  // เฉพาะหมวดที่มี rules ใช้งานอยู่ — หมวดที่ปิดบริการ (เช่น หวยลาวพัฒนา LAD) ไม่โผล่เป็น market
  const cats = await db.prepare(`SELECT c.id, c.lottery_type_id, c.code, c.name_th
    FROM lottery_categories c
    WHERE c.is_active = 1
      AND EXISTS (SELECT 1 FROM lottery_rules r WHERE r.category_id = c.id AND r.is_active = 1)
    ORDER BY c.id`).all();
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

router.get('/types/:id', async (req, res, next) => {
  try {
    const t = await svc.getLotteryType(Number(req.params.id));
    if (!t) return res.status(404).json({ error: 'ไม่พบประเภทหวย' });
    res.json({ type: t, rules: await svc.listRules(t.id) });
  } catch (e) { next(e); }
});

router.get('/draws', async (req, res, next) => {
  try {
    // ?market=<type_id>:<category_id|0> — กรองระดับตลาดหวย (ละเอียดกว่า type)
    let lotteryTypeId = req.query.type ? Number(req.query.type) : null;
    let categoryId = undefined;
    if (req.query.market) {
      const [t, c] = String(req.query.market).split(':');
      lotteryTypeId = Number(t);
      categoryId = c === '0' || c === undefined ? null : Number(c);
    }
    const draws = await svc.listDraws({
      lotteryTypeId,
      categoryId,
      status: req.query.status || null,
      upcoming: req.query.upcoming === '1',
    });
    res.json({ draws });
  } catch (e) { next(e); }
});

router.get('/draws/:id', async (req, res, next) => {
  try {
    const d = await svc.getDraw(Number(req.params.id));
    if (!d) return res.status(404).json({ error: 'ไม่พบรอบหวย' });
    res.json({ draw: d });
  } catch (e) { next(e); }
});

router.get('/draws/:id/rules', requireAuth, async (req, res, next) => {
  try {
    const r = await svc.rulesForDraw(Number(req.params.id));
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
router.get('/draws/:id/fairness', async (req, res, next) => {
  try {
    const draw = await svc.getDraw(Number(req.params.id));
    if (!draw) return res.status(404).json({ error: 'ไม่พบรอบหวย' });
    const result = await getDb().prepare('SELECT source FROM lottery_results WHERE draw_id = ?').get(draw.id);
    res.json({ draw_code: draw.draw_code, ...fetcher.fairnessForSource(result?.source, draw.draw_code) });
  } catch (e) { next(e); }
});

// Winners board — ผู้ชนะล่าสุด (mask ชื่อเล่นเพื่อความเป็นส่วนตัว) public สำหรับหน้า engagement
router.get('/winners', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || '30', 10) || 30, 50);
  const rows = await getDb().prepare(`
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

router.get('/results', async (req, res) => {
  // เฉพาะผลล่าสุด 1 รายการต่อประเภท/หมวด — ของเก่าไม่ต้องแสดง
  const rows = await getDb().prepare(`
    WITH ranked AS (
      SELECT lr.*, d.draw_code, d.draw_at, lt.name_th AS type_name_th, lt.code AS type_code,
             c.code AS category_code, c.name_th AS category_name_th,
             ROW_NUMBER() OVER (
               PARTITION BY lt.id, COALESCE(c.id, 0)
               ORDER BY d.draw_at DESC, lr.id DESC
             ) AS rn
      FROM lottery_results lr
      JOIN lottery_draws d ON d.id = lr.draw_id
      JOIN lottery_types lt ON lt.id = d.lottery_type_id
      LEFT JOIN lottery_categories c ON c.id = d.category_id
    )
    SELECT * FROM ranked WHERE rn = 1
    ORDER BY draw_at DESC`).all();
  const sourceChecks = await fetcher.getResultSourceChecks(rows.map(r => r.draw_id));
  res.json({ results: rows.map(r => ({ ...r, source_checks: sourceChecks.get(Number(r.draw_id)) || [], fairness: fetcher.fairnessForSource(r.source, r.draw_code) })) });
});

// ประวัติผลย้อนหลังของตลาด (type_code + category_code) — settled draws ล่าสุด
router.get('/history', async (req, res, next) => {
  try {
    const typeCode = String(req.query.type_code || '').trim();
    const catCode = req.query.category_code ? String(req.query.category_code).trim() : null;
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 30, 1), 100);
    if (!typeCode) throw new HttpError(400, 'ต้องระบุ type_code');
    const rows = await getDb().prepare(`
      SELECT d.id, d.draw_code, d.draw_at, d.status,
             lt.code AS type_code, lt.name_th AS type_name_th,
             c.code AS category_code, c.name_th AS category_name_th,
             lr.winning_numbers, lr.source AS result_source, lr.published_at
      FROM lottery_draws d
      JOIN lottery_types lt ON lt.id = d.lottery_type_id
      LEFT JOIN lottery_categories c ON c.id = d.category_id
      JOIN lottery_results lr ON lr.draw_id = d.id
      WHERE lt.code = $1
        AND (($2::text IS NULL AND c.code IS NULL) OR c.code = $2)
      ORDER BY d.draw_at DESC
      LIMIT $3`).all(typeCode, catCode, limit);
    const sourceChecks = await fetcher.getResultSourceChecks(rows.map(d => d.id));
    res.json({
      draws: rows.map(d => {
        let winning = null;
        try { winning = d.winning_numbers ? JSON.parse(d.winning_numbers) : null; } catch {}
        return { ...d, winning_numbers: undefined, winning, source_checks: sourceChecks.get(Number(d.id)) || [] };
      }),
    });
  } catch (e) { next(e); }
});

// สถิติความถี่เลขย้อนหลัง — นับจากผลจริง N งวดล่าสุดของตลาด
function collectNumbers(winning) {
  const nums = [];
  const walk = v => {
    if (v == null) return;
    if (Array.isArray(v)) return v.forEach(walk);
    if (typeof v === 'string' && /^\d+$/.test(v)) nums.push(v);
    else if (typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(winning);
  return nums;
}

router.get('/stats', async (req, res, next) => {
  try {
    const typeCode = String(req.query.type_code || '').trim();
    const catCode = req.query.category_code ? String(req.query.category_code).trim() : null;
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 60, 5), 200);
    if (!typeCode) throw new HttpError(400, 'ต้องระบุ type_code');
    const rows = await getDb().prepare(`
      SELECT lr.winning_numbers
      FROM lottery_draws d
      JOIN lottery_types lt ON lt.id = d.lottery_type_id
      LEFT JOIN lottery_categories c ON c.id = d.category_id
      JOIN lottery_results lr ON lr.draw_id = d.id
      WHERE lt.code = $1
        AND (($2::text IS NULL AND c.code IS NULL) OR c.code = $2)
      ORDER BY d.draw_at DESC
      LIMIT $3`).all(typeCode, catCode, limit);
    const digitFreq = {};
    const combo = {}; // key: length-prefixed number e.g. '2:06' '3:782' '6:645654'
    const lastSeen = {}; // 'len:num' → index งวดล่าสุดที่ออก (0 = งวดล่าสุด)
    let used = 0;
    rows.forEach((r, idx) => {
      let w = null;
      try { w = r.winning_numbers ? JSON.parse(r.winning_numbers) : null; } catch {}
      if (!w) return;
      used++;
      for (const n of collectNumbers(w)) {
        for (const ch of n) digitFreq[ch] = (digitFreq[ch] || 0) + 1;
        if (/^\d{2,6}$/.test(n)) {
          const k = `${n.length}:${n}`;
          combo[k] = (combo[k] || 0) + 1;
          if (lastSeen[k] === undefined) lastSeen[k] = idx;
        }
      }
    });
    const top = (len) => Object.entries(combo)
      .filter(([k]) => k.startsWith(`${len}:`))
      .map(([k, c]) => ({ number: k.slice(len.length + 1), count: c, last_seen: lastSeen[k] ?? null }))
      .sort((a, b) => b.count - a.count || a.number.localeCompare(b.number))
      .slice(0, 12);
    // เลขค้าง — top combos ที่หายไปนานสุด (last_seen ใหญ่ = ออกนานแล้ว)
    const overdue = Object.entries(combo)
      .map(([k, c]) => ({ k, c, seen: lastSeen[k] ?? 999 }))
      .filter(x => x.c >= 2 && x.seen >= 5)
      .sort((a, b) => b.seen - a.seen || b.c - a.c)
      .slice(0, 10)
      .map(x => ({ key: x.k, count: x.c, draws_ago: x.seen }));
    res.json({
      draws_used: used,
      digit_freq: Object.fromEntries('0123456789'.split('').map(d => [d, digitFreq[d] || 0])),
      top2: top('2'), top3: top('3'), top4: top('4'), top6: top('6'),
      overdue,
    });
  } catch (e) { next(e); }
});

// ตรวจเลข — ใส่เลข + เลือกรอบที่ออกผลแล้ว → บอกว่าถูกรางวัลอะไรบ้าง (public, ไม่ต้อง login)
router.get('/check', async (req, res, next) => {
  try {
    const drawId = Number(req.query.draw_id);
    if (!Number.isInteger(drawId) || drawId <= 0) throw new HttpError(400, 'ต้องระบุ draw_id');
    const draw = await svc.getDraw(drawId);
    if (!draw) throw new HttpError(404, 'ไม่พบรอบหวย');
    const row = await getDb().prepare('SELECT winning_numbers, source FROM lottery_results WHERE draw_id = ?').get(drawId);
    if (!row) throw new HttpError(400, 'รอบนี้ยังไม่ออกผล — เลือกรอบที่ออกผลแล้ว');
    let winning;
    try { winning = JSON.parse(row.winning_numbers); }
    catch { throw new HttpError(400, 'ข้อมูลผลรางวัลไม่ถูกต้อง'); }
    svc.mergeAnnounce(winning, draw.announce);
    const rules = await svc.listRules(draw.lottery_type_id, { categoryId: draw.category_id });
    const numbers = String(req.query.numbers || '').split(/[\s,;]+/).map(s => s.trim()).filter(Boolean).slice(0, 20);
    if (!numbers.length) throw new HttpError(400, 'กรุณาใส่เลขอย่างน้อย 1 เลข (คั่นด้วยช่องว่างหรือ ,)');

    const out = numbers.map(num => {
      const hits = [];
      for (const r of rules) {
        try { svc.validateBetNumber(r, num); } catch { continue; } // เลขไม่ตรงจำนวนหลักของกติกานี้ — ข้าม
        const win = svc.evaluateBet(r, num, winning, {});
        if (win.win) hits.push({ name: r.name_th, kind: 'เต็ง', mult: win.multiplier });
        else {
          const tod = svc.evaluateBet(r, num, winning, { todBet: true });
          if (tod.win) hits.push({ name: r.name_th, kind: 'โต๊ด', mult: tod.multiplier });
        }
      }
      return { number: num, hits };
    });
    res.json({
      draw: {
        id: draw.id, draw_code: draw.draw_code, draw_at: draw.draw_at,
        type_name_th: draw.type_name_th, category_name_th: draw.category_name_th,
      },
      winning,
      numbers: out,
    });
  } catch (e) { next(e); }
});

// ผลรางวัล + ตารางออกรางวัลของวันที่ระบุ (วันไทย) — ?date=YYYY-MM-DD (default: วันนี้)
router.get('/today', async (req, res) => {
  const qd = String(req.query.date || '');
  const bkkToday = /^\d{4}-\d{2}-\d{2}$/.test(qd) ? qd : new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
  const draws = await getDb().prepare(`
    SELECT d.id, d.draw_code, d.draw_at, d.close_at, d.status,
           lt.code AS type_code, lt.name_th AS type_name_th,
           c.code AS category_code, c.name_th AS category_name_th,
           lr.winning_numbers, lr.source AS result_source, lr.published_at
    FROM lottery_draws d
    JOIN lottery_types lt ON lt.id = d.lottery_type_id
    LEFT JOIN lottery_categories c ON c.id = d.category_id
    LEFT JOIN lottery_results lr ON lr.draw_id = d.id
    WHERE lt.is_active = 1 AND d.draw_code NOT LIKE '%-STANDING'
      AND to_char((d.draw_at::timestamp + interval '7 hours'), 'YYYY-MM-DD') = $1
    ORDER BY d.draw_at`).all(bkkToday);
  const sourceChecks = await fetcher.getResultSourceChecks(draws.map(d => d.id));
  res.json({
    date: bkkToday,
    draws: draws.map(d => {
      let winning = null;
      try { winning = d.winning_numbers ? JSON.parse(d.winning_numbers) : null; } catch {}
      return { ...d, winning_numbers: undefined, winning, result_kind: d.result_source ? 'real' : null, source_checks: sourceChecks.get(Number(d.id)) || [] };
    }),
  });
});

export default router;
