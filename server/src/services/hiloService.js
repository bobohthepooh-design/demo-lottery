import { randomBytes, createHash } from 'node:crypto';
import { getDb, tx, makeReference } from '../db/index.js';
import { HttpError, audit } from '../lib/audit.js';
import { debitForBetTx, creditTx, getBalance } from './walletService.js';
import { getSetting, setSetting } from './settingsService.js';

/**
 * ไฮโล (Sic Bo / ไฮโลไทย) — ทอยเต๋า 3 ลูก ทายผลรวม
 * - ต่ำ (low)    = ผลรวม 3–10   ~50.0%  → จ่ายตาม mult_low
 * - สูง (high)   = ผลรวม 12–18  ~37.5%  → จ่ายตาม mult_high
 * - 11 ไฮโล      = ผลรวม 11 พอดี ~12.5% → จ่ายตาม mult_11 (รางวัลใหญ่)
 * - เต๋าสุ่มฝั่ง server ตอนซื้อ (crypto) เก็บลับจนกว่าผู้เล่นเลือกเดิมพัน+เปิดเผย
 * - RTP เป้า ~90% ต่อฝั่งเดิมพัน — ปรับอัตราจ่ายได้ผ่าน system_settings
 * - ทุกการเล่นสร้าง bet_slip + bet_item → "โพยของฉัน"/wallet อัตโนมัติ
 */

const PRICE_SATANG = () => parseInt(getSetting('hilo_price', '5000'), 10) || 5000; // ฿50
const MULT = {
  low:    () => parseFloat(getSetting('hilo_mult_low', '1.8')) || 1.8,   // P=50%   → RTP 90%
  high:   () => parseFloat(getSetting('hilo_mult_high', '2.4')) || 2.4,  // P=37.5% → RTP 90%
  eleven: () => parseFloat(getSetting('hilo_mult_11', '7')) || 7,        // P=12.5% → RTP 87.5%
};
export const HILO_PICKS = ['low', 'high', 'eleven'];

/** อัตราจ่ายปัจจุบัน (อ่านจาก settings ทุกครั้ง) — ให้ public-config แสดงบนหน้าบ้าน */
export function hiloMultipliers() {
  return { low: multFor('low'), high: multFor('high'), eleven: multFor('eleven') };
}

// ผลรวมเต๋า 3 ลูก → ฝั่งที่ชนะ (ผลรวม 11 นับเป็น 'eleven' ไม่ใช่ high/low)
export function hiloOutcome(dice) {
  const sum = dice[0] + dice[1] + dice[2];
  if (sum === 11) return 'eleven';
  return sum >= 12 ? 'high' : 'low';
}

const pickLabel = (p) => p === 'high' ? 'สูง' : p === 'eleven' ? '11 ไฮโล' : 'ต่ำ';

// Provably fair — commit = sha256(server_seed); เต๋า derive จาก seed เดียว (deterministic)
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
/** เต๋า 3 ลูกจาก server_seed — ใช้ทั้งตอนซื้อและตอน verify ต้องได้ผลเดียวกันเสมอ */
export function diceFromSeed(seed) {
  const rng = mulberry32(hashSeed(`hilo:${seed}`));
  return [1 + Math.floor(rng() * 6), 1 + Math.floor(rng() * 6), 1 + Math.floor(rng() * 6)];
}

// ---------- infra: type HL + rule + standing draw ----------
let infraReady = false;
export function ensureInfra() {
  if (infraReady) return;
  const db = getDb();
  let type = db.prepare(`SELECT id FROM lottery_types WHERE code = 'HL'`).get();
  if (!type) {
    db.prepare(`INSERT INTO lottery_types (code, name_th, name_en, description, is_active, result_mode)
                VALUES ('HL','ไฮโลเต๋า','Hi-Lo Dice','ทายเต๋า 3 ลูก สูง/ต่ำ/11 — รู้ผลทันที',1,'manual')`)
      .run();
    type = db.prepare(`SELECT id FROM lottery_types WHERE code = 'HL'`).get();
  }
  const typeId = type.id;
  if (!db.prepare(`SELECT id FROM lottery_rules WHERE lottery_type_id = ? AND bet_type = 'hilo'`).get(typeId)) {
    db.prepare(`INSERT INTO lottery_rules
      (lottery_type_id, category_id, bet_type, name_th, name_en, digits, match_config, payout_multiplier, stake_unit, min_amount, max_amount, is_active)
      VALUES (?, NULL, 'hilo', 'ไฮโลเต๋า 3 ลูก', 'Hi-Lo Dice', 0, '{"mode":"hilo"}', 0, 1, 5000, 5000, 1)`)
      .run(typeId);
  }
  // กติกาแยกตามฝั่งเดิมพัน — admin ปรับอัตราจ่ายได้ใน /admin/lotteries (กติกา) โดยตรง
  // payout_multiplier ของแต่ละกติกา = ตัวคูณเงินรางวัลของฝั่งนั้น (settings เป็น fallback)
  const price = PRICE_SATANG();
  const PICK_DEFS = [
    ['hilo_low', 'ไฮโล — ต่ำ (ผลรวม 3-10)', 'hilo_mult_low'],
    ['hilo_high', 'ไฮโล — สูง (ผลรวม 12-18)', 'hilo_mult_high'],
    ['hilo_eleven', 'ไฮโล — 11 ไฮโล (ผลรวม 11)', 'hilo_mult_11'],
  ];
  for (const [bt, name, sk] of PICK_DEFS) {
    if (!db.prepare(`SELECT id FROM lottery_rules WHERE lottery_type_id = ? AND bet_type = ?`).get(typeId, bt)) {
      const mv = Number(getSetting(sk)) || MULT[bt === 'hilo_low' ? 'low' : bt === 'hilo_high' ? 'high' : 'eleven']();
      db.prepare(`INSERT INTO lottery_rules
        (lottery_type_id, category_id, bet_type, name_th, name_en, digits, match_config, payout_multiplier, stake_unit, min_amount, max_amount, is_active)
        VALUES (?, NULL, ?, ?, ?, 0, '{"mode":"hilo"}', ?, 1, ?, ?, 1)`)
        .run(typeId, bt, name, name, mv, price, price);
    }
  }
  if (!db.prepare(`SELECT id FROM lottery_draws WHERE draw_code = 'HL-STANDING'`).get()) {
    db.prepare(`INSERT INTO lottery_draws (lottery_type_id, category_id, draw_code, draw_at, close_at, status)
                VALUES (?, NULL, 'HL-STANDING', '2026-01-01 00:00:00', '2026-01-01 00:00:00', 'closed')`).run(typeId);
  }
  // อัปเดตชื่อ/คำอธิบายให้ตรงเกม 3 ลูก (idempotent)
  db.prepare(`UPDATE lottery_types SET name_th='ไฮโลเต๋า', description='ทายเต๋า 3 ลูก สูง/ต่ำ/11 — รู้ผลทันที' WHERE code='HL'`).run();
  // ค่าเริ่มต้นราคา/อัตราจ่าย — admin แก้ได้ใน /admin/settings (game_instant_*)
  const defaults = { hilo_price: 5000, hilo_mult_low: 1.8, hilo_mult_high: 2.4, hilo_mult_11: 7 };
  for (const [k, v] of Object.entries(defaults)) {
    if (getSetting(k) == null) setSetting(k, v);
  }
  infraReady = true;
}

function standingDraw() {
  ensureInfra();
  return getDb().prepare(`SELECT d.* FROM lottery_draws d WHERE d.draw_code = 'HL-STANDING'`).get();
}
function hiloRule() {
  const draw = standingDraw();
  return getDb().prepare(`SELECT * FROM lottery_rules WHERE lottery_type_id = ? AND bet_type = 'hilo' AND is_active = 1`)
    .get(draw.lottery_type_id);
}

// กติกาอัตราจ่ายแยกตามฝั่ง — admin แก้ payout_multiplier ในหน้ากติกาได้โดยตรง
const PICK_RULE = { low: 'hilo_low', high: 'hilo_high', eleven: 'hilo_eleven' };
function pickRule(pick) {
  const draw = standingDraw();
  return getDb().prepare(`SELECT * FROM lottery_rules WHERE lottery_type_id = ? AND bet_type = ? AND is_active = 1`)
    .get(draw.lottery_type_id, PICK_RULE[pick]);
}
function multFor(pick) {
  const r = pickRule(pick);
  const m = r ? Number(r.payout_multiplier) : NaN;
  return Number.isFinite(m) && m > 0 ? m : MULT[pick]();
}

/** ราคาต่อครั้ง — ใช้ min_amount ของกติกา 'hilo' (admin แก้ในหน้ากติกา) fallback settings */
export function hiloPrice() {
  const r = hiloRule();
  const p = r ? Number(r.min_amount) : NaN;
  return Number.isInteger(p) && p > 0 ? p : PRICE_SATANG();
}

const diceOf = (t) => [t.die1, t.die2, t.die3 ?? t.die2]; // die3 NULL = ตั๋วเก่าจากเวอร์ชัน 2 ลูก
const sumOf = (t) => diceOf(t).reduce((a, b) => a + b, 0);

const ticketView = (t) => {
  const revealed = t.status === 'revealed';
  return {
    id: t.id,
    slipRef: t.slip_ref,
    status: t.status,
    pick: t.pick || null,
    createdAt: t.created_at,
    // เต๋าเปิดเผยเฉพาะหลัง settle — ก่อนหน้านั้นซ่อนเป็น ?
    ...(revealed ? { dice: diceOf(t), sum: sumOf(t), side: hiloOutcome(diceOf(t)) } : {}),
    // ตัวเลือกเดิมพัน + อัตราจ่าย (คำนวณจาก settings ทุกครั้ง)
    bets: HILO_PICKS.map(p => ({ pick: p, label: pickLabel(p), mult: multFor(p), maxPayout: Math.floor(hiloPrice() * multFor(p)) })),
    // fairness: commit เผยตั้งแต่ซื้อ — seed เผยหลัง reveal เท่านั้น
    ...(t.commit_hash ? { fairness: {
      algo: 'sha256(server_seed) → เต๋า 3 ลูก (mulberry32)',
      commit: t.commit_hash,
      seed: revealed ? t.server_seed : null,
    } } : {}),
  };
};

/** ซื้อรอบ — สุ่มเต๋า 3 ลูกฝั่ง server, หักเครดิต, เก็บผลลับ */
export function buyTicket(userId) {
  ensureInfra();
  const price = hiloPrice();
  const draw = standingDraw();
  const rule = hiloRule();
  if (!draw || !rule) throw new HttpError(500, 'ระบบไฮโลยังไม่พร้อมใช้งาน');

  const serverSeed = randomBytes(32).toString('hex');
  const commitHash = commitOf(serverSeed);
  const dice = diceFromSeed(serverSeed);
  const cardRef = makeReference('HL');
  const slipRef = makeReference('BET');

  const result = tx((d) => {
    const slip = d.prepare(`INSERT INTO bet_slips (slip_ref, user_id, draw_id, status, total_stake, idempotency_key)
                            VALUES (?, ?, ?, 'pending', ?, ?)`).run(slipRef, userId, draw.id, price, `hilo-${cardRef}`);
    const slipId = Number(slip.lastInsertRowid);
    // bet_items.number ห้ามเก็บเต๋าจริง — รั่วให้สมาชิกเห็นผลล่วงหน้าผ่าน /bets/mine
    // (เต๋าอยู่ใน hilo_tickets + result_detail หลัง reveal เท่านั้น)
    d.prepare(`INSERT INTO bet_items (slip_id, draw_id, rule_id, bet_type, number, amount)
               VALUES (?, ?, ?, 'hilo', ?, ?)`).run(slipId, draw.id, rule.id, cardRef, price);
    debitForBetTx(d, { userId, slipRef, totalStake: price, idempotencyKey: `bet-debit-${slipRef}` });
    const t = d.prepare(`INSERT INTO hilo_tickets (user_id, slip_id, die1, die2, die3, status, server_seed, commit_hash)
                         VALUES (?, ?, ?, ?, ?, 'awaiting', ?, ?)`).run(userId, slipId, ...dice, serverSeed, commitHash);
    audit({ userId, action: 'hilo.buy', entityType: 'hilo_ticket', entityId: String(t.lastInsertRowid),
      detail: { dice, price, slipRef }, req: null });
    return { ticketId: Number(t.lastInsertRowid), slipRef, price };
  });

  const ticket = getDb().prepare(`SELECT t.*, s.slip_ref, s.created_at FROM hilo_tickets t
    JOIN bet_slips s ON s.id = t.slip_id WHERE t.id = ?`).get(result.ticketId);
  return { ...result, balance: getBalance(userId), ticket: ticketView(ticket) };
}

/** เล่นจบในคำขอเดียว — ซื้อ+ทาย+เปิดเต๋าทันที (ใช้เมื่อยังไม่มีตั๋ว awaiting) */
export function playTicket(userId, pick) {
  // validate pick ก่อนซื้อ — กันหักเครดิตแล้วค่อย error (ตั๋ว awaiting ค้างโดยไม่ตั้งใจ)
  if (!HILO_PICKS.includes(pick)) throw new HttpError(400, 'กรุณาเลือก สูง / ต่ำ / 11 ไฮโล');
  const { ticketId } = buyTicket(userId);
  return guessTicket(userId, ticketId, pick);
}

export function listMyTickets(userId, { limit = 50 } = {}) {
  ensureInfra();
  const rows = getDb().prepare(`SELECT t.*, s.slip_ref, s.created_at, s.status AS slip_status
    FROM hilo_tickets t JOIN bet_slips s ON s.id = t.slip_id
    WHERE t.user_id = ? ORDER BY t.id DESC LIMIT ?`).all(userId, limit);
  return rows.map(ticketView);
}

/** ตรวจสอบย้อนหลัง — ใส่ server_seed ที่เผยหลัง reveal → คืนเต๋าที่ derive ได้ */
export function verifyHiloSeed(seed) {
  if (!seed || typeof seed !== 'string' || seed.length > 200) throw new HttpError(400, 'seed ไม่ถูกต้อง');
  const dice = diceFromSeed(seed);
  return { commit: commitOf(seed), dice, sum: dice.reduce((a, b) => a + b, 0), side: hiloOutcome(dice) };
}

/** เลือกเดิมพัน high/low/eleven — settle + เปิดเผยเต๋าทันทีใน transaction เดียว (idempotent) */
export function guessTicket(userId, ticketId, pick) {
  if (!HILO_PICKS.includes(pick)) throw new HttpError(400, 'กรุณาเลือก สูง / ต่ำ / 11 ไฮโล');
  const t = getDb().prepare(`SELECT t.*, s.slip_ref, s.status AS slip_status, s.total_stake
    FROM hilo_tickets t JOIN bet_slips s ON s.id = t.slip_id
    WHERE t.id = ? AND t.user_id = ?`).get(ticketId, userId);
  if (!t) throw new HttpError(404, 'ไม่พบตั๋ว');
  if (t.status === 'revealed') {
    const dice = diceOf(t);
    return { ...ticketView(t), balance: getBalance(userId), duplicate: true,
      outcome: hiloOutcome(dice) === t.pick ? 'win' : 'lose' };
  }
  if (t.slip_status !== 'pending') throw new HttpError(400, 'โพยนี้ถูกยกเลิกแล้ว');

  const dice = diceOf(t);
  const sum = dice.reduce((a, b) => a + b, 0);
  const outcomeSide = hiloOutcome(dice);
  const win = outcomeSide === pick;
  const stake = t.total_stake;
  const mult = multFor(pick);
  const payout = win ? Math.floor(stake * mult) : 0;
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const detail = JSON.stringify({ dice, sum, pick, mult, won: outcomeSide });

  tx((d) => {
    d.prepare(`UPDATE hilo_tickets SET pick = ?, status = 'revealed', revealed_at = ? WHERE id = ?`)
      .run(pick, now, ticketId);
    if (win) {
      d.prepare(`UPDATE bet_items SET status = 'won', payout = ?, result_detail = ? WHERE slip_id = ? AND bet_type = 'hilo'`)
        .run(payout, detail, t.slip_id);
      d.prepare(`UPDATE bet_slips SET status = 'won', total_payout = ?, settled_at = ? WHERE id = ?`)
        .run(payout, now, t.slip_id);
      creditTx(d, {
        userId, type: 'win_credit', amount: payout,
        description: `รางวัลไฮโล ${t.slip_ref} — ${dice.join('-')} ผลรวม ${sum} (${pickLabel(pick)} ×${mult})`,
        idempotencyKey: `hilo-win-${t.slip_ref}`,
      });
    } else {
      d.prepare(`UPDATE bet_items SET status = 'lost', payout = 0, result_detail = ? WHERE slip_id = ? AND bet_type = 'hilo'`)
        .run(detail, t.slip_id);
      d.prepare(`UPDATE bet_slips SET status = 'lost', total_payout = 0, settled_at = ? WHERE id = ?`)
        .run(now, t.slip_id);
    }
    audit({ userId, action: 'hilo.guess', entityType: 'hilo_ticket', entityId: String(ticketId),
      detail: { pick, dice, sum, win, payout }, req: null });
  });

  const fresh = getDb().prepare(`SELECT t.*, s.slip_ref, s.created_at FROM hilo_tickets t
    JOIN bet_slips s ON s.id = t.slip_id WHERE t.id = ?`).get(ticketId);
  const view = ticketView(fresh);
  return { ...view, balance: getBalance(userId), outcome: win ? 'win' : 'lose', payout, mult };
}
