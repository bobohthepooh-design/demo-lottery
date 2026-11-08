import { getDb, tx, makeReference } from '../db/index.js';
import { HttpError, audit } from '../lib/audit.js';
import { debitForBetTx, creditTx, getBalance } from './walletService.js';

export const BET_TYPES = ['2top', '2bottom', '3top', '3tod', 'run_top', 'run_bottom'];

function nowSql() { return new Date().toISOString().replace('T', ' ').slice(0, 19); }

/** Convert naive local datetime string ('YYYY-MM-DD HH:MM[:SS]' or ISO) to UTC sql string. */
export function toUtcSql(input) {
  const s = String(input).replace('T', ' ').slice(0, 19);
  const d = new Date(s.length === 16 ? s + ':00' : s);
  if (isNaN(d)) throw new HttpError(400, 'รูปแบบวันที่เวลาไม่ถูกต้อง');
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

export function listLotteryTypes({ activeOnly = true } = {}) {
  const db = getDb();
  return activeOnly
    ? db.prepare('SELECT * FROM lottery_types WHERE is_active = 1 ORDER BY id').all()
    : db.prepare('SELECT * FROM lottery_types ORDER BY id').all();
}

export function getLotteryType(id) {
  return getDb().prepare('SELECT * FROM lottery_types WHERE id = ?').get(id);
}

export function listRules(lotteryTypeId, { activeOnly = true, categoryId = undefined } = {}) {
  const db = getDb();
  let sql = `SELECT * FROM lottery_rules WHERE lottery_type_id = ? ${activeOnly ? 'AND is_active = 1' : ''}`;
  const args = [lotteryTypeId];
  if (categoryId !== undefined) { sql += ' AND COALESCE(category_id,0) = COALESCE(?,0)'; args.push(categoryId); }
  sql += ' ORDER BY bet_type';
  return db.prepare(sql).all(...args);
}

/** Rules that apply to a specific draw (type + category). */
export function rulesForDraw(drawId) {
  const draw = getDraw(drawId);
  if (!draw) return null;
  return { draw, rules: listRules(draw.lottery_type_id, { categoryId: draw.category_id }) };
}

export function listDraws({ lotteryTypeId = null, categoryId = undefined, status = null, upcoming = false } = {}) {
  const db = getDb();
  let sql = `SELECT d.*, lt.code AS type_code, lt.name_th AS type_name_th, lt.result_mode AS result_mode,
                    c.code AS category_code, c.name_th AS category_name_th
             FROM lottery_draws d
             JOIN lottery_types lt ON lt.id = d.lottery_type_id
             LEFT JOIN lottery_categories c ON c.id = d.category_id
             WHERE 1=1`;
  const args = [];
  if (lotteryTypeId) { sql += ' AND d.lottery_type_id = ?'; args.push(lotteryTypeId); }
  if (categoryId !== undefined) {
    if (categoryId === null) sql += ' AND d.category_id IS NULL';
    else { sql += ' AND d.category_id = ?'; args.push(categoryId); }
  }
  if (status) { sql += ' AND d.status = ?'; args.push(status); }
  if (upcoming) sql += ` AND d.status IN ('scheduled','open') AND d.close_at > '${nowSql()}'`;
  sql += ' ORDER BY d.draw_at DESC LIMIT 200';
  return db.prepare(sql).all(...args);
}

export function getDraw(id) {
  const db = getDb();
  return db.prepare(`SELECT d.*, lt.code AS type_code, lt.name_th AS type_name_th, lt.result_mode AS result_mode,
                            c.code AS category_code, c.name_th AS category_name_th
                     FROM lottery_draws d
                     JOIN lottery_types lt ON lt.id = d.lottery_type_id
                     LEFT JOIN lottery_categories c ON c.id = d.category_id
                     WHERE d.id = ?`).get(id);
}

export function isDrawOpen(draw) {
  if (!draw) return false;
  if (draw.status === 'open' && draw.close_at > nowSql()) return true;
  // auto-transition stale draws
  if (draw.status === 'open' && draw.close_at <= nowSql()) {
    getDb().prepare(`UPDATE lottery_draws SET status = 'closed', updated_at = datetime('now') WHERE id = ?`).run(draw.id);
    return false;
  }
  return false;
}

export function validateBetNumber(rule, number) {
  // หวยลาวพัฒนา 5/45 — เลือก 5 เลขไม่ซ้ำกันจาก 1-45 คั่นด้วย -
  if (rule.bet_type === 'pattana5') {
    const parts = String(number).split('-').map(s => s.trim());
    if (parts.length !== 5 || !parts.every(p => /^\d{1,2}$/.test(p)))
      throw new HttpError(400, 'สลากพัฒนา 5/45 ต้องเป็น 5 ตัวเลข 1-45 คั่นด้วย - เช่น 05-12-23-34-45');
    const nums = parts.map(Number);
    if (nums.some(n => n < 1 || n > 45)) throw new HttpError(400, 'เลขต้องอยู่ระหว่าง 1-45');
    if (new Set(nums).size !== 5) throw new HttpError(400, 'เลขทั้ง 5 ต้องไม่ซ้ำกัน');
    return nums.sort((a, b) => a - b).map(n => String(n).padStart(2, '0')).join('-');
  }
  if (!/^\d+$/.test(number || '')) throw new HttpError(400, `หมายเลขต้องเป็นตัวเลขล้วน (${rule.name_th})`);
  if (number.length !== rule.digits) throw new HttpError(400, `${rule.name_th} ต้องเป็น ${rule.digits} หลัก`);
  return number;
}

/**
 * Place a bet slip. items: [{ ruleId, number, amount }] — amount in satang, multiple of stake_unit.
 * All-or-nothing inside one DB transaction.
 */
export function placeBet(userId, { drawId, items, idempotencyKey = null }) {
  if (!Array.isArray(items) || items.length === 0) throw new HttpError(400, 'กรุณาเลือกอย่างน้อย 1 รายการ');
  if (items.length > 50) throw new HttpError(400, 'สูงสุด 50 รายการต่อโพย');
  if (idempotencyKey !== null && (typeof idempotencyKey !== 'string' || idempotencyKey.length > 64))
    throw new HttpError(400, 'idempotencyKey ไม่ถูกต้อง');

  const db = getDb();
  const draw = getDraw(drawId);
  if (!draw) throw new HttpError(404, 'ไม่พบรอบหวย');
  if (!isDrawOpen(draw)) throw new HttpError(400, 'รอบหวยนี้ไม่เปิดรับโพย', 'DRAW_CLOSED');

  // Resolve rules (must belong to draw's lottery type, active)
  const slipRef = makeReference('BET');
  const resolved = items.map(it => {
    const rule = db.prepare(`SELECT * FROM lottery_rules
                             WHERE id = ? AND lottery_type_id = ? AND is_active = 1
                               AND COALESCE(category_id, 0) = COALESCE(?, 0)`)
      .get(it.ruleId, draw.lottery_type_id, draw.category_id);
    if (!rule) throw new HttpError(400, `ประเภทการแทงไม่ถูกต้องหรือปิดใช้งาน (rule ${it.ruleId})`);
    const number = validateBetNumber(rule, String(it.number ?? '').trim());
    const amount = Number(it.amount);
    if (!Number.isInteger(amount) || amount <= 0) throw new HttpError(400, 'จำนวนเงินแทงไม่ถูกต้อง');
    if (amount % rule.stake_unit !== 0) throw new HttpError(400, `จำนวนเงินต้องเป็นหน่วย ${rule.stake_unit} สตางค์`);
    if (amount < rule.min_amount) throw new HttpError(400, `ขั้นต่ำ ${rule.min_amount} สตางค์`);
    if (rule.max_amount && amount > rule.max_amount) throw new HttpError(400, `สูงสุด ${rule.max_amount} สตางค์`);
    return { rule, number, amount };
  });

  const totalStake = resolved.reduce((s, r) => s + r.amount, 0);

  const lookupExisting = (d) => idempotencyKey
    ? d.prepare(`SELECT id, slip_ref, total_stake FROM bet_slips WHERE user_id = ? AND idempotency_key = ?`)
        .get(userId, idempotencyKey)
    : null;

  try {
    return tx((d) => {
      // idempotent retry: same key returns the already-created slip
      const existing = lookupExisting(d);
      if (existing) {
        return { slipRef: existing.slip_ref, slipId: existing.id, totalStake: existing.total_stake,
          balance: getBalance(userId), duplicate: true };
      }

      // re-check draw is still open inside the transaction (TOCTOU guard)
      const cur = d.prepare('SELECT status, close_at FROM lottery_draws WHERE id = ?').get(drawId);
      if (!cur || cur.status !== 'open' || cur.close_at <= nowSql())
        throw new HttpError(400, 'รอบหวยนี้ไม่เปิดรับโพยแล้ว', 'DRAW_CLOSED');

      const slip = d.prepare(`INSERT INTO bet_slips (slip_ref, user_id, draw_id, status, total_stake, idempotency_key)
                              VALUES (?, ?, ?, 'pending', ?, ?)`)
        .run(slipRef, userId, drawId, totalStake, idempotencyKey);
      const slipId = Number(slip.lastInsertRowid);

      const insItem = d.prepare(`INSERT INTO bet_items (slip_id, draw_id, rule_id, bet_type, number, amount)
                                 VALUES (?, ?, ?, ?, ?, ?)`);
      for (const r of resolved) {
        insItem.run(slipId, drawId, r.rule.id, r.rule.bet_type, r.number, r.amount);
      }

      debitForBetTx(d, {
        userId, slipRef, totalStake,
        idempotencyKey: `bet-debit-${slipRef}`,
      });

      audit({ userId, action: 'bet.place', entityType: 'bet_slip', entityId: slipRef,
        detail: { drawId, totalStake, items: resolved.map(r => ({ t: r.rule.bet_type, n: r.number, a: r.amount })) } });

      return { slipRef, slipId, totalStake, balance: getBalance(userId) };
    });
  } catch (e) {
    // concurrent same-key submit: unique index rejected the insert — return the winner's slip
    if (idempotencyKey && /UNIQUE|constraint/i.test(String(e.message))) {
      const db = getDb();
      const existing = db.prepare(`SELECT id, slip_ref, total_stake FROM bet_slips WHERE user_id = ? AND idempotency_key = ?`)
        .get(userId, idempotencyKey);
      if (existing) return { slipRef: existing.slip_ref, slipId: existing.id,
        totalStake: existing.total_stake, balance: getBalance(userId), duplicate: true };
    }
    throw e;
  }
}

export function listMyBets(userId, { limit = 50, offset = 0 } = {}) {
  const db = getDb();
  const slips = db.prepare(`SELECT bs.*, d.draw_code, d.draw_at, d.status AS draw_status, lt.name_th AS type_name_th,
                                  c.name_th AS category_name_th
                           FROM bet_slips bs
                           JOIN lottery_draws d ON d.id = bs.draw_id
                           JOIN lottery_types lt ON lt.id = d.lottery_type_id
                           LEFT JOIN lottery_categories c ON c.id = d.category_id
                           WHERE bs.user_id = ? ORDER BY bs.id DESC LIMIT ? OFFSET ?`)
    .all(userId, limit, offset);
  const itemStmt = db.prepare(`SELECT bi.id, bi.bet_type, bi.number, bi.amount, bi.status, bi.payout, bi.result_detail,
                                     lr.name_th AS rule_name_th, lr.payout_multiplier
                              FROM bet_items bi JOIN lottery_rules lr ON lr.id = bi.rule_id
                              WHERE bi.slip_id = ?`);
  return slips.map(s => ({ ...s, items: itemStmt.all(s.id) }));
}

// สรุปผลการเล่นของสมาชิก — ใช้หน้า "ผลงานของฉัน"
export function myStats(userId) {
  const db = getDb();
  const totals = db.prepare(`SELECT
      COUNT(*) AS slips,
      COALESCE(SUM(total_stake),0) AS stake,
      COALESCE(SUM(total_payout),0) AS payout,
      COALESCE(SUM(CASE WHEN status = 'pending' THEN total_stake ELSE 0 END),0) AS pending_stake,
      SUM(CASE WHEN status = 'won' THEN 1 ELSE 0 END) AS won_slips,
      SUM(CASE WHEN status = 'lost' THEN 1 ELSE 0 END) AS lost_slips,
      SUM(CASE WHEN status = 'partial' THEN 1 ELSE 0 END) AS partial_slips
    FROM bet_slips WHERE user_id = ? AND status NOT IN ('cancelled','refunded')`).get(userId);

  const items = db.prepare(`SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN bi.status = 'won' THEN 1 ELSE 0 END) AS won,
      SUM(CASE WHEN bi.status = 'lost' THEN 1 ELSE 0 END) AS lost,
      SUM(CASE WHEN bi.status = 'pending' THEN 1 ELSE 0 END) AS pending,
      COALESCE(SUM(bi.payout),0) AS payout,
      COALESCE(SUM(bi.amount),0) AS stake
    FROM bet_items bi JOIN bet_slips bs ON bs.id = bi.slip_id
    WHERE bs.user_id = ? AND bi.status != 'cancelled' AND bs.status NOT IN ('cancelled','refunded')`).get(userId);

  const byType = db.prepare(`SELECT lt.name_th AS type_name_th, lt.code AS type_code,
        COUNT(DISTINCT bs.id) AS slips,
        COALESCE(SUM(bi.amount),0) AS stake,
        COALESCE(SUM(bi.payout),0) AS payout,
        SUM(CASE WHEN bi.status = 'won' THEN 1 ELSE 0 END) AS won_items
      FROM bet_items bi
      JOIN bet_slips bs ON bs.id = bi.slip_id
      JOIN lottery_draws d ON d.id = bs.draw_id
      JOIN lottery_types lt ON lt.id = d.lottery_type_id
      WHERE bs.user_id = ? AND bi.status != 'cancelled' AND bs.status NOT IN ('cancelled','refunded')
      GROUP BY lt.id ORDER BY stake DESC`).all(userId);

  const best = db.prepare(`SELECT bs.slip_ref, bs.total_payout, d.draw_code,
        lt.name_th AS type_name_th, bs.settled_at
      FROM bet_slips bs
      JOIN lottery_draws d ON d.id = bs.draw_id
      JOIN lottery_types lt ON lt.id = d.lottery_type_id
      WHERE bs.user_id = ? AND bs.status IN ('won','partial') AND bs.total_payout > 0
      ORDER BY bs.total_payout DESC LIMIT 1`).get(userId);

  const settledItems = (items.won || 0) + (items.lost || 0);
  return {
    totals: {
      slips: totals.slips || 0,
      stake: totals.stake || 0,
      payout: totals.payout || 0,
      net: (totals.payout || 0) - (totals.stake || 0),
      pendingStake: totals.pending_stake || 0,
      wonSlips: totals.won_slips || 0,
      lostSlips: totals.lost_slips || 0,
      partialSlips: totals.partial_slips || 0,
    },
    items: {
      total: items.total || 0,
      won: items.won || 0,
      lost: items.lost || 0,
      pending: items.pending || 0,
      payout: items.payout || 0,
      stake: items.stake || 0,
      winRate: settledItems ? Math.round((items.won / settledItems) * 1000) / 10 : 0,
    },
    byType,
    best: best || null,
  };
}

export function getMySlip(userId, slipRef) {
  const db = getDb();
  const slip = db.prepare(`SELECT bs.*, d.draw_code, d.draw_at, lt.name_th AS type_name_th,
                                 c.name_th AS category_name_th
                          FROM bet_slips bs JOIN lottery_draws d ON d.id = bs.draw_id
                          JOIN lottery_types lt ON lt.id = d.lottery_type_id
                          LEFT JOIN lottery_categories c ON c.id = d.category_id
                          WHERE bs.slip_ref = ? AND bs.user_id = ?`).get(slipRef, userId);
  if (!slip) throw new HttpError(404, 'ไม่พบโพย');
  slip.items = db.prepare('SELECT * FROM bet_items WHERE slip_id = ?').all(slip.id);
  return slip;
}

/**
 * Evaluate a bet item against winning numbers using rule.match_config.
 * match_config: { source: 'top3'|'bottom2'|'main'|..., mode: 'tail'|'head'|'sorted'|'digit_contains' }
 */
export function evaluateBet(rule, betNumber, winningNumbers) {
  const cfg = JSON.parse(rule.match_config);
  const raw = winningNumbers?.[cfg.source];
  const bet = String(betNumber);
  // source อาจเป็น string เดียว, array ของ string (หลายรางวัล) หรือข้อความที่มีตัวคั่น
  // เช่น "12-7-34-19-45" (สลากพัฒนา 5/45) — แยกเป็นเลขเดี่ยว ๆ ก่อนเทียบ
  const sources = (Array.isArray(raw) ? raw : [raw])
    .flatMap(s => String(s ?? '').split(/[-,\s]+/))
    .map(s => s.trim()).filter(s => /^\d{1,10}$/.test(s));
  if (!sources.length) return { win: false, detail: { reason: 'no_source', source: cfg.source } };

  // สลากพัฒนา 5/45 — ถูกเมื่อเซ็ต 5 เลขตรงกับผลทั้งหมด (ไม่สนลำดับ)
  if (cfg.mode === 'set5') {
    const norm = s => String(s).split(/[-,\s]+/).map(x => parseInt(x, 10)).filter(n => !isNaN(n)).sort((a, b) => a - b).join('-');
    const win = norm(bet) === norm(sources.join('-'));
    return { win, detail: { sources, mode: cfg.mode }, multiplier: rule.payout_multiplier };
  }

  const matchOne = (source) => {
    switch (cfg.mode) {
      case 'exact': return bet === source;
      case 'tail': return bet === source.slice(-bet.length);
      case 'head': return bet === source.slice(0, bet.length);
      case 'sorted': {
        const src = source.slice(-bet.length).split('').sort().join('');
        return bet.split('').sort().join('') === src;
      }
      case 'digit_contains': {
        const srcDigits = new Set(source.split(''));
        return bet.split('').every(dg => srcDigits.has(dg));
      }
      default: return false;
    }
  };

  const win = sources.some(matchOne);
  return { win, detail: { sources, mode: cfg.mode }, multiplier: rule.payout_multiplier };
}

/** Publish result + settle all pending bets for a draw. Admin only. Atomic. */
export function settleDraw(adminId, drawId, winningNumbers) {
  const db = getDb();
  const draw = getDraw(drawId);
  if (!draw) throw new HttpError(404, 'ไม่พบรอบหวย');
  if (draw.status === 'settled') throw new HttpError(400, 'รอบนี้ออกผลแล้ว', 'ALREADY_SETTLED');
  if (draw.status === 'cancelled') throw new HttpError(400, 'รอบนี้ถูกยกเลิก');

  // validate winning_numbers is non-empty object of digit strings
  if (!winningNumbers || typeof winningNumbers !== 'object' || Array.isArray(winningNumbers))
    throw new HttpError(400, 'winning_numbers ต้องเป็น object เช่น {"top3":"123","bottom2":"45"}');
  const validVal = (v) => /^\d{1,10}$/.test(String(v));
  for (const [k, v] of Object.entries(winningNumbers)) {
    if (Array.isArray(v)) {
      if (!v.length || v.length > 20 || !v.every(validVal))
        throw new HttpError(400, `ตัวเลขผลรางวัล field "${k}" ไม่ถูกต้อง`);
    } else if (!validVal(v)) {
      throw new HttpError(400, `ตัวเลขผลรางวัล field "${k}" ไม่ถูกต้อง`);
    }
  }

  return tx((d) => {
    // prevent double-settle race: re-check status inside tx
    const cur = d.prepare('SELECT status FROM lottery_draws WHERE id = ?').get(drawId);
    if (cur.status === 'settled') throw new HttpError(400, 'รอบนี้ออกผลแล้ว', 'ALREADY_SETTLED');

    d.prepare(`INSERT INTO lottery_results (draw_id, winning_numbers, published_by, source) VALUES (?, ?, ?, ?)`)
      .run(drawId, JSON.stringify(winningNumbers), adminId, adminId ? 'manual' : 'auto');
    d.prepare(`UPDATE lottery_draws SET status = 'settled', result_numbers = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(JSON.stringify(winningNumbers), drawId);

    const pendingItems = d.prepare(`SELECT bi.*, bs.user_id AS owner_id, bs.slip_ref, r.match_config, r.payout_multiplier, r.bet_type AS rule_bet_type
                                    FROM bet_items bi
                                    JOIN bet_slips bs ON bs.id = bi.slip_id
                                    JOIN lottery_rules r ON r.id = bi.rule_id
                                    WHERE bi.draw_id = ? AND bi.status = 'pending'`).all(drawId);

    const ruleCache = new Map();
    const slipStats = new Map(); // slip_id -> {won,payout,stake}
    let settledCount = 0, winCount = 0, totalPayout = 0;

    for (const item of pendingItems) {
      let rule = ruleCache.get(item.rule_id);
      if (!rule) {
        rule = d.prepare('SELECT * FROM lottery_rules WHERE id = ?').get(item.rule_id);
        ruleCache.set(item.rule_id, rule);
      }
      const { win, detail } = evaluateBet(rule, item.number, winningNumbers);
      const payout = win ? Math.floor(item.amount * Number(rule.payout_multiplier)) : 0;
      d.prepare(`UPDATE bet_items SET status = ?, payout = ?, result_detail = ? WHERE id = ?`)
        .run(win ? 'won' : 'lost', payout, JSON.stringify(detail), item.id);
      settledCount++;
      if (win) { winCount++; totalPayout += payout; }
      const st = slipStats.get(item.slip_id) || { won: 0, payout: 0, stake: 0, userId: item.owner_id, slipRef: item.slip_ref };
      st.payout += payout; st.stake += item.amount; if (win) st.won++;
      slipStats.set(item.slip_id, st);
    }

    // credit winners & update slip status
    const updSlip = d.prepare(`UPDATE bet_slips SET status = ?, total_payout = ?, settled_at = datetime('now') WHERE id = ?`);
    // นับสถานะทั้งโพยด้วย GROUP BY ครั้งเดียว (กัน N+1)
    const slipIds = [...slipStats.keys()];
    const countsBySlip = new Map();
    if (slipIds.length) {
      const qs = slipIds.map(() => '?').join(',');
      for (const r of d.prepare(`SELECT slip_id, COUNT(*) AS c,
          SUM(CASE WHEN status = 'won' THEN 1 ELSE 0 END) AS w
          FROM bet_items WHERE slip_id IN (${qs}) GROUP BY slip_id`).all(...slipIds)) {
        countsBySlip.set(r.slip_id, r);
      }
    }
    for (const [slipId, st] of slipStats) {
      const counts = countsBySlip.get(slipId) || { c: 0, w: 0 };
      const status = counts.w === 0 ? 'lost' : (counts.w === counts.c ? 'won' : 'partial');
      updSlip.run(status, st.payout, slipId);
      if (st.payout > 0) {
        creditTx(d, {
          userId: st.userId, type: 'win_credit', amount: st.payout,
          description: `เงินรางวัลโพย ${st.slipRef} (net payout รวม ${st.payout} สตางค์)`,
          idempotencyKey: `win-${st.slipRef}`,
        });
      }
    }

    audit({ userId: adminId, action: 'draw.settle', entityType: 'draw', entityId: String(drawId),
      detail: { winningNumbers, settledCount, winCount, totalPayout } });

    return { drawId, settledItems: settledCount, winningItems: winCount, totalPayout };
  });
}

export function createDraw(adminId, { lotteryTypeId, categoryId = null, drawCode, drawAt, closeAt }) {
  if (!drawCode || !drawAt || !closeAt) throw new HttpError(400, 'กรุณาระบุ draw_code, draw_at, close_at');
  if (new Date(closeAt) >= new Date(drawAt)) throw new HttpError(400, 'เวลาปิดรับโพยต้องอยู่ก่อนเวลาออกรางวัล');
  const db = getDb();
  if (!db.prepare('SELECT id FROM lottery_types WHERE id = ?').get(lotteryTypeId)) throw new HttpError(400, 'lottery_type ไม่ถูกต้อง');
  try {
    const r = db.prepare(`INSERT INTO lottery_draws (lottery_type_id, category_id, draw_code, draw_at, close_at, status)
                          VALUES (?, ?, ?, ?, ?, 'scheduled')`)
      .run(lotteryTypeId, categoryId, drawCode, toUtcSql(drawAt), toUtcSql(closeAt));
    audit({ userId: adminId, action: 'draw.create', entityType: 'draw', entityId: String(r.lastInsertRowid), detail: { drawCode } });
    return Number(r.lastInsertRowid);
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) throw new HttpError(409, 'draw_code นี้ถูกใช้แล้ว');
    throw e;
  }
}

export function updateDraw(adminId, drawId, { drawCode, drawAt, closeAt }) {
  const db = getDb();
  const draw = getDraw(drawId);
  if (!draw) throw new HttpError(404, 'ไม่พบรอบหวย');
  if (draw.status === 'settled' || draw.status === 'cancelled') throw new HttpError(400, 'รอบที่ออกผล/ยกเลิกแล้วไม่สามารถแก้ไขได้');
  const code = drawCode ?? draw.draw_code;
  const at = drawAt ? toUtcSql(drawAt) : draw.draw_at;
  const close = closeAt ? toUtcSql(closeAt) : draw.close_at;
  if (new Date(close) >= new Date(at)) throw new HttpError(400, 'เวลาปิดรับโพยต้องอยู่ก่อนเวลาออกรางวัล');
  if (code !== draw.draw_code) {
    const dup = db.prepare('SELECT id FROM lottery_draws WHERE draw_code = ? AND id != ?').get(code, drawId);
    if (dup) throw new HttpError(409, 'draw_code นี้ถูกใช้แล้ว');
  }
  db.prepare(`UPDATE lottery_draws SET draw_code = ?, draw_at = ?, close_at = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(code, at, close, drawId);
  audit({ userId: adminId, action: 'draw.update', entityType: 'draw', entityId: String(drawId), detail: { drawCode: code } });
}

export function updateDrawStatus(adminId, drawId, status) {
  const allowed = ['scheduled', 'open', 'closed', 'cancelled'];
  if (!allowed.includes(status)) throw new HttpError(400, 'สถานะไม่ถูกต้อง');
  const db = getDb();
  const draw = getDraw(drawId);
  if (!draw) throw new HttpError(404, 'ไม่พบรอบหวย');
  if (draw.status === 'settled') throw new HttpError(400, 'รอบที่ออกผลแล้วไม่สามารถเปลี่ยนสถานะได้');

  // ยกเลิกรอบ → คืนเครดิตโพยที่ยัง pending ทั้งหมดใน transaction เดียว
  if (status === 'cancelled' && draw.status !== 'cancelled') {
    return tx((d) => {
      const slips = d.prepare(`SELECT id, slip_ref, user_id, total_stake FROM bet_slips
                               WHERE draw_id = ? AND status = 'pending'`).all(drawId);
      let refundedSlips = 0, refundedAmount = 0;
      const cancelItems = d.prepare(`UPDATE bet_items SET status = 'cancelled' WHERE slip_id = ? AND status = 'pending'`);
      for (const s of slips) {
        if (s.total_stake > 0) {
          creditTx(d, {
            userId: s.user_id, type: 'bet_refund', amount: s.total_stake,
            description: `คืนเครดิตโพย ${s.slip_ref} (ยกเลิกรอบหวย)`,
            idempotencyKey: `refund-${s.slip_ref}`,
          });
        }
        cancelItems.run(s.id);
        d.prepare(`UPDATE bet_slips SET status = 'refunded', settled_at = datetime('now') WHERE id = ?`).run(s.id);
        refundedSlips++; refundedAmount += s.total_stake;
      }
      d.prepare(`UPDATE lottery_draws SET status = ?, updated_at = datetime('now') WHERE id = ?`).run(status, drawId);
      audit({ userId: adminId, action: 'draw.status', entityType: 'draw', entityId: String(drawId),
        detail: { from: draw.status, to: status, refundedSlips, refundedAmount } });
      return { refundedSlips, refundedAmount };
    });
  }

  db.prepare(`UPDATE lottery_draws SET status = ?, updated_at = datetime('now') WHERE id = ?`).run(status, drawId);
  audit({ userId: adminId, action: 'draw.status', entityType: 'draw', entityId: String(drawId), detail: { from: draw.status, to: status } });
}
