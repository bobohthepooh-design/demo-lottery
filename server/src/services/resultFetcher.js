import { txAsync, makeReference } from '../db/index.js';
import { settleDraw, getDraw, evaluateBet, listRules, mergeAnnounce, validateWinningNumbers, updateDrawStatus } from './lotteryService.js';
import { audit, HttpError } from '../lib/audit.js';
import { broadcast } from './events.js';
import { notify } from './notifyService.js';
import { ZODIAC_SIGNS } from '../lib/zodiac.js';
import { q, qGet, qRun, getPool } from '../db/pg.js';

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
      // รางวัลที่ 2-5 + เลขอั้น — GLO ให้มาครบ เก็บไว้แสดงผล (ไม่ใช้ settle เพราะไม่มี rule)
      second: vals(g.second), third: vals(g.third), fourth: vals(g.fourth), fifth: vals(g.fifth),
      near1: vals(g.near1),
      front3: vals(g.last3f),
      // เลขตัวบนทั้งหมด derive จากรางวัลที่ 1 (กติกาหวยจริง): บน3=3 ตัวท้าย, บน2=2 ตัวท้าย, บน4=4 ตัวท้าย
      // last3 = เลขท้าย 3 ตัวทางการ (ลางวัลแยก — ฝั่งล่าง) — เก็บไว้แสดงผลเท่านั้น
      top3: String(vals(g.first)[0] || '').replace(/\D/g, '').slice(-3) || null,
      last3: vals(g.last3b),
      top4: String(vals(g.first)[0] || '').replace(/\D/g, '').slice(-4) || null,
      top2: String(vals(g.first)[0] || '').replace(/\D/g, '').slice(-2) || null,
      last1: String(vals(g.first)[0] || '').replace(/\D/g, '').slice(-1) || null,
      bottom2: vals(g.last2)[0] || null,
      bottom1: (vals(g.last2)[0] || '').replace(/\D/g, '').slice(-1) || null,
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
  const s5 = pad(special, 5);
  return {
    date: null,
    winning: { ...suffix5(s5), db5: s5 },
  };
}

export function generateThaiResult(drawCode) {
  const rng = mulberry32(hashSeed(`thai:${drawCode}`));
  const n3 = () => pad(rnd(rng, 100, 999), 3);
  const n6 = (min, max) => {
    const s = new Set();
    while (s.size < max) s.add(pad(rnd(rng, min, 999999), 6));
    return [...s];
  };
  const first = pad(rnd(rng, 100000, 999999), 6);
  return {
    date: null,
    winning: {
      first,
      second: n6(100000, 5), third: n6(100000, 10), fourth: n6(100000, 20), fifth: n6(100000, 30),
      near1: [String((Number(first) - 1 + 1000000) % 1000000).padStart(6, '0'), String((Number(first) + 1) % 1000000).padStart(6, '0')],
      front3: [n3(), n3()],
      // เลขตัวบน derive จากรางวัลที่ 1 — last3 = เลขท้าย 3 ตัวทางการ (ฝั่งล่าง)
      top3: first.slice(-3), last3: [n3(), n3()],
      top4: first.slice(-4), top2: first.slice(-2), last1: first.slice(-1),
      bottom2: pad(rnd(rng, 0, 99), 2),
    },
  };
}

export function generateLaoDevResult(drawCode) {
  const rng = mulberry32(hashSeed(`laodev:${drawCode}`));
  const base = pad(rnd(rng, 100000, 999999), 6);
  return {
    date: null,
    winning: { ...suffix5(base), main: base, num4: base.slice(-4) },
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
  // ผลบนรอบ DEMO หรือ source 'demo'/'auto' (legacy backfill) = ผลจำลองภายใน ไม่ใช่ผลภายนอก
  if (source === 'demo' || source === 'auto' || /DEMO/i.test(String(drawCode || '')))
    return { method: 'demo', source: source || null };
  return { method: 'external', source: source || null };
}
export function generateByKind(kind, drawCode) {
  if (kind === 'thai') return generateThaiResult(drawCode).winning;
  if (kind === 'laodev') return generateLaoDevResult(drawCode).winning;
  if (kind === 'zodiac') return generateZodiacResult(drawCode);
  throw new HttpError(400, 'kind ไม่ถูกต้อง');
}

// ตลาดหวยย่อยจาก lotterychecks.com — slug จริงที่ยืนยันแล้วว่ามีผลทุกวัน
// kind: lao5 = เลขพิเศษ 5 หลัก (last4/num4/top3/last3/last2/bottom2)
//       lao6 = เลขพิเศษ 6 หลัก (ลาวพัฒนา — num4=4 ตัวท้าย, bottom2=2 ตัวแรก)
//       hn   = โครงสร้างฮานอย (num4/top3/bottom2/db5)
const LC_MARKET_MAP = {
  LA:    { slug: 'lao-union',                kind: 'lao5' },   // ลาวสามัคคี 20:30 ทุกวัน
  LAM:   { slug: 'lao-morning',              kind: 'lao5' },   // หวยลาวเช้า 08:30 ทุกวัน
  LAD:   { slug: 'lao-lottery',              kind: 'lao-dev' },// หวยลาวพัฒนา จ–ศ 20:35 (ท้าย 4/3/2)
  LADAM: { slug: 'lao-development-morning',  kind: 'lao6' },   // ลาวพัฒนาเช้า 09:00 ทุกวัน
  LADT:  { slug: 'lao-development-midday',   kind: 'lao6' },   // ลาวพัฒนาเที่ยง 12:30 ทุกวัน
  HNS:   { slug: 'hanoi-adhoc',              kind: 'hn' },
  HNP:   { slug: 'hanoi-special',            kind: 'hn' },
  HNV:   { slug: 'hanoi-vip',                kind: 'hn' },
  HNM:   { slug: 'hanoi-morning',            kind: 'hn' },
  GS:    { slug: 'gsb-lottery',              kind: 'gsb' },
};

// ดึงผลหลายงวดล่าสุดจาก lotterychecks — คืน array [{date, prizes:{slug:digits}}]
// (ต้องหลายงวดเพราะรอบค้างย้อนหลังต้องหา result ของวันที่ตรงกัน ไม่ใช่แค่ล่าสุด)
async function fetchLCAll(slug) {
  const r = await fetchResilient(`https://lotterychecks.com/api/public/results?lottery=${slug}&limit=10`,
    { signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`LC HTTP ${r.status}`);
  const j = await r.json();
  const list = (j?.data || []).filter(d => d && d.status === 'complete');
  if (!list.length) throw new Error(`LC ${slug}: no result`);
  return list.map(d => {
    const prizes = {};
    // เก็บทุกเลขรางวัล — บางตลาด (เช่น GSB) อันดับ 3/4/5 มีหลายเลข
    for (const p of d.prizes || []) {
      prizes[p.slug] = (p.numbers || []).map(n => String(n).replace(/\D/g, '')).filter(Boolean);
    }
    return { date: String(d.drawDate).slice(0, 10), prizes };
  });
}

const lcNum = (x, slug, len) => {
  const v = x.prizes[slug];
  const first = Array.isArray(v) ? v[0] : v;
  if (!first) throw new Error(`LC missing prize ${slug}`);
  return String(first).padStart(len, '0').slice(-len);
};
// ทุกเลขของรางวัล (pad เป็น len หลัก)
const lcAll = (x, slug, len) => (x.prizes[slug] || []).map(v => String(v).padStart(len, '0').slice(-len));

// หวยลาว/ฮานอยตามสเปก: เลข 5/4/3/2/1 ตัว ทั้งหมดเป็นตัวท้ายของเลขรางวัลหลัก
// (ไม่มีรางวัลแยก — ละเว้น three-digit-top/two-digit-bottom ของ LC)
const suffix5 = (main) => {
  const m = String(main ?? '').replace(/\D/g, '');
  if (!m) return {};
  const take = (n) => (m.length >= n ? m.slice(-n) : null);
  return {
    last5: take(5), last4: take(4), last3: take(3), last2: take(2), last1: take(1),
    // ลาว/ฮานอยไม่มีรางวัลล่างแยก — bottom* = ค่าเดียวกับ last* (ให้กติกา แบบไทยใช้งานได้)
    bottom2: take(2), bottom1: take(1),
    // เลขรางวัลหลัก = เลขพิเศษดิบ — ลาวพัฒนา 6 หลัก / ลาว-ฮานอย 5 หลัก (ĐB เวียดนามเป็น 5 หลัก)
    main: m.length >= 5 && m.length <= 6 ? m : null,
    num4: take(4), db5: take(5),
  };
};

function winningFor(kind, x) {
  if (kind === 'lao5') {
    const s5 = lcNum(x, 'special-prize', 5);
    return { ...suffix5(s5), db5: s5 };
  }
  if (kind === 'lao6') {
    const s6 = lcNum(x, 'special-prize', 6);
    return { ...suffix5(s6), main: s6 };
  }
  if (kind === 'lao-dev') {
    // หวยลาวพัฒนา — เลขหลัก 6 หลัก (special-prize) ถ้ามี; ไม่งั้นใช้เลขท้าย 4 ตัวที่ LC มี
    const s6 = lcNum(x, 'special-prize', 6);
    if (s6) return { ...suffix5(s6), main: s6 };
    const l4 = lcNum(x, 'last-four-digit', 4);
    return { ...suffix5(l4), last4: l4, num4: l4 };
  }
  if (kind === 'gsb') {
    // สลากออมสินพิเศษ — อันดับ 1-5 (7 หลัก, อ.3=5 เลข อ.4=10 เลข อ.5=15 เลข) + เลขท้าย 4/3 ตัว
    const w = {
      p1: lcAll(x, 'first-prize', 7), p2: lcAll(x, 'second-prize', 7),
      p3: lcAll(x, 'third-prize', 7), p4: lcAll(x, 'fourth-prize', 7),
      p5: lcAll(x, 'fifth-prize', 7),
      last4: lcNum(x, 'last-four-digit', 4),
      last3: lcNum(x, 'last-three-digit', 3),
    };
    // derive เลขบน/ล่าง/วิ่ง เหมือนหวยไทย — บน/หน้า/หลัง จากอันดับ 1, ล่าง 2 ตัวจากอันดับ 5
    const a = String(w.p1?.[0] ?? w.p1 ?? '').replace(/\D/g, '');
    const b = String(w.p5?.[0] ?? w.p5 ?? '').replace(/\D/g, '');
    if (a.length >= 7) {
      // front3 ไม่ derive — ออมสินไม่มีรางวัลเลขหน้า 3 ตัวแยก (มีแค่ เลขท้าย 4/3 ตัว)
      w.top3 = a.slice(-3); w.top4 = a.slice(-4);
      w.top2 = a.slice(-2); w.last1 = a.slice(-1);
    }
    if (b.length >= 2) { w.bottom2 = b.slice(-2); w.bottom1 = b.slice(-1); }
    return w;
  }
  if (kind === 'thai-gov') {
    // หวยรัฐบาล — fallback ของ GLO: รางวัล 1-5 + เลขอั้น + เลขหน้า/ท้าย 3 ตัว + เลขท้าย 2 ตัว
    // เลขตัวบน derive จากรางวัลที่ 1 (กติกาจริง) — last3 = เลขท้าย 3 ตัวทางการ (ฝั่งล่าง)
    const first = lcNum(x, 'first-prize', 6);
    const bottom2 = lcNum(x, 'last-two-digit', 2);
    return {
      first,
      second: lcAll(x, 'second-prize', 6), third: lcAll(x, 'third-prize', 6),
      fourth: lcAll(x, 'fourth-prize', 6), fifth: lcAll(x, 'fifth-prize', 6),
      near1: lcAll(x, 'near-first-prize', 6),
      front3: lcAll(x, 'first-three-digit', 3),
      top3: first.slice(-3), last3: lcAll(x, 'last-three-digit', 3),
      top4: first.slice(-4), top2: first.slice(-2), last1: first.slice(-1),
      bottom2, bottom1: bottom2.slice(-1),
    };
  }
  // hn — spec: 5/4/3/2/1 ตัว ล้วนเป็นตัวท้ายของเลขพิเศษ (ĐB)
  const s5 = lcNum(x, 'special-prize', 5);
  return { ...suffix5(s5), db5: s5 };
}

// ผลดิบ LC → winning ตาม kind (ใช้ร่วมกันทุก source chain)
async function lcWinning(slug, kind, date) {
  const list = await fetchLCAll(slug);
  const raw = date ? list.find(x => x.date === date) : list[0];
  if (!raw) throw new Error(`LC ${slug}: no result for ${date || 'latest'}`);
  return { date: raw.date, winning: winningFor(kind, raw), slug };
}

// ---------- LA: ຫວຍລາວພັດທະນາ (Lao Development Lottery) — เว็บทางการ laodl.com ----------
// ผลจริง = เลข 6 หลัก 1 เลข → รางวัล 5/4/3/2/1 ตัวท้าย (spec: ทั้งหมดจากเลขหลัก)
const LAODL_URL = 'https://laodl.com/api/website/laolot/WinPrizeHistory?type=1';
let laodlCache = { at: 0, rows: null };
async function laodlRounds() {
  if (laodlCache.rows && Date.now() - laodlCache.at < 10 * 60e3) return laodlCache.rows;
  const r = await fetchResilient(LAODL_URL,
    { headers: { 'User-Agent': UA['User-Agent'], 'Accept': 'application/json' }, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`laodl HTTP ${r.status}`);
  const j = await r.json();
  const rows = (j?.resultData || []).filter(x => x && /^\d{6}$/.test(String(x.winNumber || '').replace(/\D/g, '')));
  if (!rows.length) throw new Error('laodl: no result');
  laodlCache = { at: Date.now(), rows };
  return rows;
}
export async function fetchLaoDevOfficial(date) {
  const rows = await laodlRounds();
  const row = date ? rows.find(x => String(x.roundDate).slice(0, 10) === date) : rows[0];
  if (!row) throw new Error(`laodl: no result for ${date || 'latest'}`);
  const win = String(row.winNumber).replace(/\D/g, '');
  return { date: String(row.roundDate).slice(0, 10), winning: { ...suffix5(win), main: win } };
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
  // 베팅용 숫자는 모두 ĐB(giải đặc biệt)에서 파생 — Vietnam "đề" 규칙과 동일
  const db = s(last.special, 5);
  return {
    date: String(last.date).slice(0, 10),
    winning: { ...suffix5(db), db5: db },
  };
}

// ---------- matching & settle ----------
// draw_at เก็บเป็น UTC 'YYYY-MM-DD HH24:MI:SS' — แปลงเป็นวันที่เวลาไทยสำหรับเทียบกับวันที่ผลจริง
// ---------- source verification (draw_result_sources) ----------
// บันทึกว่าผลของแต่ละแหล่งตรงกันไหม — user/admin เห็นความน่าเชื่อถือของผลย้อนหลังได้

function canonicalWinning(value) {
  if (Array.isArray(value)) return value.map(canonicalWinning).sort();
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(k => [k, canonicalWinning(value[k])]));
  }
  return String(value ?? '').trim();
}

function sameWinning(a, b) {
  return JSON.stringify(canonicalWinning(a)) === JSON.stringify(canonicalWinning(b));
}

async function storeSourceChecks(drawId, observations) {
  for (const o of observations) {
    await qRun(`INSERT INTO draw_result_sources
      (draw_id, source, source_role, source_url, result_date, winning_numbers,
       verification_status, error, checked_at, last_available_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS'),
        CASE WHEN $9 THEN to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS') ELSE NULL END)
      ON CONFLICT (draw_id, source) DO UPDATE SET
        source_role = EXCLUDED.source_role,
        source_url = EXCLUDED.source_url,
        result_date = COALESCE(EXCLUDED.result_date, draw_result_sources.result_date),
        winning_numbers = COALESCE(EXCLUDED.winning_numbers, draw_result_sources.winning_numbers),
        verification_status = EXCLUDED.verification_status,
        error = EXCLUDED.error,
        checked_at = EXCLUDED.checked_at,
        last_available_at = COALESCE(EXCLUDED.last_available_at, draw_result_sources.last_available_at)`,
    [
      drawId, o.source, o.role, o.url, o.date || null,
      o.winning ? JSON.stringify(o.winning) : null, o.status, o.error || null, !!o.available,
    ]);
  }
}

function parseSourceCheck(row) {
  let winning = null;
  try { winning = row.winning_numbers ? JSON.parse(row.winning_numbers) : null; } catch {}
  return { ...row, winning_numbers: undefined, winning };
}

export async function getResultSourceChecks(drawIds) {
  const ids = [...new Set((drawIds || []).map(Number).filter(Number.isInteger))];
  if (!ids.length) return new Map();
  const rows = await q(`SELECT draw_id, source, source_role, source_url, result_date,
      winning_numbers, verification_status, error, checked_at, last_available_at
    FROM draw_result_sources WHERE draw_id = ANY($1::bigint[])
    ORDER BY draw_id, CASE source_role WHEN 'official' THEN 0 WHEN 'primary' THEN 1 ELSE 2 END, source`,
  [ids]);
  const grouped = new Map();
  for (const row of rows) {
    const key = Number(row.draw_id);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(parseSourceCheck(row));
  }
  return grouped;
}

// หา source label ที่รายงานผลตรงกับ winning ที่กำลังจะ settle — ใช้ติดป้ายกำกับผลย้อนหลัง
export async function sourceLabelForWinning(draw, winning) {
  const grouped = await getResultSourceChecks([draw.id]);
  const checks = grouped.get(Number(draw.id)) || [];
  const targetDate = drawLocalDate(draw);
  return checks.find(c =>
    c.result_date === targetDate
    && !['unavailable', 'date_mismatch'].includes(c.verification_status)
    && c.winning
    && sameWinning(c.winning, winning)
  )?.source || null;
}

function drawLocalDate(draw) {
  const d = new Date(String(draw.draw_at).replace(' ', 'T') + 'Z');
  return isNaN(d) ? String(draw.draw_at).slice(0, 10) : d.toLocaleDateString('sv-SE', { timeZone: 'Asia/Bangkok' });
}

//<HNS=auto> — หวยฮานอยเฉพาะกิจมีผลรายวันบน lotterychecks (hanoi-adhoc, เผยแพร่ ~16:45)
// → auto-fetch ได้; ถ้าตลาดไหนไม่มีผลวันไหน date-match จะไม่ settle (รอ admin กรอกเอง)
export function isManualDraw(d) {
  return d.result_mode === 'manual';
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
// session-level advisory lock — กันหลาย instance settle ซ้ำกัน (single-instance ก็ใช้ได้ปลอดภัย)
const ADVISORY_LOCK_KEY = 727001;
// throttle Telegram alert — กัน spam ทุก 1 นาทีที่ scheduler รัน
let lastAlertAt = 0, lastAlertSig = '';
const ALERT_COOLDOWN_MS = 30 * 60e3;
const OVERDUE_MS = 6 * 3600e3; // รอบที่เลยเวลาออกผลเกิน 6 ชม. ถือว่าค้าง

// health ของแต่ละ result source — ใช้แสดงใน /admin/health และเป็นสัญญาณว่า fallback ถูกใช้บ่อยไหม
const sourceHealth = new Map(); // label -> {label, ok, lastOkAt, lastErrAt, lastError, uses}
function noteSource(label, ok, err) {
  const h = sourceHealth.get(label) || { label, ok: null, lastOkAt: null, lastErrAt: null, lastError: null, uses: 0 };
  h.uses++;
  if (ok) { h.ok = true; h.lastOkAt = new Date().toISOString(); }
  else { h.ok = false; h.lastErrAt = new Date().toISOString(); h.lastError = String(err || 'unknown').slice(0, 200); }
  sourceHealth.set(label, h);
}
export function getSourceHealth() {
  return [...sourceHealth.values()].sort((a, b) => (b.lastOkAt || b.lastErrAt || '').localeCompare(a.lastOkAt || a.lastErrAt || ''));
}
export async function autoSettleResults() {
  if (settleRunning) return { settled: [], skipped: [], errors: [], sources: [], note: 'previous run still in progress' };
  settleRunning = true;
  // advisory lock บน dedicated connection — ถ้า instance อื่นกำลัง settle อยู่ ให้ข้ามรอบนี้
  let lockClient = null, locked = false;
  try {
    lockClient = await getPool().connect();
    const r = await lockClient.query('SELECT pg_try_advisory_lock($1) AS ok', [ADVISORY_LOCK_KEY]);
    locked = !!r.rows[0]?.ok;
    if (!locked) return { settled: [], skipped: [], errors: [], sources: [], note: 'another instance is settling' };
  } catch (e) {
    // lock พัง (เช่น DB เก่า) — ปล่อย lockClient แล้วทำต่อแบบไม่มี lock ดีกว่าหยุด settle ทั้งระบบ
    console.error('[auto-settle] advisory lock failed, continuing unlocked:', e.message);
    if (lockClient) { try { lockClient.release(); } catch {} lockClient = null; }
  }
  try { return await autoSettleResultsInner(); }
  finally {
    settleRunning = false;
    if (locked && lockClient) {
      try { await lockClient.query('SELECT pg_advisory_unlock($1)', [ADVISORY_LOCK_KEY]); } catch {}
    }
    if (lockClient) lockClient.release();
  }
}

async function autoSettleResultsInner() {
  const out = { settled: [], skipped: [], errors: [], sources: [] };
  const draws = await pendingDraws();
  if (!draws.length) return out;

  // cache ต่อรอบ settle — กัน fetch ซ้ำเมื่อมีหลายรอบของตลาดเดียวกัน
  const lcCache = new Map();   // slug -> raw | null
  const lcErr = new Map();     // slug -> error message
  const runCache = new Map();  // label -> Promise<{ok,r|e}>
  const lcRaw = async (slug) => {
    if (!lcCache.has(slug)) {
      try { lcCache.set(slug, await fetchLCAll(slug)); }
      catch (e) { lcErr.set(slug, e.message); lcCache.set(slug, null); }
    }
    const raw = lcCache.get(slug);
    if (!raw) throw new Error(`LC ${slug}: ${lcErr.get(slug) || 'no result'}`);
    return raw;
  };
  const cached = (label, fn) => {
    if (!runCache.has(label))
      runCache.set(label, Promise.resolve().then(fn).then(r => ({ ok: true, r })).catch(e => ({ ok: false, e })));
    return runCache.get(label);
  };
  const lcWin = (slug, kind, date) => lcRaw(slug).then(list => {
    // date = วันที่รอบ (Asia/Bangkok) — เลือกงวดที่ตรงกันเท่านั้น (กัน settle ด้วยผลคนละวัน)
    const raw = date ? list.find(x => x.date === date) : list[0];
    if (!raw) throw new Error(`LC ${slug}: no result for ${date || 'latest'}`);
    return { date: raw.date, winning: winningFor(kind, raw) };
  });

  // source chain ต่อ draw — ลำดับ = ความน่าเชื่อถือ (official ก่อน, fallback ตามหลัง)
  // ทุก candidate ต้องผ่าน date-match กับรอบนั้นๆ ถึงจะ settle — กัน source เก่า/ผิดวัน
  const GLO_URL = 'https://www.glo.or.th/api/lottery/getLatestLottery';
  const LC_URL = (slug) => `https://lotterychecks.com/api/public/results?lottery=${encodeURIComponent(slug)}&limit=1`;
  const candidatesFor = (d) => {
    const cat = d.cat_code;
    if (d.type_code === 'TH') return [
      { label: 'TH(GLO)', role: 'official', url: GLO_URL, get: () => cached('src:TH(GLO)', fetchThaiResult) },
      { label: 'TH(LC)',  role: 'backup',   url: LC_URL('thai-government'), get: () => cached(`src:TH(LC):${drawLocalDate(d)}`, () => lcWin('thai-government', 'thai-gov', drawLocalDate(d))) },
    ];
    if (d.type_code === 'HR')
      return [{ label: 'HR(gen)', role: 'primary', url: 'internal:generate', get: () => cached('src:HR(gen)', async () => ({ date: drawLocalDate(d), winning: generateZodiacResult(d.draw_code) })) }];
    if (d.type_code === 'LA' && cat === 'LAD') {
      // หวยลาวพัฒนา — เว็บทางการ laodl.com เป็น primary (เลข 6 หลักครบ)
      // backup LC มีแค่เลขท้าย 4/3/2 — รับเฉพาะผลที่มี last5 ไม่งั้นถือว่าไม่มีผล (กัน settle ไม่ครบ)
      const localDate = drawLocalDate(d);
      const lcLaoDev = () => cached(`src:lao-lottery:${localDate}`, async () => {
        const r = await lcWin('lao-lottery', 'lao-dev', localDate);
        if (!r.winning?.last5) throw new Error('lao-lottery: ผลไม่ครบ (ไม่มีเลข 5 ตัวท้าย)');
        return r;
      });
      return [
        { label: 'LA(laodl)', role: 'official', url: LAODL_URL, get: () => cached(`src:laodl:${localDate}`, () => fetchLaoDevOfficial(localDate)) },
        { label: 'LA(lao-lottery)', role: 'backup', url: LC_URL('lao-lottery'), get: lcLaoDev },
      ];
    }
    if (d.type_code === 'HN' && (cat === 'HNN' || cat === 'HNST')) return [
      { label: 'HN(XSMB)', role: 'primary', url: XSMB_URL, get: () => cached(`src:HN(XSMB):${drawLocalDate(d)}`, fetchHanoiResult) },
      { label: 'HN(LC)',   role: 'backup',  url: LC_URL('hanoi-normal'), get: () => cached(`src:HN(LC):${drawLocalDate(d)}`, () => lcWin('hanoi-normal', 'hn', drawLocalDate(d))) },
    ];
    if (d.type_code === 'LA' || d.type_code === 'HN' || d.type_code === 'GS') {
      const m = LC_MARKET_MAP[cat] || LC_MARKET_MAP[d.type_code];
      if (!m) return [];
      const localDate = drawLocalDate(d);
      return [{ label: `${d.type_code}(${m.slug})`, role: 'primary', url: LC_URL(m.slug), get: () => cached(`src:${m.slug}:${localDate}`, () => lcWin(m.slug, m.kind, localDate)) }];
    }
    return [];
  };

  const srcSeen = new Set();
  for (const d of draws) {
    if (isManualDraw(d)) { out.skipped.push(`${d.draw_code}: manual mode`); continue; }
    const cands = candidatesFor(d);
    if (!cands.length) { out.skipped.push(`${d.draw_code}: no source`); continue; }
    const tried = [];
    const observations = [];
    let selected = null;
    // ประเมินทุก candidate (fetch ถูก cache ต่อ label อยู่แล้ว) — เก็บผลทุกแหล่งลง draw_result_sources
    // เพื่อให้ user เห็นว่าแต่ละแหล่งรายงานตรงกันไหม ก่อน settle ด้วย candidate แรกที่ผ่าน date-match
    for (const c of cands) {
      const res = await c.get();
      if (!srcSeen.has(c.label)) {
        srcSeen.add(c.label);
        out.sources.push({ code: c.label, label: c.label, ok: res.ok, ...(res.ok ? {} : { error: res.e?.message }) });
      }
      noteSource(c.label, res.ok, res.e?.message);
      const localDate = drawLocalDate(d);
      if (!res.ok) {
        tried.push(`${c.label}:fail`);
        observations.push({ source: c.label, role: c.role, url: c.url, available: false, status: 'unavailable', error: String(res.e?.message || '').slice(0, 200) });
        continue;
      }
      const src = res.r;
      if (src.date && localDate !== src.date) {
        tried.push(`${c.label}:date ${src.date}`);
        observations.push({ source: c.label, role: c.role, url: c.url, date: src.date, winning: src.winning, available: true, status: 'date_mismatch' });
        continue;
      }
      observations.push({ source: c.label, role: c.role, url: c.url, date: src.date, winning: src.winning, available: true, status: 'unverified' });
      if (!selected) selected = { c, src };
    }
    // เปรียบเทียบผลข้ามแหล่ง — eligible ทั้งหมดตรงกัน = matched, ไม่ตรง = mismatch
    const eligible = observations.filter(o => o.available && o.status !== 'date_mismatch');
    if (eligible.length > 1) {
      const base = eligible.find(o => o.role === 'official') || eligible[0];
      const status = eligible.every(o => sameWinning(base.winning, o.winning)) ? 'matched' : 'mismatch';
      for (const o of eligible) o.status = status;
    }
    if (observations.length) {
      try { await storeSourceChecks(d.id, observations); }
      catch (e) { console.error('[source-checks] store failed:', e.message); }
    }
    if (selected) {
      try {
        await settleDraw(null, d.id, selected.src.winning, selected.c.label);
        out.settled.push(`${d.draw_code}(${selected.c.label})`);
        await audit({ action: 'draw.auto_settle', entityType: 'draw', entityId: String(d.id), detail: { source: selected.c.label, winning: selected.src.winning } });
      } catch (e) {
        out.errors.push(`${d.draw_code}: ${e.message}`);
      }
    } else {
      out.skipped.push(`${d.draw_code}: รอผลจริง [${tried.join(' | ') || 'no data'}]`);
    }
  }

  // HNS (หวยฮานอยเฉพาะกิจ) ออกไม่ทุกวัน — ระบบ generate ทุกรอบแต่บางวันไม่มีผลจริงบน LC
  // ถ้าค้างเกิน 36 ชม. แล้วยังไม่มีผล → ยกเลิกรอบ + refund โพยอัตโนมัติ (admin เห็นใน audit)
  try {
    const staleCut = new Date(Date.now() - 36 * 3600e3).toISOString().slice(0, 19).replace('T', ' ');
    const stale = await q(`SELECT d.id, d.draw_code FROM lottery_draws d
      JOIN lottery_types lt ON lt.id=d.lottery_type_id
      LEFT JOIN lottery_categories c ON c.id=d.category_id
      WHERE d.status IN ('open','scheduled','closed') AND d.draw_at < ?
        AND lt.code='HN' AND (c.code='HNS' OR d.category_id IS NULL)
        AND d.id NOT IN (SELECT draw_id FROM lottery_results)`, [staleCut]);
    for (const s of stale) {
      try {
        await updateDrawStatus(null, s.id, 'cancelled');
        await audit({ action: 'draw.auto_cancel_stale', entityType: 'draw', entityId: String(s.id), detail: { drawCode: s.draw_code, reason: 'no result after 36h (HNS adhoc)' } });
        out.cancelled = [...(out.cancelled || []), s.draw_code];
      } catch (e) { console.error('[auto-cancel]', s.draw_code, e.message); }
    }
    if (out.cancelled?.length) broadcast('draws');
  } catch (e) { console.error('[auto-cancel] scan failed:', e.message); }

  if (out.settled.length) {
    broadcast('results');
    // แจ้งผลรอบที่เพิ่งออกไป Telegram channel (ถ้าตั้งค่าไว้)
    import('./telegramService.js').then(m => m.sendTelegram(
      `🎉 ผลออกแล้ว ${out.settled.length} รอบ\n${out.settled.slice(0, 10).join('\n')}${out.settled.length > 10 ? `\n…อีก ${out.settled.length - 10} รอบ` : ''}`
    )).catch(() => {});
  }
  // แจ้งเตือน error / รอบค้างผลนานเกิน OVERDUE_MS ทาง Telegram — throttle 30 นาที (cooldown + signature เดิมไม่ส่งซ้ำ)
  try {
    const nowMs = Date.now();
    const overdue = draws.filter(d => {
      if (isManualDraw(d)) return false;
      const t = new Date(String(d.draw_at).replace(' ', 'T') + 'Z').getTime();
      return !isNaN(t) && nowMs - t > OVERDUE_MS;
    });
    if (out.errors.length || overdue.length) {
      const sig = `${out.errors.length}|${overdue.map(d => d.draw_code).join(',')}`;
      if (sig !== lastAlertSig || nowMs - lastAlertAt > ALERT_COOLDOWN_MS) {
        lastAlertSig = sig; lastAlertAt = nowMs;
        const lines = [];
        if (out.errors.length) lines.push(`❌ error ${out.errors.length}: ${out.errors.slice(0, 5).join(' | ')}`);
        if (overdue.length) lines.push(`⏰ รอบค้างผล ${overdue.length}: ${overdue.slice(0, 5).map(d => d.draw_code).join(', ')}${overdue.length > 5 ? ' …' : ''}`);
        import('./telegramService.js').then(m => m.sendTelegram(`⚠️ Auto-settle alert\n${lines.join('\n')}`)).catch(() => {});
      }
    }
  } catch { /* alert ต้องไม่ทำให้ settle พัง */ }
  return out;
}

/** admin กดดึงผลเองสำหรับรอบใดรอบหนึ่ง — คืนผลลัพธ์ถ้าพบ (ยังไม่ settle) */
export async function fetchResultForDraw(drawId) {
  const draw = await getDraw(drawId);
  if (!draw) throw new HttpError(404, 'ไม่พบรอบหวย');
  const d = { ...draw, cat_code: draw.cat_code || draw.category_code };
  const localDate = drawLocalDate(d);
  if (isManualDraw(d)) throw new HttpError(400, 'รอบนี้ตั้งค่ากรอกผลเอง — ดึงผลอัตโนมัติไม่ได้');
  const GLO_URL = 'https://www.glo.or.th/api/lottery/getLatestLottery';
  const LC_URL = (slug) => `https://lotterychecks.com/api/public/results?lottery=${encodeURIComponent(slug)}&limit=1`;
  const cands = [];
  if (d.type_code === 'TH') cands.push(
    ['TH(GLO)', 'official', GLO_URL, fetchThaiResult],
    ['TH(LC)', 'backup', LC_URL('thai-government'), () => lcWinning('thai-government', 'thai-gov', localDate)]);
  else if (d.type_code === 'HR') return { date: localDate, winning: generateZodiacResult(d.draw_code) };
  else if (d.type_code === 'LA' && d.cat_code === 'LAD')
    cands.push(
      ['LA(laodl)', 'official', LAODL_URL, () => fetchLaoDevOfficial(localDate)],
      ['LA(lao-lottery)', 'backup', LC_URL('lao-lottery'), async () => {
        const r = await lcWinning('lao-lottery', 'lao-dev', localDate);
        if (!r.winning?.last5) throw new Error('lao-lottery: ผลไม่ครบ (ไม่มีเลข 5 ตัวท้าย)');
        return r;
      }]);
  else if (d.type_code === 'HN' && (d.cat_code === 'HNN' || d.cat_code === 'HNST'))
    cands.push(
      ['HN(XSMB)', 'primary', XSMB_URL, fetchHanoiResult],
      ['HN(LC)', 'backup', LC_URL('hanoi-normal'), () => lcWinning('hanoi-normal', 'hn', localDate)]);
  else if (d.type_code === 'LA' || d.type_code === 'HN' || d.type_code === 'GS') {
    const m = LC_MARKET_MAP[d.cat_code] || LC_MARKET_MAP[d.type_code];
    if (!m) throw new HttpError(400, 'ไม่ทราบแหล่งผลสำหรับหวยประเภทนี้ — กรุณากรอกผลเอง');
    cands.push([`${d.type_code}(${m.slug})`, 'primary', LC_URL(m.slug), () => lcWinning(m.slug, m.kind, localDate)]);
  } else throw new HttpError(400, 'ไม่ทราบแหล่งผลสำหรับหวยประเภทนี้ — กรุณากรอกผลเอง');
  const errors = [];
  const observations = [];
  for (const [label, role, url, fn] of cands) {
    try {
      const src = await fn();
      noteSource(label, true);
      if (src.date && src.date !== localDate) {
        errors.push(`${label}: ผลวันที่ ${src.date}`);
        observations.push({ source: label, role, url, date: src.date, winning: src.winning, available: true, status: 'date_mismatch' });
        continue;
      }
      observations.push({ source: label, role, url, date: src.date, winning: src.winning, available: true, status: 'unverified' });
      const eligible = observations.filter(o => o.available && o.status !== 'date_mismatch');
      if (eligible.length > 1) {
        const base = eligible.find(o => o.role === 'official') || eligible[0];
        const st = eligible.every(o => sameWinning(base.winning, o.winning)) ? 'matched' : 'mismatch';
        for (const o of eligible) o.status = st;
      }
      try { await storeSourceChecks(d.id, observations); } catch {}
      return { date: src.date, winning: src.winning, source: label };
    } catch (e) {
      noteSource(label, false, e.message); errors.push(`${label}: ${e.message}`);
      observations.push({ source: label, role, url, available: false, status: 'unavailable', error: String(e.message || e).slice(0, 200) });
    }
  }
  try { await storeSourceChecks(d.id, observations); } catch {}
  throw new HttpError(409, `ดึงผลไม่สำเร็จ — ${errors.join(' | ') || 'ไม่มีข้อมูล'}`);
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
      const txType = dir === 'credit' ? 'win_credit' : 'admin_debit';
      const jr = await d.prepare(`INSERT INTO virtual_transactions
        (reference, wallet_id, user_id, type, amount, balance_after, direction, status, idempotency_key, description)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'completed', ?, ?)`)
        .run(makeReference('TX'), w.id, uid, txType,
          Math.abs(diff), nb, dir, `refetch-${drawId}-u${uid}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`, 'ปรับผลรางวัลหลังแก้ไขผล (DEMO)');
      const { postJournalTx } = await import('./ledgerService.js');
      await postJournalTx(d, { transactionId: Number(jr.lastInsertRowid), userId: uid, type: txType, amount: Math.abs(diff), direction: dir });
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
    await audit({ userId: adminId, action: 'draw.result_update', entityType: 'draw', entityId: String(drawId), detail: { winningNumbers } });
    return { ok: true };
  });
}
