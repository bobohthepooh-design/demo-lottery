import { getDb, tx, makeReference } from '../db/index.js';
import { HttpError, audit } from '../lib/audit.js';
import { debitForBetTx, creditTx, getBalance } from './walletService.js';
import { notify } from './notifyService.js';
import { getSetting } from './settingsService.js';
import { normalizeZodiac } from '../lib/zodiac.js';

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
  if (categoryId !== undefined) { sql += ' AND (category_id = ? OR category_id IS NULL)'; args.push(categoryId); }
  sql += ' ORDER BY bet_type';
  return db.prepare(sql).all(...args);
}

/** Rules that apply to a specific draw (type + category). */
export function rulesForDraw(drawId) {
  const draw = getDraw(drawId);
  if (!draw) return null;
  let rules = listRules(draw.lottery_type_id, { categoryId: draw.category_id });
  // เลขอั้น — แสดงประเภท ann_* เฉพาะด้านที่มีเลขอั้นประกาศจริงในรอบนั้น
  // (ไม่มีประกาศ = ซ่อนปุ่ม ไม่ให้ผู้แทงเห็นประเภทที่แทงไม่ได้)
  let ann = null;
  try { ann = draw.announce ? JSON.parse(draw.announce) : null; } catch {}
  const hasTop = annEntries(ann, 'top').length > 0;
  const hasBottom = annEntries(ann, 'bottom').length > 0;
  rules = rules.filter(r => {
    if (r.bet_type === 'ann_top') return hasTop;
    if (r.bet_type === 'ann_bottom') return hasBottom;
    return true;
  });
  return { draw, rules };
}

/** ประเภทที่มาของผลรางวัลสำหรับรอบที่ยังไม่ออกผล — ตรงกับ srcLabel ใน resultFetcher
 *  manual = admin กรอกเอง | demo = ระบบสุ่มจำลอง | web = ดึงผลจริงจากเว็บภายนอก */
export function resultKindOf(d) {
  if (d.result_mode === 'manual') return 'manual';
  if (['HR', 'SC', 'HL'].includes(d.type_code)) return 'demo';
  if (d.type_code === 'LA' && d.category_code && d.category_code !== 'LA') return 'demo';
  return 'web';
}

export function listDraws({ lotteryTypeId = null, categoryId = undefined, status = null, upcoming = false, includeInactiveTypes = false } = {}) {
  const db = getDb();
  // auto-transition: รอบที่เลยเวลาปิดรับ → 'closed' (status ค้าง 'open' ตลอดถ้าไม่มีคนยิง placeBet)
  db.prepare(`UPDATE lottery_draws SET status = 'closed', updated_at = datetime('now')
              WHERE status = 'open' AND close_at <= ?`).run(nowSql());
  let sql = `SELECT d.*, lt.code AS type_code, lt.name_th AS type_name_th, lt.result_mode AS result_mode,
                    lt.is_active AS type_active,
                    c.code AS category_code, c.name_th AS category_name_th
             FROM lottery_draws d
             JOIN lottery_types lt ON lt.id = d.lottery_type_id
             LEFT JOIN lottery_categories c ON c.id = d.category_id
             WHERE ${includeInactiveTypes ? '1=1' : 'lt.is_active = 1'}
               AND d.draw_code NOT LIKE '%-STANDING'`; // standing draw ของเกมด่วนไม่ใช่รอบจริง — ซ่อนจากทุกรายการ
  const args = [];
  if (lotteryTypeId) { sql += ' AND d.lottery_type_id = ?'; args.push(lotteryTypeId); }
  if (categoryId !== undefined) {
    if (categoryId === null) sql += ' AND d.category_id IS NULL';
    else { sql += ' AND d.category_id = ?'; args.push(categoryId); }
  }
  if (status) { sql += ' AND d.status = ?'; args.push(status); }
  // upcoming = รอบที่ยังมีความหมายสำหรับสมาชิก:
  //   - ยังรับแทงได้ (scheduled/open และยังไม่ปิดรับ)
  //   - ปิดรับแล้วรอผล (closed, draw_at ไม่เกิน 2 วันก่อนหน้า — กันรอบค้างโบราณรกหน้ารายการ)
  //   ยกเว้นเกมด่วน SC/HL (standing draw ไม่มีรอบจริง)
  if (upcoming) sql += ` AND lt.code NOT IN ('SC','HL','KI') AND (
      (d.status IN ('scheduled','open') AND d.close_at > '${nowSql()}')
      OR (d.status = 'closed' AND d.draw_at >= datetime('now','-2 days'))
    )`;
  sql += ' ORDER BY d.draw_at DESC LIMIT 200';
  return db.prepare(sql).all(...args).map(d => ({ ...d, result_kind: resultKindOf(d) }));
}

export function getDraw(id) {
  const db = getDb();
  const d = db.prepare(`SELECT d.*, lt.code AS type_code, lt.name_th AS type_name_th, lt.result_mode AS result_mode,
                           lt.is_active AS type_active,
                           c.code AS category_code, c.name_th AS category_name_th
                     FROM lottery_draws d
                     JOIN lottery_types lt ON lt.id = d.lottery_type_id
                     LEFT JOIN lottery_categories c ON c.id = d.category_id
                     WHERE d.id = ?`).get(id);
  // server_now — ให้ client เทียบ close_at ด้วยนาฬิกา server (กันเครื่อง user เพี้ยนทำปุ่มแทงผิดสถานะ)
  return d ? { ...d, result_kind: resultKindOf(d), server_now: nowSql() } : d;
}

export function isDrawOpen(draw) {
  if (!draw) return false;
  if (draw.type_active === 0) return false; // ประเภทหวยที่ปิดให้บริการ (เช่น Stocks/Coin ที่ถูกถอด)
  if (draw.status === 'open' && draw.close_at > nowSql()) return true;
  // auto-transition stale draws
  if (draw.status === 'open' && draw.close_at <= nowSql()) {
    getDb().prepare(`UPDATE lottery_draws SET status = 'closed', updated_at = datetime('now') WHERE id = ?`).run(draw.id);
    return false;
  }
  return false;
}

export function validateBetNumber(rule, number) {
  // หวยราศี — ตระกูล bet_type 'zodiac*' เลือก 1-3 ราศี คั่นด้วย - (เช่น สิงห์-กันย์-ตุลย์)
  if (rule.bet_type.startsWith('zodiac')) {
    const parts = String(number).split('-').map(s => normalizeZodiac(s));
    if (parts.some(p => !p)) throw new HttpError(400, 'กรุณาเลือกดวงราศีให้ถูกต้อง (1 ใน 12 ราศี คั่นด้วย - ถ้าหลายตัว)');
    if (rule.digits > 0 && parts.length !== rule.digits)
      throw new HttpError(400, `ประเภทนี้ต้องเลือก ${rule.digits} ราศี`);
    return parts.join('-');
  }
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

  // Responsible gambling — self-exclusion + วงเงินเดิมพันรายวัน/เดือน
  const rg = db.prepare('SELECT self_excluded_until, daily_limit_satang, monthly_limit_satang FROM users WHERE id = ?').get(userId);
  if (rg?.self_excluded_until) {
    const until = rg.self_excluded_until;
    if (until === 'permanent' || until > nowSql())
      throw new HttpError(403, 'บัญชีของคุณอยู่ในช่วงระงับชั่วคราว (self-exclusion) — ไม่สามารถแทงได้', 'SELF_EXCLUDED');
  }
  // วงเงินจำกัด — คำนวณยอดแทงสะสมวันนี้/เดือนนี้ (นับโพยที่ยังไม่ยกเลิก/คืนเงิน)
  if (rg && (rg.daily_limit_satang != null || rg.monthly_limit_satang != null)) {
    const sums = db.prepare(`SELECT
        COALESCE(SUM(CASE WHEN date(created_at) = date('now') THEN total_stake END),0) AS day_stake,
        COALESCE(SUM(CASE WHEN strftime('%Y-%m', created_at) = strftime('%Y-%m','now') THEN total_stake END),0) AS month_stake
      FROM bet_slips WHERE user_id = ? AND status NOT IN ('cancelled','refunded')`).get(userId);
    // เช็คหลังรู้ totalStake — ย้ายไปหลัง resolved (ดูด้านล่าง)
    rg._sums = sums;
  }

  // เลขอั้น — ประกาศของรอบ (รองรับหลายเลข + อัตราจ่ายเฉพาะรายเลข)
  let announce = null;
  try { announce = draw.announce ? JSON.parse(draw.announce) : null; } catch {}

  // Resolve rules (must belong to draw's lottery type, active)
  const slipRef = makeReference('BET');
  const resolved = items.map(it => {
    const rule = db.prepare(`SELECT * FROM lottery_rules
                             WHERE id = ? AND lottery_type_id = ? AND is_active = 1
                               AND COALESCE(category_id, 0) = COALESCE(?, 0)`)
      .get(it.ruleId, draw.lottery_type_id, draw.category_id);
    if (!rule) throw new HttpError(400, `ประเภทการแทงไม่ถูกต้องหรือปิดใช้งาน (rule ${it.ruleId})`);
    const number = validateBetNumber(rule, String(it.number ?? '').trim());
    // โต๊ด — เลือกแทงสลับลำดับหลักได้ เฉพาะกติกาที่ตั้งอัตราโต๊ด (match_config.tod) ไว้
    const tod = it.tod === true;
    if (tod) {
      let cfg = null;
      try { cfg = JSON.parse(rule.match_config); } catch {}
      if (cfg?.tod == null || !/^\d{2,3}$/.test(number))
        throw new HttpError(400, 'ประเภทนี้ไม่รองรับการแทงโต๊ด');
    }
    // เลขอั้น — ต้องมีเลขอั้นด้านนั้นประกาศ และต้องแทงเฉพาะเลขที่ประกาศ
    if (rule.bet_type === 'ann_top' || rule.bet_type === 'ann_bottom') {
      const side = rule.bet_type === 'ann_top' ? 'top' : 'bottom';
      const entries = annEntries(announce, side);
      if (!entries.length)
        throw new HttpError(400, `รอบนี้ยังไม่มีเลขอั้น${side === 'top' ? 'บน' : 'ล่าง'}ประกาศ — แทงประเภทนี้ไม่ได้`);
      if (!entries.some(e => e.num === number))
        throw new HttpError(400, `เลข ${number} ไม่อยู่ในเลขอั้น${side === 'top' ? 'บน' : 'ล่าง'}ที่ประกาศ`);
    }
    const amount = Number(it.amount);
    if (!Number.isInteger(amount) || amount <= 0) throw new HttpError(400, 'จำนวนเงินแทงไม่ถูกต้อง');
    if (amount % rule.stake_unit !== 0) throw new HttpError(400, `จำนวนเงินต้องเป็นหน่วย ${rule.stake_unit} สตางค์`);
    if (amount < rule.min_amount) throw new HttpError(400, `ขั้นต่ำ ${rule.min_amount} สตางค์`);
    if (rule.max_amount && amount > rule.max_amount) throw new HttpError(400, `สูงสุด ${rule.max_amount} สตางค์`);
    return { rule, number, amount, tod };
  });

  const totalStake = resolved.reduce((s, r) => s + r.amount, 0);

  // วงเงินจำกัดรายวัน/เดือน — รวมยอดแทงสะสม + โพยนี้ต้องไม่เกิน limit
  if (rg && (rg.daily_limit_satang != null || rg.monthly_limit_satang != null)) {
    const sums = rg._sums;
    if (rg.daily_limit_satang != null && sums.day_stake + totalStake > rg.daily_limit_satang)
      throw new HttpError(400, `เกินวงเงินเดิมพันรายวัน (จำกัด ฿${(rg.daily_limit_satang / 100).toLocaleString()})`, 'LIMIT_DAILY');
    if (rg.monthly_limit_satang != null && sums.month_stake + totalStake > rg.monthly_limit_satang)
      throw new HttpError(400, `เกินวงเงินเดิมพันรายเดือน (จำกัด ฿${(rg.monthly_limit_satang / 100).toLocaleString()})`, 'LIMIT_MONTHLY');
  }

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

      // exposure cap — วงเงินรวมต่อ (รอบ × กติกา × เลข) กันความเสี่ยงฝั่งเจ้ามือสูงเกิน
      // admin ตั้งใน Settings → exposure_cap_stake (สตางค์, 0 = ไม่จำกัด, default ฿5,000/เลข/กติกา/รอบ)
      const cap = Number(getSetting('exposure_cap_stake', 500000)) || 0;
      if (cap > 0) {
        const pendingStmt = d.prepare(`SELECT COALESCE(SUM(bi.amount),0) AS s FROM bet_items bi
          JOIN bet_slips bs ON bs.id = bi.slip_id
          WHERE bi.draw_id = ? AND bi.rule_id = ? AND bi.number = ? AND bi.status = 'pending' AND bs.status = 'pending'`);
        const agg = new Map(); // รวมรายการซ้ำเลขเดียวกันในโพยนี้ก่อนเทียบ cap
        for (const r of resolved) {
          const k = `${r.rule.id}|${r.number}`;
          agg.set(k, (agg.get(k) || 0) + r.amount);
        }
        for (const [k, add] of agg) {
          const sep = k.indexOf('|');
          const rid = Number(k.slice(0, sep)), num = k.slice(sep + 1);
          const used = pendingStmt.get(drawId, rid, num).s;
          if (used + add > cap) {
            const rule = resolved.find(r => r.rule.id === rid && r.number === num)?.rule;
            throw new HttpError(400,
              `เลข ${num} (${rule?.name_th || ''}) ในรอบนี้มียอดรับเต็มวงเงินแล้ว — วงเงินต่อเลข ฿${(cap / 100).toLocaleString('th-TH')} (รับไปแล้ว ฿${(used / 100).toLocaleString('th-TH')})`,
              'EXPOSURE_CAP');
          }
        }
      }

      const slip = d.prepare(`INSERT INTO bet_slips (slip_ref, user_id, draw_id, status, total_stake, idempotency_key)
                              VALUES (?, ?, ?, 'pending', ?, ?)`)
        .run(slipRef, userId, drawId, totalStake, idempotencyKey);
      const slipId = Number(slip.lastInsertRowid);

      const insItem = d.prepare(`INSERT INTO bet_items (slip_id, draw_id, rule_id, bet_type, number, amount, is_tod, payout_multiplier, match_config)
                                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      for (const r of resolved) {
        insItem.run(slipId, drawId, r.rule.id, r.rule.bet_type, r.number, r.amount, r.tod ? 1 : 0,
          r.rule.payout_multiplier, r.rule.match_config);
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
  const slips = db.prepare(`SELECT bs.*, d.draw_code, d.draw_at, d.close_at, d.status AS draw_status, d.announce AS draw_announce,
                                  lt.code AS type_code, lt.name_th AS type_name_th,
                                  c.name_th AS category_name_th
                           FROM bet_slips bs
                           JOIN lottery_draws d ON d.id = bs.draw_id
                           JOIN lottery_types lt ON lt.id = d.lottery_type_id
                           LEFT JOIN lottery_categories c ON c.id = d.category_id
                           WHERE bs.user_id = ? ORDER BY bs.id DESC LIMIT ? OFFSET ?`)
    .all(userId, limit, offset);
  const itemStmt = db.prepare(`SELECT bi.id, bi.rule_id, bi.bet_type, bi.number, bi.amount, bi.status, bi.payout, bi.result_detail, bi.is_tod,
                                     lr.name_th AS rule_name_th,
                                     COALESCE(bi.payout_multiplier, lr.payout_multiplier) AS payout_multiplier,
                                     COALESCE(bi.match_config, lr.match_config) AS match_config
                              FROM bet_items bi JOIN lottery_rules lr ON lr.id = bi.rule_id
                              WHERE bi.slip_id = ?`);
  return slips.map(s => {
    // เลขอั้น — คำนวณ est_payout ตามอัตราจ่ายเฉพาะรายเลขที่ประกาศ (ถ้ามี)
    let ann = null;
    try { ann = s.draw_announce ? JSON.parse(s.draw_announce) : null; } catch {}
    const items = itemStmt.all(s.id).map(it => {
      // โต๊ดชัดเจน — est_payout ตามอัตราโต๊ดของกติกาเสมอ
      if (it.is_tod) {
        try {
          const cfg = JSON.parse(it.match_config || '{}');
          if (cfg.tod != null) { it.est_payout = Math.floor(it.amount * Number(cfg.tod)); it.is_tod = true; }
        } catch {}
        return it;
      }
      // เลขอั้น — แทงกติกาปกติ แต่เลขตรงเลขอั้นที่ประกาศ → est_payout ตามอัตราเลขอั้น
      const num = String(it.number || '');
      if (ann && /^\d{2,3}$/.test(num)) {
        const side = num.length === 3 ? 'top' : 'bottom';
        const entry = annEntries(ann, side).find(e => e.num === num);
        if (entry) {
          const mult = entry.mult != null && Number.isFinite(entry.mult) && entry.mult > 0
            ? entry.mult : Math.floor(Number(it.payout_multiplier || 0) / 2);
          it.est_payout = Math.floor(it.amount * mult);
          it.is_ann = true;
        }
      }
      return it;
    });
    return { ...s, items };
  });
}

/** Flattened bet items for CSV export — one row per bet item, excludes cancelled. */
export function exportMyBets(userId, { limit = 5000 } = {}) {
  const db = getDb();
  return db.prepare(`SELECT bs.slip_ref, bs.created_at AS bet_at, bs.status AS slip_status,
      bs.total_stake, bs.total_payout, bs.settled_at,
      d.draw_code, d.draw_at,
      lt.name_th AS type_name, c.name_th AS category_name,
      lr.name_th AS rule_name, bi.number, bi.amount, bi.status AS item_status,
      bi.payout, bi.is_tod
    FROM bet_items bi
    JOIN bet_slips bs ON bs.id = bi.slip_id
    JOIN lottery_draws d ON d.id = bs.draw_id
    JOIN lottery_types lt ON lt.id = d.lottery_type_id
    LEFT JOIN lottery_categories c ON c.id = d.category_id
    JOIN lottery_rules lr ON lr.id = bi.rule_id
    WHERE bs.user_id = ? AND bi.status != 'cancelled'
    ORDER BY bs.id DESC, bi.id LIMIT ?`).all(userId, limit);
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

/** Member cancels own pending slip — only while draw is still open. Refunds stake atomically. */
export function cancelBet(userId, slipId) {
  return tx((d) => {
    const slip = d.prepare(`SELECT bs.*, dr.status AS draw_status, dr.close_at
                            FROM bet_slips bs JOIN lottery_draws dr ON dr.id = bs.draw_id
                            WHERE bs.id = ? AND bs.user_id = ?`).get(slipId, userId);
    if (!slip) throw new HttpError(404, 'ไม่พบโพย');
    if (slip.status !== 'pending') throw new HttpError(400, 'ยกเลิกได้เฉพาะโพยที่รอผล');
    if (slip.draw_status !== 'open' || slip.close_at <= nowSql())
      throw new HttpError(400, 'ปิดรับโพยแล้ว ไม่สามารถยกเลิกได้', 'DRAW_CLOSED');
    d.prepare(`UPDATE bet_items SET status = 'cancelled' WHERE slip_id = ? AND status = 'pending'`).run(slipId);
    d.prepare(`UPDATE bet_slips SET status = 'cancelled' WHERE id = ?`).run(slipId);
    creditTx(d, {
      userId, type: 'bet_refund', amount: slip.total_stake,
      description: `คืนเครดิตโพย ${slip.slip_ref} (ยกเลิกการแทง)`,
      idempotencyKey: `bet-refund-${slip.slip_ref}`,
    });
    notify(userId, {
      type: 'refund', title: `คืนเครดิตโพย ${slip.slip_ref}`,
      body: `ยกเลิกโพยสำเร็จ คืนเครดิต ฿${(slip.total_stake / 100).toLocaleString('th-TH')}`,
      link: '/my-bets',
    }, d);
    audit({ userId, action: 'bet.cancel', entityType: 'bet_slip', entityId: slip.slip_ref,
      detail: { slipId, totalStake: slip.total_stake } });
    return { slipRef: slip.slip_ref, refunded: slip.total_stake, balance: getBalance(userId) };
  });
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

// ---------- เลขอั้น (ann_*) ----------
// announce JSON รองรับ: { top: '123' | ['123','456'] | [{num:'123',mult:400}], bottom: ... }
// mult = อัตราจ่ายเฉพาะรายเลข (คูณ stake) — ไม่ระบุ = ใช้อัตรากติกา ann_* (default ครึ่งรางวัลหลัก)
export function annEntries(ann, side) {
  const raw = ann?.[side];
  const list = Array.isArray(raw) ? raw : (raw ? [raw] : []);
  const out = [];
  for (const e of list) {
    if (e && typeof e === 'object') {
      const num = String(e.num ?? e.number ?? '').trim();
      const mult = e.mult ?? e.payout ?? e.multiplier ?? null;
      if (num) out.push({ num, mult: mult == null ? null : Number(mult) });
    } else {
      const s = String(e).trim();
      // รองรับรูปแบบข้อความ "123:400" ด้วย
      const m = s.match(/^(\d+)\s*:\s*(\d+(?:\.\d+)?)$/);
      if (m) out.push({ num: m[1], mult: Number(m[2]) });
      else if (s) out.push({ num: s, mult: null });
    }
  }
  // dedupe ตาม num (เก็บตัวแรก) + จำกัด 20 เลข/ด้าน
  return [...new Map(out.map(e => [e.num, e])).values()].slice(0, 20);
}

// merge เลขอั้นเข้า winning_numbers — ann_<side> = รายการเลข (สำหรับ match)
// ann_<side>_pay = {num: mult} สำหรับอัตราจ่ายเฉพาะรายเลข
export function mergeAnnounce(winningNumbers, announceJson) {
  try {
    const ann = announceJson ? JSON.parse(announceJson) : null;
    if (!ann) return;
    for (const side of ['top', 'bottom']) {
      const entries = annEntries(ann, side);
      if (!entries.length) continue;
      winningNumbers[`ann_${side}`] = entries.map(e => e.num);
      const pay = {};
      for (const e of entries) if (e.mult != null && Number.isFinite(e.mult) && e.mult > 0) pay[e.num] = e.mult;
      if (Object.keys(pay).length) winningNumbers[`ann_${side}_pay`] = pay;
    }
  } catch {}
}

/**
 * Evaluate a bet item against winning numbers using rule.match_config.
 * match_config: { source: 'top3'|'bottom2'|'main'|..., mode: 'tail'|'head'|'sorted'|'digit_contains' }
 */
export function evaluateBet(rule, betNumber, winningNumbers, opts = {}) {
  const cfg = JSON.parse(rule.match_config);
  const raw = winningNumbers?.[cfg.source];
  const bet = String(betNumber);

  // หวยราศี — ผลเป็นลำดับราศี (seq array) เทียบเป็นชุด ไม่แตกคำเดี่ยว
  if (cfg.mode === 'seq_tail' || cfg.mode === 'contains') {
    const seq = (Array.isArray(raw) ? raw : [raw]).map(s => String(s ?? '').trim()).filter(Boolean);
    const win = cfg.mode === 'seq_tail'
      ? seq.slice(-bet.split('-').length).join('-') === bet
      : seq.includes(bet);
    return { win, detail: { sources: seq, mode: cfg.mode }, multiplier: rule.payout_multiplier };
  }

  // source อาจเป็น string เดียว, array ของ string (หลายรางวัล) หรือข้อความที่มีตัวคั่น
  // เช่น "12-7-34-19-45" (สลากพัฒนา 5/45) — แยกเป็นเลขเดี่ยว ๆ ก่อนเทียบ
  const parts = (Array.isArray(raw) ? raw : [raw])
    .flatMap(s => String(s ?? '').split(/[-,\s]+/))
    .map(s => s.trim()).filter(Boolean);
  // mode exact อนุญาต source เป็นข้อความ (เช่น ราศี) — mode อื่นยังเทียบเฉพาะตัวเลขเหมือนเดิม
  const sources = cfg.mode === 'exact' ? parts : parts.filter(s => /^\d{1,10}$/.test(s));
  if (!sources.length) return { win: false, detail: { reason: 'no_source', source: cfg.source } };

  // โต๊ดชัดเจน (ผู้แทงเลือก is_tod) — ชนะเมื่อเลขครบทุกหลักไม่สนลำดับ จ่ายอัตราโต๊ดเสมอ
  if (opts.todBet) {
    if (cfg.tod == null || !/^\d{2,3}$/.test(bet))
      return { win: false, detail: { reason: 'no_tod' }, multiplier: 0 };
    const sortedBet = bet.split('').sort().join('');
    const winTod = sources.some(s => {
      const cand = s.slice(-bet.length);
      return cand.length === bet.length && cand.split('').sort().join('') === sortedBet;
    });
    return { win: winTod, detail: { sources, mode: 'tod' }, multiplier: Number(cfg.tod) };
  }

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

  let win = sources.some(matchOne);
  let multiplier = rule.payout_multiplier;
  // โต๊ด — Seniors ไม่ได้แทงประเภทโต๊ดแยก: ถ้าเลขเต็งไม่เข้า แต่ตัวเลขครบทุกหลัก
  // (สลับลำดับได้) → ชนะด้วยอัตราโต๊ดที่ตั้งใน match_config.tod
  let tod = false;
  if (!win && cfg.tod != null && /^\d{2,3}$/.test(bet)) {
    const sortedBet = bet.split('').sort().join('');
    tod = sources.some(s => {
      const cand = s.slice(-bet.length);
      return cand.length === bet.length && cand.split('').sort().join('') === sortedBet;
    });
    if (tod) { win = true; multiplier = Number(cfg.tod); }
  }
  // เลขอั้น — แทงด้วยกติกาปกติ แต่ถ้าเลขตรงกับเลขอั้นที่ admin ประกาศ → จ่ายตามอัตราเลขอั้น
  // (ann_<side> = รายการเลข, ann_<side>_pay = {num:mult} อัตราเฉพาะรายเลข — ไม่ระบุ = ครึ่งหนึ่งของอัตรากติกานั้น)
  if (win && /^\d{2,3}$/.test(bet)) {
    const side = bet.length === 3 ? 'top' : 'bottom';
    const nums = winningNumbers?.[`ann_${side}`];
    if (Array.isArray(nums) && nums.includes(bet)) {
      const custom = winningNumbers?.[`ann_${side}_pay`]?.[bet];
      multiplier = custom != null ? Number(custom) : Math.floor(Number(rule.payout_multiplier) / 2);
    }
  }
  return { win, detail: { sources, mode: cfg.mode, ...(tod ? { tod: true } : {}) }, multiplier };
}

/** Publish result + settle all pending bets for a draw. Admin only. Atomic. */
export function settleDraw(adminId, drawId, winningNumbers, sourceLabel = null) {
  const db = getDb();
  const draw = getDraw(drawId);
  if (!draw) throw new HttpError(404, 'ไม่พบรอบหวย');
  // เกมด่วน (ขูด/ไฮโล/ยี่กี) settle ผ่าน service ของตัวเอง — ห้ามออกผลผ่าน settleDraw
  if (['SC', 'HL', 'KI'].includes(draw.type_code))
    throw new HttpError(400, 'เกมด่วนไม่มีผลออกรางวัล — ระบบ settle อัตโนมัติอยู่แล้ว');
  // หวยราศี — ผลสุ่มโดยระบบ (crypto) admin ออกผล/แก้ไขเองไม่ได้
  if (adminId && draw.type_code === 'HR') throw new HttpError(403, 'ผลหวยราศีสุ่มโดยระบบ — admin แก้ไขผลไม่ได้');
  if (draw.status === 'settled') throw new HttpError(400, 'รอบนี้ออกผลแล้ว', 'ALREADY_SETTLED');
  if (draw.status === 'cancelled') throw new HttpError(400, 'รอบนี้ถูกยกเลิก');

  // validate winning_numbers is non-empty object of digit strings
  if (!winningNumbers || typeof winningNumbers !== 'object' || Array.isArray(winningNumbers))
    throw new HttpError(400, 'winning_numbers ต้องเป็น object เช่น {"top3":"123","bottom2":"45"}');
  // ผลรางวัลอาจเป็นข้อความ (เช่น ราศีของหวยรายชั่วโมง) — ยอมรับ non-empty ≤20 ตัวอักษร
  const validVal = (v) => { const s = String(v ?? ''); return s.trim().length > 0 && s.length <= 20; };
  for (const [k, v] of Object.entries(winningNumbers)) {
    if (Array.isArray(v)) {
      if (!v.length || v.length > 20 || !v.every(validVal))
        throw new HttpError(400, `ตัวเลขผลรางวัล field "${k}" ไม่ถูกต้อง`);
    } else if (!validVal(v)) {
      throw new HttpError(400, `ตัวเลขผลรางวัล field "${k}" ไม่ถูกต้อง`);
    }
  }

  // merge เลขอั้นเข้า winning_numbers (หลายเลข + อัตราจ่ายเฉพาะรายเลข ann_<side>_pay)
  winningNumbers = { ...winningNumbers };
  mergeAnnounce(winningNumbers, draw.announce);

  return tx((d) => {
    // prevent double-settle race: re-check status inside tx
    const cur = d.prepare('SELECT status FROM lottery_draws WHERE id = ?').get(drawId);
    if (cur.status === 'settled') throw new HttpError(400, 'รอบนี้ออกผลแล้ว', 'ALREADY_SETTLED');

    d.prepare(`INSERT INTO lottery_results (draw_id, winning_numbers, published_by, source) VALUES (?, ?, ?, ?)`)
      .run(drawId, JSON.stringify(winningNumbers), adminId, adminId ? 'manual' : (sourceLabel || 'auto'));
    d.prepare(`UPDATE lottery_draws SET status = 'settled', result_numbers = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(JSON.stringify(winningNumbers), drawId);

    const pendingItems = d.prepare(`SELECT bi.*, bs.user_id AS owner_id, bs.slip_ref, r.match_config AS rule_match_config, r.payout_multiplier AS rule_payout_multiplier, r.bet_type AS rule_bet_type
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
      // ใช้อัตราจ่าย/กติกาที่ snapshot ไว้ตอนแทง (กัน admin แก้กติกาทีหลังเปลี่ยนราคาโพยค้าง)
      const effRule = item.match_config != null
        ? { ...rule, match_config: item.match_config, payout_multiplier: item.payout_multiplier ?? rule.payout_multiplier }
        : rule;
      const ev = evaluateBet(effRule, item.number, winningNumbers, { todBet: !!item.is_tod });
      const payout = ev.win ? Math.floor(item.amount * Number(ev.multiplier ?? effRule.payout_multiplier)) : 0;
      d.prepare(`UPDATE bet_items SET status = ?, payout = ?, result_detail = ? WHERE id = ?`)
        .run(ev.win ? 'won' : 'lost', payout, JSON.stringify(ev.detail), item.id);
      settledCount++;
      if (ev.win) { winCount++; totalPayout += payout; }
      const st = slipStats.get(item.slip_id) || { won: 0, payout: 0, stake: 0, userId: item.owner_id, slipRef: item.slip_ref };
      st.payout += payout; st.stake += item.amount; if (ev.win) st.won++;
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
        notify(st.userId, {
          type: 'win', title: `ถูกรางวัล ฿${(st.payout / 100).toLocaleString('th-TH')}`,
          body: `โพย ${st.slipRef} ได้เงินรางวัลรวม ฿${(st.payout / 100).toLocaleString('th-TH')} (เครดิตเสมือน)`,
          link: '/my-bets',
        }, d);
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
  const type = db.prepare('SELECT id, code FROM lottery_types WHERE id = ?').get(lotteryTypeId);
  if (!type) throw new HttpError(400, 'lottery_type ไม่ถูกต้อง');
  // เกมด่วน (สล็อต/ไฮโล/ยี่กี) ไม่มีรอบจริง — ใช้ standing draw ที่ service จัดการเอง
  // การสร้างรอบจริงจะทำให้โพยค้างถาวร (ไม่อยู่ใน pipeline ออกผล)
  if (['SC', 'HL', 'KI'].includes(type.code))
    throw new HttpError(400, 'เกมด่วนไม่มีรอบออกรางวัล — ระบบจัดการผลเองอัตโนมัติ');
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

export function updateDraw(adminId, drawId, { drawCode, drawAt, closeAt, announce }) {
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
  // announce: undefined = ไม่แตะ, null/'' = ล้างเลขอั้น
  // object = บันทึก {top, bottom} — แต่ละด้านเป็น string | array ของ {num, mult?} (อัตราจ่ายเฉพาะรายเลข)
  let setAnnounce = null, clearAnnounce = false;
  if (announce !== undefined) {
    if (announce && typeof announce === 'object') {
      const clean = {};
      for (const side of ['top', 'bottom']) {
        const entries = annEntries(announce, side)
          .map(e => {
            const mult = e.mult != null && Number.isFinite(e.mult) && e.mult > 0 && e.mult <= 1000000 ? Math.floor(e.mult) : null;
            return mult != null ? { num: e.num, mult } : e.num;
          });
        if (entries.length) clean[side] = entries;
      }
      if (Object.keys(clean).length) setAnnounce = JSON.stringify(clean);
      else clearAnnounce = true; // ส่ง object ว่าง = ล้างเลขอั้น
    } else clearAnnounce = true;
  }
  db.prepare(`UPDATE lottery_draws SET draw_code = ?, draw_at = ?, close_at = ?,
              announce = CASE WHEN ? = 1 THEN NULL WHEN ? IS NOT NULL THEN ? ELSE announce END,
              updated_at = datetime('now') WHERE id = ?`)
    .run(code, at, close, clearAnnounce ? 1 : 0, setAnnounce, setAnnounce, drawId);
  audit({ userId: adminId, action: 'draw.update', entityType: 'draw', entityId: String(drawId), detail: { drawCode: code } });
}

export function updateDrawStatus(adminId, drawId, status) {
  const allowed = ['scheduled', 'open', 'closed', 'cancelled'];
  if (!allowed.includes(status)) throw new HttpError(400, 'สถานะไม่ถูกต้อง');
  const db = getDb();
  const draw = getDraw(drawId);
  if (!draw) throw new HttpError(404, 'ไม่พบรอบหวย');
  if (draw.status === 'settled') throw new HttpError(400, 'รอบที่ออกผลแล้วไม่สามารถเปลี่ยนสถานะได้');
  // รอบที่ยกเลิก = คืนเครดิตโพยแล้วถาวร — ห้ามเปลี่ยนสถานะกลับ (กัน reopen รอบที่ refund ไปแล้ว)
  if (draw.status === 'cancelled') throw new HttpError(400, 'รอบที่ยกเลิกแล้วไม่สามารถเปลี่ยนสถานะได้');

  // ยกเลิกรอบ → คืนเครดิตโพยที่ยัง pending ทั้งหมดใน transaction เดียว
  if (status === 'cancelled' && draw.status !== 'cancelled') {
    return tx((d) => {
      const slips = d.prepare(`SELECT id, slip_ref, user_id, total_stake FROM bet_slips
                               WHERE draw_id = ? AND status = 'pending'`).all(drawId);
      let refundedSlips = 0, refundedAmount = 0;
      const cancelItems = d.prepare(`UPDATE bet_items SET status = 'cancelled' WHERE slip_id = ? AND status = 'pending'`);
      const perUser = new Map(); // รวมยอดคืนต่อ user — แจ้งเตือนคนละครั้งไม่ให้ spam
      for (const s of slips) {
        if (s.total_stake > 0) {
          creditTx(d, {
            userId: s.user_id, type: 'bet_refund', amount: s.total_stake,
            description: `คืนเครดิตโพย ${s.slip_ref} (ยกเลิกรอบหวย)`,
            idempotencyKey: `refund-${s.slip_ref}`,
          });
          const u = perUser.get(s.user_id) || { count: 0, amount: 0 };
          u.count++; u.amount += s.total_stake; perUser.set(s.user_id, u);
        }
        cancelItems.run(s.id);
        d.prepare(`UPDATE bet_slips SET status = 'refunded', settled_at = datetime('now') WHERE id = ?`).run(s.id);
        refundedSlips++; refundedAmount += s.total_stake;
      }
      for (const [uid, u] of perUser) {
        notify(uid, {
          type: 'refund',
          title: `คืนเครดิตจากรอบที่ยกเลิก (${u.count} โพย)`,
          body: `รอบ ${draw.draw_code} ถูกยกเลิก — คืนเครดิต ฿${(u.amount / 100).toLocaleString('th-TH')} เข้ากระเป๋าแล้ว`,
          link: '/my-bets',
        }, d);
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
