// Backfill ผลรางวัลจริงย้อนหลัง — Run once: node backfill-results.mjs
//  - หวยไทย: GLO official API (getLotteryResult ตามวันที่) — วันออก 1 และ 16 ของเดือน
//  - ฮานอย: XSMB dataset — 4 หมวด ใช้ผล XSMB วันเดียวกัน (สอดคล้องกับ auto-settle)
//  - หวยลาว: ไม่มีแหล่งข้อมูล — ข้าม
import { getDb } from './src/db/index.js';
import { settleDraw } from './src/services/lotteryService.js';

const db = getDb();
const UA = { 'Content-Type': 'application/json', 'User-Agent': 'demo-lottery/1.0' };

const toUtc = (ymd, h) => `${ymd} ${String(h).padStart(2, '0')}:00:00`; // local ICT -> treated as UTC+7 below
// เวลาไทย → UTC: ICT = UTC+7
const ictToUtc = (ymd, h, m = 0) => {
  const d = new Date(`${ymd}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00+07:00`);
  return d.toISOString().slice(0, 19).replace('T', ' ');
};
const p = n => String(n).padStart(2, '0');

function ensureDraw(typeCode, catCode, ymd, hour, closeHour) {
  const t = db.prepare('SELECT id FROM lottery_types WHERE code=?').get(typeCode);
  const c = catCode ? db.prepare('SELECT id FROM lottery_categories WHERE lottery_type_id=? AND code=?').get(t.id, catCode) : null;
  const yyyymmdd = ymd.replace(/-/g, '');
  const code = typeCode === 'TH' ? `TH-DEMO-${yyyymmdd.slice(0, 6)}-${yyyymmdd.slice(6)}` : `${catCode}-DEMO-${yyyymmdd}`;
  let d = db.prepare('SELECT * FROM lottery_draws WHERE draw_code=?').get(code);
  if (!d) {
    const r = db.prepare(`INSERT INTO lottery_draws (lottery_type_id,category_id,draw_code,draw_at,close_at,status)
      VALUES (?,?,?,?,?,'scheduled')`)
      .run(t.id, c?.id ?? null, code, ictToUtc(ymd, hour), ictToUtc(ymd, closeHour));
    d = db.prepare('SELECT * FROM lottery_draws WHERE id=?').get(r.lastInsertRowid);
    console.log('  +draw', code);
  }
  const has = db.prepare('SELECT 1 FROM lottery_results WHERE draw_id=?').get(d.id);
  return has ? null : d;
}

// ---------- TH ----------
async function backfillTH() {
  console.log('== หวยไทย ==');
  const dates = [];
  for (let m = 6; m <= 10; m++) for (const day of [1, 16]) dates.push(`2026-${p(m)}-${p(day)}`);
  dates.push('2026-11-01');
  const vals = node => (node?.number || []).map(n => String(n.value).replace(/\D/g, '')).filter(Boolean);
  for (const ymd of dates) {
    const [y, mo, da] = ymd.split('-');
    try {
      const r = await fetch('https://www.glo.or.th/api/checking/getLotteryResult', {
        method: 'POST', headers: UA,
        body: JSON.stringify({ date: da, month: mo, year: y }),
        signal: AbortSignal.timeout(20000),
      });
      const j = await r.json();
      const g = j?.response?.result?.data;
      if (!g) { console.log(' ', ymd, 'no data'); continue; }
      const draw = ensureDraw('TH', null, ymd, 15, 14);
      if (!draw) { console.log(' ', ymd, 'exists'); continue; }
      settleDraw(null, draw.id, {
        first: vals(g.first)[0], front3: vals(g.last3f), top3: vals(g.last3b), bottom2: vals(g.last2)[0],
      });
      console.log(' ', ymd, 'settled first=' + vals(g.first)[0]);
    } catch (e) { console.log(' ', ymd, 'ERR', e.message); }
  }
}

// ---------- HN ----------
async function backfillHN(days = 14) {
  console.log('== ฮานอย (XSMB) ==');
  const r = await fetch('https://raw.githubusercontent.com/AnhTuPhi/xsmb-vietnam-lottery-analysis/master/data/xsmb.json',
    { signal: AbortSignal.timeout(60000) });
  const rows = await r.json();
  const byDate = new Map(rows.map(x => [String(x.date).slice(0, 10), x]));
  const s = (n, len) => n == null ? null : String(n).padStart(len, '0').slice(-len);
  const cats = { HNS: 16, HNP: 17, HNN: 18, HNV: 19 };
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Bangkok' });
  for (let i = days; i >= 1; i--) {
    const d = new Date(Date.now() + 7 * 3600e3 - i * 86400e3);
    const ymd = d.toISOString().slice(0, 10);
    const row = byDate.get(ymd);
    if (!row) { console.log(' ', ymd, 'no XSMB data'); continue; }
    const special = Number(row.special), p1 = Number(row.prize1), p2 = Number(row.prize2_1 ?? row.prize2_2), p7 = Number(row.prize7_1);
    const winning = {
      num4: s(special, 5).slice(0, 4), top3: s(p1, 5).slice(-3),
      top2: s(p2, 5).slice(-2), bottom2: s(p7, 2), db5: s(special, 5),
    };
    for (const [cat, hour] of Object.entries(cats)) {
      const draw = ensureDraw('HN', cat, ymd, hour, hour - 1);
      if (!draw) continue;
      settleDraw(null, draw.id, winning);
    }
    console.log(' ', ymd, 'settled 4 cats special=' + winning.db5);
  }
  void today;
}

await backfillTH();
await backfillHN(14);
console.log('done');
