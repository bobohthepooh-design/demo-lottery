import { randomBytes, createHash } from 'node:crypto';
import { txAsync, makeReference } from '../db/index.js';
import { HttpError, audit } from '../lib/audit.js';
import { debitForBetTx, creditTx, getBalance } from './walletService.js';
import { getSetting, setSetting, assertBettingAllowed } from './settingsService.js';
import { ZODIAC_SIGNS } from '../lib/zodiac.js';
import { q, qGet, qRun } from '../db/pg.js';

/**
 * หวยยี่กี (KIWI) — instant number-pick lottery
 * - ผู้เล่นเลือกเลข K ตัวจาก pool → server สุ่ม K ผล → จ่ายตามจำนวนที่ตรง (hits)
 * - 2 เกม: kiwi (เลือก 5 จาก 1-20), kiwi_vip (เลือก 3 จาก 1-12 อัตราสูง)
 *   (kiwi_zodiac ถูกถอดออก — ซ้ำกับหวยราศี HR หลัก; ticket เก่ายังแสดงในประวัติได้)
 * - ซื้อ+เล่นจบในคำขอเดียว (provably fair: commit sha256(seed), seed เผยหลังเล่น)
 * - ทุกการเล่นสร้าง bet_slip + bet_item → "โพยของฉัน"/wallet อัตโนมัติ
 */

export const DICE_SYMBOLS = ['ปลา', 'กุ้ง', 'น้ำเต้า', 'เสือ', 'ปู', 'ไก่'];

const GAMES = {
  kiwi:       { label: 'ยี่กี',       poolSize: 20, pickCount: 5, price: 1000,  zodiac: false,
                tiers: { 2: 1, 3: 4, 4: 18, 5: 70 } },
  kiwi_vip:   { label: 'ยี่กี VIP',   poolSize: 12, pickCount: 3, price: 5000,  zodiac: false,
                tiers: { 2: 4, 3: 30 } },
  kiwi_dice:  { label: 'น้ำเต้าปูปลา', poolSize: 6,  pickCount: 1, price: 1000,  zodiac: false,
                dice: true, diceSymbols: DICE_SYMBOLS },
};
export const KIWI_GAMES = Object.keys(GAMES);

// อัตราจ่ายน้ำเต้าปูปลา default — admin ปรับได้ผ่าน lottery_rules.match_config.payouts.mults
const DICE_MULTS_DEFAULT = { single: 1.6, pair: 5, triple: 150 };
// อัตราจ่ายรวมจาก rule.match_config.payouts (admin หน้ากติกา) — fallback ค่า default ใน GAMES
function payoutsOf(rule, game) {
  let p = {};
  try { p = (rule?.match_config ? JSON.parse(rule.match_config) : null)?.payouts || {}; } catch {}
  const tiers = {};
  for (const [k, v] of Object.entries({ ...(GAMES[game]?.tiers || {}), ...(p.tiers || {}) })) {
    const n = Number(v);
    if (Number.isFinite(n) && n >= 0) tiers[k] = n;
  }
  const mults = {};
  for (const k of ['single', 'pair', 'triple']) {
    const n = Number(p.mults?.[k] ?? DICE_MULTS_DEFAULT[k]);
    if (Number.isFinite(n) && n >= 0) mults[k] = n;
  }
  return { tiers, mults };
}
const diceBetsOf = (m) => ({
  single: { label: 'สัตว์เดี่ยว', desc: 'เลือกสัตว์ 1 ตัว — ออกอย่างน้อย 1 ลูกในเต๋า 3 ลูก', payout: `ออก ≥1 ตัว = ×${m.single}` },
  pair:   { label: 'สัตว์คู่',   desc: 'เลือกสัตว์ 2 ตัวต่างกัน — ต้องออกครบทั้งคู่ในลูกเต๋า 3 ลูก (ไม่สนลำดับ)', payout: `×${m.pair}` },
  triple: { label: 'สัตว์ตอง',   desc: 'เลือกสัตว์ 1 ตัว — ต้องออกครบทั้ง 3 ลูกเต๋าเหมือนกันหมด', payout: `×${m.triple}` },
});

const commitOf = (seed) => createHash('sha256').update(String(seed)).digest('hex');
function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function drawNumbers(seed, poolSize, count) {
  const rng = mulberry32(hashSeed(`kiwi:${seed}`));
  const pool = Array.from({ length: poolSize }, (_, i) => i + 1);
  const out = [];
  while (out.length < count && pool.length) {
    out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  }
  return out.sort((a, b) => a - b);
}

export function drawZodiac(seed, count = 6) {
  const rng = mulberry32(hashSeed(`kiwizz:${seed}`));
  const pool = [...ZODIAC_SIGNS];
  const out = [];
  while (out.length < count && pool.length) out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  return out;
}

const hitsOf = (picks, drawn) => picks.filter(p => drawn.includes(p)).length;

export function drawDice(seed) {
  const rng = mulberry32(hashSeed(`kiwidice:${seed}`));
  return [0, 1, 2].map(() => Math.floor(rng() * 6) + 1);
}

function normDiceBet(betType, sel) {
  const isNum = (v) => Number.isInteger(v) && v >= 1 && v <= 6;
  switch (betType) {
    case 'single': case 'triple': {
      const v = sel?.[0];
      if (!isNum(v)) throw new HttpError(400, 'กรุณาเลือกสัตว์ 1 ตัว (แต้ม 1-6)');
      return [v];
    }
    case 'pair': {
      const a = sel?.[0], b = sel?.[1];
      if (!isNum(a) || !isNum(b) || a === b) throw new HttpError(400, 'กรุณาเลือกสัตว์ 2 ตัวที่ต่างกัน');
      return [a, b].sort((x, y) => x - y);
    }
    default: throw new HttpError(400, 'ไม่รู้จักรูปแบบการแทง');
  }
}

function settleDice(betType, sel, dice, mults = DICE_MULTS_DEFAULT) {
  const sum = dice[0] + dice[1] + dice[2];
  switch (betType) {
    case 'single': {
      const hits = dice.filter(d => d === sel[0]).length;
      return { win: hits > 0, mult: mults.single, sum, hits };
    }
    case 'pair': {
      const hits = sel.filter(v => dice.includes(v)).length;
      const win = hits === 2;
      return { win, mult: mults.pair, sum, hits };
    }
    case 'triple': {
      const win = dice.every(d => d === sel[0]);
      return { win, mult: mults.triple, sum, hits: win ? 3 : dice.filter(d => d === sel[0]).length };
    }
    default: return { win: false, mult: 0, sum };
  }
}

// ---------- infra: type KI + rules + standing draw ----------
let infraReady = false;
export async function ensureInfra() {
  if (infraReady) return;
  let type = await qGet(`SELECT id FROM lottery_types WHERE code = 'KI'`);
  if (!type) {
    await qRun(`INSERT INTO lottery_types (code, name_th, name_en, description, is_active, result_mode)
                VALUES ('KI','หวยยี่กี','Yi Ki Lottery','เลือกเลขทายผลไว — รู้ผลทันที',1,'manual')`);
    type = await qGet(`SELECT id FROM lottery_types WHERE code = 'KI'`);
  }
  const typeId = type.id;
  for (const [game, g] of Object.entries(GAMES)) {
    if (!(await qGet(`SELECT id FROM lottery_rules WHERE lottery_type_id = $1 AND bet_type = $2`, [typeId, game]))) {
      await qRun(`INSERT INTO lottery_rules
        (lottery_type_id, category_id, bet_type, name_th, name_en, digits, match_config, payout_multiplier, stake_unit, min_amount, max_amount, is_active)
        VALUES ($1, NULL, $2, $3, $4, 0, '{"mode":"kiwi"}', 0, 1, $5, $6, 1)`,
        [typeId, game, `ยี่กี — ${g.label}`, `Kiwi ${game}`, g.price, g.price]);
    }
  }
  if (!(await qGet(`SELECT id FROM lottery_draws WHERE draw_code = 'KI-STANDING'`))) {
    await qRun(`INSERT INTO lottery_draws (lottery_type_id, category_id, draw_code, draw_at, close_at, status)
                VALUES ($1, NULL, 'KI-STANDING', '2026-01-01 00:00:00', '2026-01-01 00:00:00', 'closed')`, [typeId]);
  }
  await qRun(`UPDATE lottery_types SET name_th='หวยยี่กี', name_en='Yi Ki Lottery', description='เลือกเลขทายผลไว — รู้ผลทันที' WHERE code='KI'`);
  const RULE_NAMES = { kiwi: ['ยี่กี', 'Yi Ki'], kiwi_vip: ['ยี่กี VIP', 'Yi Ki VIP'], kiwi_dice: ['น้ำเต้าปูปลา', 'Nam Tao Pu Pla'] };
  for (const [g, [th, en]] of Object.entries(RULE_NAMES)) {
    await qRun(`UPDATE lottery_rules SET name_th = $1, name_en = $2 WHERE bet_type = $3 AND lottery_type_id = $4`,
      [th, en, g, typeId]);
  }
  for (const [g, def] of Object.entries(GAMES)) {
    const k = `kiwi_price_${g}`;
    if ((await getSetting(k)) == null) await setSetting(k, def.price);
    const price = Number(await getSetting(k)) || def.price;
    await qRun(`UPDATE lottery_rules SET min_amount = $1, max_amount = $2 WHERE bet_type = $3 AND lottery_type_id = $4`,
      [price, price, g, typeId]);
  }
  infraReady = true;
}

async function standingDraw() {
  await ensureInfra();
  return qGet(`SELECT d.* FROM lottery_draws d WHERE d.draw_code = 'KI-STANDING'`);
}
async function gameRule(game) {
  const draw = await standingDraw();
  return qGet(`SELECT r.* FROM lottery_rules r
    JOIN lottery_types lt ON lt.id = r.lottery_type_id
    WHERE r.lottery_type_id = $1 AND r.bet_type = $2 AND r.is_active = 1 AND lt.is_active = 1`,
    [draw.lottery_type_id, game]);
}

// เกมเปิดให้เล่น = rule ของเกมนั้น + ประเภทหวย (KI) ยัง active — ใช้ public-config + /kiwi/info
export async function gameEnabled(game) {
  return !!(await gameRule(game));
}

const gamePrice = async (game) => {
  const s = Number(await getSetting(`kiwi_price_${game}`));
  if (Number.isInteger(s) && s > 0) return s;
  const r = await gameRule(game);
  const p = r ? Number(r.min_amount) : NaN;
  return Number.isInteger(p) && p > 0 ? p : GAMES[game].price;
};

export async function kiwiInfo() {
  await ensureInfra();
  const out = [];
  for (const g of KIWI_GAMES) {
    const rule = await gameRule(g);
    const po = payoutsOf(rule, g);
    out.push({
      game: g, label: GAMES[g].label, price: await gamePrice(g), enabled: !!rule,
      poolSize: GAMES[g].poolSize, pickCount: GAMES[g].pickCount,
      zodiac: GAMES[g].zodiac, symbols: GAMES[g].symbols || null,
      dice: !!GAMES[g].dice, diceSymbols: GAMES[g].diceSymbols || null,
      diceBets: GAMES[g].dice ? diceBetsOf(po.mults) : null,
      tiers: po.tiers,
    });
  }
  return out;
}

const normPicks = (game, picks) => {
  const g = GAMES[game];
  if (!Array.isArray(picks)) throw new HttpError(400, 'กรุณาเลือกเลข');
  let vals = picks.map(x => g.zodiac ? String(x) : Number(x));
  if (g.zodiac) {
    const bad = vals.filter(v => !ZODIAC_SIGNS.includes(v));
    if (bad.length || new Set(vals).size !== vals.length || vals.length !== g.pickCount)
      throw new HttpError(400, `กรุณาเลือก ${g.pickCount} ราศีที่ไม่ซ้ำกัน`);
    return vals;
  }
  vals = vals.filter(v => Number.isInteger(v) && v >= 1 && v <= g.poolSize);
  if (new Set(vals).size !== vals.length || vals.length !== g.pickCount)
    throw new HttpError(400, `กรุณาเลือก ${g.pickCount} เลขไม่ซ้ำกัน (1-${g.poolSize})`);
  return vals.sort((a, b) => a - b);
};

export async function playKiwi(userId, game, picks, betType = null, idemKey = null) {
  if (!GAMES[game]) throw new HttpError(400, 'ไม่รู้จักเกม');
  await ensureInfra();
  const g = GAMES[game];
  const price = await gamePrice(game);
  const rule = await gameRule(game);
  const draw = await standingDraw();
  if (!draw) throw new HttpError(500, 'ระบบยี่กียังไม่พร้อมใช้งาน');
  if (!rule) throw new HttpError(403, 'เกมนี้ปิดให้บริการชั่วคราว', 'GAME_CLOSED');
  await assertBettingAllowed('KI');

  const serverSeed = randomBytes(32).toString('hex');
  const commitHash = commitOf(serverSeed);
  const slipRef = makeReference('BET');
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const po = payoutsOf(rule, game);
  if (idemKey != null && (typeof idemKey !== 'string' || idemKey.length > 64))
    throw new HttpError(400, 'idempotencyKey ไม่ถูกต้อง');
  const slipKey = idemKey ? `kiwi-idem:${idemKey}` : `kiwi-${slipRef}`;

  let sel, drawn, hits, mult, payout, detail;
  if (g.dice) {
    sel = normDiceBet(betType, picks);
    drawn = drawDice(serverSeed);
    const r = settleDice(betType, sel, drawn, po.mults);
    mult = r.win ? r.mult : 0;
    payout = mult ? Math.floor(price * mult) : 0;
    hits = r.hits ?? (r.win ? 1 : 0);
    detail = { betType, sel, dice: drawn, sum: r.sum, mult: r.mult };
  } else {
    sel = normPicks(game, picks);
    drawn = g.zodiac ? drawZodiac(serverSeed) : drawNumbers(serverSeed, g.poolSize, g.pickCount);
    hits = hitsOf(sel, drawn);
    mult = po.tiers[hits] || 0;
    payout = mult ? Math.floor(price * mult) : 0;
    detail = { picks: sel, drawn, hits, mult };
  }

  const findExisting = async (d) => idemKey
    ? d.prepare(`SELECT t.id AS ticket_id FROM bet_slips s
                 JOIN kiwi_tickets t ON t.slip_id = s.id
                 WHERE s.user_id = ? AND s.idempotency_key = ?`).get(userId, slipKey)
    : null;

  let txResult;
  try {
    txResult = await txAsync(async (d) => {
      const ex = await findExisting(d);
      if (ex) return { duplicate: true, ticketId: ex.ticket_id };
      const slip = await d.prepare(`INSERT INTO bet_slips (slip_ref, user_id, draw_id, status, total_stake, total_payout, idempotency_key)
                            VALUES (?, ?, ?, ?, ?, ?, ?)`).run(slipRef, userId, draw.id,
        payout ? 'won' : 'lost', price, payout, slipKey);
      const slipId = Number(slip.lastInsertRowid);
      await d.prepare(`INSERT INTO bet_items (slip_id, draw_id, rule_id, bet_type, number, amount, status, payout, result_detail)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(slipId, draw.id, rule.id, game,
        JSON.stringify(sel), price, payout ? 'won' : 'lost', payout,
        JSON.stringify(detail));
      await debitForBetTx(d, { userId, slipRef, totalStake: price, idempotencyKey: `bet-debit-${slipRef}` });
      if (payout) {
        await d.prepare(`UPDATE bet_slips SET settled_at = ? WHERE id = ?`).run(now, slipId);
        await creditTx(d, { userId, type: 'win_credit', amount: payout,
          description: `รางวัล${g.dice ? 'น้ำเต้าปูปลา' : 'ยี่กี'} ${GAMES[game].label} ${slipRef}`,
          idempotencyKey: `kiwi-win-${slipRef}` });
      }
      const t = await d.prepare(`INSERT INTO kiwi_tickets (user_id, slip_id, game, bet_type, picks, drawn, hits, payout, status, server_seed, commit_hash, revealed_at)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'revealed', ?, ?, ?)`)
        .run(userId, slipId, game, g.dice ? betType : null, JSON.stringify(sel), JSON.stringify(drawn), hits, payout, serverSeed, commitHash, now);
      audit({ userId, action: 'kiwi.play', entityType: 'kiwi_ticket', entityId: String(t.lastInsertRowid),
        detail: { game, betType, picks: sel, drawn, hits, payout }, req: null });
      return { ticketId: Number(t.lastInsertRowid) };
    });
  } catch (e) {
    if (idemKey && /UNIQUE|constraint|duplicate key/i.test(String(e.message))) {
      const ex = await qGet(`SELECT t.id AS ticket_id FROM bet_slips s
        JOIN kiwi_tickets t ON t.slip_id = s.id
        WHERE s.user_id = $1 AND s.idempotency_key = $2`, [userId, slipKey]);
      if (ex) txResult = { duplicate: true, ticketId: ex.ticket_id };
      else throw e;
    } else throw e;
  }

  const ticket = await qGet(`SELECT t.*, s.slip_ref, s.created_at FROM kiwi_tickets t
    JOIN bet_slips s ON s.id = t.slip_id WHERE t.id = $1`, [txResult.ticketId]);
  // duplicate → คืนผลของตั๋วเดิม (payout/hits ที่บันทึกไว้) ไม่ใช่การคำนวณใหม่
  const outPayout = txResult.duplicate ? ticket.payout : payout;
  return { ...ticketView(ticket, { [game]: price }, { [game]: po }), balance: await getBalance(userId),
    outcome: outPayout ? 'win' : 'lose', payout: outPayout,
    ...(txResult.duplicate ? { duplicate: true } : {}) };
}

export async function listMyKiwi(userId, { limit = 50 } = {}) {
  await ensureInfra();
  const rows = await q(`SELECT t.*, s.slip_ref, s.created_at FROM kiwi_tickets t
    JOIN bet_slips s ON s.id = t.slip_id WHERE t.user_id = $1 ORDER BY t.id DESC LIMIT $2`, [userId, limit]);
  const prices = {}, payouts = {};
  for (const g of KIWI_GAMES) { prices[g] = await gamePrice(g); payouts[g] = payoutsOf(await gameRule(g), g); }
  return rows.map(t => ticketView(t, prices, payouts));
}

export function verifyKiwiSeed(game, seed, betType = null) {
  if (!GAMES[game]) throw new HttpError(400, 'ไม่รู้จักเกม');
  if (!seed || typeof seed !== 'string' || seed.length > 200) throw new HttpError(400, 'seed ไม่ถูกต้อง');
  const g = GAMES[game];
  if (g.dice) return { commit: commitOf(seed), drawn: drawDice(seed), diceSymbols: g.diceSymbols };
  const drawn = g.zodiac ? drawZodiac(seed) : drawNumbers(seed, g.poolSize, g.pickCount);
  return { commit: commitOf(seed), drawn };
}

const LEGACY_LABELS = { kiwi_zodiac: 'ยี่กีราศี', kiwi_animal: 'ยี่กีสัตว์' };

const ticketView = (t, prices = null, payouts = null) => {
  const g = GAMES[t.game] || {};
  const priceOf = (gm) => prices ? (prices[gm] ?? GAMES[gm]?.price ?? 0) : (GAMES[gm]?.price ?? 0);
  const po = payouts?.[t.game] || payoutsOf(null, t.game);
  return {
    id: t.id, slipRef: t.slip_ref, game: t.game, gameLabel: g.label || LEGACY_LABELS[t.game] || t.game,
    status: t.status, createdAt: t.created_at, betType: t.bet_type || null,
    dice: !!g.dice, diceSymbols: g.diceSymbols || null, diceBets: g.dice ? diceBetsOf(po.mults) : null,
    picks: JSON.parse(t.picks || '[]'), drawn: JSON.parse(t.drawn || '[]'),
    hits: t.hits, payout: t.payout,
    price: priceOf(t.game),
    symbols: g.symbols || null,
    tiers: po.tiers,
    ...(t.commit_hash ? { fairness: {
      algo: g.dice ? 'sha256(server_seed) → สุ่มลูกเต๋า 3 ลูก (mulberry32)'
        : g.zodiac ? 'sha256(server_seed) → สุ่มราศีไม่ซ้ำ (mulberry32)'
        : 'sha256(server_seed) → สุ่มเลขไม่ซ้ำ (mulberry32)',
      commit: t.commit_hash,
      seed: t.server_seed || null,
    } } : {}),
  };
};
