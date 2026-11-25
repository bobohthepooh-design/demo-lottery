import { randomBytes, createHash } from 'node:crypto';
import { txAsync, makeReference } from '../db/index.js';
import { HttpError, audit } from '../lib/audit.js';
import { debitForBetTx, creditTx, getBalance } from './walletService.js';
import { getSetting, setSetting } from './settingsService.js';
import { notify } from './notifyService.js';
import { q, qGet, qRun } from '../db/pg.js';

/**
 * สล็อต 5 รีล × 3 แถว — 20 เพย์ไลน์แบบ video slot จริง
 * - ราคา/ผลกำหนดตอนซื้อฝั่ง server (กัน client รู้ผลก่อนสปิน)
 * - grid 15 ช่อง (3 แถว × 5 รีล) — 20 เพย์ไลน์: แต่ละเส้นเลือก 1 ช่องต่อรีล
 * - ชนะเมื่อสัญลักษณ์เดิมซ้ำกันติดกันตั้งแต่รีลซ้าย ≥3 รีล บนเพย์ไลน์ใดก็ได้
 * - จ่ายรวมทุกเพย์ไลน์ที่ถูก (สูงสุด 20 เส้นพร้อมกัน) — เหมือนตู้จริง
 * - ทุกการซื้อสร้าง bet_slip + bet_item ปกติ → แสดงใน "โพยของฉัน"/ประวัติ-wallet อัตโนมัติ
 * - reveal: คำนวณผลจาก grid อีกครั้ง → ถูก = เครดิต win_credit ทันที
 */

const SYMBOLS = [
  { icon: '🍒', name: 'เชอร์รี่', weight: 330, pay3: 150    },
  { icon: '🍋', name: 'เลมอน',   weight: 150, pay3: 300    },
  { icon: '🍊', name: 'ส้ม',     weight: 130, pay3: 500    },
  { icon: '🍇', name: 'องุ่น',   weight: 110, pay3: 900    },
  { icon: '🔔', name: 'กระดิ่ง', weight: 100, pay3: 2000   },
  { icon: '⭐', name: 'ดาว',     weight: 80,  pay3: 6000   },
  { icon: '💎', name: 'เพชร',   weight: 60,  pay3: 18000  },
  { icon: '7️⃣', name: 'เจ็ด',   weight: 40,  pay3: 80000  },
];
const TIER = { 3: 1, 4: 4, 5: 15 };

export const PAYLINES = [
  [1, 1, 1, 1, 1], [0, 0, 0, 0, 0], [2, 2, 2, 2, 2],
  [0, 1, 2, 1, 0], [2, 1, 0, 1, 2], [0, 1, 1, 1, 0],
  [2, 1, 1, 1, 2], [1, 0, 0, 0, 1], [1, 2, 2, 2, 1],
  [0, 0, 1, 0, 0], [2, 2, 1, 2, 2], [1, 0, 1, 0, 1],
  [1, 2, 1, 2, 1], [0, 1, 0, 1, 0], [2, 1, 2, 1, 2],
  [0, 2, 0, 2, 0], [2, 0, 2, 0, 2], [1, 0, 0, 1, 0],
  [1, 2, 2, 1, 2], [0, 1, 2, 2, 1],
];

// ตารางรางวัล override: rule.match_config.prizes (admin หน้ากติกา) → fallback scratch_prizes setting → default
function prizesFromRule(rule) {
  try {
    const j = rule?.match_config ? JSON.parse(rule.match_config)?.prizes : null;
    return Array.isArray(j) ? j : null;
  } catch { return null; }
}
function ovMap(j) {
  const ov = {};
  if (Array.isArray(j)) for (const p of j) if (p?.icon && Number(p.prize) > 0) ov[p.icon] = Math.floor(Number(p.prize));
  return ov;
}
async function effectiveSymbols() {
  let j = prizesFromRule(await scratchRule());
  if (!j) { try { j = JSON.parse(await getSetting('scratch_prizes', '[]') || '[]'); } catch { j = null; } }
  const ov = ovMap(j);
  return SYMBOLS.map(s => ({ ...s, pay3: ov[s.icon] ?? s.pay3 }));
}

export async function prizeTable() {
  return (await effectiveSymbols()).map(s => ({
    icon: s.icon, name: s.name,
    prize: s.pay3,
    max: s.pay3 * TIER[5],
  }));
}
const GRID_SIZE = 15;
const ROWS = 3;
const REELS = 5;

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
const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];

const commitOf = (seed) => createHash('sha256').update(String(seed)).digest('hex');

const pickIcon = (rng) => {
  let r = Math.floor(rng() * 1000);
  for (const s of SYMBOLS) { r -= s.weight; if (r < 0) return s.icon; }
  return SYMBOLS[0].icon;
};

export function genGrid(seed) {
  const rng = mulberry32(hashSeed(`scratch:${seed}`));
  const out = [];
  for (let i = 0; i < GRID_SIZE; i++) out.push(pickIcon(rng));
  return out;
}

const cell = (grid, r, c) => grid[r * REELS + c];

function evaluateGridWith(syms, grid) {
  const byIcon = Object.fromEntries(syms.map(s => [s.icon, s]));
  const lines = [];
  let total = 0, best = null;
  PAYLINES.forEach((path, li) => {
    const first = cell(grid, path[0], 0);
    const sym = byIcon[first];
    if (!sym) return;
    let k = 1;
    while (k < REELS && cell(grid, path[k], k) === first) k++;
    if (k < 3) return;
    const prize = sym.pay3 * (TIER[k] || 1);
    const cellsWin = [];
    for (let c = 0; c < k; c++) cellsWin.push([path[c], c]);
    lines.push({ line: li + 1, symbol: sym.icon, name: sym.name, prize, count: k, cells: cellsWin });
    total += prize;
    if (!best || prize > best.prize) best = { ...sym, prize, count: k };
  });
  if (!lines.length) return { win: false };
  return { win: true, symbol: best.icon, name: best.name, prize: total, count: lines.length, lines };
}

export async function evaluateGrid(grid) {
  return evaluateGridWith(await effectiveSymbols(), grid);
}

// ---------- infra ----------
let infraReady = false;
export async function ensureInfra() {
  if (infraReady) return;
  let type = await qGet(`SELECT id FROM lottery_types WHERE code = 'SC'`);
  if (!type) {
    await qRun(`INSERT INTO lottery_types (code, name_th, name_en, description, is_active, result_mode)
                VALUES ('SC','สล็อต','Slot Machine','สล็อต 5 รีล 3 แถว 20 เพย์ไลน์ — สปินแล้วรอลุ้นผลทันที',1,'manual')`);
    type = await qGet(`SELECT id FROM lottery_types WHERE code = 'SC'`);
  }
  const typeId = type.id;
  if (!(await qGet(`SELECT id FROM lottery_rules WHERE lottery_type_id = $1 AND bet_type = 'scratch'`, [typeId]))) {
    await qRun(`INSERT INTO lottery_rules
      (lottery_type_id, category_id, bet_type, name_th, name_en, digits, match_config, payout_multiplier, stake_unit, min_amount, max_amount, is_active)
      VALUES ($1, NULL, 'scratch', 'สล็อต 5 รีล 3 แถว 20 เพย์ไลน์', 'Slot 5-Reel 20-Paylines', 0, '{"mode":"scratch"}', 0, 1, 5000, 5000, 1)`, [typeId]);
  }
  if (!(await qGet(`SELECT id FROM lottery_draws WHERE draw_code = 'SC-STANDING'`))) {
    await qRun(`INSERT INTO lottery_draws (lottery_type_id, category_id, draw_code, draw_at, close_at, status)
                VALUES ($1, NULL, 'SC-STANDING', '2026-01-01 00:00:00', '2026-01-01 00:00:00', 'closed')`, [typeId]);
  }
  await qRun(`UPDATE lottery_types SET name_th='สล็อต', name_en='Slot Machine', description='สล็อต 5 รีล 3 แถว 20 เพย์ไลน์ — สปินแล้วรอลุ้นผลทันที' WHERE code = 'SC'`);
  await qRun(`UPDATE lottery_rules SET name_th='สล็อต 5 รีล 3 แถว 20 เพย์ไลน์', name_en='Slot 5-Reel 20-Paylines' WHERE bet_type = 'scratch'`);
  if ((await getSetting('scratch_price')) == null) await setSetting('scratch_price', 5000);
  if ((await getSetting('scratch_prizes')) == null) {
    await setSetting('scratch_prizes', JSON.stringify(SYMBOLS.map(s => ({ icon: s.icon, prize: s.pay3 }))));
  }
  infraReady = true;
}

async function standingDraw() {
  await ensureInfra();
  return qGet(`SELECT d.*, lt.code AS type_code, c.code AS cat_code
    FROM lottery_draws d JOIN lottery_types lt ON lt.id = d.lottery_type_id
    LEFT JOIN lottery_categories c ON c.id = d.category_id
    WHERE d.draw_code = 'SC-STANDING'`);
}
async function scratchRule() {
  const draw = await standingDraw();
  return qGet(`SELECT r.* FROM lottery_rules r
    JOIN lottery_types lt ON lt.id = r.lottery_type_id
    WHERE r.lottery_type_id = $1 AND r.bet_type = 'scratch' AND r.is_active = 1 AND lt.is_active = 1`,
    [draw.lottery_type_id]);
}

// เกมเปิดให้เล่น = ทั้ง rule และประเภทหวย (SC) ยัง active — ใช้ public-config + หน้าบ้านซ่อนการ์ดที่ปิด
export async function gameEnabled() {
  return !!(await scratchRule());
}

export async function cardPrice() {
  const r = await scratchRule();
  const p = r ? Number(r.min_amount) : NaN;
  return Number.isInteger(p) && p > 0 ? p : parseInt(await getSetting('scratch_price', '5000'), 10) || 5000;
}

const cardView = (c, revealOutcome = false) => ({
  id: c.id,
  slipRef: c.slip_ref,
  status: c.status,
  createdAt: c.created_at,
  grid: c.status === 'revealed' ? JSON.parse(c.grid) : null,
  ...(c.commit_hash ? { fairness: {
    algo: 'sha256(server_seed) → grid 5 รีล × 3 แถว, จ่ายตาม 20 เพย์ไลน์ (mulberry32)',
    commit: c.commit_hash,
    seed: c.status === 'revealed' ? c.server_seed : null,
  } } : {}),
  ...(c.status === 'revealed'
    ? { outcome: JSON.parse(c.outcome), ...(revealOutcome ? { payout: JSON.parse(c.outcome).prize || 0 } : {}) }
    : {}),
});

export async function buyCard(userId, idemKey = null) {
  await ensureInfra();
  if (idemKey != null && (typeof idemKey !== 'string' || idemKey.length > 64))
    throw new HttpError(400, 'idempotencyKey ไม่ถูกต้อง');
  const price = await cardPrice();
  const draw = await standingDraw();
  const rule = await scratchRule();
  if (!draw) throw new HttpError(500, 'ระบบสล็อตยังไม่พร้อมใช้งาน');
  if (!rule) throw new HttpError(403, 'เกมนี้ปิดให้บริการชั่วคราว', 'GAME_CLOSED');

  const serverSeed = randomBytes(32).toString('hex');
  const commitHash = commitOf(serverSeed);
  const grid = genGrid(serverSeed);
  const cardRef = makeReference('SC');
  const slipRef = makeReference('BET');
  const slipKey = idemKey ? `scratch-idem:${idemKey}` : `scratch-${cardRef}`;

  const findExisting = async (d) => idemKey
    ? d.prepare(`SELECT s.slip_ref, s.total_stake, c.id AS card_id
                 FROM bet_slips s JOIN scratch_cards c ON c.slip_id = s.id
                 WHERE s.user_id = ? AND s.idempotency_key = ?`).get(userId, slipKey)
    : null;

  let result;
  try {
    result = await txAsync(async (d) => {
      const ex = await findExisting(d);
      if (ex) return { duplicate: true, cardId: ex.card_id, slipRef: ex.slip_ref, price: ex.total_stake };
      const slip = await d.prepare(`INSERT INTO bet_slips (slip_ref, user_id, draw_id, status, total_stake, idempotency_key)
                              VALUES (?, ?, ?, 'pending', ?, ?)`).run(slipRef, userId, draw.id, price, slipKey);
      const slipId = Number(slip.lastInsertRowid);
      await d.prepare(`INSERT INTO bet_items (slip_id, draw_id, rule_id, bet_type, number, amount)
                 VALUES (?, ?, ?, 'scratch', ?, ?)`).run(slipId, draw.id, rule.id, cardRef, price);
      await debitForBetTx(d, { userId, slipRef, totalStake: price, idempotencyKey: `bet-debit-${slipRef}` });
      const card = await d.prepare(`INSERT INTO scratch_cards (user_id, slip_id, grid, outcome, status, server_seed, commit_hash)
                              VALUES (?, ?, ?, '{}', 'hidden', ?, ?)`).run(userId, slipId, JSON.stringify(grid), serverSeed, commitHash);
      audit({ userId, action: 'scratch.buy', entityType: 'scratch_card', entityId: String(card.lastInsertRowid),
        detail: { price, slipRef }, req: null });
      return { cardId: Number(card.lastInsertRowid), slipRef, price };
    });
  } catch (e) {
    if (idemKey && /UNIQUE|constraint|duplicate key/i.test(String(e.message))) {
      const ex = await qGet(`SELECT s.slip_ref, s.total_stake, c.id AS card_id
                             FROM bet_slips s JOIN scratch_cards c ON c.slip_id = s.id
                             WHERE s.user_id = $1 AND s.idempotency_key = $2`, [userId, slipKey]);
      if (ex) result = { duplicate: true, cardId: ex.card_id, slipRef: ex.slip_ref, price: ex.total_stake };
      else throw e;
    } else throw e;
  }

  const card = await qGet(`SELECT c.*, s.slip_ref, s.created_at FROM scratch_cards c
    JOIN bet_slips s ON s.id = c.slip_id WHERE c.id = $1`, [result.cardId]);
  return { ...result, balance: await getBalance(userId), card: cardView(card) };
}

export async function listMyCards(userId, { limit = 50 } = {}) {
  await ensureInfra();
  const rows = await q(`SELECT c.*, s.slip_ref, s.created_at, s.status AS slip_status
    FROM scratch_cards c JOIN bet_slips s ON s.id = c.slip_id
    WHERE c.user_id = $1 ORDER BY c.id DESC LIMIT $2`, [userId, limit]);
  return rows.map(c => cardView({ ...c, created_at: c.created_at }));
}

export async function getCard(userId, cardId) {
  const c = await qGet(`SELECT c.*, s.slip_ref, s.created_at, s.status AS slip_status
    FROM scratch_cards c JOIN bet_slips s ON s.id = c.slip_id
    WHERE c.id = $1 AND c.user_id = $2`, [cardId, userId]);
  if (!c) throw new HttpError(404, 'ไม่พบบัตรสล็อต');
  return cardView(c);
}

export async function verifyScratchSeed(seed) {
  if (!seed || typeof seed !== 'string' || seed.length > 200) throw new HttpError(400, 'seed ไม่ถูกต้อง');
  const grid = genGrid(seed);
  return { commit: commitOf(seed), grid, outcome: await evaluateGrid(grid) };
}

export async function revealCard(userId, cardId) {
  const card = await qGet(`SELECT c.*, s.slip_ref, s.status AS slip_status
    FROM scratch_cards c JOIN bet_slips s ON s.id = c.slip_id
    WHERE c.id = $1 AND c.user_id = $2`, [cardId, userId]);
  if (!card) throw new HttpError(404, 'ไม่พบบัตรสล็อต');
  if (card.status === 'revealed') return { ...cardView(card), balance: await getBalance(userId), duplicate: true };
  if (card.slip_status !== 'pending') throw new HttpError(400, 'โพยนี้ถูกยกเลิกแล้ว');

  const grid = JSON.parse(card.grid);
  const outcome = await evaluateGrid(grid);
  await txAsync(async (d) => {
    const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const upd = await d.prepare(`UPDATE scratch_cards SET status = 'revealed', outcome = ?, revealed_at = ? WHERE id = ? AND status = 'hidden'`)
      .run(JSON.stringify(outcome), now, cardId);
    if (upd.changes === 0) throw new HttpError(409, 'บัตรนี้ถูกเปิดหรือยกเลิกไปแล้ว', 'CARD_CLOSED');
    const slipUpd = outcome.win
      ? await d.prepare(`UPDATE bet_slips SET status = 'won', total_payout = ?, settled_at = ? WHERE id = ? AND status = 'pending'`)
          .run(outcome.prize, now, card.slip_id)
      : await d.prepare(`UPDATE bet_slips SET status = 'lost', total_payout = 0, settled_at = ? WHERE id = ? AND status = 'pending'`)
          .run(now, card.slip_id);
    if (slipUpd.changes === 0) throw new HttpError(409, 'โพยนี้ถูกยกเลิกหรือออกผลแล้ว', 'SLIP_CLOSED');
    if (outcome.win) {
      await d.prepare(`UPDATE bet_items SET status = 'won', payout = ? WHERE slip_id = ? AND bet_type = 'scratch'`)
        .run(outcome.prize, card.slip_id);
      await creditTx(d, {
        userId, type: 'win_credit', amount: outcome.prize,
        description: `รางวัลสล็อต ${card.slip_ref} — ${outcome.symbol} x${outcome.count}`,
        idempotencyKey: `scratch-win-${card.slip_ref}`,
      });
    } else {
      await d.prepare(`UPDATE bet_items SET status = 'lost', payout = 0 WHERE slip_id = ? AND bet_type = 'scratch'`).run(card.slip_id);
    }
    audit({ userId, action: 'scratch.reveal', entityType: 'scratch_card', entityId: String(cardId),
      detail: { outcome }, req: null });
  });

  const fresh = await qGet(`SELECT c.*, s.slip_ref, s.created_at FROM scratch_cards c
    JOIN bet_slips s ON s.id = c.slip_id WHERE c.id = $1`, [cardId]);
  return { ...cardView(fresh), balance: await getBalance(userId) };
}

export async function cancelCard(userId, cardId) {
  await ensureInfra();
  return txAsync(async (d) => {
    const c = await d.prepare(`SELECT c.*, s.slip_ref, s.status AS slip_status, s.total_stake
      FROM scratch_cards c JOIN bet_slips s ON s.id = c.slip_id
      WHERE c.id = ? AND c.user_id = ?`).get(cardId, userId);
    if (!c) throw new HttpError(404, 'ไม่พบบัตร');
    if (c.status !== 'hidden') throw new HttpError(400, 'ยกเลิกได้เฉพาะบัตรที่ยังไม่ได้สปิน');
    if (c.slip_status !== 'pending') throw new HttpError(400, 'โพยนี้ถูกยกเลิกหรือออกผลแล้ว');
    const upd = await d.prepare(`UPDATE scratch_cards SET status = 'cancelled' WHERE id = ? AND status = 'hidden'`).run(cardId);
    if (upd.changes === 0) throw new HttpError(409, 'บัตรนี้ถูกเปิดหรือยกเลิกไปแล้ว', 'CARD_CLOSED');
    await d.prepare(`UPDATE bet_items SET status = 'cancelled' WHERE slip_id = ? AND status = 'pending'`).run(c.slip_id);
    const slipUpd = await d.prepare(`UPDATE bet_slips SET status = 'cancelled' WHERE id = ? AND status = 'pending'`).run(c.slip_id);
    if (slipUpd.changes === 0) throw new HttpError(409, 'โพยนี้ถูกยกเลิกหรือออกผลแล้ว', 'SLIP_CLOSED');
    const refundTx = await creditTx(d, {
      userId, type: 'bet_refund', amount: c.total_stake,
      description: `คืนเครดิตบัตรสล็อต ${c.slip_ref} (ยกเลิกก่อนสปิน)`,
      idempotencyKey: `scratch-refund-${c.slip_ref}`,
    });
    await notify(userId, {
      type: 'refund', title: `คืนเครดิตบัตรสล็อต ${c.slip_ref}`,
      body: `ยกเลิกบัตรก่อนสปิน คืนเครดิต ฿${(c.total_stake / 100).toLocaleString('th-TH')}`,
      link: '/scratch',
    }, d);
    audit({ userId, action: 'scratch.cancel', entityType: 'scratch_card', entityId: String(cardId),
      detail: { slipRef: c.slip_ref, refunded: c.total_stake } });
    return { slipRef: c.slip_ref, refunded: c.total_stake, balance: refundTx.balanceAfter };
  });
}
