import { txAsync, makeReference } from '../db/index.js';
import { HttpError, audit } from '../lib/audit.js';
import { debitForBetTx, creditTx, getBalance } from './walletService.js';
import { notify } from './notifyService.js';
import { getSetting } from './settingsService.js';
import { normalizeZodiac, ZODIAC_SIGNS } from '../lib/zodiac.js';
import { q, qGet, qRun, qInsert } from '../db/pg.js';

export const BET_TYPES = ['2top', '2bottom', '3top', '3tod', 'run_top', 'run_bottom'];

// ---------- syntax ของ winning_numbers ----------
// field → รูปแบบที่ยอมรับ (string หรือ array ของ string ก็ได้ — engine แบนทั้งคู่)
const WINNING_FIELD_SPECS = {
  first:   { re: /^\d{6}$/, desc: 'รางวัลที่ 1 — เลข 6 หลัก' },
  main:    { re: /^\d{6}$/, desc: 'เลขหลัก — 6 หลัก' },
  db5:     { re: /^\d{5}$/, desc: 'ผล DB — 5 หลัก' },
  num4:    { re: /^\d{4}$/, desc: 'เลข 4 ตัว' },
  last4:   { re: /^\d{4}$/, desc: 'เลขท้าย 4 ตัว' },
  top3:    { re: /^\d{3}$/, desc: 'เลขบน 3 ตัว', many: true },
  front3:  { re: /^\d{3}$/, desc: 'เลขหน้า 3 ตัว', many: true },
  last3:   { re: /^\d{3}$/, desc: 'เลขท้าย 3 ตัว', many: true },
  top2:    { re: /^\d{2}$/, desc: 'เลขบน 2 ตัว', many: true },
  bottom2: { re: /^\d{2}$/, desc: 'เลขล่าง 2 ตัว', many: true },
  last2:   { re: /^\d{2}$/, desc: 'เลขท้าย 2 ตัว', many: true },
  ann_top:    { re: /^\d{1,3}$/, desc: 'เลขอั้นบน', many: true },
  ann_bottom: { re: /^\d{1,3}$/, desc: 'เลขอั้นล่าง', many: true },
};
const WINNING_SPECIAL_KEYS = ['ann_top_pay', 'ann_bottom_pay', 'zodiac', 'seq', 'numbers'];

/** validate รูปแบบ winning_numbers ก่อนบันทึก/settle — reject field ไม่รู้จักหรือ format ผิด */
export function validateWinningNumbers(winningNumbers) {
  if (!winningNumbers || typeof winningNumbers !== 'object' || Array.isArray(winningNumbers))
    throw new HttpError(400, 'winning_numbers ต้องเป็น object เช่น {"top3":"123","bottom2":"45"}');
  const entries = Object.entries(winningNumbers);
  if (!entries.length) throw new HttpError(400, 'winning_numbers ห้ามเป็น object ว่าง');
  for (const [key, raw] of entries) {
    if (key === 'ann_top_pay' || key === 'ann_bottom_pay') {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw))
        throw new HttpError(400, `${key} ต้องเป็น object {เลข: อัตราจ่าย}`);
      for (const [num, mult] of Object.entries(raw)) {
        if (!/^\d{1,3}$/.test(num) || !Number.isFinite(Number(mult)) || Number(mult) <= 0)
          throw new HttpError(400, `${key}: เลข "${num}" หรืออัตราจ่ายไม่ถูกต้อง`);
      }
      continue;
    }
    if (key === 'zodiac') {
      if (!ZODIAC_SIGNS.includes(String(raw).trim()))
        throw new HttpError(400, 'zodiac ต้องเป็นราศีไทย 12 ราศี (ชวด ฉลู ขาล เถาะ มะโรง มะเส็ง มะเมีย มะแม วอก ระกา จอ กุน)');
      continue;
    }
    if (key === 'seq') {
      const arr = Array.isArray(raw) ? raw : [raw];
      if (!arr.length || arr.length > 12 || !arr.every(s => ZODIAC_SIGNS.includes(String(s).trim())))
        throw new HttpError(400, 'seq ต้องเป็น array ของราศีไทย 12 ราศี');
      continue;
    }
    if (key === 'numbers') {
      const arr = Array.isArray(raw) ? raw : String(raw ?? '').split(/[-,\s]+/).filter(Boolean);
      if (!arr.length || arr.length > 10 || !arr.every(x => /^\d{1,2}$/.test(String(x).trim())))
        throw new HttpError(400, 'numbers ต้องเป็นตัวเลข 1-2 หลัก (array หรือคั่นด้วย -)');
      continue;
    }
    const spec = WINNING_FIELD_SPECS[key];
    if (!spec)
      throw new HttpError(400, `ไม่รู้จัก field ผลรางวัล "${key}" — field ที่ใช้ได้: ${[...Object.keys(WINNING_FIELD_SPECS), ...WINNING_SPECIAL_KEYS].join(', ')}`);
    const vals = Array.isArray(raw) ? raw : [raw];
    if (!vals.length || vals.length > 20)
      throw new HttpError(400, `field "${key}" ต้องมีค่า 1-20 รายการ`);
    for (const v of vals) {
      const s = String(v ?? '').trim();
      if (!spec.re.test(s))
        throw new HttpError(400, `${key}: ${spec.desc} — ได้ "${s}"`);
    }
  }
  return winningNumbers;
}

function nowSql() { return new Date().toISOString().replace('T', ' ').slice(0, 19); }

/** Convert naive local datetime string ('YYYY-MM-DD HH:MM[:SS]' or ISO) to UTC sql string. */
export function toUtcSql(input) {
  const s = String(input).replace('T', ' ').slice(0, 19);
  const d = new Date(s.length === 16 ? s + ':00' : s);
  if (isNaN(d)) throw new HttpError(400, 'รูปแบบวันที่เวลาไม่ถูกต้อง');
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

export async function listLotteryTypes({ activeOnly = true } = {}) {
  return activeOnly
    ? q('SELECT * FROM lottery_types WHERE is_active = 1 ORDER BY id')
    : q('SELECT * FROM lottery_types ORDER BY id');
}

export async function getLotteryType(id) {
  return qGet('SELECT * FROM lottery_types WHERE id = $1', [id]);
}

export async function listRules(lotteryTypeId, { activeOnly = true, categoryId = undefined } = {}) {
  let sql = `SELECT * FROM lottery_rules WHERE lottery_type_id = $1 ${activeOnly ? 'AND is_active = 1' : ''}`;
  const args = [lotteryTypeId];
  if (categoryId !== undefined) { sql += ' AND (category_id = $2 OR category_id IS NULL)'; args.push(categoryId); }
  sql += ' ORDER BY bet_type';
  return q(sql, args);
}

const DRAW_SELECT = `SELECT d.*, lt.code AS type_code, lt.name_th AS type_name_th, lt.result_mode AS result_mode,
                           lt.is_active AS type_active,
                           c.code AS category_code, c.name_th AS category_name_th
                     FROM lottery_draws d
                     JOIN lottery_types lt ON lt.id = d.lottery_type_id
                     LEFT JOIN lottery_categories c ON c.id = d.category_id
                     WHERE d.id = ?`;

/** Rules that apply to a specific draw (type + category). */
export async function rulesForDraw(drawId) {
  const draw = await getDraw(drawId);
  if (!draw) return null;
  let rules = await listRules(draw.lottery_type_id, { categoryId: draw.category_id });
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

export async function listDraws({ lotteryTypeId = null, categoryId = undefined, status = null, upcoming = false, includeInactiveTypes = false } = {}) {
  await qRun(`UPDATE lottery_draws SET status = 'closed',
      updated_at = to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS')
              WHERE status = 'open' AND close_at <= $1`, [nowSql()]);
  let sql = `SELECT d.*, lt.code AS type_code, lt.name_th AS type_name_th, lt.result_mode AS result_mode,
                    lt.is_active AS type_active,
                    c.code AS category_code, c.name_th AS category_name_th
             FROM lottery_draws d
             JOIN lottery_types lt ON lt.id = d.lottery_type_id
             LEFT JOIN lottery_categories c ON c.id = d.category_id
             WHERE ${includeInactiveTypes ? '1=1' : 'lt.is_active = 1'}
               AND d.draw_code NOT LIKE '%-STANDING'`;
  const args = [];
  if (lotteryTypeId) { sql += ' AND d.lottery_type_id = ?'; args.push(lotteryTypeId); }
  if (categoryId !== undefined) {
    if (categoryId === null) sql += ' AND d.category_id IS NULL';
    else { sql += ' AND d.category_id = ?'; args.push(categoryId); }
  }
  if (status) { sql += ' AND d.status = ?'; args.push(status); }
  if (upcoming) sql += ` AND lt.code NOT IN ('SC','HL','KI') AND (
      (d.status IN ('scheduled','open') AND d.close_at > '${nowSql()}')
      OR (d.status = 'closed' AND d.draw_at >= to_char((now() AT TIME ZONE 'UTC') - interval '2 days','YYYY-MM-DD HH24:MI:SS'))
    )`;
  sql += ' ORDER BY d.draw_at DESC LIMIT 200';
  // q() translate() แปลง ? → $n ให้อัตโนมัติ
  return (await q(sql, args)).map(d => ({ ...d, result_kind: resultKindOf(d) }));
}

export async function getDraw(id) {
  const d = await qGet(DRAW_SELECT, [id]);
  return d ? { ...d, result_kind: resultKindOf(d), server_now: nowSql() } : d;
}

export async function isDrawOpen(draw) {
  if (draw.status === 'open' && draw.close_at > nowSql()) return true;
  if (draw.status === 'open' && draw.close_at <= nowSql()) {
    await qRun(`UPDATE lottery_draws SET status = 'closed',
        updated_at = to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS') WHERE id = $1`, [draw.id]);
    return false;
  }
  return false;
}

export function validateBetNumber(rule, number) {
  if (rule.bet_type.startsWith('zodiac')) {
    const parts = String(number).split('-').map(s => normalizeZodiac(s));
    if (parts.some(p => !p)) throw new HttpError(400, 'กรุณาเลือกดวงราศีให้ถูกต้อง (1 ใน 12 ราศี คั่นด้วย - ถ้าหลายตัว)');
    if (rule.digits > 0 && parts.length !== rule.digits)
      throw new HttpError(400, `ประเภทนี้ต้องเลือก ${rule.digits} ราศี`);
    return parts.join('-');
  }
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

export async function placeBet(userId, { drawId, items, idempotencyKey }) {
  if (!Array.isArray(items) || items.length === 0) throw new HttpError(400, 'กรุณาเลือกอย่างน้อย 1 รายการ');
  if (items.length > 200) throw new HttpError(400, 'สูงสุด 200 รายการต่อโพย');
  if (idempotencyKey != null && (typeof idempotencyKey !== 'string' || idempotencyKey.length > 64))
    throw new HttpError(400, 'idempotencyKey ไม่ถูกต้อง');

  const draw = await getDraw(drawId);
  if (!draw) throw new HttpError(404, 'ไม่พบรอบหวย');
  if (!(await isDrawOpen(draw))) throw new HttpError(400, 'รอบหวยนี้ไม่เปิดรับโพย', 'DRAW_CLOSED');

  const rg = await qGet('SELECT self_excluded_until, daily_limit_satang, monthly_limit_satang FROM users WHERE id = $1', [userId]);
  if (rg?.self_excluded_until) {
    const until = rg.self_excluded_until;
    if (until === 'permanent' || until > nowSql())
      throw new HttpError(403, 'บัญชีของคุณอยู่ในช่วงระงับชั่วคราว (self-exclusion) — ไม่สามารถแทงได้', 'SELF_EXCLUDED');
  }
  if (rg && (rg.daily_limit_satang != null || rg.monthly_limit_satang != null)) {
    const sums = await qGet(`SELECT
        COALESCE(SUM(CASE WHEN created_at::date = (now() AT TIME ZONE 'UTC')::date THEN total_stake END),0) AS day_stake,
        COALESCE(SUM(CASE WHEN to_char(created_at::timestamptz AT TIME ZONE 'UTC','YYYY-MM') = to_char(now() AT TIME ZONE 'UTC','YYYY-MM') THEN total_stake END),0) AS month_stake
      FROM bet_slips WHERE user_id = $1 AND status NOT IN ('cancelled','refunded')`, [userId]);
    rg._sums = sums;
  }

  let announce = null;
  try { announce = draw.announce ? JSON.parse(draw.announce) : null; } catch {}

  const slipRef = makeReference('BET');
  const resolved = [];
  for (const it of items) {
    const rule = await qGet(`SELECT * FROM lottery_rules
                             WHERE id = $1 AND lottery_type_id = $2 AND is_active = 1
                               AND COALESCE(category_id, 0) = COALESCE($3, 0)`,
      [it.ruleId, draw.lottery_type_id, draw.category_id]);
    if (!rule) throw new HttpError(400, `ประเภทการแทงไม่ถูกต้องหรือปิดใช้งาน (rule ${it.ruleId})`);
    const number = validateBetNumber(rule, String(it.number ?? '').trim());
    const tod = it.tod === true;
    if (tod) {
      let cfg = null;
      try { cfg = JSON.parse(rule.match_config); } catch {}
      if (cfg?.tod == null || !/^\d{2,3}$/.test(number))
        throw new HttpError(400, 'ประเภทนี้ไม่รองรับการแทงโต๊ด');
    }
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
    resolved.push({ rule, number, amount, tod });
  }

  const totalStake = resolved.reduce((s, r) => s + r.amount, 0);

  if (rg && (rg.daily_limit_satang != null || rg.monthly_limit_satang != null)) {
    const sums = rg._sums;
    if (rg.daily_limit_satang != null && sums.day_stake + totalStake > rg.daily_limit_satang)
      throw new HttpError(400, `เกินวงเงินเดิมพันรายวัน (จำกัด ฿${(rg.daily_limit_satang / 100).toLocaleString()})`, 'LIMIT_DAILY');
    if (rg.monthly_limit_satang != null && sums.month_stake + totalStake > rg.monthly_limit_satang)
      throw new HttpError(400, `เกินวงเงินเดิมพันรายเดือน (จำกัด ฿${(rg.monthly_limit_satang / 100).toLocaleString()})`, 'LIMIT_MONTHLY');
  }

  try {
    return await txAsync(async (d) => {
      if (idempotencyKey) {
        const existing = await d.prepare(`SELECT id, slip_ref, total_stake FROM bet_slips WHERE user_id = ? AND idempotency_key = ?`)
          .get(userId, idempotencyKey);
        if (existing) {
          return { slipRef: existing.slip_ref, slipId: existing.id, totalStake: existing.total_stake,
            balance: await getBalance(userId), duplicate: true };
        }
      }

      const cur = await d.prepare('SELECT status, close_at FROM lottery_draws WHERE id = ?').get(drawId);
      if (!cur || cur.status !== 'open' || cur.close_at <= nowSql())
        throw new HttpError(400, 'รอบหวยนี้ไม่เปิดรับโพยแล้ว', 'DRAW_CLOSED');

      const cap = Number(await getSetting('exposure_cap_stake', 500000)) || 0;
      if (cap > 0) {
        const agg = new Map();
        for (const r of resolved) {
          const k = `${r.rule.id}|${r.number}`;
          agg.set(k, (agg.get(k) || 0) + r.amount);
        }
        for (const [k, add] of agg) {
          const sep = k.indexOf('|');
          const rid = Number(k.slice(0, sep)), num = k.slice(sep + 1);
          const used = (await d.prepare(`SELECT COALESCE(SUM(bi.amount),0) AS s FROM bet_items bi
            JOIN bet_slips bs ON bs.id = bi.slip_id
            WHERE bi.draw_id = ? AND bi.rule_id = ? AND bi.number = ? AND bi.status = 'pending' AND bs.status = 'pending'`)
            .get(drawId, rid, num)).s;
          if (used + add > cap) {
            const rule = resolved.find(r => r.rule.id === rid && r.number === num)?.rule;
            throw new HttpError(400,
              `เลข ${num} (${rule?.name_th || ''}) ในรอบนี้มียอดรับเต็มวงเงินแล้ว — วงเงินต่อเลข ฿${(cap / 100).toLocaleString('th-TH')} (รับไปแล้ว ฿${(used / 100).toLocaleString('th-TH')})`,
              'EXPOSURE_CAP');
          }
        }
      }

      const slip = await d.prepare(`INSERT INTO bet_slips (slip_ref, user_id, draw_id, status, total_stake, idempotency_key)
                              VALUES (?, ?, ?, 'pending', ?, ?)`)
        .run(slipRef, userId, drawId, totalStake, idempotencyKey);
      const slipId = Number(slip.lastInsertRowid);

      const insItem = d.prepare(`INSERT INTO bet_items (slip_id, draw_id, rule_id, bet_type, number, amount, is_tod, payout_multiplier, match_config)
                                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      for (const r of resolved) {
        await insItem.run(slipId, drawId, r.rule.id, r.rule.bet_type, r.number, r.amount, r.tod ? 1 : 0,
          r.rule.payout_multiplier, r.rule.match_config);
      }

      const debitTx = await debitForBetTx(d, {
        userId, slipRef, totalStake,
        idempotencyKey: `bet-debit-${slipRef}`,
      });

      audit({ userId, action: 'bet.place', entityType: 'bet_slip', entityId: slipRef,
        detail: { drawId, totalStake, items: resolved.map(r => ({ t: r.rule.bet_type, n: r.number, a: r.amount })) } });

      return { slipRef, slipId, totalStake, balance: debitTx.balanceAfter };
    });
  } catch (e) {
    if (idempotencyKey && /UNIQUE|constraint/i.test(String(e.message))) {
      const existing = await qGet(`SELECT id, slip_ref, total_stake FROM bet_slips WHERE user_id = $1 AND idempotency_key = $2`,
        [userId, idempotencyKey]);
      if (existing) return { slipRef: existing.slip_ref, slipId: existing.id,
        totalStake: existing.total_stake, balance: await getBalance(userId), duplicate: true };
    }
    throw e;
  }
}


export async function listMyBets(userId, { limit = 50, offset = 0, status = null } = {}) {
  const statusClause = status ? ' AND bs.status = $4' : '';
  const slips = await q(`SELECT bs.*, d.draw_code, d.draw_at, d.close_at, d.status AS draw_status, d.announce AS draw_announce,
                                  lt.code AS type_code, lt.name_th AS type_name_th,
                                  c.name_th AS category_name_th
                           FROM bet_slips bs
                           JOIN lottery_draws d ON d.id = bs.draw_id
                           JOIN lottery_types lt ON lt.id = d.lottery_type_id
                           LEFT JOIN lottery_categories c ON c.id = d.category_id
                           WHERE bs.user_id = $1${statusClause} ORDER BY bs.id DESC LIMIT $2 OFFSET $3`,
    status ? [userId, limit, offset, status] : [userId, limit, offset]);
  const out = [];
  for (const s of slips) {
    let ann = null;
    try { ann = s.draw_announce ? JSON.parse(s.draw_announce) : null; } catch {}
    const rawItems = await q(`SELECT bi.id, bi.rule_id, bi.bet_type, bi.number, bi.amount, bi.status, bi.payout, bi.result_detail, bi.is_tod,
                                     lr.name_th AS rule_name_th,
                                     COALESCE(bi.payout_multiplier, lr.payout_multiplier) AS payout_multiplier,
                                     COALESCE(bi.match_config, lr.match_config) AS match_config
                              FROM bet_items bi JOIN lottery_rules lr ON lr.id = bi.rule_id
                              WHERE bi.slip_id = $1`, [s.id]);
    const items = rawItems.map(it => {
      if (it.is_tod) {
        try {
          const cfg = JSON.parse(it.match_config || '{}');
          if (cfg.tod != null) { it.est_payout = Math.floor(it.amount * Number(cfg.tod)); it.is_tod = true; }
        } catch {}
        return it;
      }
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
    out.push({ ...s, items });
  }
  return out;
}

/** Flattened bet items for CSV export — one row per bet item, excludes cancelled. */
export async function exportMyBets(userId, limit) {
  return q(`SELECT bs.slip_ref, bs.created_at AS bet_at, bs.status AS slip_status,
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
    WHERE bs.user_id = $1 AND bi.status != 'cancelled'
    ORDER BY bs.id DESC, bi.id LIMIT $2`, [userId, limit]);
}

// สรุปผลการเล่นของสมาชิก — ใช้หน้า "ผลงานของฉัน"
export async function myStats(userId) {
  const totals = await qGet(`SELECT
      COUNT(*)::int AS slips,
      COALESCE(SUM(total_stake),0) AS stake,
      COALESCE(SUM(total_payout),0) AS payout,
      COALESCE(SUM(CASE WHEN status = 'pending' THEN total_stake ELSE 0 END),0) AS pending_stake,
      SUM(CASE WHEN status = 'won' THEN 1 ELSE 0 END) AS won_slips,
      SUM(CASE WHEN status = 'lost' THEN 1 ELSE 0 END) AS lost_slips,
      SUM(CASE WHEN status = 'partial' THEN 1 ELSE 0 END) AS partial_slips
    FROM bet_slips WHERE user_id = $1 AND status NOT IN ('cancelled','refunded')`, [userId]);

  const items = await qGet(`SELECT
      COUNT(*)::int AS total,
      SUM(CASE WHEN bi.status = 'won' THEN 1 ELSE 0 END) AS won,
      SUM(CASE WHEN bi.status = 'lost' THEN 1 ELSE 0 END) AS lost,
      SUM(CASE WHEN bi.status = 'pending' THEN 1 ELSE 0 END) AS pending,
      COALESCE(SUM(bi.payout),0) AS payout,
      COALESCE(SUM(bi.amount),0) AS stake
    FROM bet_items bi JOIN bet_slips bs ON bs.id = bi.slip_id
    WHERE bs.user_id = $1 AND bi.status != 'cancelled' AND bs.status NOT IN ('cancelled','refunded')`, [userId]);

  const byType = await q(`SELECT lt.name_th AS type_name_th, lt.code AS type_code,
        COUNT(DISTINCT bs.id) AS slips,
        COALESCE(SUM(bi.amount),0) AS stake,
        COALESCE(SUM(bi.payout),0) AS payout,
        SUM(CASE WHEN bi.status = 'won' THEN 1 ELSE 0 END) AS won_items
      FROM bet_items bi
      JOIN bet_slips bs ON bs.id = bi.slip_id
      JOIN lottery_draws d ON d.id = bs.draw_id
      JOIN lottery_types lt ON lt.id = d.lottery_type_id
      WHERE bs.user_id = $1 AND bi.status != 'cancelled' AND bs.status NOT IN ('cancelled','refunded')
      GROUP BY lt.id ORDER BY stake DESC`, [userId]);

  const best = await qGet(`SELECT bs.slip_ref, bs.total_payout, d.draw_code,
        lt.name_th AS type_name_th, bs.settled_at
      FROM bet_slips bs
      JOIN lottery_draws d ON d.id = bs.draw_id
      JOIN lottery_types lt ON lt.id = d.lottery_type_id
      WHERE bs.user_id = $1 AND bs.status IN ('won','partial') AND bs.total_payout > 0
      ORDER BY bs.total_payout DESC LIMIT 1`, [userId]);

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
export async function cancelBet(userId, slipId) {
  return txAsync(async (d) => {
    const slip = await d.prepare(`SELECT bs.*, dr.status AS draw_status, dr.close_at
                            FROM bet_slips bs JOIN lottery_draws dr ON dr.id = bs.draw_id
                            WHERE bs.id = ? AND bs.user_id = ?`).get(slipId, userId);
    if (!slip) throw new HttpError(404, 'ไม่พบโพย');
    if (slip.status !== 'pending') throw new HttpError(400, 'ยกเลิกได้เฉพาะโพยที่รอผล');
    if (slip.draw_status !== 'open' || slip.close_at <= nowSql())
      throw new HttpError(400, 'ปิดรับโพยแล้ว ไม่สามารถยกเลิกได้', 'DRAW_CLOSED');
    const claim = await d.prepare(`UPDATE bet_slips SET status = 'cancelled' WHERE id = ? AND status = 'pending'`).run(slipId);
    if (claim.changes === 0) throw new HttpError(409, 'โพยนี้ถูกยกเลิกหรือออกผลแล้ว', 'SLIP_CLOSED');
    await d.prepare(`UPDATE bet_items SET status = 'cancelled' WHERE slip_id = ? AND status = 'pending'`).run(slipId);
    const refundTx = await creditTx(d, {
      userId, type: 'bet_refund', amount: slip.total_stake,
      description: `คืนเครดิตโพย ${slip.slip_ref} (ยกเลิกการแทง)`,
      idempotencyKey: `bet-refund-${slip.slip_ref}`,
    });
    await notify(userId, {
      type: 'refund', title: `คืนเครดิตโพย ${slip.slip_ref}`,
      body: `ยกเลิกโพยสำเร็จ คืนเครดิต ฿${(slip.total_stake / 100).toLocaleString('th-TH')}`,
      link: '/my-bets',
    }, d);
    audit({ userId, action: 'bet.cancel', entityType: 'bet_slip', entityId: slip.slip_ref,
      detail: { slipId, totalStake: slip.total_stake } });
    return { slipRef: slip.slip_ref, refunded: slip.total_stake, balance: refundTx.balanceAfter };
  });
}

export async function getMySlip(userId, slipRef) {
  const slip = await qGet(`SELECT bs.*, d.draw_code, d.draw_at, lt.name_th AS type_name_th,
                                 c.name_th AS category_name_th
                          FROM bet_slips bs JOIN lottery_draws d ON d.id = bs.draw_id
                          JOIN lottery_types lt ON lt.id = d.lottery_type_id
                          LEFT JOIN lottery_categories c ON c.id = d.category_id
                          WHERE bs.slip_ref = $1 AND bs.user_id = $2`, [slipRef, userId]);
  if (!slip) throw new HttpError(404, 'ไม่พบโพย');
  slip.items = await q('SELECT * FROM bet_items WHERE slip_id = $1', [slip.id]);
  return slip;
}

// ---------- เลขอั้น (ann_*) ----------
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
      const m = s.match(/^(\d+)\s*:\s*(\d+(?:\.\d+)?)$/);
      if (m) out.push({ num: m[1], mult: Number(m[2]) });
      else if (s) out.push({ num: s, mult: null });
    }
  }
  return [...new Map(out.map(e => [e.num, e])).values()].slice(0, 20);
}

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

export function evaluateBet(rule, betNumber, winningNumbers, opts = {}) {
  const cfg = JSON.parse(rule.match_config);
  const raw = winningNumbers?.[cfg.source];
  const bet = String(betNumber);

  if (cfg.mode === 'seq_tail' || cfg.mode === 'contains') {
    const seq = (Array.isArray(raw) ? raw : [raw]).map(s => String(s ?? '').trim()).filter(Boolean);
    const win = cfg.mode === 'seq_tail'
      ? seq.slice(-bet.split('-').length).join('-') === bet
      : seq.includes(bet);
    return { win, detail: { sources: seq, mode: cfg.mode }, multiplier: rule.payout_multiplier };
  }

  const parts = (Array.isArray(raw) ? raw : [raw])
    .flatMap(s => String(s ?? '').split(/[-,\s]+/))
    .map(s => s.trim()).filter(Boolean);
  const sources = cfg.mode === 'exact' ? parts : parts.filter(s => /^\d{1,10}$/.test(s));
  if (!sources.length) return { win: false, detail: { reason: 'no_source', source: cfg.source } };

  if (opts.todBet) {
    if (cfg.tod == null || !/^\d{2,3}$/.test(bet))
      return { win: false, detail: { reason: 'no_tod' }, multiplier: 0 };
    const sortedBet = bet.split('').sort().join('');
    // โต๊ด = เลขชุดเดิมไม่สนลำดับ รวมเลขตรงเป๊ะด้วย (เต็งคือ permutation ของตัวเอง)
    // → แพ็กเกจ เต็ง+โต๊ด: ผลตรงจ่ายทั้งเต็ง+โต๊ด, ผลสลับจ่ายเฉพาะโต๊ด
    const winTod = sources.some(s => {
      const cand = s.slice(-bet.length);
      return cand.length === bet.length
        && cand.split('').sort().join('') === sortedBet;
    });
    return { win: winTod, detail: { sources, mode: 'tod' }, multiplier: Number(cfg.tod) };
  }

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
  // โต๊ดต้องซื้อแยก (bet_items.is_tod — return ไปแล้วด้านบน) — เต็งธรรมดาชนะเฉพาะเงื่อนไขกติกา
  // เลขอั้น — แทงด้วยกติกาปกติ แต่ถ้าเลขตรงกับเลขอั้นที่ admin ประกาศ → จ่ายตามอัตราเลขอั้น
  if (win && /^\d{2,3}$/.test(bet)) {
    const side = bet.length === 3 ? 'top' : 'bottom';
    const nums = winningNumbers?.[`ann_${side}`];
    if (Array.isArray(nums) && nums.includes(bet)) {
      const custom = winningNumbers?.[`ann_${side}_pay`]?.[bet];
      // กติกา ann_* คือราคาหลังลดครึ่งอยู่แล้ว — ห้ามหาร 2 ซ้ำ (ใช้ custom rate ถ้า admin ประกาศไว้)
      multiplier = custom != null ? Number(custom)
        : (rule.bet_type?.startsWith('ann_') ? Number(rule.payout_multiplier) : Math.floor(Number(rule.payout_multiplier) / 2));
    }
  }
  return { win, detail: { sources, mode: cfg.mode }, multiplier };
}

/** Publish result + settle all pending bets for a draw. Admin only. Atomic. */

function settleDrawCommon(draw, adminId, winningNumbers, sourceLabel) {
  if (!draw) throw new HttpError(404, 'ไม่พบรอบหวย');
  if (['SC', 'HL', 'KI'].includes(draw.type_code))
    throw new HttpError(400, 'เกมด่วนไม่มีผลออกรางวัล — ระบบ settle อัตโนมัติอยู่แล้ว');
  if (adminId && draw.type_code === 'HR') throw new HttpError(403, 'ผลหวยราศีสุ่มโดยระบบ — admin แก้ไขผลไม่ได้');
  if (draw.status === 'settled') throw new HttpError(400, 'รอบนี้ออกผลแล้ว', 'ALREADY_SETTLED');
  if (draw.status === 'cancelled') throw new HttpError(400, 'รอบนี้ถูกยกเลิก');
  const nowUtc = new Date().toISOString().slice(0, 19).replace('T', ' ');
  if (draw.draw_at > nowUtc) throw new HttpError(400, 'ยังไม่ถึงเวลาออกรางวัล — ออกผลก่อนเวลาไม่ได้', 'DRAW_NOT_DUE');

  validateWinningNumbers(winningNumbers);

  winningNumbers = { ...winningNumbers };
  mergeAnnounce(winningNumbers, draw.announce);
  return winningNumbers;
}


export async function settleDraw(adminId, drawId, winningNumbers, sourceLabel) {
  const draw = await getDraw(drawId);
  winningNumbers = settleDrawCommon(draw, adminId, winningNumbers, sourceLabel);

  return txAsync(async (d) => {
    const cur = await d.prepare('SELECT status FROM lottery_draws WHERE id = ?').get(drawId);
    if (cur.status === 'settled') throw new HttpError(400, 'รอบนี้ออกผลแล้ว', 'ALREADY_SETTLED');

    await d.prepare(`INSERT INTO lottery_results (draw_id, winning_numbers, published_by, source) VALUES (?, ?, ?, ?)`)
      .run(drawId, JSON.stringify(winningNumbers), adminId, adminId ? 'manual' : (sourceLabel || 'auto'));
    await d.prepare(`UPDATE lottery_draws SET status = 'settled', result_numbers = ?,
        updated_at = to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS') WHERE id = ?`)
      .run(JSON.stringify(winningNumbers), drawId);

    const pendingItems = await d.prepare(`SELECT bi.*, bs.user_id AS owner_id, bs.slip_ref, r.match_config AS rule_match_config, r.payout_multiplier AS rule_payout_multiplier, r.bet_type AS rule_bet_type
                                    FROM bet_items bi
                                    JOIN bet_slips bs ON bs.id = bi.slip_id
                                    JOIN lottery_rules r ON r.id = bi.rule_id
                                    WHERE bi.draw_id = ? AND bi.status = 'pending' AND bs.status = 'pending'`).all(drawId);

    const ruleCache = new Map();
    const slipStats = new Map();
    let settledCount = 0, winCount = 0, totalPayout = 0;

    for (const item of pendingItems) {
      let rule = ruleCache.get(item.rule_id);
      if (!rule) {
        rule = await d.prepare('SELECT * FROM lottery_rules WHERE id = ?').get(item.rule_id);
        ruleCache.set(item.rule_id, rule);
      }
      const effRule = item.match_config != null
        ? { ...rule, match_config: item.match_config, payout_multiplier: item.payout_multiplier ?? rule.payout_multiplier }
        : rule;
      const ev = evaluateBet(effRule, item.number, winningNumbers, { todBet: !!item.is_tod });
      const payout = ev.win ? Math.floor(item.amount * Number(ev.multiplier ?? effRule.payout_multiplier)) : 0;
      // claim แบบ atomic — ถ้า item ถูกยกเลิกไปแล้วระหว่าง tx ให้ข้าม (กันนับยอด/เครดิตซ้ำ)
      const itemUpd = await d.prepare(`UPDATE bet_items SET status = ?, payout = ?, result_detail = ? WHERE id = ? AND status = 'pending'`)
        .run(ev.win ? 'won' : 'lost', payout, JSON.stringify(ev.detail), item.id);
      if (itemUpd.changes === 0) continue;
      settledCount++;
      if (ev.win) { winCount++; totalPayout += payout; }
      const st = slipStats.get(item.slip_id) || { won: 0, payout: 0, stake: 0, userId: item.owner_id, slipRef: item.slip_ref };
      st.payout += payout; st.stake += item.amount; if (ev.win) st.won++;
      slipStats.set(item.slip_id, st);
    }

    const slipIds = [...slipStats.keys()];
    const countsBySlip = new Map();
    if (slipIds.length) {
      const qs = slipIds.map(() => '?').join(',');
      for (const r of await d.prepare(`SELECT slip_id, COUNT(*) AS c,
          SUM(CASE WHEN status = 'won' THEN 1 ELSE 0 END) AS w
          FROM bet_items WHERE slip_id IN (${qs}) GROUP BY slip_id`).all(...slipIds)) {
        countsBySlip.set(r.slip_id, r);
      }
    }
    for (const [slipId, st] of slipStats) {
      const counts = countsBySlip.get(slipId) || { c: 0, w: 0 };
      const status = counts.w === 0 ? 'lost' : (counts.w === counts.c ? 'won' : 'partial');
      // claim slip เฉพาะที่ยัง pending — ถ้าโดนยกเลิกแทรก ให้ข้ามเครดิต/แจ้งเตือน (กันจ่ายซ้ำ)
      const slipUpd = await d.prepare(`UPDATE bet_slips SET status = ?, total_payout = ?,
          settled_at = to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS') WHERE id = ? AND status = 'pending'`).run(status, st.payout, slipId);
      if (slipUpd.changes === 0) continue;
      if (st.payout > 0) {
        await creditTx(d, {
          userId: st.userId, type: 'win_credit', amount: st.payout,
          description: `เงินรางวัลโพย ${st.slipRef} (net payout รวม ${st.payout} สตางค์)`,
          idempotencyKey: `win-${st.slipRef}`,
        });
        await notify(st.userId, {
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

export async function createDraw(adminId, { lotteryTypeId, categoryId = null, drawCode, drawAt, closeAt }) {
  if (!drawCode || !drawAt || !closeAt) throw new HttpError(400, 'กรุณาระบุ draw_code, draw_at, close_at');
  if (new Date(closeAt) >= new Date(drawAt)) throw new HttpError(400, 'เวลาปิดรับโพยต้องอยู่ก่อนเวลาออกรางวัล');
  const type = await qGet('SELECT id, code FROM lottery_types WHERE id = $1', [lotteryTypeId]);
  if (!type) throw new HttpError(400, 'lottery_type ไม่ถูกต้อง');
  if (['SC', 'HL', 'KI'].includes(type.code))
    throw new HttpError(400, 'เกมด่วนไม่มีรอบออกรางวัล — ระบบจัดการผลเองอัตโนมัติ');
  try {
    const r = await qInsert(`INSERT INTO lottery_draws (lottery_type_id, category_id, draw_code, draw_at, close_at, status)
                          VALUES (?, ?, ?, ?, ?, 'scheduled')`,
      [lotteryTypeId, categoryId, drawCode, toUtcSql(drawAt), toUtcSql(closeAt)]);
    audit({ userId: adminId, action: 'draw.create', entityType: 'draw', entityId: String(r.id), detail: { drawCode } });
    return Number(r.id);
  } catch (e) {
    if (/unique|duplicate/i.test(String(e.message))) throw new HttpError(409, 'draw_code นี้ถูกใช้แล้ว');
    throw e;
  }
}

export async function updateDraw(adminId, drawId, { drawCode, drawAt, closeAt, announce }) {
  const draw = await getDraw(drawId);
  if (!draw) throw new HttpError(404, 'ไม่พบรอบหวย');
  if (draw.status === 'settled' || draw.status === 'cancelled') throw new HttpError(400, 'รอบที่ออกผล/ยกเลิกแล้วไม่สามารถแก้ไขได้');
  const code = drawCode ?? draw.draw_code;
  const at = drawAt ? toUtcSql(drawAt) : draw.draw_at;
  const close = closeAt ? toUtcSql(closeAt) : draw.close_at;
  if (new Date(close) >= new Date(at)) throw new HttpError(400, 'เวลาปิดรับโพยต้องอยู่ก่อนเวลาออกรางวัล');
  if (code !== draw.draw_code) {
    const dup = await qGet('SELECT id FROM lottery_draws WHERE draw_code = $1 AND id != $2', [code, drawId]);
    if (dup) throw new HttpError(409, 'draw_code นี้ถูกใช้แล้ว');
  }
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
      else clearAnnounce = true;
    } else clearAnnounce = true;
  }
  await qRun(`UPDATE lottery_draws SET draw_code = $1, draw_at = $2, close_at = $3,
              announce = CASE WHEN $4 = 1 THEN NULL WHEN $5::text IS NOT NULL THEN $5::text ELSE announce END,
              updated_at = to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS') WHERE id = $6`,
    [code, at, close, clearAnnounce ? 1 : 0, setAnnounce, drawId]);
  audit({ userId: adminId, action: 'draw.update', entityType: 'draw', entityId: String(drawId), detail: { drawCode: code } });
}

export async function updateDrawStatus(adminId, drawId, status) {
  const allowed = ['scheduled', 'open', 'closed', 'cancelled'];
  if (!allowed.includes(status)) throw new HttpError(400, 'สถานะไม่ถูกต้อง');
  const draw = await getDraw(drawId);
  if (!draw) throw new HttpError(404, 'ไม่พบรอบหวย');
  if (draw.status === 'settled') throw new HttpError(400, 'รอบที่ออกผลแล้วไม่สามารถเปลี่ยนสถานะได้');
  if (draw.status === 'cancelled') throw new HttpError(400, 'รอบที่ยกเลิกแล้วไม่สามารถเปลี่ยนสถานะได้');

  if (status === 'cancelled' && draw.status !== 'cancelled') {
    return txAsync(async (d) => {
      const slips = await d.prepare(`SELECT id, slip_ref, user_id, total_stake FROM bet_slips
                               WHERE draw_id = ? AND status = 'pending'`).all(drawId);
      let refundedSlips = 0, refundedAmount = 0;
      const perUser = new Map();
      for (const s of slips) {
        // claim ก่อน — ถ้า slip ถูก settle ไปแล้วระหว่าง tx (changes=0) ข้ามทั้ง item cancel และคืนเงิน
        const claim = await d.prepare(`UPDATE bet_slips SET status = 'refunded',
            settled_at = to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS')
            WHERE id = ? AND status = 'pending'`).run(s.id);
        if (claim.changes === 0) continue;
        await d.prepare(`UPDATE bet_items SET status = 'cancelled' WHERE slip_id = ? AND status = 'pending'`).run(s.id);
        if (s.total_stake > 0) {
          await creditTx(d, {
            userId: s.user_id, type: 'bet_refund', amount: s.total_stake,
            description: `คืนเครดิตโพย ${s.slip_ref} (ยกเลิกรอบหวย)`,
            idempotencyKey: `refund-${s.slip_ref}`,
          });
          const u = perUser.get(s.user_id) || { count: 0, amount: 0 };
          u.count++; u.amount += s.total_stake; perUser.set(s.user_id, u);
        }
        refundedSlips++; refundedAmount += s.total_stake;
      }
      for (const [uid, u] of perUser) {
        await notify(uid, {
          type: 'refund',
          title: `คืนเครดิตจากรอบที่ยกเลิก (${u.count} โพย)`,
          body: `รอบ ${draw.draw_code} ถูกยกเลิก — คืนเครดิต ฿${(u.amount / 100).toLocaleString('th-TH')} เข้ากระเป๋าแล้ว`,
          link: '/my-bets',
        }, d);
      }
      await d.prepare(`UPDATE lottery_draws SET status = ?,
          updated_at = to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS') WHERE id = ?`).run(status, drawId);
      audit({ userId: adminId, action: 'draw.status', entityType: 'draw', entityId: String(drawId),
        detail: { from: draw.status, to: status, refundedSlips, refundedAmount } });
      return { refundedSlips, refundedAmount };
    });
  }

  await qRun(`UPDATE lottery_draws SET status = $1,
      updated_at = to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS') WHERE id = $2`, [status, drawId]);
  audit({ userId: adminId, action: 'draw.status', entityType: 'draw', entityId: String(drawId), detail: { from: draw.status, to: status } });
}
