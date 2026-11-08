import { getDb, tx, makeReference } from '../db/index.js';
import { settleDraw, getDraw, evaluateBet, rulesForDraw } from './lotteryService.js';
import { audit, HttpError } from '../lib/audit.js';

/**
 * ดึงผลรางวัลอัตโนมัติจากแหล่งข้อมูลทางการ/สาธารณะ
 *  - หวยไทย:  API ทางการ GLO (glo.or.th)
 *  - ฮานอย:  XSMB dataset บน GitHub (อัปเดตอัตโนมัติรายวัน)
 *  - หวยลาว:  ไม่มีแหล่งฟรีที่เสถียร — ใช้การกรอกผลโดย admin (manual)
 * Admin ยังแก้ไขผลเองได้เสมอผ่าน /admin/settle หรือ refetch
 */

const UA = { 'User-Agent': 'demo-lottery/1.0', 'Content-Type': 'application/json' };

async function postJson(url, body = {}) {
  const r = await fetch(url, { method: 'POST', headers: UA, body: JSON.stringify(body), signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}
const vals = (node) => (node?.number || []).map(n => String(n.value).replace(/\D/g, '')).filter(Boolean);

// ---------- TH: GLO official ----------
export async function fetchThaiResult() {
  const j = await postJson('https://www.glo.or.th/api/lottery/getLatestLottery');
  const d = j?.response;
  if (!d?.data) throw new Error('GLO: no data');
  const g = d.data;
  return {
    date: d.date, // 'YYYY-MM-DD' วันที่ออกรางวัล
    winning: {
      first: vals(g.first)[0] || null,
      front3: vals(g.last3f),   // เลขหน้า 3 ตัว (2 รางวัล)
      top3: vals(g.last3b),     // เลขท้าย 3 ตัว (2 รางวัล)
      bottom2: vals(g.last2)[0] || null,
      near1: vals(g.near1),
    },
  };
}

// ---------- HN: XSMB (GitHub dataset อัปเดตอัตโนมัติทุกวัน) ----------
const XSMB_URL = 'https://raw.githubusercontent.com/AnhTuPhi/xsmb-vietnam-lottery-analysis/master/data/xsmb.json';
let xsmbCache = { at: 0, rows: null };

async function xsmbRows() {
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Bangkok' }); // YYYY-MM-DD เวลาไทย
  const latest = xsmbCache.rows?.at(-1)?.date?.slice(0, 10);
  // refetch ถ้า cache เก่าเกิน 60 นาที หรือยังไม่มีผลของวันนี้
  if (xsmbCache.rows && Date.now() - xsmbCache.at < 60 * 60 * 1000 && latest >= today) return xsmbCache.rows;
  const r = await fetch(XSMB_URL, { signal: AbortSignal.timeout(60000) });
  if (!r.ok) throw new Error(`XSMB HTTP ${r.status}`);
  const rows = await r.json();
  if (!Array.isArray(rows) || !rows.length) throw new Error('XSMB: no data');
  xsmbCache = { at: Date.now(), rows };
  return rows;
}

export async function fetchHanoiResult() {
  const rows = await xsmbRows();
  const last = rows[rows.length - 1];
  const s = (n, len) => n == null ? null : String(n).padStart(len, '0').slice(-len);
  const special = Number(last.special), p1 = Number(last.prize1), p2 = Number(last.prize2_1 ?? last.prize2_2), p7 = Number(last.prize7_1);
  return {
    date: String(last.date).slice(0, 10),
    winning: {
      num4: s(special, 5).slice(0, 4),   // เลข 4 ตัว = 4 หลักแรกของเลขพิเศษ
      top3: s(p1, 5).slice(-3),          // 3 ตัวบน = ท้ายของรางวัลที่ 1
      top2: s(p2, 5).slice(-2),          // 2 ตัวบน = ท้ายของรางวัลที่ 2
      bottom2: s(p7, 2),                 // 2 ตัวล่าง = รางวัลเลขท้าย (giải bảy)
      db5: s(special, 5),
    },
  };
}

// ---------- matching & settle ----------
function drawLocalDate(draw) {
  // draw_at เก็บเป็น UTC — วันออกรางวัลตามเวลาไทย (UTC+7) ตรงกับวันที่ UTC สำหรับทุกรอบของเรา
  return String(draw.draw_at).slice(0, 10);
}

/** หารอบที่ควรออกผล: เลยเวลาออกรางวัลแล้ว + ยังไม่มีผล + ยังไม่ settle */
function pendingDraws() {
  const db = getDb();
  const nowUtc = new Date().toISOString().slice(0, 19).replace('T', ' ');
  return db.prepare(`SELECT d.*, lt.code AS type_code, c.code AS cat_code
    FROM lottery_draws d JOIN lottery_types lt ON lt.id=d.lottery_type_id
    LEFT JOIN lottery_categories c ON c.id=d.category_id
    WHERE d.status IN ('open','scheduled','closed') AND d.draw_at <= ?
      AND d.id NOT IN (SELECT draw_id FROM lottery_results)
    ORDER BY d.draw_at`).all(nowUtc);
}

/** ลองดึงผล + settle ให้อัตโนมัติทุกประเภทที่มีแหล่งข้อมูล */
export async function autoSettleResults() {
  const out = { settled: [], skipped: [], errors: [] };
  const draws = pendingDraws();
  if (!draws.length) return out;

  let thai = null, hanoi = null;
  try { thai = await fetchThaiResult(); } catch (e) { out.errors.push(`TH fetch: ${e.message}`); }
  try { hanoi = await fetchHanoiResult(); } catch (e) { out.errors.push(`HN fetch: ${e.message}`); }

  for (const d of draws) {
    const src = d.type_code === 'TH' ? thai : d.type_code === 'HN' ? hanoi : null;
    if (!src) { out.skipped.push(`${d.draw_code}: no source`); continue; }
    if (src.date && drawLocalDate(d) !== src.date) {
      out.skipped.push(`${d.draw_code}: result date ${src.date} != draw date ${drawLocalDate(d)}`);
      continue;
    }
    try {
      settleDraw(null, d.id, src.winning);
      out.settled.push(d.draw_code);
      audit({ action: 'draw.auto_settle', entityType: 'draw', entityId: String(d.id), detail: { source: d.type_code, winning: src.winning } });
    } catch (e) {
      out.errors.push(`${d.draw_code}: ${e.message}`);
    }
  }
  return out;
}

/** admin กดดึงผลเองสำหรับรอบใดรอบหนึ่ง — คืนผลลัพธ์ถ้าพบ (ยังไม่ settle) */
export async function fetchResultForDraw(drawId) {
  const draw = getDraw(drawId);
  if (!draw) throw new HttpError(404, 'ไม่พบรอบหวย');
  let src = null;
  if (draw.type_code === 'TH') src = await fetchThaiResult();
  else if (draw.type_code === 'HN') src = await fetchHanoiResult();
  else throw new HttpError(400, 'หวยลาวยังไม่มีแหล่งข้อมูลอัตโนมัติ — กรุณากรอกผลเอง');
  if (src.date && drawLocalDate(draw) !== src.date) {
    throw new HttpError(409, `ผลที่ดึงได้เป็นของวันที่ ${src.date} ไม่ตรงกับรอบนี้ (${drawLocalDate(draw)})`);
  }
  return { date: src.date, winning: src.winning };
}

/** admin แก้ไขผลหลังออกผลแล้ว — คำนวณส่วนต่างเครดิต/เดบิตใหม่ทั้งโพย */
export function updateDrawResult(adminId, drawId, winningNumbers) {
  const db = getDb();
  const draw = getDraw(drawId);
  if (!draw) throw new HttpError(404, 'ไม่พบรอบหวย');
  const result = db.prepare('SELECT * FROM lottery_results WHERE draw_id = ?').get(drawId);
  if (!result) throw new HttpError(400, 'รอบนี้ยังไม่ออกผล — ใช้ปุ่มออกผลแทน');
  const { rules } = rulesForDraw(drawId);
  const ruleById = new Map(rules.map(r => [r.id, r]));

  return tx((d) => {
    d.prepare('UPDATE lottery_results SET winning_numbers = ? WHERE draw_id = ?')
      .run(JSON.stringify(winningNumbers), drawId);
    d.prepare(`UPDATE lottery_draws SET result_numbers = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(JSON.stringify(winningNumbers), drawId);

    const items = d.prepare(`SELECT bi.*, bs.user_id AS owner_id, bs.slip_ref, bs.status AS slip_status
      FROM bet_items bi JOIN bet_slips bs ON bs.id = bi.slip_id
      WHERE bi.draw_id = ? AND bs.status != 'cancelled'`).all(drawId);
    const slipMap = new Map();
    const slipItemCount = new Map();
    for (const item of items) {
      slipItemCount.set(item.slip_id, (slipItemCount.get(item.slip_id) || 0) + 1);
      const rule = ruleById.get(item.rule_id);
      if (!rule) continue;
      const ev = evaluateBet(rule, item.number, winningNumbers);
      const newPayout = ev.win ? Math.floor(item.amount * Number(rule.payout_multiplier)) : 0;
      const diff = newPayout - item.payout;
      d.prepare(`UPDATE bet_items SET status = ?, payout = ?, result_detail = ? WHERE id = ?`)
        .run(ev.win ? 'won' : 'lost', newPayout, JSON.stringify(ev.detail), item.id);
      if (diff !== 0) {
        const w = d.prepare('SELECT id, balance FROM virtual_wallets WHERE user_id = ?').get(item.owner_id);
        if (w) {
          const nb = w.balance + diff;
          if (nb >= 0) {
            d.prepare('UPDATE virtual_wallets SET balance = ?, version = version + 1 WHERE id = ?').run(nb, w.id);
            const dir = diff > 0 ? 'credit' : 'debit';
            d.prepare(`INSERT INTO virtual_transactions
              (reference, wallet_id, user_id, type, amount, balance_after, direction, status, idempotency_key, description)
              VALUES (?, ?, ?, ?, ?, ?, ?, 'completed', ?, ?)`)
              .run(makeReference('TX'), w.id, item.owner_id, dir === 'credit' ? 'win_credit' : 'admin_debit',
                Math.abs(diff), nb, dir, `refetch-${drawId}-${item.id}`, 'ปรับผลรางวัลหลังแก้ไขผล (DEMO)');
          }
        }
      }
      const st = slipMap.get(item.slip_id) || { won: 0, payout: 0, stake: 0 };
      st.payout += newPayout; st.stake += item.amount; if (ev.win) st.won++;
      slipMap.set(item.slip_id, st);
    }
    for (const [slipId, st] of slipMap) {
      const total = slipItemCount.get(slipId) || 1;
      const status = st.won === 0 ? 'lost' : st.won === total ? 'won' : 'partial';
      d.prepare(`UPDATE bet_slips SET status = ?, total_payout = ? WHERE id = ?`).run(status, st.payout, slipId);
    }
    audit({ userId: adminId, action: 'draw.result_update', entityType: 'draw', entityId: String(drawId), detail: { winningNumbers } });
    return { ok: true };
  });
}
