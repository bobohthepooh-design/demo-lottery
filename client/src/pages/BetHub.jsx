import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, fmtDateTime, drawLabel } from '../api.js';
import { FlagIcon } from '../components/ResultLine.jsx';
import { typeAccent } from '../typeAccent.js';
import { isBettingOpen, bettingOpenAtSql, thaiHM } from '../bettingWindow.js';
import { SkeletonGrid } from '../components/Skeleton.jsx';
import EmptyState from '../components/EmptyState.jsx';
import { annSummary } from '../ann.js';

const STATUS_TH = { scheduled: 'กำหนดการ', open: 'รับแทงอยู่', closed: 'ปิดรับ', settled: 'ออกผลแล้ว', cancelled: 'ยกเลิก' };

// หน้า provider — เลือกหวยเป็นกลุ่มตลาด แล้วเห็น "รอบ" ของแต่ละตลาดเป็นรายการ
// รอบที่ยังไม่เปิดรับแสดงเป็นการ์ด back (blind mode) — ล็อกจนกว่าจะถึงเวลาเปิด
export default function BetHub() {
  const [draws, setDraws] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [hiddenBetTypes, setHiddenBetTypes] = useState([]);
  const [filter, setFilter] = useState(''); // key ตลาดที่เลือก — '' = ทั้งหมด

  const load = () => api('/lottery/draws?upcoming=1')
    .then(r => { setDraws(r.draws || []); setLoaded(true); })
    .catch(() => setLoaded(true));

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    api('/lottery/public-config').then(r => setHiddenBetTypes(Array.isArray(r.hiddenBetTypes) ? r.hiddenBetTypes : [])).catch(() => {});
    const h = () => load();
    window.addEventListener('sys:update', h);
    return () => { clearInterval(t); window.removeEventListener('sys:update', h); };
  }, []);

  const hiddenSet = new Set(hiddenBetTypes);
  const nowSql = new Date().toISOString().slice(0, 19).replace('T', ' ');

  // จัดกลุ่มตลาด: type+category — ตัดสิน blind/live ต่อรอบ
  const markets = useMemo(() => {
    const map = new Map();
    for (const d of draws) {
      if (hiddenSet.has(d.type_code)) continue;
      if (['SC', 'HL', 'KI'].includes(d.type_code)) continue; // เกมด่วนไม่มีรอบ
      const key = `${d.type_code}:${d.category_code || d.category_id || ''}`;
      if (!map.has(key)) {
        map.set(key, {
          key,
          typeCode: d.type_code,
          typeName: d.type_name_th,
          catName: d.category_name_th || '',
          name: d.category_name_th ? `${d.type_name_th} — ${d.category_name_th}` : d.type_name_th,
          rounds: [],
        });
      }
      map.get(key).rounds.push(d);
    }
    for (const m of map.values()) {
      m.rounds.sort((a, b) => String(a.draw_at).localeCompare(String(b.draw_at)));
      // สถานะตลาด = สถานะรอบที่ใกล้สุดที่ยังไม่ออกผล
      m.live = m.rounds.some(d => isBettingOpen(d, nowSql));
      m.next = m.rounds.find(d => !['settled', 'cancelled'].includes(d.status));
    }
    return [...map.values()].sort((a, b) => (b.live - a.live) || a.name.localeCompare(b.name, 'th'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draws, hiddenBetTypes]);

  const shown = filter ? markets.filter(m => m.key === filter) : markets;

  return (
    <div className="space-y-5">
      <div className="text-center">
        <h1 className="text-xl font-black text-white">🎯 เลือกหวย</h1>
        <p className="text-xs text-navy-400 mt-1">เลือกตลาด → เลือกรอบที่ต้องการแทง</p>
      </div>

      {/* chips กรองตลาด */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        <button onClick={() => setFilter('')}
          className={`shrink-0 text-xs px-3 py-1.5 rounded-full border font-semibold ${!filter ? 'bg-cyan-500/20 text-cyan-200 border-cyan-400/60' : 'border-navy-600 text-navy-300'}`}>
          ทั้งหมด
        </button>
        {markets.map(m => (
          <button key={m.key} onClick={() => setFilter(m.key === filter ? '' : m.key)}
            className={`shrink-0 text-xs px-3 py-1.5 rounded-full border font-semibold flex items-center gap-1.5 ${m.key === filter ? 'bg-cyan-500/20 text-cyan-200 border-cyan-400/60' : 'border-navy-600 text-navy-300'}`}>
            <FlagIcon code={m.typeCode} className="w-5 h-3.5 text-[7px]" />
            {m.catName || m.typeName}
            {m.live && <span className="online-dot inline-block w-1.5 h-1.5 rounded-full bg-green-400" />}
          </button>
        ))}
      </div>

      {!loaded && <SkeletonGrid count={6} />}
      {loaded && !shown.length && <EmptyState emoji="🎟️" title="ไม่พบรอบหวย" hint="ยังไม่มีรอบที่เปิดรับ — กลับมาดูใหม่ภายหลัง" />}

      {shown.map(m => {
        const ac = typeAccent(m.typeCode);
        return (
          <section key={m.key} className="bg-navy-800/70 border border-navy-700 rounded-2xl overflow-hidden">
            <header className="flex items-center gap-2 px-4 py-3 border-b border-navy-700">
              <FlagIcon code={m.typeCode} className="w-7 h-5 text-[9px]" />
              <div className="font-bold text-white text-sm">{m.name}</div>
              {m.live && <span className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-500/20 text-green-300 border border-green-500/40">● รับแทงอยู่</span>}
            </header>
            <div className="divide-y divide-navy-700/60">
              {m.rounds.map(d => <RoundRow key={d.id} d={d} accent={ac} />)}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function RoundRow({ d, accent }) {
  const nowSql = new Date().toISOString().slice(0, 19).replace('T', ' ');
  const live = isBettingOpen(d, nowSql);
  const opensAt = bettingOpenAtSql(d.close_at, d.type_code);
  const blind = !live && !['settled', 'cancelled'].includes(d.status);
  const drawing = d.status === 'closed' && d.draw_at <= nowSql;
  const opensMs = opensAt ? Date.parse(String(opensAt).replace(' ', 'T') + 'Z') : NaN;
  const opensIn = Number.isFinite(opensMs) ? Math.max(0, opensMs - Date.now()) : 0;

  // ── blind mode: รอบที่ยังไม่เปิดรับ — การ์ดหงายหลัง 🔒 ──
  if (blind) {
    return (
      <div className="flex items-center gap-3 px-4 py-3 opacity-80">
        <div className="w-10 h-12 rounded-lg shrink-0 flex items-center justify-center text-lg"
          style={{ background: 'repeating-linear-gradient(45deg,#1e293b,#1e293b 6px,#334155 6px,#334155 12px)', border: '1px solid #475569' }}>
          🂠
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-navy-300">{drawLabel(d)}</div>
          <div className="text-[11px] text-navy-500">
            ออกรางวัล {thaiHM(d.draw_at)} น.
            {opensAt && opensIn > 0 && ` • เปิดรับ ${thaiHM(opensAt)} น.`}
          </div>
        </div>
        <span className="text-[10px] font-bold px-2 py-1 rounded-lg bg-navy-700 text-navy-300 border border-navy-600 whitespace-nowrap">
          {opensIn > 0 ? `🔒 ${fmtCountdown(opensIn)}` : STATUS_TH[d.status] || '—'}
        </span>
      </div>
    );
  }

  // ── live / drawing / settled ──
  const ann = annSummary(d.announce);
  return (
    <Link to={live ? `/bet/${d.id}` : `/results?draw=${d.id}`}
      className={`flex items-center gap-3 px-4 py-3 hover:bg-navy-700/40 transition ${live ? '' : 'opacity-70'}`}>
      <div className={`w-10 h-12 rounded-lg shrink-0 flex items-center justify-center text-lg border ${live ? 'bg-green-500/15 border-green-500/40' : drawing ? 'bg-gold-500/15 border-gold-500/40' : 'bg-navy-700/60 border-navy-600'}`}>
        {live ? '🎯' : drawing ? '🎰' : d.status === 'settled' ? '🏆' : '🔒'}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-white">{drawLabel(d)}</div>
        <div className="text-[11px] text-navy-400">
          ออก {fmtDateTime(d.draw_at)}
          {ann && <span className="ml-1 text-amber-300">📣 {ann}</span>}
        </div>
      </div>
      {live ? (
        <span className="text-[10px] font-bold px-2 py-1 rounded-lg bg-green-500/20 text-green-300 border border-green-500/40 whitespace-nowrap">
          ปิดใน {fmtCountdown(Date.parse(String(d.close_at).replace(' ', 'T') + 'Z') - Date.now())}
        </span>
      ) : (
        <span className={`text-[10px] font-bold px-2 py-1 rounded-lg whitespace-nowrap ${drawing ? 'bg-gold-500/20 text-gold-300 border border-gold-500/40 animate-pulse' : 'bg-navy-700 text-navy-300 border border-navy-600'}`}>
          {drawing ? 'กำลังออกรางวัล' : d.status === 'settled' ? 'ออกผลแล้ว' : 'ปิดรับ'}
        </span>
      )}
    </Link>
  );
}

function fmtCountdown(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return '00:00';
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h > 0 ? `${h}ชม. ${String(m).padStart(2, '0')}น.` : `${m}:${String(sec).padStart(2, '0')}`;
}
