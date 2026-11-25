import { randomBytes, createHash } from 'node:crypto';
import { txAsync, makeReference } from '../db/index.js';
import { HttpError, audit } from '../lib/audit.js';
import { debitForBetTx, creditTx, getBalance } from './walletService.js';
import { getSetting, setSetting, assertBettingAllowed } from './settingsService.js';
import { notify } from './notifyService.js';
import { q, qGet, qRun } from '../db/pg.js';

/**
 * ไฮโล (Sic Bo / ไฮโลไทย) — ทอยเต๋า 3 ลูก ทายผลรวม
 * - ต่ำ (low)    = ผลรวม 3–10   ~50.0%  → จ่ายตาม mult_low
 * - สูง (high)   = ผลรวม 12–18  ~37.5%  → จ่ายตาม mult_high
 * - 11 ไฮโล      = ผลรวม 11 พอดี ~12.5% → จ่ายตาม mult_11 (รางวัลใหญ่)
 * - เต๋าสุ่มฝั่ง server ตอนซื้อ (crypto) เก็บลับจนกว่าผู้เล่นเลือกเดิมพัน+เปิดเผย
 * - RTP เป้า ~90% ต่อฝั่งเดิมพัน — ปรับอัตราจ่ายได้ผ่าน system_settings
 * - ทุกการเล่นสร้าง bet_slip + bet_item → "โพยของฉัน"/wallet อัตโนมัติ
 */

const FALLBACK_PRICE = 5000;
const FALLBACK_MULT = { low: 1.8, high: 2.4, eleven: 7 };
const PRICE_SATANG = async () => parseInt(await getSetting('hilo_price', '5000'), 10) || FALLBACK_PRICE;
export const HILO_PICKS = ['low', 'high', 'eleven'];

export async function hiloMultipliers() {
  return { low: await multFor('low'), high: await multFor('high'), eleven: await multFor('eleven') };
}

export function hiloOutcome(dice) {
  const sum = dice[0] + dice[1] + dice[2];
  if (sum === 11) return 'eleven';
  return sum >= 12 ? 'high' : 'low';
}

const pickLabel = (p) => p === 'high' ? 'สูง' : p === 'eleven' ? '11 ไฮโล' : 'ต่ำ';

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
export function diceFromSeed(seed) {
  const rng = mulberry32(hashSeed(`hilo:${seed}`));
  return [1 + Math.floor(rng() * 6), 1 + Math.floor(rng() * 6), 1 + Math.floor(rng() * 6)];
}

// ---------- infra: type HL + rule + standing draw ----------
let infraReady = false;
export async function ensureInfra() {
  if (infraReady) return;
  let type = await qGet(`SELECT id FROM lottery_types WHERE code = 'HL'`);
  if (!type) {
    await qRun(`INSERT INTO lottery_types (code, name_th, name_en, description, is_active, result_mode)
                VALUES ('HL','ไฮโลเต๋า','Hi-Lo Dice','ทายเต๋า 3 ลูก สูง/ต่ำ/11 — รู้ผลทันที',1,'manual')`);
    type = await qGet(`SELECT id FROM lottery_types WHERE code = 'HL'`);
  }
  const typeId = type.id;
  if (!(await qGet(`SELECT id FROM lottery_rules WHERE lottery_type_id = $1 AND bet_type = 'hilo'`, [typeId]))) {
    await qRun(`INSERT INTO lottery_rules
      (lottery_type_id, category_id, bet_type, name_th, name_en, digits, match_config, payout_multiplier, stake_unit, min_amount, max_amount, is_active)
      VALUES ($1, NULL, 'hilo', 'ไฮโลเต๋า 3 ลูก', 'Hi-Lo Dice', 0, '{"mode":"hilo"}', 0, 1, 5000, 5000, 1)`, [typeId]);
  }
  // อ่านราคาจาก rule ที่เพิ่งสร้างโดยตรง — ห้ามเรียก hiloPrice() ตรงนี้
  // เพราะ HL-STANDING draw ยังไม่ถูก insert (hiloRule ต้องการ draw ก่อน) → null.lottery_type_id
  const priceRow = await qGet(`SELECT min_amount FROM lottery_rules WHERE lottery_type_id = $1 AND bet_type = 'hilo' AND is_active = 1`, [typeId]);
  const price = priceRow ? Number(priceRow.min_amount) : (await PRICE_SATANG());
  const PICK_DEFS = [
    ['hilo_low', 'ไฮโล — ต่ำ (ผลรวม 3-10)', 'hilo_mult_low'],
    ['hilo_high', 'ไฮโล — สูง (ผลรวม 12-18)', 'hilo_mult_high'],
    ['hilo_eleven', 'ไฮโล — 11 ไฮโล (ผลรวม 11)', 'hilo_mult_11'],
  ];
  for (const [bt, name, sk] of PICK_DEFS) {
    if (!(await qGet(`SELECT id FROM lottery_rules WHERE lottery_type_id = $1 AND bet_type = $2`, [typeId, bt]))) {
      const mv = Number(await getSetting(sk)) || FALLBACK_MULT[bt === 'hilo_low' ? 'low' : bt === 'hilo_high' ? 'high' : 'eleven'];
      await qRun(`INSERT INTO lottery_rules
        (lottery_type_id, category_id, bet_type, name_th, name_en, digits, match_config, payout_multiplier, stake_unit, min_amount, max_amount, is_active)
        VALUES ($1, NULL, $2, $3, $4, 0, '{"mode":"hilo"}', $5, 1, $6, $7, 1)`,
        [typeId, bt, name, name, mv, price, price]);
    }
  }
  if (!(await qGet(`SELECT id FROM lottery_draws WHERE draw_code = 'HL-STANDING'`))) {
    await qRun(`INSERT INTO lottery_draws (lottery_type_id, category_id, draw_code, draw_at, close_at, status)
                VALUES ($1, NULL, 'HL-STANDING', '2026-01-01 00:00:00', '2026-01-01 00:00:00', 'closed')`, [typeId]);
  }
  await qRun(`UPDATE lottery_types SET name_th='ไฮโลเต๋า', description='ทายเต๋า 3 ลูก สูง/ต่ำ/11 — รู้ผลทันที' WHERE code='HL'`);
  const defaults = { hilo_price: 5000, hilo_mult_low: 1.8, hilo_mult_high: 2.4, hilo_mult_11: 7 };
  for (const [k, v] of Object.entries(defaults)) {
    if ((await getSetting(k)) == null) await setSetting(k, v);
  }
  infraReady = true;
}

async function standingDraw() {
  await ensureInfra();
  return qGet(`SELECT d.* FROM lottery_draws d WHERE d.draw_code = 'HL-STANDING'`);
}
async function hiloRule() {
  const draw = await standingDraw();
  return qGet(`SELECT r.* FROM lottery_rules r
    JOIN lottery_types lt ON lt.id = r.lottery_type_id
    WHERE r.lottery_type_id = $1 AND r.bet_type = 'hilo' AND r.is_active = 1 AND lt.is_active = 1`,
    [draw.lottery_type_id]);
}

// เกมเปิดให้เล่น = rule ฐาน + ประเภทหวย (HL) ยัง active — ใช้ public-config + หน้าบ้านซ่อนการ์ดที่ปิด
export async function gameEnabled() {
  return !!(await hiloRule());
}

const PICK_RULE = { low: 'hilo_low', high: 'hilo_high', eleven: 'hilo_eleven' };
async function pickRule(pick) {
  const draw = await standingDraw();
  return qGet(`SELECT r.* FROM lottery_rules r
    JOIN lottery_types lt ON lt.id = r.lottery_type_id
    WHERE r.lottery_type_id = $1 AND r.bet_type = $2 AND r.is_active = 1 AND lt.is_active = 1`,
    [draw.lottery_type_id, PICK_RULE[pick]]);
}
async function multFor(pick) {
  const r = await pickRule(pick);
  const m = r ? Number(r.payout_multiplier) : NaN;
  return Number.isFinite(m) && m > 0 ? m : FALLBACK_MULT[pick];
}

export async function hiloPrice() {
  const r = await hiloRule();
  const p = r ? Number(r.min_amount) : NaN;
  return Number.isInteger(p) && p > 0 ? p : await PRICE_SATANG();
}

const diceOf = (t) => [t.die1, t.die2, t.die3 ?? t.die2];
const sumOf = (t) => diceOf(t).reduce((a, b) => a + b, 0);

const ticketView = (t, betsOverride = null) => {
  const revealed = t.status === 'revealed';
  const bets = betsOverride || HILO_PICKS.map(p => ({ pick: p, label: pickLabel(p), mult: multFor(p), maxPayout: Math.floor(hiloPrice() * multFor(p)) }));
  return {
    id: t.id,
    slipRef: t.slip_ref,
    status: t.status,
    pick: t.pick || null,
    createdAt: t.created_at,
    ...(revealed ? { dice: diceOf(t), sum: sumOf(t), side: hiloOutcome(diceOf(t)) } : {}),
    bets,
    ...(t.commit_hash ? { fairness: {
      algo: 'sha256(server_seed) → เต๋า 3 ลูก (mulberry32)',
      commit: t.commit_hash,
      seed: revealed ? t.server_seed : null,
    } } : {}),
  };
};

async function betsFor() {
  const price = await hiloPrice();
  const out = [];
  for (const p of HILO_PICKS) {
    const mult = await multFor(p);
    out.push({ pick: p, label: pickLabel(p), mult, maxPayout: Math.floor(price * mult) });
  }
  return out;
}

export async function buyTicket(userId, idemKey = null) {
  await ensureInfra();
  if (idemKey != null && (typeof idemKey !== 'string' || idemKey.length > 64))
    throw new HttpError(400, 'idempotencyKey ไม่ถูกต้อง');
  const price = await hiloPrice();
  const draw = await standingDraw();
  const rule = await hiloRule();
  if (!draw) throw new HttpError(500, 'ระบบไฮโลยังไม่พร้อมใช้งาน');
  if (!rule) throw new HttpError(403, 'เกมนี้ปิดให้บริการชั่วคราว', 'GAME_CLOSED');
  await assertBettingAllowed('HL');

  const serverSeed = randomBytes(32).toString('hex');
  const commitHash = commitOf(serverSeed);
  const dice = diceFromSeed(serverSeed);
  const cardRef = makeReference('HL');
  const slipRef = makeReference('BET');
  const slipKey = idemKey ? `hilo-idem:${idemKey}` : `hilo-${cardRef}`;
  const bets = await betsFor();

  const findExisting = async (d) => idemKey
    ? d.prepare(`SELECT s.slip_ref, s.total_stake, t.id AS ticket_id
                 FROM bet_slips s JOIN hilo_tickets t ON t.slip_id = s.id
                 WHERE s.user_id = ? AND s.idempotency_key = ?`).get(userId, slipKey)
    : null;

  let result;
  try {
    result = await txAsync(async (d) => {
      const ex = await findExisting(d);
      if (ex) return { duplicate: true, ticketId: ex.ticket_id, slipRef: ex.slip_ref, price: ex.total_stake };
      const slip = await d.prepare(`INSERT INTO bet_slips (slip_ref, user_id, draw_id, status, total_stake, idempotency_key)
                              VALUES (?, ?, ?, 'pending', ?, ?)`).run(slipRef, userId, draw.id, price, slipKey);
      const slipId = Number(slip.lastInsertRowid);
      await d.prepare(`INSERT INTO bet_items (slip_id, draw_id, rule_id, bet_type, number, amount)
                 VALUES (?, ?, ?, 'hilo', ?, ?)`).run(slipId, draw.id, rule.id, cardRef, price);
      await debitForBetTx(d, { userId, slipRef, totalStake: price, idempotencyKey: `bet-debit-${slipRef}` });
      const t = await d.prepare(`INSERT INTO hilo_tickets (user_id, slip_id, die1, die2, die3, status, server_seed, commit_hash)
                           VALUES (?, ?, ?, ?, ?, 'awaiting', ?, ?)`).run(userId, slipId, ...dice, serverSeed, commitHash);
      audit({ userId, action: 'hilo.buy', entityType: 'hilo_ticket', entityId: String(t.lastInsertRowid),
        detail: { dice, price, slipRef }, req: null });
      return { ticketId: Number(t.lastInsertRowid), slipRef, price };
    });
  } catch (e) {
    if (idemKey && /UNIQUE|constraint|duplicate key/i.test(String(e.message))) {
      const ex = await qGet(`SELECT s.slip_ref, s.total_stake, t.id AS ticket_id
                             FROM bet_slips s JOIN hilo_tickets t ON t.slip_id = s.id
                             WHERE s.user_id = $1 AND s.idempotency_key = $2`, [userId, slipKey]);
      if (ex) result = { duplicate: true, ticketId: ex.ticket_id, slipRef: ex.slip_ref, price: ex.total_stake };
      else throw e;
    } else throw e;
  }

  const ticket = await qGet(`SELECT t.*, s.slip_ref, s.created_at FROM hilo_tickets t
    JOIN bet_slips s ON s.id = t.slip_id WHERE t.id = $1`, [result.ticketId]);
  return { ...result, balance: await getBalance(userId), ticket: ticketView(ticket, bets) };
}

export async function playTicket(userId, pick, idemKey = null) {
  if (!HILO_PICKS.includes(pick)) throw new HttpError(400, 'กรุณาเลือก สูง / ต่ำ / 11 ไฮโล');
  const { ticketId } = await buyTicket(userId, idemKey);
  return guessTicket(userId, ticketId, pick);
}

export async function listMyTickets(userId, { limit = 50 } = {}) {
  await ensureInfra();
  const rows = await q(`SELECT t.*, s.slip_ref, s.created_at, s.status AS slip_status
    FROM hilo_tickets t JOIN bet_slips s ON s.id = t.slip_id
    WHERE t.user_id = $1 ORDER BY t.id DESC LIMIT $2`, [userId, limit]);
  const bets = await betsFor();
  return rows.map(t => ticketView(t, bets));
}

export function verifyHiloSeed(seed) {
  if (!seed || typeof seed !== 'string' || seed.length > 200) throw new HttpError(400, 'seed ไม่ถูกต้อง');
  const dice = diceFromSeed(seed);
  return { commit: commitOf(seed), dice, sum: dice.reduce((a, b) => a + b, 0), side: hiloOutcome(dice) };
}

export async function guessTicket(userId, ticketId, pick) {
  if (!HILO_PICKS.includes(pick)) throw new HttpError(400, 'กรุณาเลือก สูง / ต่ำ / 11 ไฮโล');
  const t = await qGet(`SELECT t.*, s.slip_ref, s.status AS slip_status, s.total_stake
    FROM hilo_tickets t JOIN bet_slips s ON s.id = t.slip_id
    WHERE t.id = $1 AND t.user_id = $2`, [ticketId, userId]);
  if (!t) throw new HttpError(404, 'ไม่พบตั๋ว');
  const bets = await betsFor();
  if (t.status === 'revealed') {
    const dice = diceOf(t);
    return { ...ticketView(t, bets), balance: await getBalance(userId), duplicate: true,
      outcome: hiloOutcome(dice) === t.pick ? 'win' : 'lose' };
  }
  if (t.slip_status !== 'pending') throw new HttpError(400, 'โพยนี้ถูกยกเลิกแล้ว');

  const dice = diceOf(t);
  const sum = dice.reduce((a, b) => a + b, 0);
  const outcomeSide = hiloOutcome(dice);
  const win = outcomeSide === pick;
  const stake = t.total_stake;
  // ฝั่งที่ admin ปิด (rule is_active=0) หรือประเภทปิด → ห้ามทาย
  const pickR = await pickRule(pick);
  if (!pickR) throw new HttpError(403, 'รูปแบบการทายนี้ปิดให้บริการชั่วคราว', 'GAME_CLOSED');
  const mult = Number(pickR.payout_multiplier) > 0 ? Number(pickR.payout_multiplier) : FALLBACK_MULT[pick];
  const payout = win ? Math.floor(stake * mult) : 0;
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const detail = JSON.stringify({ dice, sum, pick, mult, won: outcomeSide });

  await txAsync(async (d) => {
    const upd = await d.prepare(`UPDATE hilo_tickets SET pick = ?, status = 'revealed', revealed_at = ? WHERE id = ? AND status = 'awaiting'`)
      .run(pick, now, ticketId);
    if (upd.changes === 0) throw new HttpError(409, 'ตั๋วนี้ถูกทายหรือยกเลิกไปแล้ว', 'TICKET_CLOSED');
    const slipUpd = win
      ? await d.prepare(`UPDATE bet_slips SET status = 'won', total_payout = ?, settled_at = ? WHERE id = ? AND status = 'pending'`)
          .run(payout, now, t.slip_id)
      : await d.prepare(`UPDATE bet_slips SET status = 'lost', total_payout = 0, settled_at = ? WHERE id = ? AND status = 'pending'`)
          .run(now, t.slip_id);
    if (slipUpd.changes === 0) throw new HttpError(409, 'โพยนี้ถูกยกเลิกหรือออกผลแล้ว', 'SLIP_CLOSED');
    if (win) {
      await d.prepare(`UPDATE bet_items SET status = 'won', payout = ?, result_detail = ? WHERE slip_id = ? AND bet_type = 'hilo'`)
        .run(payout, detail, t.slip_id);
      await creditTx(d, {
        userId, type: 'win_credit', amount: payout,
        description: `รางวัลไฮโล ${t.slip_ref} — ${dice.join('-')} ผลรวม ${sum} (${pickLabel(pick)} ×${mult})`,
        idempotencyKey: `hilo-win-${t.slip_ref}`,
      });
    } else {
      await d.prepare(`UPDATE bet_items SET status = 'lost', payout = 0, result_detail = ? WHERE slip_id = ? AND bet_type = 'hilo'`)
        .run(detail, t.slip_id);
    }
    audit({ userId, action: 'hilo.guess', entityType: 'hilo_ticket', entityId: String(ticketId),
      detail: { pick, dice, sum, win, payout }, req: null });
  });

  const fresh = await qGet(`SELECT t.*, s.slip_ref, s.created_at FROM hilo_tickets t
    JOIN bet_slips s ON s.id = t.slip_id WHERE t.id = $1`, [ticketId]);
  const view = ticketView(fresh, bets);
  return { ...view, balance: await getBalance(userId), outcome: win ? 'win' : 'lose', payout, mult };
}

export async function cancelTicket(userId, ticketId) {
  await ensureInfra();
  return txAsync(async (d) => {
    const t = await d.prepare(`SELECT t.*, s.slip_ref, s.status AS slip_status, s.total_stake
      FROM hilo_tickets t JOIN bet_slips s ON s.id = t.slip_id
      WHERE t.id = ? AND t.user_id = ?`).get(ticketId, userId);
    if (!t) throw new HttpError(404, 'ไม่พบตั๋ว');
    if (t.status !== 'awaiting') throw new HttpError(400, 'ยกเลิกได้เฉพาะตั๋วที่ยังไม่ได้ทาย');
    if (t.slip_status !== 'pending') throw new HttpError(400, 'โพยนี้ถูกยกเลิกหรือออกผลแล้ว');
    const upd = await d.prepare(`UPDATE hilo_tickets SET status = 'cancelled' WHERE id = ? AND status = 'awaiting'`).run(ticketId);
    if (upd.changes === 0) throw new HttpError(409, 'ตั๋วนี้ถูกทายหรือยกเลิกไปแล้ว', 'TICKET_CLOSED');
    await d.prepare(`UPDATE bet_items SET status = 'cancelled' WHERE slip_id = ? AND status = 'pending'`).run(t.slip_id);
    const slipUpd = await d.prepare(`UPDATE bet_slips SET status = 'cancelled' WHERE id = ? AND status = 'pending'`).run(t.slip_id);
    if (slipUpd.changes === 0) throw new HttpError(409, 'โพยนี้ถูกยกเลิกหรือออกผลแล้ว', 'SLIP_CLOSED');
    const refundTx = await creditTx(d, {
      userId, type: 'bet_refund', amount: t.total_stake,
      description: `คืนเครดิตตั๋วไฮโล ${t.slip_ref} (ยกเลิกก่อนทาย)`,
      idempotencyKey: `hilo-refund-${t.slip_ref}`,
    });
    await notify(userId, {
      type: 'refund', title: `คืนเครดิตตั๋วไฮโล ${t.slip_ref}`,
      body: `ยกเลิกตั๋วก่อนทาย คืนเครดิต ฿${(t.total_stake / 100).toLocaleString('th-TH')}`,
      link: '/hilo',
    }, d);
    audit({ userId, action: 'hilo.cancel', entityType: 'hilo_ticket', entityId: String(ticketId),
      detail: { slipRef: t.slip_ref, refunded: t.total_stake } });
    return { slipRef: t.slip_ref, refunded: t.total_stake, balance: refundTx.balanceAfter };
  });
}
