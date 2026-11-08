import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { api, fmtDateTime } from '../api.js';
import { resultSchema } from '../lotterySchema.js';
import { useAuth } from '../auth.jsx';

const TYPE_EMOJI = { TH: '🇹🇭', LA: '🇱🇦', HN: '🇻🇳' };

// แถวผลรางวัลแบบบรรทัดเดียว — ชื่อประเทศ + เลขทุกประเภทรางวัลเป็นตัวหนังสือธรรมดา
function ResultLine({ r }) {
  let data = r.winning_numbers;
  if (typeof data === 'string') { try { data = JSON.parse(data); } catch { data = {}; } }
  const schema = resultSchema(r.type_code, r.category_code);
  const fields = schema?.fields?.length ? schema.fields : [];
  const parts = fields
    .filter(f => !f.optional)
    .map(f => {
      const raw = data?.[f.key];
      if (raw === undefined || raw === null || raw === '') return null;
      const vals = (Array.isArray(raw) ? raw : [raw]).join(',');
      return `${f.short || f.label}:${vals}`;
    })
    .filter(Boolean);
  // field เสริมที่ไม่อยู่ใน schema
  const known = new Set(fields.map(f => f.key));
  for (const [k, v] of Object.entries(data || {})) {
    if (!known.has(k) && v !== '') parts.push(`${k}:${Array.isArray(v) ? v.join(',') : v}`);
  }
  return (
    <div className="bg-navy-800/70 border border-navy-700/60 rounded-lg px-3 py-1.5 overflow-x-auto whitespace-nowrap">
      <span className="text-xs">{TYPE_EMOJI[r.type_code] || '🎟️'}</span>{' '}
      <span className="text-[11px] font-semibold text-white">{r.type_name_th}{r.category_name_th ? ` ${r.category_name_th}` : ''}</span>
      <span className="text-navy-500 mx-1">|</span>
      <span className="text-[11px] font-mono text-gold-300">{parts.join('  ·  ')}</span>
    </div>
  );
}

// นับถอยหลังเวลา (วินาที) — tick ทุก 1 วิ
function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

function countdownText(closeAtSql, now) {
  // close_at เก็บเป็น UTC 'YYYY-MM-DD HH:MM:SS'
  const close = new Date(String(closeAtSql).replace(' ', 'T') + 'Z').getTime();
  const diff = close - now;
  if (diff <= 0) return 'ปิดรับแล้ว';
  const h = Math.floor(diff / 3600e3), m = Math.floor(diff % 3600e3 / 60e3), s = Math.floor(diff % 60e3 / 1000);
  const p = n => String(n).padStart(2, '0');
  return h >= 24 ? `อีก ${Math.floor(h / 24)} วัน ${p(h % 24)}:${p(m)}:${p(s)}` : `${p(h)}:${p(m)}:${p(s)}`;
}

// แถวรอบหวยของแต่ละประเทศ/หมวด — แสดงเวลาออกรางวัล + นับถอยหลังปิดรับ
function DrawLine({ d, now }) {
  const closed = d.status !== 'open';
  return (
    <div className="bg-navy-800/70 border border-navy-700/60 rounded-lg px-3 py-1.5 flex items-center gap-2 overflow-x-auto whitespace-nowrap">
      <span className="text-xs shrink-0">{TYPE_EMOJI[d.type_code] || '🎟️'}</span>
      <span className="text-[11px] font-semibold text-white shrink-0">
        {d.type_name_th}{d.category_name_th ? ` ${d.category_name_th}` : ''}
      </span>
      <span className="text-[10px] text-navy-400 shrink-0">ออก {fmtDateTime(d.draw_at)}</span>
      <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded shrink-0 ${closed ? 'bg-navy-700 text-navy-400' : 'bg-gold-500/15 text-gold-300'}`}>
        {closed ? 'ปิดรับแล้ว' : `⏳ ${countdownText(d.close_at, now)}`}
      </span>
    </div>
  );
}

export default function Home() {
  const { user } = useAuth();
  const now = useNow();
  const [types, setTypes] = useState([]);
  const [draws, setDraws] = useState([]);
  const [results, setResults] = useState([]);

  useEffect(() => {
    api('/lottery/types').then(r => setTypes(r.types)).catch(() => {});
    api('/lottery/draws?upcoming=1').then(r => setDraws(r.draws)).catch(() => {});
    api('/lottery/results').then(r => setResults(r.results)).catch(() => {});
  }, [user]);

  // รอบเปิดรับที่ใกล้ปิดสุดของแต่ละประเทศ/หมวด
  const openByCategory = [];
  const seenDraw = new Set();
  const sorted = [...draws]
    .filter(d => d.status === 'open' || d.status === 'scheduled')
    .sort((a, b) => String(a.close_at).localeCompare(String(b.close_at)));
  for (const d of sorted) {
    const key = `${d.type_code}:${d.category_code || ''}`;
    if (seenDraw.has(key)) continue;
    seenDraw.add(key);
    openByCategory.push(d);
  }

  // ผลล่าสุดของแต่ละประเทศ/หมวด (results เรียง published_at DESC อยู่แล้ว)
  const latestByCategory = [];
  const seen = new Set();
  for (const r of results) {
    const key = `${r.type_code}:${r.category_code || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    latestByCategory.push(r);
  }

  return (
    <div className="space-y-8">
      {/* ผลรางวัลล่าสุด — ไว้บนสุดเสมอ ครบทุกประเทศ/หมวด */}
      {latestByCategory.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-white">ผลรางวัลล่าสุด</h2>
            <Link to="/lotteries" className="text-sm text-gold-400 hover:underline">ดูรอบหวยทั้งหมด →</Link>
          </div>
          <div className="space-y-1">
            {latestByCategory.map(r => <ResultLine key={r.id} r={r} />)}
          </div>
        </section>
      )}

      {/* ประเภทหวยที่รองรับ + รอบที่เปิดรับ/นับถอยหลังของแต่ละประเทศ */}
      <section>
        <h2 className="text-xl font-bold text-white mb-4">ประเภทหวยที่รองรับ</h2>
        <div className="grid sm:grid-cols-3 gap-4">
          {types.map(t => {
            const typeDraws = openByCategory.filter(d => d.type_code === t.code);
            return (
              <div key={t.id} className="bg-navy-800 border border-navy-700 rounded-xl p-4 flex flex-col">
                <Link to={`/lotteries?type=${t.id}`} className="group">
                  <div className="text-3xl mb-1">{t.code === 'TH' ? '🇹🇭' : t.code === 'LA' ? '🇱🇦' : '🇻🇳'}</div>
                  <div className="font-bold text-white group-hover:text-gold-300">{t.name_th}</div>
                  <div className="text-xs text-navy-300 mt-1 mb-3">{t.description}</div>
                </Link>
                {typeDraws.length > 0 ? (
                  <div className="space-y-1 mt-auto">
                    {typeDraws.map(d => <DrawLine key={d.id} d={d} now={now} />)}
                  </div>
                ) : (
                  <div className="text-[11px] text-navy-500 mt-auto">ไม่มีรอบที่เปิดรับ</div>
                )}
              </div>
            );
          })}
          {!types.length && <div className="text-navy-300">กำลังโหลด...</div>}
        </div>
        <div className="mt-3 text-right">
          <Link to="/lotteries" className="text-sm text-gold-400 hover:underline">ดูรอบหวยทั้งหมด →</Link>
        </div>
      </section>

    </div>
  );
}
