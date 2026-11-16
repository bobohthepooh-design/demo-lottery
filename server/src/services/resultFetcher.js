import { txAsync, makeReference } from '../db/index.js';
import { settleDraw, getDraw, evaluateBet, listRules, mergeAnnounce, validateWinningNumbers } from './lotteryService.js';
import { audit, HttpError } from '../lib/audit.js';
import { broadcast } from './events.js';
import { notify } from './notifyService.js';
import { ZODIAC_SIGNS } from '../lib/zodiac.js';
import { q, qGet, qRun } from '../db/pg.js';

/**
 * ดึงผลรางวัลอัตโนมัติจากแหล่งข้อมูลทางการ/สาธารณะ
 *  - หวยไทย:  API ทางการ GLO (glo.or.th)
 *  - ฮานอย:  XSMB dataset บน GitHub (อัปเดตอัตโนมัติรายวัน)
 *  - หวยลาว:  ไม่มีแหล่งฟรีที่เสถียร — ใช้การกรอกผลโดย admin (manual)
 * Admin ยังแก้ไขผลเองได้เสมอผ่าน /admin/settle หรือ refetch
 */

const UA = { 'User-Agent': 'demo-lottery/1.0', 'Content-Type': 'application/json' };

// retry/backoff สำหรับ external fetch — กัน source สะดุดชั่วคราวทำให้ทั้งรอบพลาด
// retry เฉพาะ network error / 5xx / 429 — ไม่ retry 4xx (request ผิดจริง)
async function fetchResilient(url, options = {}, { retries = 2, baseMs = 800 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const r = await fetch(url, options);
      if (r.ok || (r.status < 500 && r.status !== 429)) return r;
      lastErr = new Error(`HTTP ${r.status}`);
    } catch (e) {
      lastErr = e; // network error / timeout — retry ได้
    }
    if (attempt < retries) await new Promise(res => setTimeout(res, baseMs * 2 ** attempt));
  }
  throw lastErr;
}

async function postJson(url, body = {}) {
  const r = await fetchResilient(url, { method: 'POST', headers: UA, body: JSON.stringify(body), signal: AbortSignal.timeout(20000) });
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
    date: d.date,
    winning: {
      first: vals(g.first)[0] || null,
      front3: vals(g.last3f),
      top3: vals(g.last3b),
      bottom2: vals(g.last2)[0] || null,
    },
  };
}

// ---------- HN: 4 รอบอิสระต่อวัน ----------
// XSMB (ฮานอยปกติ) — dataset อัปเดตทุกวันจันทร์–เสาร์ (ไม่มีออกรางวัลวันอาทิตย์)
const XSMB_URL = 'https://raw.githubusercontent.com/khiemdoan/vietnam-lottery-xsmb-analysis/refs/heads/main/data/xsmb.json';
let xsmbCache = { at: 0, rows: null };

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
const rnd = (rng, min, max) => min + Math.floor(rng() * (max - min + 1));
const pad = (n, l) => String(n).padStart(l, '0');

export function generateHanoiResult(drawCode) {
  const rng = mulberry32(hashSeed(`hanoi:${drawCode}`));
  const special = rnd(rng, 10000, 99999);
  const p1 = rnd(rng, 10000, 99999);
  const p2 = rnd(rng, 10000, 99999);
  const p7 = rnd(rng, 0, 99);
  const s5 = pad(special, 5);
  return {
    date: null,
    winning: {
      num4: s5.slice(0, 4),
      top3: pad(p1, 5).slice(-3),
      top2: pad(p2, 5).slice(-2),
      bottom2: pad(p7, 2),
      db5: s5,
    },
  };
}

export function generateThaiResult(drawCode) {
  const rng = mulberry32(hashSeed(`thai:${drawCode}`));
  const n3 = () => pad(rnd(rng, 100, 999), 3);
  return {
    date: null,
    winning: {
      first: pad(rnd(rng, 100000, 999999), 6),
      front3: [n3(), n3()],
      top3: [n3(), n3()],
      bottom2: pad(rnd(rng, 0, 99), 2),
    },
  };
}

export function generateLaoDevResult(drawCode) {
  const rng = mulberry32(hashSeed(`laodev:${drawCode}`));
  const base = pad(rnd(rng, 100000, 999999), 6);
  return {
    date: null,
    winning: {
      main: base,
      num4: base.slice(0, 4),
      top3: base.slice(-3),
      bottom2: base.slice(-5, -3),
      last4: base.slice(-4),
      last3: base.slice(-3),
      last2: base.slice(-2),
    },
  };
}

export function generateZodiacResult(drawCode) {
  const rng = mulberry32(hashSeed(`zodiac:${drawCode}`));
  const pool = [...ZODIAC_SIGNS];
  const seq = [];
  for (let i = 0; i < 6; i++) seq.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  return { zodiac: seq[0], seq };
}

const GEN_KIND = { 'TH(gen)': 'thai', 'LA(dev-gen)': 'laodev', 'HR(gen)': 'zodiac' };
export function fairnessForSource(source, drawCode) {
  const kind = GEN_KIND[source];
  if (kind) return { method: 'deterministic', kind, seed: `${kind}:${drawCode}` };
  if (source === 'manual') return { method: 'manual' };
  return { method: 'external', source: source || null };
}
export function generateByKind(kind, drawCode) {
  if (kind === 'thai') return generateThaiResult(drawCode).winning;
  if (kind === 'laodev') return generateLaoDevResult(drawCode).winning;
  if (kind === 'zodiac') return generateZodiacResult(drawCode);
  throw new HttpError(400, 'kind ไม่ถูกต้อง');
}

const LC_HN_MAP = { HNS: 'hanoi-adhoc', HNP: 'hanoi-special', HNV: 'hanoi-vip' };
async function hanoiResultFor(draw) {
  if (draw.cat_code === 'HNN' || draw.cat_code === 'HNST') return fetchHanoiResult();
  const key = LC_HN_MAP[draw.cat_code];
  if (!key) throw new HttpError(400, `หมวด ${draw.cat_code} ยังไม่มีแหล่งผล`);
  return fetchLotteryChecks(key);
}

export async function fetchLotteryChecks(lottery) {
  const r = await fetchResilient(`https://lotterychecks.com/api/public/results?lottery=${lottery}&limit=1`,
    { signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`LC HTTP ${r.status}`);
  const j = await r.json();
  const d = j?.data?.[0];
  if (!d || d.status !== 'complete') throw new Error(`LC ${lottery}: no result`);
  const prize = (slug) => d.prizes?.find(p => p.slug === slug)?.numbers?.[0] || null;
  const special = prize('special-prize'), top3 = prize('three-digit-top'), bottom2 = prize('two-digit-bottom');
  if (!special || !top3 || !bottom2) throw new Error(`LC ${lottery}: incomplete prizes`);
  const s5 = String(special).padStart(5, '0').slice(-5);
  return {
    date: String(d.drawDate).slice(0, 10),
    winning: {
      num4: s5.slice(0, 4),
      top3: String(top3).padStart(3, '0').slice(-3),
      bottom2: String(bottom2).padStart(2, '0').slice(-2),
      db5: s5,
    },
  };
}

async function xsmbRows() {
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Bangkok' });
  const latest = xsmbCache.rows?.at(-1)?.date?.slice(0, 10);
  if (xsmbCache.rows && Date.now() - xsmbCache.at < 60 * 60 * 1000 && latest >= today) return xsmbCache.rows;
  const r = await fetchResilient(XSMB_URL, { signal: AbortSignal.timeout(60000) }, { retries: 1, baseMs: 2000 });
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
      num4: s(special, 5).slice(0, 4),
      top3: s(p1, 5).slice(-3),
      top2: s(p2, 5).slice(-2),
      bottom2: s(p7, 2),
      db5: s(special, 5),
    },
  };
}

export async function fetchLaoResult() {
  const r = await fetchResilient('https://laodl.com/api/website/laolot/WinPrizeHistory?type=1',
    { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' }, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`LA HTTP ${r.status}`);
  const j = await r.json();
  const row = (j?.resultData || []).find(x => x.winNumber && x.roundStatus === 0);
  if (!row) throw new Error('LA: no result yet');
  const w = String(row.winNumber).replace(/\D/g, '');
  if (w.length < 4) throw new Error('LA: bad winNumber');
  return {
    date: String(row.roundDate).slice(0, 10),
    winning: {
      main: w,
      last4: w.slice(-4),
      last3: w.slice(-3),
      last2: w.slice(-2),
      bottom2: w.length >= 5 ? w.slice(-5, -3) : w.slice(-2),
    },
  };
}

// ---------- matching & settle ----------
function drawLocalDate(draw) {
  return String(draw.draw_at).slice(0, 10);
}

const PENDING_DRAWS_SQL = `SELECT d.*, lt.code AS type_code, lt.result_mode AS result_mode, c.code AS cat_code
    FROM lottery_draws d JOIN lottery_types lt ON lt.id=d.lottery_type_id
    LEFT JOIN lottery_categories c ON c.id=d.category_id
    WHERE d.status IN ('open','scheduled','closed') AND d.draw_at <= ?
      AND lt.is_active = 1
      AND lt.code NOT IN ('SC','HL','KI','CF')
      AND d.id NOT IN (SELECT draw_id FROM lottery_results)
    ORDER BY d.draw_at`;

function pendingDraws() {
  const nowUtc = new Date().toISOString().slice(0, 19).replace('T', ' ');
  return q(PENDING_DRAWS_SQL, [nowUtc]);
}

let settleRunning = false;
export async function autoSettleResults() {
  if (settleRunning) return { settled: [], skipped: [], errors: [], sources: [], note: 'previous run still in progress' };
  settleRunning = true;
  try { return await autoSettleResultsInner(); }
  finally { settleRunning = false; }
}

async function autoSettleResultsInner() {
  const out = { settled: [], skipped: [], errors: [], sources: [] };

  const tryFetch = async (code, label, fn) => {
    try { const r = await fn(); out.sources.push({ code, label, ok: true }); return r; }
    catch (e) { out.sources.push({ code, label, ok: false, error: e.message }); out.errors.push(`${code} fetch: ${e.message}`); return null; }
  };
  const draws = await pendingDraws();
  if (!draws.length) return out;
  const lcCache = new Map();

  const need = { TH: false, HN: false, LA: false };
  for (const d of draws) {
    if (d.result_mode === 'manual') continue;
    if (d.type_code === 'TH') need.TH = true;
    else if (d.type_code === 'HN') need.HN = true;
    else if (d.type_code === 'LA' && d.cat_code === 'LA') need.LA = true;
  }
  let thai = null, hanoi = null, lao = null;
  if (need.TH) thai = await tryFetch('TH', 'GLO (glo.or.th)', fetchThaiResult);
  if (need.HN) hanoi = await tryFetch('HN', 'XSMB (GitHub)', fetchHanoiResult);
  if (need.LA) lao = await tryFetch('LA', 'laodl.com', fetchLaoResult);

  for (const d of draws) {
    if (d.result_mode === 'manual') { out.skipped.push(`${d.draw_code}: manual mode`); continue; }
    let src = null, srcLabel = d.type_code;
    if (d.type_code === 'TH') {
      if (thai && thai.date === drawLocalDate(d)) { src = thai; srcLabel = 'TH(GLO)'; }
      else { out.skipped.push(`${d.draw_code}: รอผล GLO จริง (ล่าสุด ${thai?.date || 'ไม่มีข้อมูล'})`); continue; }
    }
    else if (d.type_code === 'LA' && d.cat_code === 'LA') { src = lao; srcLabel = 'LA(laodl)'; }
    else if (d.type_code === 'LA') {
      out.skipped.push(`${d.draw_code}: ลาวพัฒนาไม่มีแหล่งผลอัตโนมัติ — admin กรอกผลจริง`); continue;
    }
    else if (d.type_code === 'HR') {
      src = { winning: generateZodiacResult(d.draw_code), date: drawLocalDate(d) }; srcLabel = 'HR(gen)';
    }
    else if (d.type_code === 'HN') {
      if (d.cat_code === 'HNN' || d.cat_code === 'HNST') {
        if (hanoi && hanoi.date === drawLocalDate(d)) { src = hanoi; srcLabel = 'HN(XSMB)'; }
        else { out.skipped.push(`${d.draw_code}: รอผล XSMB จริง (ล่าสุด ${hanoi?.date || 'ไม่มีข้อมูล'})`); continue; }
      } else {
        const key = LC_HN_MAP[d.cat_code];
        if (!key) { out.skipped.push(`${d.draw_code}: no source`); continue; }
        let lc = lcCache.get(key);
        if (lc === undefined) {
          try { lc = await fetchLotteryChecks(key); }
          catch (e) { out.errors.push(`LC ${key}: ${e.message}`); lc = null; }
          lcCache.set(key, lc);
        }
        if (lc && lc.date === drawLocalDate(d)) { src = lc; srcLabel = `HN(${key})`; }
        else { out.skipped.push(`${d.draw_code}: รอผล ${key} (ล่าสุด ${lc?.date || 'ไม่มีข้อมูล'})`); continue; }
      }
    }
    if (!src) { out.skipped.push(`${d.draw_code}: no source`); continue; }
    if (src.date && drawLocalDate(d) !== src.date) {
      out.skipped.push(`${d.draw_code}: result date ${src.date} != draw date ${drawLocalDate(d)}`);
      continue;
    }
    try {
      await settleDraw(null, d.id, src.winning, srcLabel);
      out.settled.push(`${d.draw_code}(${srcLabel})`);
      audit({ action: 'draw.auto_settle', entityType: 'draw', entityId: String(d.id), detail: { source: srcLabel, winning: src.winning } });
    } catch (e) {
      out.errors.push(`${d.draw_code}: ${e.message}`);
    }
  }
  if (out.settled.length) broadcast('results');
  return out;
}

/** admin กดดึงผลเองสำหรับรอบใดรอบหนึ่ง — คืนผลลัพธ์ถ้าพบ (ยังไม่ settle) */
export async function fetchResultForDraw(drawId) {
  const draw = await getDraw(drawId);
  if (!draw) throw new HttpError(404, 'ไม่พบรอบหวย');
  let src = null;
  if (draw.type_code === 'TH') src = await fetchThaiResult();
  else if (draw.type_code === 'HN') src = await hanoiResultFor(draw);
  else if (draw.type_code === 'LA' && draw.category_code === 'LA') src = await fetchLaoResult();
  else if (draw.type_code === 'LA') throw new HttpError(400, 'ลาวพัฒนาไม่มีแหล่งผลอัตโนมัติ — กรุณากรอกผลจริงเอง');
  else if (draw.type_code === 'HR') return { date: drawLocalDate(draw), winning: generateZodiacResult(draw.draw_code) };
  else throw new HttpError(400, 'ไม่ทราบแหล่งผลสำหรับหวยประเภทนี้ — กรุณากรอกผลเอง');
  if (src.date && drawLocalDate(draw) !== src.date) {
    throw new HttpError(409, `ผลที่ดึงได้เป็นของวันที่ ${src.date} ไม่ตรงกับรอบนี้ (${drawLocalDate(draw)})`);
  }
  return { date: src.date, winning: src.winning };
}

export async function updateDrawResult(adminId, drawId, winningNumbers) {
  const draw = await getDraw(drawId);
  if (!draw) throw new HttpError(404, 'ไม่พบรอบหวย');
  if (draw.type_code === 'HR') throw new HttpError(403, 'ผลหวยราศีสุ่มโดยระบบ — admin แก้ไขผลไม่ได้');
  const result = await qGet('SELECT * FROM lottery_results WHERE draw_id = $1', [drawId]);
  if (!result) throw new HttpError(400, 'รอบนี้ยังไม่ออกผล — ใช้ปุ่มออกผลแทน');
  const rules = await listRules(draw.lottery_type_id, { categoryId: draw.category_id });
  const ruleById = new Map(rules.map(r => [r.id, r]));

  return txAsync(async (d) => {
    winningNumbers = { ...winningNumbers };
    validateWinningNumbers(winningNumbers);
    mergeAnnounce(winningNumbers, draw.announce);
    await d.prepare(`UPDATE lottery_results SET winning_numbers = ?, source = 'manual' WHERE draw_id = ?`)
      .run(JSON.stringify(winningNumbers), drawId);
    await d.prepare(`UPDATE lottery_draws SET result_numbers = ?,
        updated_at = to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS') WHERE id = ?`)
      .run(JSON.stringify(winningNumbers), drawId);

    const items = await d.prepare(`SELECT bi.*, bs.user_id AS owner_id, bs.slip_ref, bs.status AS slip_status
      FROM bet_items bi JOIN bet_slips bs ON bs.id = bi.slip_id
      WHERE bi.draw_id = ? AND bi.status != 'cancelled' AND bs.status NOT IN ('cancelled','refunded')`).all(drawId);
    const slipMap = new Map();
    const slipItemCount = new Map();
    const userDiff = new Map();
    for (const item of items) {
      slipItemCount.set(item.slip_id, (slipItemCount.get(item.slip_id) || 0) + 1);
      const rule = ruleById.get(item.rule_id);
      if (!rule) continue;
      const effRule = item.match_config != null
        ? { ...rule, match_config: item.match_config, payout_multiplier: item.payout_multiplier ?? rule.payout_multiplier }
        : rule;
      const ev = evaluateBet(effRule, item.number, winningNumbers, { todBet: !!item.is_tod });
      const newPayout = ev.win ? Math.floor(item.amount * Number(ev.multiplier ?? effRule.payout_multiplier)) : 0;
      const diff = newPayout - item.payout;
      if (diff !== 0) userDiff.set(item.owner_id, (userDiff.get(item.owner_id) || 0) + diff);
      await d.prepare(`UPDATE bet_items SET status = ?, payout = ?, result_detail = ? WHERE id = ?`)
        .run(ev.win ? 'won' : 'lost', newPayout, JSON.stringify(ev.detail), item.id);
      const st = slipMap.get(item.slip_id) || { won: 0, payout: 0, stake: 0 };
      st.payout += newPayout; st.stake += item.amount; if (ev.win) st.won++;
      slipMap.set(item.slip_id, st);
    }
    for (const [slipId, st] of slipMap) {
      const total = slipItemCount.get(slipId) || 1;
      const status = st.won === 0 ? 'lost' : st.won === total ? 'won' : 'partial';
      await d.prepare(`UPDATE bet_slips SET status = ?, total_payout = ? WHERE id = ?`).run(status, st.payout, slipId);
    }
    // ปรับเครดิตรวมต่อ user ครั้งเดียว — version check กัน race, ยอดติดลบ = ยกเลิกทั้งการแก้ไขผล
    for (const [uid, diff] of userDiff) {
      if (!diff) continue;
      const w = await d.prepare('SELECT id, balance, version FROM virtual_wallets WHERE user_id = ?').get(uid);
      if (!w) continue;
      const nb = w.balance + diff;
      if (nb < 0) throw new HttpError(400,
        `การแก้ไขผลทำให้เครดิตของ user ${uid} ติดลบ — กรุณาปรับเครดิตก่อนแล้วลองใหม่`, 'NEGATIVE_BALANCE');
      const upd = await d.prepare(`UPDATE virtual_wallets SET balance = ?, version = version + 1,
          updated_at = to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS')
          WHERE id = ? AND version = ?`).run(nb, w.id, w.version);
      if (upd.changes === 0) throw new HttpError(409, 'เกิด race condition กรุณาลองใหม่', 'CONCURRENT_MODIFICATION');
      const dir = diff > 0 ? 'credit' : 'debit';
      await d.prepare(`INSERT INTO virtual_transactions
        (reference, wallet_id, user_id, type, amount, balance_after, direction, status, idempotency_key, description)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'completed', ?, ?)`)
        .run(makeReference('TX'), w.id, uid, dir === 'credit' ? 'win_credit' : 'admin_debit',
          Math.abs(diff), nb, dir, `refetch-${drawId}-u${uid}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`, 'ปรับผลรางวัลหลังแก้ไขผล (DEMO)');
    }
    for (const [uid, diff] of userDiff) {
      if (!diff) continue;
      const baht = Math.abs(diff) / 100;
      await notify(uid, {
        type: 'result_update',
        title: diff > 0 ? `ผลรางวัลปรับใหม่ +฿${baht.toLocaleString('th-TH')}` : `ผลรางวัลปรับใหม่ −฿${baht.toLocaleString('th-TH')}`,
        body: `ผลรางวัลรอบ ${draw.draw_code} ถูกแก้ไข — เครดิตของคุณ${diff > 0 ? 'เพิ่ม' : 'ลด'} ฿${baht.toLocaleString('th-TH')}`,
        link: '/my-bets',
      }, d);
    }
    audit({ userId: adminId, action: 'draw.result_update', entityType: 'draw', entityId: String(drawId), detail: { winningNumbers } });
    return { ok: true };
  });
}
