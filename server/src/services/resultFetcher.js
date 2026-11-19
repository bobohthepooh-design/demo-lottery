import { txAsync, makeReference } from '../db/index.js';
import { settleDraw, getDraw, evaluateBet, listRules, mergeAnnounce, validateWinningNumbers } from './lotteryService.js';
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
  LA:    { slug: 'lao-union',                kind: 'lao5' },
  LAM:   { slug: 'lao-morning',              kind: 'lao5' },
  LADAM: { slug: 'lao-development-morning',  kind: 'lao6' },
  LADT:  { slug: 'lao-development-midday',   kind: 'lao6' },
  HNS:   { slug: 'hanoi-adhoc',              kind: 'hn' },
  HNP:   { slug: 'hanoi-special',            kind: 'hn' },
  HNV:   { slug: 'hanoi-vip',                kind: 'hn' },
  HNM:   { slug: 'hanoi-morning',            kind: 'hn' },
  GS:    { slug: 'gsb-lottery',              kind: 'gsb' },
};

// ดึงผลดิบจาก lotterychecks — คืน {date, prizes:{slug:digits}}
async function fetchLCAll(slug) {
  const r = await fetchResilient(`https://lotterychecks.com/api/public/results?lottery=${slug}&limit=1`,
    { signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`LC HTTP ${r.status}`);
  const j = await r.json();
  const d = j?.data?.[0];
  if (!d || d.status !== 'complete') throw new Error(`LC ${slug}: no result`);
  const prizes = {};
  // เก็บทุกเลขรางวัล — บางตลาด (เช่น GSB) อันดับ 3/4/5 มีหลายเลข
  for (const p of d.prizes || []) {
    prizes[p.slug] = (p.numbers || []).map(n => String(n).replace(/\D/g, '')).filter(Boolean);
  }
  return { date: String(d.drawDate).slice(0, 10), prizes };
}

const lcNum = (x, slug, len) => {
  const v = x.prizes[slug];
  const first = Array.isArray(v) ? v[0] : v;
  if (!first) throw new Error(`LC missing prize ${slug}`);
  return String(first).padStart(len, '0').slice(-len);
};
// ทุกเลขของรางวัล (pad เป็น len หลัก)
const lcAll = (x, slug, len) => (x.prizes[slug] || []).map(v => String(v).padStart(len, '0').slice(-len));

function winningFor(kind, x) {
  if (kind === 'lao5') {
    const s5 = lcNum(x, 'special-prize', 5);
    const top3 = lcNum(x, 'three-digit-top', 3);
    const bottom2 = lcNum(x, 'two-digit-bottom', 2);
    return {
      last4: s5.slice(-4), num4: s5.slice(0, 4), db5: s5,
      top3, last3: top3, last2: top3.slice(-2), bottom2,
    };
  }
  if (kind === 'lao6') {
    const s6 = lcNum(x, 'special-prize', 6);
    const s5 = s6.slice(-5);
    return {
      last4: s6.slice(-4), num4: s6.slice(-4), db5: s5,
      top3: lcNum(x, 'three-digit-top', 3), last3: lcNum(x, 'three-digit-top', 3),
      last2: lcNum(x, 'two-digit-bottom', 2), bottom2: lcNum(x, 'two-digit-bottom', 2),
    };
  }
  if (kind === 'gsb') {
    // สลากออมสินพิเศษ — อันดับ 1-5 (7 หลัก, อ.3=5 เลข อ.4=10 เลข อ.5=15 เลข) + เลขท้าย 4/3 ตัว
    return {
      p1: lcAll(x, 'first-prize', 7), p2: lcAll(x, 'second-prize', 7),
      p3: lcAll(x, 'third-prize', 7), p4: lcAll(x, 'fourth-prize', 7),
      p5: lcAll(x, 'fifth-prize', 7),
      last4: lcNum(x, 'last-four-digit', 4),
      last3: lcNum(x, 'last-three-digit', 3),
    };
  }
  if (kind === 'thai-gov') {
    // หวยรัฐบาล — fallback ของ GLO: เลข 6 หลัก + เลขหน้า/ท้าย 3 ตัว (ตลาดละ 2 เลข) + เลขท้าย 2 ตัว
    return {
      first: lcNum(x, 'first-prize', 6),
      front3: lcAll(x, 'first-three-digit', 3),
      top3: lcAll(x, 'last-three-digit', 3),
      bottom2: lcNum(x, 'last-two-digit', 2),
    };
  }
  // hn
  const s5 = lcNum(x, 'special-prize', 5);
  return {
    num4: s5.slice(0, 4),
    top3: lcNum(x, 'three-digit-top', 3),
    bottom2: lcNum(x, 'two-digit-bottom', 2),
    db5: s5,
  };
}

// ผลดิบ LC → winning ตาม kind (ใช้ร่วมกันทุก source chain)
async function lcWinning(slug, kind) {
  const raw = await fetchLCAll(slug);
  return { date: raw.date, winning: winningFor(kind, raw), slug };
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

// ---------- matching & settle ----------
// draw_at เก็บเป็น UTC 'YYYY-MM-DD HH:MM:SS' — แปลงเป็นวันที่เวลาไทยสำหรับเทียบกับวันที่ผลจริง
function drawLocalDate(draw) {
  const d = new Date(String(draw.draw_at).replace(' ', 'T') + 'Z');
  return isNaN(d) ? String(draw.draw_at).slice(0, 10) : d.toLocaleDateString('sv-SE', { timeZone: 'Asia/Bangkok' });
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
  const lcWin = (slug, kind) => lcRaw(slug).then(raw => ({ date: raw.date, winning: winningFor(kind, raw) }));

  // source chain ต่อ draw — ลำดับ = ความน่าเชื่อถือ (official ก่อน, fallback ตามหลัง)
  // ทุก candidate ต้องผ่าน date-match กับรอบนั้นๆ ถึงจะ settle — กัน source เก่า/ผิดวัน
  const candidatesFor = (d) => {
    const cat = d.cat_code;
    if (d.type_code === 'TH') return [
      { label: 'TH(GLO)', get: () => cached('src:TH(GLO)', fetchThaiResult) },
      { label: 'TH(LC)',  get: () => cached('src:TH(LC)', () => lcWin('thai-government', 'thai-gov')) },
    ];
    if (d.type_code === 'HR')
      return [{ label: 'HR(gen)', get: () => cached('src:HR(gen)', async () => ({ date: drawLocalDate(d), winning: generateZodiacResult(d.draw_code) })) }];
    if (d.type_code === 'HN' && (cat === 'HNN' || cat === 'HNST')) return [
      { label: 'HN(XSMB)', get: () => cached('src:HN(XSMB)', fetchHanoiResult) },
      { label: 'HN(LC)',   get: () => cached('src:HN(LC)', () => lcWin('hanoi-normal', 'hn')) },
    ];
    if (d.type_code === 'LA' || d.type_code === 'HN' || d.type_code === 'GS') {
      const m = LC_MARKET_MAP[cat] || LC_MARKET_MAP[d.type_code];
      if (!m) return [];
      return [{ label: `${d.type_code}(${m.slug})`, get: () => cached(`src:${m.slug}`, () => lcWin(m.slug, m.kind)) }];
    }
    return [];
  };

  const srcSeen = new Set();
  for (const d of draws) {
    if (d.result_mode === 'manual') { out.skipped.push(`${d.draw_code}: manual mode`); continue; }
    const cands = candidatesFor(d);
    if (!cands.length) { out.skipped.push(`${d.draw_code}: no source`); continue; }
    const tried = [];
    let done = false;
    for (const c of cands) {
      const res = await c.get();
      if (!srcSeen.has(c.label)) {
        srcSeen.add(c.label);
        out.sources.push({ code: c.label, label: c.label, ok: res.ok, ...(res.ok ? {} : { error: res.e?.message }) });
      }
      noteSource(c.label, res.ok, res.e?.message);
      if (!res.ok) { tried.push(`${c.label}:fail`); continue; }
      const src = res.r;
      const localDate = drawLocalDate(d);
      if (src.date && localDate !== src.date) { tried.push(`${c.label}:date ${src.date}`); continue; }
      try {
        await settleDraw(null, d.id, src.winning, c.label);
        out.settled.push(`${d.draw_code}(${c.label})`);
        audit({ action: 'draw.auto_settle', entityType: 'draw', entityId: String(d.id), detail: { source: c.label, winning: src.winning } });
      } catch (e) {
        out.errors.push(`${d.draw_code}: ${e.message}`);
      }
      done = true;
      break;
    }
    if (!done) out.skipped.push(`${d.draw_code}: รอผลจริง [${tried.join(' | ') || 'no data'}]`);
  }
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
      if (d.result_mode === 'manual') return false;
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
  if (d.result_mode === 'manual') throw new HttpError(400, 'รอบนี้ตั้งค่ากรอกผลเอง — ดึงผลอัตโนมัติไม่ได้');
  const cands = [];
  if (d.type_code === 'TH') cands.push(['TH(GLO)', fetchThaiResult], ['TH(LC)', () => lcWinning('thai-government', 'thai-gov')]);
  else if (d.type_code === 'HR') return { date: localDate, winning: generateZodiacResult(d.draw_code) };
  else if (d.type_code === 'HN' && (d.cat_code === 'HNN' || d.cat_code === 'HNST'))
    cands.push(['HN(XSMB)', fetchHanoiResult], ['HN(LC)', () => lcWinning('hanoi-normal', 'hn')]);
  else if (d.type_code === 'LA' || d.type_code === 'HN' || d.type_code === 'GS') {
    const m = LC_MARKET_MAP[d.cat_code] || LC_MARKET_MAP[d.type_code];
    if (!m) throw new HttpError(400, 'ไม่ทราบแหล่งผลสำหรับหวยประเภทนี้ — กรุณากรอกผลเอง');
    cands.push([`${d.type_code}(${m.slug})`, () => lcWinning(m.slug, m.kind)]);
  } else throw new HttpError(400, 'ไม่ทราบแหล่งผลสำหรับหวยประเภทนี้ — กรุณากรอกผลเอง');
  const errors = [];
  for (const [label, fn] of cands) {
    try {
      const src = await fn();
      noteSource(label, true);
      if (src.date && src.date !== localDate) { errors.push(`${label}: ผลวันที่ ${src.date}`); continue; }
      return { date: src.date, winning: src.winning, source: label };
    } catch (e) { noteSource(label, false, e.message); errors.push(`${label}: ${e.message}`); }
  }
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
