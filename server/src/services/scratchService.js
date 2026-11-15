import { randomBytes, createHash } from 'node:crypto';
import { getDb, tx, makeReference } from '../db/index.js';
import { HttpError, audit } from '../lib/audit.js';
import { debitForBetTx, creditTx, getBalance } from './walletService.js';
import { getSetting, setSetting } from './settingsService.js';

/**
 *สล็อต 5 รีล × 3 แถว — 20 เพย์ไลน์แบบ video slot จริง
 * - ราคา/ผลกำหนดตอนซื้อฝั่ง server (กัน client รู้ผลก่อนสปิน)
 * - grid 15 ช่อง (3 แถว × 5 รีล) — 20 เพย์ไลน์: แต่ละเส้นเลือก 1 ช่องต่อรีล
 * - ชนะเมื่อสัญลักษณ์เดิมซ้ำกันติดกันตั้งแต่รีลซ้าย ≥3 รีล บนเพย์ไลน์ใดก็ได้
 * - จ่ายรวมทุกเพย์ไลน์ที่ถูก (สูงสุด 20 เส้นพร้อมกัน) — เหมือนตู้จริง
 * - ทุกการซื้อสร้าง bet_slip + bet_item ปกติ → แสดงใน "โพยของฉัน"/ประวัติ-wallet อัตโนมัติ
 * - reveal: คำนวณผลจาก grid อีกครั้ง → ถูก = เครดิต win_credit ทันที
 */

const CARD_PRICE_SATANG = () => parseInt(getSetting('scratch_price', '5000'), 10) || 5000;

// สัญลักษณ์คาสิโนคลาสสิคสากล — weight ต่อช่อง (รวม 1000)
// pay3 = จ่ายเมื่อสัญลักษณ์ซ้ำ 3 รีลแรกบน "1 เพย์ไลน์" (สตางค์) — 4 ตัว ×4, 5 ตัว ×15
// (paytable หารสเกลลงตามจำนวนเพย์ไลน์ เพื่อให้ RTP รวม ~35% เท่าเดิม)
const SYMBOLS = [
  { icon: '🍒', name: 'เชอร์รี่', weight: 330, pay3: 150    },  // ฿1.50/เส้น
  { icon: '🍋', name: 'เลมอน',   weight: 150, pay3: 300    },  // ฿3
  { icon: '🍊', name: 'ส้ม',     weight: 130, pay3: 500    },  // ฿5
  { icon: '🍇', name: 'องุ่น',   weight: 110, pay3: 900    },  // ฿9
  { icon: '🔔', name: 'กระดิ่ง', weight: 100, pay3: 2000   },  // ฿20
  { icon: '⭐', name: 'ดาว',     weight: 80,  pay3: 6000   },  // ฿60
  { icon: '💎', name: 'เพชร',   weight: 60,  pay3: 18000  },  // ฿180
  { icon: '7️⃣', name: 'เจ็ด',   weight: 40,  pay3: 80000  },  // ฿800 jackpot
];
const TIER = { 3: 1, 4: 4, 5: 15 }; // ตัวคูณตามจำนวนรีลที่ซ้ำบนเพย์ไลน์

// 20 เพย์ไลน์มาตรฐาน — แต่ละเส้นคือ [แถวของรีล0, รีล1, รีล2, รีล3, รีล4] (แถว 0=บน, 1=กลาง, 2=ล่าง)
// เส้นตรง 3 แนวนอน + เส้นทแยง/ซิกแซก/หน่ำเหมือนตู้ video slot จริง
export const PAYLINES = [
  [1, 1, 1, 1, 1], // 1 กลาง
  [0, 0, 0, 0, 0], // 2 บน
  [2, 2, 2, 2, 2], // 3 ล่าง
  [0, 1, 2, 1, 0], // 4 V
  [2, 1, 0, 1, 2], // 5 ∧
  [0, 1, 1, 1, 0], // 6 หน่ำบน
  [2, 1, 1, 1, 2], // 7 หน่ำล่าง
  [1, 0, 0, 0, 1], // 8 ขอบบน
  [1, 2, 2, 2, 1], // 9 ขอบล่าง
  [0, 0, 1, 0, 0], // 10 หยักบน
  [2, 2, 1, 2, 2], // 11 หยักล่าง
  [1, 0, 1, 0, 1], // 12 ซิกแซก A
  [1, 2, 1, 2, 1], // 13 ซิกแซก B
  [0, 1, 0, 1, 0], // 14 ซิกแซก C
  [2, 1, 2, 1, 2], // 15 ซิกแซก D
  [0, 2, 0, 2, 0], // 16 ซิกแซก E
  [2, 0, 2, 0, 2], // 17 ซิกแซก F
  [1, 0, 0, 1, 0], // 18 เฉียงบน
  [1, 2, 2, 1, 2], // 19 เฉียงล่าง
  [0, 1, 2, 2, 1], // 20 เฉียงทแยง
];

/** รางวัลที่มีผลจริง — admin ปรับได้ผ่าน system_settings 'scratch_prizes' (JSON [{icon,prize}])
 *  prize = จ่ายเมื่อซ้ำ 3 ตัวแรกของแถว (4 ตัว ×4, 5 ตัว ×15 อัตโนมัติ)
 *  fallback = SYMBOLS hardcode; น้ำหนักยังใช้ SYMBOLS เดิมเสมอ */
function effectiveSymbols() {
  let ov = {};
  try {
    const j = JSON.parse(getSetting('scratch_prizes', '[]') || '[]');
    if (Array.isArray(j)) for (const p of j) if (p?.icon && Number(p.prize) > 0) ov[p.icon] = Math.floor(Number(p.prize));
  } catch {}
  return SYMBOLS.map(s => ({ ...s, pay3: ov[s.icon] ?? s.pay3 }));
}

/** ตารางรางวัลสำหรับแสดงผล — min = จ่าย 3 ตัว, max = จ่าย 5 ตัว (สูงสุดต่อสัญลักษณ์) */
export function prizeTable() {
  return effectiveSymbols().map(s => ({
    icon: s.icon, name: s.name,
    prize: s.pay3,
    max: s.pay3 * TIER[5],
  }));
}
const GRID_SIZE = 15;  // 3 แถว × 5 รีล
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

// Provably fair — commit = sha256(server_seed) เก็บคู่กับ grid;
// server_seed เผยเฉพาะหลัง reveal ให้ใครก็ได้ตรวจว่า grid ไม่ถูกสลับ
const commitOf = (seed) => createHash('sha256').update(String(seed)).digest('hex');


const pickIcon = (rng) => {
  let r = Math.floor(rng() * 1000);
  for (const s of SYMBOLS) { r -= s.weight; if (r < 0) return s.icon; }
  return SYMBOLS[0].icon;
};

/** สร้าง grid 3 แถว × 5 รีล (15 ช่อง) — deterministic ตาม seed
 *  สุ่มอิสระทุกช่องเหมือนช่องบนสายพานสล็อต — ผลคำนวณจากแถวซ้ายไปขวา */
export function genGrid(seed) {
  const rng = mulberry32(hashSeed(`scratch:${seed}`));
  const out = [];
  for (let i = 0; i < GRID_SIZE; i++) out.push(pickIcon(rng));
  return out;
}

/** cell(row, reel) ของ grid row-major 15 ช่อง — แถว r, รีล c → index r*5 + c */
const cell = (grid, r, c) => grid[r * REELS + c];

/** คำนวณผลจาก grid — 20 เพย์ไลน์: แต่ละเส้นดูการซ้ำของสัญลักษณ์ตัวแรกจากซ้าย
 *  ซ้ำ k รีล (k≥3) = ถูก — จ่าย pay3 × TIER[k] ต่อเส้น, รวมทุกเส้นที่ถูก
 *  คืน cells = พิกัด [row, reel] ที่ชนะ เพื่อให้ client ไฮไลต์เฉพาะช่องนั้น */
export function evaluateGrid(grid) {
  const syms = effectiveSymbols();
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

// ---------- infra: lottery type SC + rule + standing draw (idempotent) ----------
let infraReady = false;
export function ensureInfra() {
  if (infraReady) return;
  const db = getDb();
  let type = db.prepare(`SELECT id FROM lottery_types WHERE code = 'SC'`).get();
  if (!type) {
    db.prepare(`INSERT INTO lottery_types (code, name_th, name_en, description, is_active, result_mode)
                VALUES ('SC','สล็อต','Slot Machine','สล็อต 5 รีล 3 แถว 20 เพย์ไลน์ — สปินแล้วรอลุ้นผลทันที',1,'manual')`)
      .run();
    type = db.prepare(`SELECT id FROM lottery_types WHERE code = 'SC'`).get();
  }
  const typeId = type.id;
  if (!db.prepare(`SELECT id FROM lottery_rules WHERE lottery_type_id = ? AND bet_type = 'scratch'`).get(typeId)) {
    db.prepare(`INSERT INTO lottery_rules
      (lottery_type_id, category_id, bet_type, name_th, name_en, digits, match_config, payout_multiplier, stake_unit, min_amount, max_amount, is_active)
      VALUES (?, NULL, 'scratch', 'สล็อต 5 รีล 3 แถว 20 เพย์ไลน์', 'Slot 5-Reel 20-Paylines', 0, '{"mode":"scratch"}', 0, 1, 5000, 5000, 1)`)
      .run(typeId);
  }
  // standing draw — status 'closed' เพื่อไม่ให้โผล่ในรายการรอบ (สลากขูดไม่มีรอบ)
  if (!db.prepare(`SELECT id FROM lottery_draws WHERE draw_code = 'SC-STANDING'`).get()) {
    db.prepare(`INSERT INTO lottery_draws (lottery_type_id, category_id, draw_code, draw_at, close_at, status)
                VALUES (?, NULL, 'SC-STANDING', '2026-01-01 00:00:00', '2026-01-01 00:00:00', 'closed')`).run(typeId);
  }
  // sync ชื่อ/คำอธิบายเป็นสล็อต (idempotent — กัน description เก่าค้างใน DB)
  db.prepare(`UPDATE lottery_types SET name_th='สล็อต', name_en='Slot Machine', description='สล็อต 5 รีล 3 แถว 20 เพย์ไลน์ — สปินแล้วรอลุ้นผลทันที' WHERE code = 'SC'`).run();
  db.prepare(`UPDATE lottery_rules SET name_th='สล็อต 5 รีล 3 แถว 20 เพย์ไลน์', name_en='Slot 5-Reel 20-Paylines' WHERE bet_type = 'scratch'`).run();
  // ค่าเริ่มต้นราคา/ตารางรางวัล — admin แก้ได้ใน /admin/settings (scratch_price, scratch_prizes)
  if (getSetting('scratch_price') == null) setSetting('scratch_price', 5000);
  if (getSetting('scratch_prizes') == null) {
    setSetting('scratch_prizes', JSON.stringify(SYMBOLS.map(s => ({ icon: s.icon, prize: s.pay3 }))));
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
  // grid เผยเฉพาะหลัง reveal — ก่อนสปิน client เห็นแค่ commit (กันรู้ผลล่วงหน้า)
  grid: c.status === 'revealed' ? JSON.parse(c.grid) : null,
  // fairness: commit เผยตั้งแต่ซื้อ (พิสูจน์ว่าไม่ได้เปลี่ยนผลทีหลัง) — seed เผยหลัง reveal เท่านั้น
  ...(c.commit_hash ? { fairness: {
    algo: 'sha256(server_seed) → grid 5 รีล × 3 แถว, จ่ายตาม 20 เพย์ไลน์ (mulberry32)',
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
  if (!draw || !rule) throw new HttpError(500, 'ระบบสล็อตยังไม่พร้อมใช้งาน');

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
  if (!c) throw new HttpError(404, 'ไม่พบบัตรสล็อต');
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
  if (!card) throw new HttpError(404, 'ไม่พบบัตรสล็อต');
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
        description: `รางวัลสล็อต ${card.slip_ref} — ${outcome.symbol} x${outcome.count}`,
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
