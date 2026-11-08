// Backfill ผลหวยลาวจริงย้อนหลังจาก laodl.com — node backfill-lao.mjs
import { getDb } from './src/db/index.js';
import { settleDraw } from './src/services/lotteryService.js';

const db = getDb();
const ictToUtc = (ymd, h, m = 0) => new Date(`${ymd}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00+07:00`).toISOString().slice(0, 19).replace('T', ' ');

const r = await fetch('https://laodl.com/api/website/laolot/WinPrizeHistory?type=1',
  { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' }, signal: AbortSignal.timeout(30000) });
const j = await r.json();
const rows = (j.resultData || []).filter(x => x.winNumber);
console.log('history rows:', rows.length);

const t = db.prepare("SELECT id FROM lottery_types WHERE code='LA'").get();
const cat = db.prepare("SELECT id FROM lottery_categories WHERE lottery_type_id=? AND code='LA'").get(t.id);

let n = 0;
for (const row of rows.slice(0, 20)) { // 20 งวดล่าสุดที่มีผล
  const ymd = String(row.roundDate).slice(0, 10);
  const wd = new Date(ymd + 'T12:00:00+07:00').getUTCDay();
  if (![1, 2, 3, 4, 5].includes(wd)) { console.log(' skip', ymd, 'weekday', wd); continue; }
  const code = `LA-DEMO-${ymd.replace(/-/g, '')}`;
  let d = db.prepare('SELECT * FROM lottery_draws WHERE draw_code=?').get(code);
  if (!d) {
    const ins = db.prepare(`INSERT INTO lottery_draws (lottery_type_id,category_id,draw_code,draw_at,close_at,status)
      VALUES (?,?,?,?,?,'scheduled')`).run(t.id, cat.id, code, ictToUtc(ymd, 20), ictToUtc(ymd, 19));
    d = db.prepare('SELECT * FROM lottery_draws WHERE id=?').get(ins.lastInsertRowid);
  }
  if (db.prepare('SELECT 1 FROM lottery_results WHERE draw_id=?').get(d.id)) { console.log(' exists', code); continue; }
  const w = String(row.winNumber).replace(/\D/g, '');
  settleDraw(null, d.id, { main: w, last4: w.slice(-4), last3: w.slice(-3), last2: w.slice(-2) });
  console.log(' settled', code, 'win=' + w);
  n++;
}
console.log('done', n);
