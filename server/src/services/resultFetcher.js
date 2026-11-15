import { getDb, tx, makeReference } from '../db/index.js';
import { settleDraw, getDraw, evaluateBet, listRules, mergeAnnounce } from './lotteryService.js';
import { audit, HttpError } from '../lib/audit.js';
import { broadcast } from './events.js';
import { notify } from './notifyService.js';
import { ZODIAC_SIGNS } from '../lib/zodiac.js';

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

// ---------- HN: 4 รอบอิสระต่อวัน ----------
// หวยฮานอย 4 หมวด (เฉพาะกิจ/พิเศษ/ปกติ/VIP) เป็นรอบที่เจ้ามือกำหนดเอง ผลแต่ละรอบอิสระกัน
// - HNN (ปกติ 18:00): ใช้เฉพาะผล XSMB จริงของวันออกรางวัล — รอจนกว่า source อัปเดต
// - หมวดอื่น: สุ่มแบบกำหนดได้ (deterministic ตาม draw_code) — คงที่ตรวจสอบได้ย้อนหลัง
const XSMB_URL = 'https://raw.githubusercontent.com/AnhTuPhi/xsmb-vietnam-lottery-analysis/master/data/xsmb.json';
let xsmbCache = { at: 0, rows: null };

// PRNG deterministic จาก string (mulberry32)
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

/** สุ่มผลฮานอยของรอบที่กำหนดเอง — deterministic ตาม draw_code (ตรวจสอบย้อนหลังได้) */
export function generateHanoiResult(drawCode) {
  const rng = mulberry32(hashSeed(`hanoi:${drawCode}`));
  const special = rnd(rng, 10000, 99999);
  const p1 = rnd(rng, 10000, 99999);
  const p2 = rnd(rng, 10000, 99999);
  const p7 = rnd(rng, 0, 99);
  const s5 = pad(special, 5);
  return {
    date: null, // ไม่ผูกวันที่ภายนอก — ใช้วันของรอบ
    winning: {
      num4: s5.slice(0, 4),
      top3: pad(p1, 5).slice(-3),
      top2: pad(p2, 5).slice(-2),
      bottom2: pad(p7, 2),
      db5: s5,
    },
  };
}

/** ผลหวยไทยจำลอง deterministic ตาม draw_code — fallback เมื่อ GLO ยังไม่เผยแพร่ผลของวันออกรางวัล */
export function generateThaiResult(drawCode) {
  const rng = mulberry32(hashSeed(`thai:${drawCode}`));
  const n3 = () => pad(rnd(rng, 100, 999), 3);
  return {
    date: null, // ใส่วันของรอบตอนใช้งาน
    winning: {
      first: pad(rnd(rng, 100000, 999999), 6),
      front3: [n3(), n3()],
      top3: [n3(), n3()],
      bottom2: pad(rnd(rng, 0, 99), 2),
      near1: [pad(rnd(rng, 0, 9), 1)],
    },
  };
}

/** ผลหวยลาวพัฒนา (LAD/ลาวพัฒนาเช้า) — ไม่มีแหล่งฟรีที่เสถียร
 *  ใช้ผล deterministic ตาม draw_code (ตรวจสอบย้อนหลังได้) — field ครอบคลุมทุก source ที่ rules ใช้ */
export function generateLaoDevResult(drawCode) {
  const rng = mulberry32(hashSeed(`laodev:${drawCode}`));
  const base = pad(rnd(rng, 100000, 999999), 6);
  return {
    date: null,
    winning: {
      main: base,
      num4: base.slice(0, 4),
      top3: base.slice(-3),
      // เลข 2 ตัวล่าง = หลักหมื่น-พัน (ตำแหน่ง -5,-4 ของเลข 6 หลัก) — ตรงนิยามเว็บหวยลาวจริง
      bottom2: base.slice(-5, -3),
      last4: base.slice(-4),
      last3: base.slice(-3),
      last2: base.slice(-2),
    },
  };
}

/** ผลหวยราศี — สุ่มราศี 6 ตัวไม่ซ้ำ เรียงลำดับ deterministic ตาม draw_code
 *  (ตรวจสอบย้อนหลังได้ — admin แก้ไขผลไม่ได้ ผลอยู่ที่ระบบล้วน) */
export function generateZodiacResult(drawCode) {
  const rng = mulberry32(hashSeed(`zodiac:${drawCode}`));
  const pool = [...ZODIAC_SIGNS];
  const seq = [];
  for (let i = 0; i < 6; i++) seq.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  return { zodiac: seq[0], seq };
}

// ---------- provably fair metadata ----------
// ผลที่ระบบ generate เองเป็น deterministic ตาม draw_code → ใครก็คำนวณซ้ำตรวจได้
// ผลจากแหล่งภายนอก (GLO/XSMB/lotterychecks/laodl) หรือ admin กรอก → ไม่ใช่ provably fair โดยธรรมชาติ
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

/** ผลฮานอยของหมวดหนึ่งๆ — HNN ใช้ XSMB จริง, หมวดเสริมใช้ lotterychecks.com (ผลจริงรายหมวด)
 *  lotterychecks มีแค่ 3 รางวัล (พิเศษ/3บน/2ล่าง) — ไม่มี 2 ตัวบน จึงไม่ส่ง field top2 */
const LC_HN_MAP = { HNS: 'hanoi-adhoc', HNP: 'hanoi-special', HNV: 'hanoi-vip' };
async function hanoiResultFor(draw) {
  if (draw.cat_code === 'HNN' || draw.cat_code === 'HNST') return fetchHanoiResult();
  const key = LC_HN_MAP[draw.cat_code];
  if (!key) throw new HttpError(400, `หมวด ${draw.cat_code} ยังไม่มีแหล่งผล`);
  return fetchLotteryChecks(key);
}

/** ดึงผลจาก lotterychecks.com (aggregator ผลจริงรายหมวดหวย) — คืน {date, winning} */
export async function fetchLotteryChecks(lottery) {
  const r = await fetch(`https://lotterychecks.com/api/public/results?lottery=${lottery}&limit=1`,
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

// ---------- LA: หวยลาวหลัก (laodl.com public API) ----------
export async function fetchLaoResult() {
  const r = await fetch('https://laodl.com/api/website/laolot/WinPrizeHistory?type=1',
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
      // เลข 2 ตัวล่าง = หลักหมื่น-พันของผลรางวัล (ตำแหน่ง -5,-4) — เว็บหวยลาวจริงไม่มี "เลขท้าย 4 ตัว" เป็นประเภทแทง
      bottom2: w.length >= 5 ? w.slice(-5, -3) : w.slice(-2),
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
  return db.prepare(`SELECT d.*, lt.code AS type_code, lt.result_mode AS result_mode, c.code AS cat_code
    FROM lottery_draws d JOIN lottery_types lt ON lt.id=d.lottery_type_id
    LEFT JOIN lottery_categories c ON c.id=d.category_id
    WHERE d.status IN ('open','scheduled','closed') AND d.draw_at <= ?
      AND lt.is_active = 1
      AND lt.code NOT IN ('SC','HL','KI','CF')
      AND d.id NOT IN (SELECT draw_id FROM lottery_results)
    ORDER BY d.draw_at`).all(nowUtc);
}

/** ลองดึงผล + settle ให้อัตโนมัติทุกประเภทที่มีแหล่งข้อมูล */
let settleRunning = false;
export async function autoSettleResults() {
  // กันรอบซ้อน — ถ้ารอบก่อนยังดึงผลภายนอกไม่เสร็จ (timeout ยาว) ไม่ให้รันซ้อนกัน
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
  const draws = pendingDraws();
  if (!draws.length) return out;
  const lcCache = new Map(); // กันยิง lotterychecks ซ้ำหลายรอบในรอบเดียวกัน

  // ดึงเฉพาะแหล่งที่มีรอบรอผลจริง — ลดภาระ/กัน rate-limit (HR ไม่ต้องดึง: ผล deterministic)
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
      // ใช้ผล GLO จริงเฉพาะเมื่อเป็นผลของวันออกรางวัล — ถ้า GLO ยังไม่อัปเดต/ล่าช้า
      // fallback เป็นผล deterministic ของรอบนั้น (admin แก้ผลย้อนหลังได้เสมอ)
      if (thai && thai.date === drawLocalDate(d)) { src = thai; srcLabel = 'TH(GLO)'; }
      else { const g = generateThaiResult(d.draw_code); src = { winning: g.winning, date: drawLocalDate(d) }; srcLabel = 'TH(gen)'; }
    }
    else if (d.type_code === 'LA' && d.cat_code === 'LA') { src = lao; srcLabel = 'LA(laodl)'; }
    else if (d.type_code === 'LA') {
      // หวยลาวพัฒนา/ลาวพัฒนาเช้า — ไม่มีแหล่งผลอัตโนมัติ ใช้ผล deterministic ของรอบ (admin แก้ย้อนหลังได้)
      const g = generateLaoDevResult(d.draw_code); src = { winning: g.winning, date: drawLocalDate(d) }; srcLabel = 'LA(dev-gen)';
    }
    else if (d.type_code === 'HR') {
      // หวยรายชั่วโมง — ผลเป็นดวงราศี สุ่ม deterministic ตาม draw_code (ตรวจสอบย้อนหลังได้)
      src = { winning: generateZodiacResult(d.draw_code), date: drawLocalDate(d) }; srcLabel = 'HR(gen)';
    }
    else if (d.type_code === 'HN') {
      if (d.cat_code === 'HNN' || d.cat_code === 'HNST') {
        // HNN (ปกติ) / HNST (ทางการ): ใช้เฉพาะผล XSMB จริงของวันออกรางวัล — ถ้ายังไม่อัปเดตให้รอ (admin แก้เองได้)
        if (hanoi && hanoi.date === drawLocalDate(d)) { src = hanoi; srcLabel = 'HN(XSMB)'; }
        else { out.skipped.push(`${d.draw_code}: รอผล XSMB จริง (ล่าสุด ${hanoi?.date || 'ไม่มีข้อมูล'})`); continue; }
      } else {
        // หมวดเสริม (เฉพาะกิจ/พิเศษ/VIP): ใช้ผลจริงจาก lotterychecks.com — รอจนกว่างวดจะอัปเดต
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
      settleDraw(null, d.id, src.winning, srcLabel);
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
  const draw = getDraw(drawId);
  if (!draw) throw new HttpError(404, 'ไม่พบรอบหวย');
  let src = null;
  if (draw.type_code === 'TH') src = await fetchThaiResult();
  else if (draw.type_code === 'HN') src = await hanoiResultFor(draw);
  else if (draw.type_code === 'LA' && draw.category_code === 'LA') src = await fetchLaoResult();
  else if (draw.type_code === 'LA') { const g = generateLaoDevResult(draw.draw_code); return { date: drawLocalDate(draw), winning: g.winning }; }
  else if (draw.type_code === 'HR') return { date: drawLocalDate(draw), winning: generateZodiacResult(draw.draw_code) };
  else throw new HttpError(400, 'ไม่ทราบแหล่งผลสำหรับหวยประเภทนี้ — กรุณากรอกผลเอง');
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
  if (draw.type_code === 'HR') throw new HttpError(403, 'ผลหวยราศีสุ่มโดยระบบ — admin แก้ไขผลไม่ได้');
  const result = db.prepare('SELECT * FROM lottery_results WHERE draw_id = ?').get(drawId);
  if (!result) throw new HttpError(400, 'รอบนี้ยังไม่ออกผล — ใช้ปุ่มออกผลแทน');
  // ใช้ listRules เต็ม (ไม่กรอง ann) — bet_items ที่แทงไว้แล้วต้องประเมินได้เสมอ
  const rules = listRules(draw.lottery_type_id, { categoryId: draw.category_id });
  const ruleById = new Map(rules.map(r => [r.id, r]));

  return tx((d) => {
    // merge เลขอั้นเข้า winningNumbers — กติกา ann_* ประเมินจากเลขที่ admin ประกาศ (หลายเลข + อัตราจ่ายเฉพาะรายเลข)
    winningNumbers = { ...winningNumbers };
    mergeAnnounce(winningNumbers, draw.announce);
    d.prepare(`UPDATE lottery_results SET winning_numbers = ?, source = 'manual' WHERE draw_id = ?`)
      .run(JSON.stringify(winningNumbers), drawId);
    d.prepare(`UPDATE lottery_draws SET result_numbers = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(JSON.stringify(winningNumbers), drawId);

    const items = d.prepare(`SELECT bi.*, bs.user_id AS owner_id, bs.slip_ref, bs.status AS slip_status
      FROM bet_items bi JOIN bet_slips bs ON bs.id = bi.slip_id
      WHERE bi.draw_id = ? AND bi.status != 'cancelled' AND bs.status NOT IN ('cancelled','refunded')`).all(drawId);
    const slipMap = new Map();
    const slipItemCount = new Map();
    const userDiff = new Map(); // user_id -> ผลต่างเครดิตรวมจากการแก้ผล (แจ้งเตือนสมาชิก)
    for (const item of items) {
      slipItemCount.set(item.slip_id, (slipItemCount.get(item.slip_id) || 0) + 1);
      const rule = ruleById.get(item.rule_id);
      if (!rule) continue;
      // snapshot อัตราจ่าย/กติกาตอนแทง — กันการแก้ผลย้อนหลังเปลี่ยนราคาโพย
      const effRule = item.match_config != null
        ? { ...rule, match_config: item.match_config, payout_multiplier: item.payout_multiplier ?? rule.payout_multiplier }
        : rule;
      const ev = evaluateBet(effRule, item.number, winningNumbers, { todBet: !!item.is_tod });
      const newPayout = ev.win ? Math.floor(item.amount * Number(ev.multiplier ?? effRule.payout_multiplier)) : 0;
      const diff = newPayout - item.payout;
      if (diff !== 0) userDiff.set(item.owner_id, (userDiff.get(item.owner_id) || 0) + diff);
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
                Math.abs(diff), nb, dir, `refetch-${drawId}-${item.id}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`, 'ปรับผลรางวัลหลังแก้ไขผล (DEMO)');
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
    // แจ้งเตือนสมาชิกที่เครดิตเปลี่ยนจากการแก้ผล — กันผู้เล่นงงว่าผล/เงินขยับโดยไม่มีแจ้ง
    for (const [uid, diff] of userDiff) {
      if (!diff) continue;
      const baht = Math.abs(diff) / 100;
      notify(uid, {
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
