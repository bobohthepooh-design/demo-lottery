import { randomBytes, createHash } from 'node:crypto';
import { getDb, tx, makeReference } from '../db/index.js';
import { HttpError, audit } from '../lib/audit.js';
import { debitForBetTx, creditTx, getBalance } from './walletService.js';
import { getSetting, setSetting } from './settingsService.js';

/**
 * หวยขูด Match-3 — ซื้อบัตรแล้วขูดทันที (instant win)
 * - ราคา/รางวัลกำหนดตอนซื้อฝั่ง server (กัน client รู้ผลก่อนขูด)
 * - ทุกการซื้อสร้าง bet_slip + bet_item ปกติ → แสดงใน "โพยของฉัน"/ประวัติ-wallet อัตโนมัติ
 * - reveal: คำนวณผลจาก grid อีกครั้ง (recount) → ถูก = เครดิต win_credit ทันที
 */

const CARD_PRICE_SATANG = () => parseInt(getSetting('scratch_price', '5000'), 10) || 5000;

// สัญลักษณ์ + รางวัล (สตางค์) + weight ต่อ 1000 — น้ำหนักรวมต้อง = 1000
// ความน่าจะเป็นชนะรวม ~15.3% → RTP ≈ 64% (มาตรฐาน scratch)
const SYMBOLS = [
  { icon: '🍒', name: 'เชอร์รี่', prize: 7500,   weight: 70  },  // ฿75
  { icon: '🍋', name: 'เลมอน',   prize: 12500,  weight: 45  },  // ฿125
  { icon: '🔔', name: 'กระดิ่ง', prize: 25000,  weight: 25  },  // ฿250
  { icon: '⭐', name: 'ดาว',     prize: 75000,  weight: 10  },  // ฿750
  { icon: '💎', name: 'เพชร',   prize: 250000, weight: 3   },  // ฿2,500
];

/** รางวัลที่มีผลจริง — admin ปรับได้ผ่าน system_settings 'scratch_prizes' (JSON [{icon,prize}])
 *  fallback = SYMBOLS hardcode; น้ำหนัก/โครงสร้าง grid ยังใช้ SYMBOLS เดิมเสมอ */
function effectiveSymbols() {
  let ov = {};
  try {
    const j = JSON.parse(getSetting('scratch_prizes', '[]') || '[]');
    if (Array.isArray(j)) for (const p of j) if (p?.icon && Number(p.prize) > 0) ov[p.icon] = Math.floor(Number(p.prize));
  } catch {}
  return SYMBOLS.map(s => ({ ...s, prize: ov[s.icon] ?? s.prize }));
}

/** ตารางรางวัล (สตางค์) — ให้ public-config ดึงไปแสดงบนหน้าบ้าน ไม่ให้ hardcode ฝั่ง client */
export function prizeTable() {
  return effectiveSymbols().map(({ icon, name, prize }) => ({ icon, name, prize }));
}
const LOSE_WEIGHT = 847; // 1000 - (70+45+25+10+3)
const GRID_SIZE = 9;
const WIN_COUNT = 3;

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

// Provably fair — commit = sha256(server_seed) เก็บคู่กับ grid;
// server_seed เผยเฉพาะหลัง reveal ให้ใครก็ได้ตรวจว่า grid ไม่ถูกสลับ
const commitOf = (seed) => createHash('sha256').update(String(seed)).digest('hex');

function shuffle(arr, rng) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** สุ่มสัญลักษณ์ที่ยังไม่ครบ weight — ใช้เติมช่องที่เหลือโดยไม่ให้สัญลักษณ์ไหนถึง 3 ตัวเผลอ */
function fillCell(grid, counts, rng) {
  const ok = SYMBOLS.filter(s => (counts[s.icon] || 0) < WIN_COUNT - 1); // cap 2 → ไม่มีตัวไหนโดน 3 โดยไม่ตั้งใจ
  const s = pick(rng, ok.length ? ok : SYMBOLS);
  grid.push(s.icon);
  counts[s.icon] = (counts[s.icon] || 0) + 1;
}

/** สร้าง grid 3x3 — deterministic ตาม seed (เก็บแค่ grid; outcome คำนวณตอน reveal) */
export function genGrid(seed) {
  const rng = mulberry32(hashSeed(`scratch:${seed}`));
  const roll = Math.floor(rng() * 1000);
  const counts = {};

  let winSym = null;
  if (roll < LOSE_WEIGHT) {
    winSym = null; // แพ้ — เติมให้ไม่มีสัญลักษณ์ไหนครบ 3
  } else {
    let cum = LOSE_WEIGHT;
    for (const s of SYMBOLS) { cum += s.weight; if (roll < cum) { winSym = s; break; } }
    if (!winSym) winSym = SYMBOLS[0];
  }

  if (winSym) {
    // วางผู้ชนะ 3 ช่องสุ่ม แล้วเติมช่องว่าง — สัญลักษณ์อื่น cap 2 ไม่ให้ครบ 3 โดยไม่ตั้งใจ
    const positions = new Set(shuffle([...Array(GRID_SIZE).keys()], rng).slice(0, WIN_COUNT));
    const out = [];
    const fillCounts = {};
    for (let i = 0; i < GRID_SIZE; i++) {
      if (positions.has(i)) { out.push(winSym.icon); continue; }
      const ok = SYMBOLS.filter(s => s.icon !== winSym.icon && (fillCounts[s.icon] || 0) < WIN_COUNT - 1);
      const pool = ok.length ? ok : SYMBOLS.filter(x => x.icon !== winSym.icon);
      const s = pick(rng, pool);
      out.push(s.icon);
      fillCounts[s.icon] = (fillCounts[s.icon] || 0) + 1;
    }
    return out;
  }

  // แพ้ — เติม 9 ช่อง cap 2 ต่อสัญลักษณ์
  const out = [];
  for (let i = 0; i < GRID_SIZE; i++) fillCell(out, counts, rng);
  return out;
}

/** คำนวณผลจาก grid — สัญลักษณ์ที่มากสุด ≥3 = ถูกรางวัลตามราคา */
export function evaluateGrid(grid) {
  const counts = {};
  for (const s of grid) counts[s] = (counts[s] || 0) + 1;
  const syms = effectiveSymbols();
  let best = null;
  for (const [icon, n] of Object.entries(counts)) {
    if (n >= WIN_COUNT) {
      const sym = syms.find(s => s.icon === icon);
      if (sym && (!best || sym.prize > best.prize)) best = { ...sym, count: n };
    }
  }
  return best ? { win: true, symbol: best.icon, prize: best.prize, count: best.count } : { win: false };
}

// ---------- infra: lottery type SC + rule + standing draw (idempotent) ----------
let infraReady = false;
export function ensureInfra() {
  if (infraReady) return;
  const db = getDb();
  let type = db.prepare(`SELECT id FROM lottery_types WHERE code = 'SC'`).get();
  if (!type) {
    db.prepare(`INSERT INTO lottery_types (code, name_th, name_en, description, is_active, result_mode)
                VALUES ('SC','หวยขูด','Scratch Card','สลากขูด instantaneous — ซื้อแล้วขูดรู้ผลทันที',1,'manual')`)
      .run();
    type = db.prepare(`SELECT id FROM lottery_types WHERE code = 'SC'`).get();
  }
  const typeId = type.id;
  if (!db.prepare(`SELECT id FROM lottery_rules WHERE lottery_type_id = ? AND bet_type = 'scratch'`).get(typeId)) {
    db.prepare(`INSERT INTO lottery_rules
      (lottery_type_id, category_id, bet_type, name_th, name_en, digits, match_config, payout_multiplier, stake_unit, min_amount, max_amount, is_active)
      VALUES (?, NULL, 'scratch', 'สลากขูด Match-3', 'Scratch Match-3', 0, '{"mode":"scratch"}', 0, 1, 5000, 5000, 1)`)
      .run(typeId);
  }
  // standing draw — status 'closed' เพื่อไม่ให้โผล่ในรายการรอบ (สลากขูดไม่มีรอบ)
  if (!db.prepare(`SELECT id FROM lottery_draws WHERE draw_code = 'SC-STANDING'`).get()) {
    db.prepare(`INSERT INTO lottery_draws (lottery_type_id, category_id, draw_code, draw_at, close_at, status)
                VALUES (?, NULL, 'SC-STANDING', '2026-01-01 00:00:00', '2026-01-01 00:00:00', 'closed')`).run(typeId);
  }
  // ค่าเริ่มต้นราคา/ตารางรางวัล — admin แก้ได้ใน /admin/settings (scratch_price, scratch_prizes)
  if (getSetting('scratch_price') == null) setSetting('scratch_price', 5000);
  if (getSetting('scratch_prizes') == null) {
    setSetting('scratch_prizes', JSON.stringify(SYMBOLS.map(s => ({ icon: s.icon, prize: s.prize }))));
  }
  infraReady = true;
}

function standingDraw() {
  ensureInfra();
  return getDb().prepare(`SELECT d.*, lt.code AS type_code, c.code AS cat_code
    FROM lottery_draws d JOIN lottery_types lt ON lt.id = d.lottery_type_id
    LEFT JOIN lottery_categories c ON c.id = d.category_id
    WHERE d.draw_code = 'SC-STANDING'`).get();
}
function scratchRule() {
  const draw = standingDraw();
  return getDb().prepare(`SELECT * FROM lottery_rules WHERE lottery_type_id = ? AND bet_type = 'scratch' AND is_active = 1`)
    .get(draw.lottery_type_id);
}

/** ราคาบัตร — ใช้ min_amount ของกติกา 'scratch' (admin แก้ในหน้ากติกา) fallback settings */
export function cardPrice() {
  const r = scratchRule();
  const p = r ? Number(r.min_amount) : NaN;
  return Number.isInteger(p) && p > 0 ? p : CARD_PRICE_SATANG();
}

const cardView = (c, revealOutcome = false) => ({
  id: c.id,
  slipRef: c.slip_ref,
  status: c.status,
  createdAt: c.created_at,
  grid: JSON.parse(c.grid),
  // fairness: commit เผยตั้งแต่ซื้อ (พิสูจน์ว่าไม่ได้เปลี่ยนผลทีหลัง) — seed เผยหลัง reveal เท่านั้น
  ...(c.commit_hash ? { fairness: {
    algo: 'sha256(server_seed) → grid 3x3 (mulberry32)',
    commit: c.commit_hash,
    seed: c.status === 'revealed' ? c.server_seed : null,
  } } : {}),
  ...(c.status === 'revealed'
    ? { outcome: JSON.parse(c.outcome), ...(revealOutcome ? { payout: JSON.parse(c.outcome).prize || 0 } : {}) }
    : {}),
});

/** ซื้อบัตรขูด 1 ใบ — หักเครดิต + สร้าง slip/item/card ใน transaction เดียว */
export function buyCard(userId) {
  ensureInfra();
  const price = cardPrice();
  const draw = standingDraw();
  const rule = scratchRule();
  if (!draw || !rule) throw new HttpError(500, 'ระบบหวยขูดยังไม่พร้อมใช้งาน');

  // server_seed สุ่มด้วย crypto — grid derive จาก seed เดียว (deterministic ตรวจย้อนได้)
  const serverSeed = randomBytes(32).toString('hex');
  const commitHash = commitOf(serverSeed);
  const grid = genGrid(serverSeed);
  const cardRef = makeReference('SC');
  const slipRef = makeReference('BET');

  const result = tx((d) => {
    const slip = d.prepare(`INSERT INTO bet_slips (slip_ref, user_id, draw_id, status, total_stake, idempotency_key)
                            VALUES (?, ?, ?, 'pending', ?, ?)`).run(slipRef, userId, draw.id, price, `scratch-${cardRef}`);
    const slipId = Number(slip.lastInsertRowid);
    d.prepare(`INSERT INTO bet_items (slip_id, draw_id, rule_id, bet_type, number, amount)
               VALUES (?, ?, ?, 'scratch', ?, ?)`).run(slipId, draw.id, rule.id, cardRef, price);
    debitForBetTx(d, { userId, slipRef, totalStake: price, idempotencyKey: `bet-debit-${slipRef}` });
    const card = d.prepare(`INSERT INTO scratch_cards (user_id, slip_id, grid, outcome, status, server_seed, commit_hash)
                            VALUES (?, ?, ?, '{}', 'hidden', ?, ?)`).run(userId, slipId, JSON.stringify(grid), serverSeed, commitHash);
    audit({ userId, action: 'scratch.buy', entityType: 'scratch_card', entityId: String(card.lastInsertRowid),
      detail: { price, slipRef }, req: null });
    return { cardId: Number(card.lastInsertRowid), slipRef, price };
  });

  const card = getDb().prepare(`SELECT c.*, s.slip_ref, s.created_at FROM scratch_cards c
    JOIN bet_slips s ON s.id = c.slip_id WHERE c.id = ?`).get(result.cardId);
  return { ...result, balance: getBalance(userId), card: cardView(card) };
}

export function listMyCards(userId, { limit = 50 } = {}) {
  ensureInfra();
  const rows = getDb().prepare(`SELECT c.*, s.slip_ref, s.created_at, s.status AS slip_status
    FROM scratch_cards c JOIN bet_slips s ON s.id = c.slip_id
    WHERE c.user_id = ? ORDER BY c.id DESC LIMIT ?`).all(userId, limit);
  return rows.map(c => cardView({ ...c, created_at: c.created_at }));
}

export function getCard(userId, cardId) {
  const c = getDb().prepare(`SELECT c.*, s.slip_ref, s.created_at, s.status AS slip_status
    FROM scratch_cards c JOIN bet_slips s ON s.id = c.slip_id
    WHERE c.id = ? AND c.user_id = ?`).get(cardId, userId);
  if (!c) throw new HttpError(404, 'ไม่พบบัตรขูด');
  return cardView(c);
}

/** ตรวจสอบย้อนหลัง — ใส่ server_seed ที่เผยหลัง reveal → คืน grid+outcome ที่ derive ได้ */
export function verifyScratchSeed(seed) {
  if (!seed || typeof seed !== 'string' || seed.length > 200) throw new HttpError(400, 'seed ไม่ถูกต้อง');
  const grid = genGrid(seed);
  return { commit: commitOf(seed), grid, outcome: evaluateGrid(grid) };
}

/** เปิดเผยผล — ขูดครบแล้ว: คำนวณจาก grid → ถูกรางวัลเครดิตทันที (idempotent) */
export function revealCard(userId, cardId) {
  const card = getDb().prepare(`SELECT c.*, s.slip_ref, s.status AS slip_status
    FROM scratch_cards c JOIN bet_slips s ON s.id = c.slip_id
    WHERE c.id = ? AND c.user_id = ?`).get(cardId, userId);
  if (!card) throw new HttpError(404, 'ไม่พบบัตรขูด');
  if (card.status === 'revealed') return { ...cardView(card), balance: getBalance(userId), duplicate: true };
  if (card.slip_status !== 'pending') throw new HttpError(400, 'โพยนี้ถูกยกเลิกแล้ว');

  const grid = JSON.parse(card.grid);
  const outcome = evaluateGrid(grid);
  const result = tx((d) => {
    const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
    d.prepare(`UPDATE scratch_cards SET status = 'revealed', outcome = ?, revealed_at = ? WHERE id = ?`)
      .run(JSON.stringify(outcome), now, cardId);
    if (outcome.win) {
      d.prepare(`UPDATE bet_items SET status = 'won', payout = ? WHERE slip_id = ? AND bet_type = 'scratch'`)
        .run(outcome.prize, card.slip_id);
      d.prepare(`UPDATE bet_slips SET status = 'won', total_payout = ?, settled_at = ? WHERE id = ?`)
        .run(outcome.prize, now, card.slip_id);
      creditTx(d, {
        userId, type: 'win_credit', amount: outcome.prize,
        description: `รางวัลหวยขูด ${card.slip_ref} — ${outcome.symbol} x${outcome.count}`,
        idempotencyKey: `scratch-win-${card.slip_ref}`,
      });
    } else {
      d.prepare(`UPDATE bet_items SET status = 'lost', payout = 0 WHERE slip_id = ? AND bet_type = 'scratch'`).run(card.slip_id);
      d.prepare(`UPDATE bet_slips SET status = 'lost', total_payout = 0, settled_at = ? WHERE id = ?`).run(now, card.slip_id);
    }
    audit({ userId, action: 'scratch.reveal', entityType: 'scratch_card', entityId: String(cardId),
      detail: { outcome }, req: null });
    return outcome;
  });

  const fresh = getDb().prepare(`SELECT c.*, s.slip_ref, s.created_at FROM scratch_cards c
    JOIN bet_slips s ON s.id = c.slip_id WHERE c.id = ?`).get(cardId);
  return { ...cardView(fresh), balance: getBalance(userId) };
}
