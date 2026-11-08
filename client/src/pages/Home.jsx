import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { api, fmtDateTime, thaiTime } from '../api.js';
import { useAuth } from '../auth.jsx';
import ResultLine, { TYPE_EMOJI } from '../components/ResultLine.jsx';

// นับถอยหลังเวลา (วินาที) — tick ทุก 1 วิ
function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

function msLeft(closeAtSql, now) {
  return new Date(String(closeAtSql).replace(' ', 'T') + 'Z').getTime() - now;
}

function countdownText(closeAtSql, now) {
  // close_at เก็บเป็น UTC 'YYYY-MM-DD HH:MM:SS'
  const diff = msLeft(closeAtSql, now);
  if (diff <= 0) return 'ปิดรับแล้ว';
  const h = Math.floor(diff / 3600e3), m = Math.floor(diff % 3600e3 / 60e3), s = Math.floor(diff % 60e3 / 1000);
  const p = n => String(n).padStart(2, '0');
  return h >= 24 ? `อีก ${Math.floor(h / 24)} วัน ${p(h % 24)}:${p(m)}:${p(s)}` : `${p(h)}:${p(m)}:${p(s)}`;
}

// ระยะเวลาที่เหลือแบบอ่านเข้าใจง่าย ไม่ให้สับสนกับเวลาดน.
function durationText(closeAtSql, now) {
  const diff = msLeft(closeAtSql, now);
  if (diff <= 0) return 'ปิดรับแล้ว';
  const sec = Math.floor(diff / 1000);
  const d = Math.floor(sec / 86400), h = Math.floor(sec % 86400 / 3600);
  const m = Math.floor(sec % 3600 / 60), s = sec % 60;
  if (d > 0) return `อีก ${d} วัน ${h} ชม. ${m} นาที`;
  if (h > 0) return `อีก ${h} ชม. ${m} นาที ${s} วินาที`;
  if (m > 0) return `อีก ${m} นาที ${s} วินาที`;
  return `อีก ${s} วินาที`;
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
  const [selType, setSelType] = useState('');

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

  // ผลรางวัลกรองตามประเภทหวยที่เลือก ('' = ทั้งหมด)
  const selCode = types.find(t => String(t.id) === String(selType))?.code;
  const shownResults = selCode
    ? latestByCategory.filter(r => r.type_code === selCode)
    : latestByCategory;

  // แจ้งเตือนรอบที่ใกล้ปิดรับสุด (สูงสุด 3 รอบ) — กระพริบแดงเมื่อเหลือ < 1 ชม.
  const alertDraws = sorted
    .filter(d => d.status === 'open' && msLeft(d.close_at, now) > 0)
    .slice(0, 3);

  return (
    <div className="space-y-8">
      {/* แจ้งเตือนเวลาปิดรับโพย — รอบที่ใกล้สุดก่อน */}
      {alertDraws.length > 0 && (
        <section className="bg-gradient-to-r from-amber-500/15 to-red-500/10 border border-amber-500/40 rounded-xl p-4">
          <h2 className="text-sm font-bold text-amber-300 mb-2 flex items-center gap-2">
            🔔 แจ้งเตือนรอบหวยที่ใกล้ปิดรับ
          </h2>
          <div className="space-y-1.5">
            {alertDraws.map(d => {
              const left = msLeft(d.close_at, now);
              const urgent = left < 3600e3;
              return (
                <div key={d.id} className="flex items-center gap-2 flex-wrap bg-navy-900/60 rounded-lg px-3 py-2">
                  <span className="text-xs">{TYPE_EMOJI[d.type_code] || '🎟️'}</span>
                  <span className="text-xs font-semibold text-white">
                    {d.type_name_th}{d.category_name_th ? ` ${d.category_name_th}` : ''}
                  </span>
                  <span className="text-[10px] text-navy-400">ออกรางวัล {fmtDateTime(d.draw_at)} • ปิดรับ {thaiTime(d.close_at)} น.</span>
                  <span className={`text-xs font-bold ml-auto px-2 py-0.5 rounded ${urgent ? 'bg-red-500/25 text-red-300 animate-pulse' : 'bg-amber-500/20 text-amber-300'}`}>
                    ปิดรับ {durationText(d.close_at, now)}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ผลรางวัลล่าสุด — ไว้บนสุดเสมอ กรองตามประเภทหวยได้ */}
      {shownResults.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <h2 className="text-xl font-bold text-white">ผลรางวัลล่าสุด</h2>
            <div className="flex items-center gap-2">
              <div className="flex gap-1">
                <button onClick={() => setSelType('')}
                  className={`px-3 py-1 rounded-lg text-xs ${!selType ? 'bg-gold-500 text-navy-950 font-bold' : 'bg-navy-800 text-navy-200 border border-navy-700'}`}>
                  ทั้งหมด
                </button>
                {types.map(t => (
                  <button key={t.id} onClick={() => setSelType(String(t.id))}
                    className={`px-3 py-1 rounded-lg text-xs ${selType === String(t.id) ? 'bg-gold-500 text-navy-950 font-bold' : 'bg-navy-800 text-navy-200 border border-navy-700'}`}>
                    {t.name_th}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="space-y-1">
            {shownResults.map(r => <ResultLine key={r.id} r={r} />)}
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
