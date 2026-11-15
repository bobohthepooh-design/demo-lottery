import { randomBytes, createHash } from 'node:crypto';
import { getDb, tx, makeReference } from '../db/index.js';
import { HttpError, audit } from '../lib/audit.js';
import { debitForBetTx, creditTx, getBalance } from './walletService.js';
import { getSetting, setSetting } from './settingsService.js';
import { ZODIAC_SIGNS } from '../lib/zodiac.js';

/**
 * หวยยี่กี (KIWI) — instant number-pick lottery
 * - ผู้เล่นเลือกเลข K ตัวจาก pool → server สุ่ม K ผล → จ่ายตามจำนวนที่ตรง (hits)
 * - 2 เกม: kiwi (เลือก 5 จาก 1-20), kiwi_vip (เลือก 3 จาก 1-12 อัตราสูง)
 *   (kiwi_zodiac ถูกถอดออก — ซ้ำกับหวยราศี HR หลัก; ticket เก่ายังแสดงในประวัติได้)
 * - ซื้อ+เล่นจบในคำขอเดียว (provably fair: commit sha256(seed), seed เผยหลังเล่น)
 * - ทุกการเล่นสร้าง bet_slip + bet_item → "โพยของฉัน"/wallet อัตโนมัติ
 */

// ยี่กีสัตว์ (kiwi_animal) ถูกรวมเข้าเกมน้ำเต้าปูปลาแล้ว — เล่นผ่าน betType 'single'
// (เลือกสัตว์เดี่ยว 1 ใน 6 เหมือนเดิม แต่ผลตัดสินจากลูกเต๋า 3 ลูกตามกติกาเต๋า)

// น้ำเต้าปูปลา (Sic Bo) — ลูกเต๋า 3 ลูก ค่าแต้ม 1-6 เรียงตามมูลค่าสัตว์ (ปลา=1 … ไก่=6)
export const DICE_SYMBOLS = ['ปลา', 'กุ้ง', 'น้ำเต้า', 'เสือ', 'ปู', 'ไก่'];

const GAMES = {
  kiwi:       { label: 'ยี่กี',       poolSize: 20, pickCount: 5, price: 1000,  zodiac: false,
                // hits → multiplier (stake × mult) — ต่ำกว่า 2 ไม่จ่าย — RTP ~65%
                tiers: { 2: 1, 3: 4, 4: 18, 5: 70 } },
  kiwi_vip:   { label: 'ยี่กี VIP',   poolSize: 12, pickCount: 3, price: 5000,  zodiac: false,
                tiers: { 2: 4, 3: 30 } },
  kiwi_dice:  { label: 'น้ำเต้าปูปลา', poolSize: 6,  pickCount: 1, price: 1000,  zodiac: false,
                dice: true, diceSymbols: DICE_SYMBOLS },
};
export const KIWI_GAMES = Object.keys(GAMES);

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

/** สุ่ม K ตัวไม่ซ้ำจาก pool — deterministic ตาม seed */
export function drawNumbers(seed, poolSize, count) {
  const rng = mulberry32(hashSeed(`kiwi:${seed}`));
  const pool = Array.from({ length: poolSize }, (_, i) => i + 1);
  const out = [];
  while (out.length < count && pool.length) {
    out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  }
  return out.sort((a, b) => a - b);
}

/** สุ่ม K ราศีไม่ซ้ำจาก 12 ราศี — deterministic ตาม seed */
export function drawZodiac(seed, count = 6) {
  const rng = mulberry32(hashSeed(`kiwizz:${seed}`));
  const pool = [...ZODIAC_SIGNS];
  const out = [];
  while (out.length < count && pool.length) out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  return out;
}

const hitsOf = (picks, drawn) => picks.filter(p => drawn.includes(p)).length;

// ---------- น้ำเต้าปูปลา (Sic Bo) — ลูกเต๋า 3 ลูก ----------
// ค่าแต้ม 1-6 map กับ DICE_SYMBOLS — ระบบแปลงเป็นสัตว์ตอนแสดงผล
export function drawDice(seed) {
  const rng = mulberry32(hashSeed(`kiwidice:${seed}`));
  return [0, 1, 2].map(() => Math.floor(rng() * 6) + 1);
}

// betType: single(สัตว์เดี่ยว) | pair(สัตว์คู่) | triple(สัตว์ตอง)
// sel: single/triple → [เลขแต้ม 1-6]; pair → [เลข1, เลข2] ไม่ซ้ำ
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

// ตัดสินน้ำเต้าปูปลา — คืน { win, mult, sum, hits } (mult = stake × mult ทั้งจำนวน)
function settleDice(betType, sel, dice) {
  const sum = dice[0] + dice[1] + dice[2];
  switch (betType) {
    case 'single': {
      const hits = dice.filter(d => d === sel[0]).length;
      // จ่ายคงที่เมื่อออกอย่างน้อย 1 ตัว — RTP ~67%
      return { win: hits > 0, mult: 1.6, sum, hits };
    }
    case 'pair': {
      const hits = sel.filter(v => dice.includes(v)).length;
      const win = hits === 2;
      return { win, mult: 5, sum, hits }; // คู่ตรง — RTP ~69%
    }
    case 'triple': {
      const win = dice.every(d => d === sel[0]);
      return { win, mult: 150, sum, hits: win ? 3 : dice.filter(d => d === sel[0]).length };
    }
    default: return { win: false, mult: 0, sum };
  }
}

const DICE_BET_INFO = {
  single: { label: 'สัตว์เดี่ยว', desc: 'เลือกสัตว์ 1 ตัว — ออกอย่างน้อย 1 ลูกในเต๋า 3 ลูก จ่ายคงที่ ×1.6', payout: 'ออก ≥1 ตัว = ×1.6' },
  pair:   { label: 'สัตว์คู่',   desc: 'เลือกสัตว์ 2 ตัวต่างกัน — ต้องออกครบทั้งคู่ในลูกเต๋า 3 ลูก (ไม่สนลำดับ)', payout: '×5' },
  triple: { label: 'สัตว์ตอง',   desc: 'เลือกสัตว์ 1 ตัว — ต้องออกครบทั้ง 3 ลูกเต๋าเหมือนกันหมด', payout: '×150' },
};

// ---------- infra: type KI + rules + standing draw ----------
let infraReady = false;
export function ensureInfra() {
  if (infraReady) return;
  const db = getDb();
  let type = db.prepare(`SELECT id FROM lottery_types WHERE code = 'KI'`).get();
  if (!type) {
    db.prepare(`INSERT INTO lottery_types (code, name_th, name_en, description, is_active, result_mode)
                VALUES ('KI','หวยยี่กี','Yi Ki Lottery','เลือกเลขทายผลไว — รู้ผลทันที',1,'manual')`)
      .run();
    type = db.prepare(`SELECT id FROM lottery_types WHERE code = 'KI'`).get();
  }
  const typeId = type.id;
  for (const [game, g] of Object.entries(GAMES)) {
    if (!db.prepare(`SELECT id FROM lottery_rules WHERE lottery_type_id = ? AND bet_type = ?`).get(typeId, game)) {
      db.prepare(`INSERT INTO lottery_rules
        (lottery_type_id, category_id, bet_type, name_th, name_en, digits, match_config, payout_multiplier, stake_unit, min_amount, max_amount, is_active)
        VALUES (?, NULL, ?, ?, ?, 0, '{"mode":"kiwi"}', 0, 1, ?, ?, 1)`)
        .run(typeId, game, `ยี่กี — ${g.label}`, `Kiwi ${game}`, g.price, g.price);
    }
  }
  if (!db.prepare(`SELECT id FROM lottery_draws WHERE draw_code = 'KI-STANDING'`).get()) {
    db.prepare(`INSERT INTO lottery_draws (lottery_type_id, category_id, draw_code, draw_at, close_at, status)
                VALUES (?, NULL, 'KI-STANDING', '2026-01-01 00:00:00', '2026-01-01 00:00:00', 'closed')`).run(typeId);
  }
  db.prepare(`UPDATE lottery_types SET name_th='หวยยี่กี', name_en='Yi Ki Lottery', description='เลือกเลขทายผลไว — รู้ผลทันที' WHERE code='KI'`).run();
  // sync ชื่อกติกาให้ตรงเกมปัจจุบัน (กันชื่อเก่า 'กีวิ' ค้างใน DB)
  const RULE_NAMES = { kiwi: ['ยี่กี', 'Yi Ki'], kiwi_vip: ['ยี่กี VIP', 'Yi Ki VIP'], kiwi_dice: ['น้ำเต้าปูปลา', 'Nam Tao Pu Pla'] };
  for (const [g, [th, en]] of Object.entries(RULE_NAMES)) {
    db.prepare(`UPDATE lottery_rules SET name_th = ?, name_en = ? WHERE bet_type = ? AND lottery_type_id = ?`)
      .run(th, en, g, typeId);
  }
  for (const [g, def] of Object.entries(GAMES)) {
    const k = `kiwi_price_${g}`;
    if (getSetting(k) == null) setSetting(k, def.price);
    // sync ราคา setting → rule min/max (กันค่าเพี้ยนถ้าเคยแก้ฝั่งเดียว)
    const price = Number(getSetting(k)) || def.price;
    db.prepare(`UPDATE lottery_rules SET min_amount = ?, max_amount = ? WHERE bet_type = ? AND lottery_type_id = ?`)
      .run(price, price, g, typeId);
  }
  infraReady = true;
}

function standingDraw() {
  ensureInfra();
  return getDb().prepare(`SELECT d.* FROM lottery_draws d WHERE d.draw_code = 'KI-STANDING'`).get();
}
function gameRule(game) {
  const draw = standingDraw();
  return getDb().prepare(`SELECT * FROM lottery_rules WHERE lottery_type_id = ? AND bet_type = ? AND is_active = 1`)
    .get(draw.lottery_type_id, game);
}

const gamePrice = (game) => {
  // ราคา source of truth = system_settings kiwi_price_<game> (admin แก้ได้ทั้งหน้า Settings และหน้ากติกา — sync กันอัตโนมัติ)
  // fallback: rule.min_amount → ค่า default ของเกม
  const s = Number(getSetting(`kiwi_price_${game}`));
  if (Number.isInteger(s) && s > 0) return s;
  const r = gameRule(game);
  const p = r ? Number(r.min_amount) : NaN;
  return Number.isInteger(p) && p > 0 ? p : GAMES[game].price;
};

export function kiwiInfo() {
  ensureInfra();
  return KIWI_GAMES.map(g => ({
    game: g, label: GAMES[g].label, price: gamePrice(g),
    poolSize: GAMES[g].poolSize, pickCount: GAMES[g].pickCount,
    zodiac: GAMES[g].zodiac, symbols: GAMES[g].symbols || null,
    dice: !!GAMES[g].dice, diceSymbols: GAMES[g].diceSymbols || null,
    diceBets: GAMES[g].dice ? DICE_BET_INFO : null,
    tiers: GAMES[g].tiers || {},
  }));
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

/** เล่นยี่กี — เลือกเลข + server สุ่มผล + จ่ายรางวัลใน transaction เดียว */
export function playKiwi(userId, game, picks, betType = null) {
  if (!GAMES[game]) throw new HttpError(400, 'ไม่รู้จักเกม');
  const g = GAMES[game];
  const price = gamePrice(game);
  const rule = gameRule(game);
  const draw = standingDraw();
  if (!rule || !draw) throw new HttpError(500, 'ระบบยี่กียังไม่พร้อมใช้งาน');

  const serverSeed = randomBytes(32).toString('hex');
  const commitHash = commitOf(serverSeed);
  const slipRef = makeReference('BET');
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);

  let sel, drawn, hits, mult, payout, detail;
  if (g.dice) {
    // น้ำเต้าปูปลา — ลูกเต๋า 3 ลูก + รูปแบบการแทง
    sel = normDiceBet(betType, picks);
    drawn = drawDice(serverSeed);
    const r = settleDice(betType, sel, drawn);
    mult = r.win ? r.mult : 0;
    payout = mult ? Math.floor(price * mult) : 0;
    hits = r.hits ?? (r.win ? 1 : 0);
    detail = { betType, sel, dice: drawn, sum: r.sum, mult: r.mult };
  } else {
    sel = normPicks(game, picks);
    drawn = g.zodiac ? drawZodiac(serverSeed) : drawNumbers(serverSeed, g.poolSize, g.pickCount);
    hits = hitsOf(sel, drawn);
    mult = g.tiers[hits] || 0;
    payout = mult ? Math.floor(price * mult) : 0;
    detail = { picks: sel, drawn, hits, mult };
  }

  const { ticketId } = tx((d) => {
    const slip = d.prepare(`INSERT INTO bet_slips (slip_ref, user_id, draw_id, status, total_stake, total_payout, idempotency_key)
                            VALUES (?, ?, ?, ?, ?, ?, ?)`).run(slipRef, userId, draw.id,
      payout ? 'won' : 'lost', price, payout, `kiwi-${slipRef}`);
    const slipId = Number(slip.lastInsertRowid);
    d.prepare(`INSERT INTO bet_items (slip_id, draw_id, rule_id, bet_type, number, amount, status, payout, result_detail)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(slipId, draw.id, rule.id, game,
      JSON.stringify(sel), price, payout ? 'won' : 'lost', payout,
      JSON.stringify(detail));
    debitForBetTx(d, { userId, slipRef, totalStake: price, idempotencyKey: `bet-debit-${slipRef}` });
    if (payout) {
      d.prepare(`UPDATE bet_slips SET settled_at = ? WHERE id = ?`).run(now, slipId);
      creditTx(d, { userId, type: 'win_credit', amount: payout,
        description: `รางวัล${g.dice ? 'น้ำเต้าปูปลา' : 'ยี่กี'} ${GAMES[game].label} ${slipRef}`,
        idempotencyKey: `kiwi-win-${slipRef}` });
    }
    const t = d.prepare(`INSERT INTO kiwi_tickets (user_id, slip_id, game, bet_type, picks, drawn, hits, payout, status, server_seed, commit_hash, revealed_at)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'revealed', ?, ?, ?)`)
      .run(userId, slipId, game, g.dice ? betType : null, JSON.stringify(sel), JSON.stringify(drawn), hits, payout, serverSeed, commitHash, now);
    audit({ userId, action: 'kiwi.play', entityType: 'kiwi_ticket', entityId: String(t.lastInsertRowid),
      detail: { game, betType, picks: sel, drawn, hits, payout }, req: null });
    return { ticketId: Number(t.lastInsertRowid), slipId };
  });

  const ticket = getDb().prepare(`SELECT t.*, s.slip_ref, s.created_at FROM kiwi_tickets t
    JOIN bet_slips s ON s.id = t.slip_id WHERE t.id = ?`).get(ticketId);
  return { ...ticketView(ticket), balance: getBalance(userId), outcome: payout ? 'win' : 'lose', payout };
}

export function listMyKiwi(userId, { limit = 50 } = {}) {
  ensureInfra();
  const rows = getDb().prepare(`SELECT t.*, s.slip_ref, s.created_at FROM kiwi_tickets t
    JOIN bet_slips s ON s.id = t.slip_id WHERE t.user_id = ? ORDER BY t.id DESC LIMIT ?`).all(userId, limit);
  return rows.map(ticketView);
}

/** ตรวจสอบย้อนหลัง — ใส่ server_seed → คืนผลที่ derive ได้ */
export function verifyKiwiSeed(game, seed, betType = null) {
  if (!GAMES[game]) throw new HttpError(400, 'ไม่รู้จักเกม');
  if (!seed || typeof seed !== 'string' || seed.length > 200) throw new HttpError(400, 'seed ไม่ถูกต้อง');
  const g = GAMES[game];
  if (g.dice) return { commit: commitOf(seed), drawn: drawDice(seed), diceSymbols: g.diceSymbols };
  const drawn = g.zodiac ? drawZodiac(seed) : drawNumbers(seed, g.poolSize, g.pickCount);
  return { commit: commitOf(seed), drawn };
}

// label สำหรับเกมเก่าที่ถูกถอด/รวมแล้ว (kiwi_zodiac, kiwi_animal) — กันประวัติแสดงรหัสดิบ
const LEGACY_LABELS = { kiwi_zodiac: 'ยี่กีราศี', kiwi_animal: 'ยี่กีสัตว์' };

const ticketView = (t) => {
  const g = GAMES[t.game] || {};
  return {
    id: t.id, slipRef: t.slip_ref, game: t.game, gameLabel: g.label || LEGACY_LABELS[t.game] || t.game,
    status: t.status, createdAt: t.created_at, betType: t.bet_type || null,
    dice: !!g.dice, diceSymbols: g.diceSymbols || null, diceBets: g.dice ? DICE_BET_INFO : null,
    picks: JSON.parse(t.picks || '[]'), drawn: JSON.parse(t.drawn || '[]'),
    hits: t.hits, payout: t.payout,
    price: gamePrice(t.game),
    symbols: g.symbols || null,
    tiers: g.tiers || {},
    ...(t.commit_hash ? { fairness: {
      algo: g.dice ? 'sha256(server_seed) → สุ่มลูกเต๋า 3 ลูก (mulberry32)'
        : g.zodiac ? 'sha256(server_seed) → สุ่มราศีไม่ซ้ำ (mulberry32)'
        : 'sha256(server_seed) → สุ่มเลขไม่ซ้ำ (mulberry32)',
      commit: t.commit_hash,
      seed: t.server_seed || null,
    } } : {}),
  };
};
