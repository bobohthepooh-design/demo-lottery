import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, fmtDateTime, drawLabel } from '../api.js';
import { FlagIcon } from '../components/ResultLine.jsx';
import { typeAccent } from '../typeAccent.js';
import { isBettingOpen, bettingOpenAtSql, thaiHM } from '../bettingWindow.js';
import { SkeletonGrid } from '../components/Skeleton.jsx';
import EmptyState from '../components/EmptyState.jsx';
import { annSummary } from '../ann.js';

// เรียงกลุ่มตลาดแบบ provider — เกม → หวยรางวัล → หวยไทย → ลาว → ฮานอย
const FAMILIES = [
  { key: 'HR', title: '🎴 หวยราศี' },
  { key: 'TH', title: '🇹🇭 หวยไทย' },
  { key: 'GS', title: 'สลากออมสิน / ธ.ก.ส.' },
  { key: 'LA', title: '🇱🇦 หวยลาว' },
  { key: 'HN', title: '🇻🇳 หวยฮานอย' },
];

// หน้า provider-style — ตลาดเป็นแถวเดียวต่อการ์ด แสดงสถานะรอบถัดไป (countdown/หมดรอบ/blind)
// กดตลาดที่เปิดรับ → หน้าแทง / กดตลาดอื่น → กางรายการรอบย่อย
export default function BetHub() {
  const [draws, setDraws] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [hiddenBetTypes, setHiddenBetTypes] = useState([]);
  const [openKey, setOpenKey] = useState(''); // key ตลาดที่กางรายการรอบอยู่
  const [nowMs, setNowMs] = useState(Date.now());

  const load = () => api('/lottery/draws?upcoming=1')
    .then(r => { setDraws(r.draws || []); setLoaded(true); })
    .catch(() => setLoaded(true));

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    const tick = setInterval(() => setNowMs(Date.now()), 1000);
    api('/lottery/public-config').then(r => setHiddenBetTypes(Array.isArray(r.hiddenBetTypes) ? r.hiddenBetTypes : [])).catch(() => {});
    const h = () => load();
    window.addEventListener('sys:update', h);
    return () => { clearInterval(t); clearInterval(tick); window.removeEventListener('sys:update', h); };
  }, []);

  const hiddenSet = new Set(hiddenBetTypes);
  const nowSql = new Date(nowMs).toISOString().slice(0, 19).replace('T', ' ');

  // จัดกลุ่มตลาด: family > type+category
  const { families } = useMemo(() => {
    const map = new Map();
    for (const d of draws) {
      if (hiddenSet.has(d.type_code)) continue;
      if (['SC', 'HL', 'KI', 'CF'].includes(d.type_code)) continue; // เกมด่วนไม่มีรอบ
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
      m.live = m.rounds.some(d => isBettingOpen(d, nowSql));
      m.next = m.rounds.find(d => !['settled', 'cancelled'].includes(d.status));
    }
    const fams = FAMILIES.map(f => ({
      ...f,
      markets: [...map.values()].filter(m => m.typeCode === f.key)
        .sort((a, b) => (b.live - a.live) || String(a.next?.draw_at || '9').localeCompare(String(b.next?.draw_at || '9'))),
    })).filter(f => f.markets.length);
    // type code ที่ไม่อยู่ใน FAMILY — ต่อท้ายตามชื่อ
    const rest = [...map.values()].filter(m => !FAMILIES.some(f => f.key === m.typeCode));
    if (rest.length) fams.push({ key: 'OTHER', title: 'หวยอื่น ๆ', markets: rest });
    return { families: fams };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draws, hiddenBetTypes, nowMs]);

  return (
    <div className="space-y-4 pb-4">
      <div className="text-center">
        <h1 className="text-xl font-black text-white">🎯 เลือกหวย</h1>
        <p className="text-xs text-navy-400 mt-1">เลือกรอบที่เปิดรับเพื่อแทง — รอบที่ล็อกจะเปิดให้อัตโนมัติเมื่อถึงเวลา</p>
      </div>

      {/* quick nav — ผลรางวัล/เกม/โพย */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {[
          { to: '/results', icon: '🏆', label: 'ผลรางวัล' },
          { to: '/games', icon: '🎮', label: 'เกมด่วน' },
          { to: '/my-bets', icon: '🧾', label: 'โพยของฉัน' },
        ].map(q => (
          <Link key={q.to} to={q.to}
            className="shrink-0 text-xs px-3 py-1.5 rounded-full border border-navy-600 text-navy-300 font-semibold flex items-center gap-1.5 hover:border-cyan-500/50 hover:text-cyan-200">
            {q.icon} {q.label}
          </Link>
        ))}
      </div>

      {!loaded && <SkeletonGrid count={6} />}
      {loaded && !families.length && <EmptyState emoji="🎟️" title="ไม่พบรอบหวย" hint="ยังไม่มีรอบที่เปิดรับ — กลับมาดูใหม่ภายหลัง" />}

      {/* กลุ่ม เกมด่วน — ลิงก์ไปหน้าเกม */}
      <section className="bg-navy-800/70 border border-navy-700 rounded-2xl overflow-hidden">
        <header className="px-4 py-3 border-b border-navy-700 font-bold text-white text-sm">🎮 เกมด่วน</header>
        <Link to="/games" className="flex items-center gap-3 px-4 py-3 hover:bg-navy-700/40 transition">
          <div className="w-10 h-12 rounded-lg shrink-0 flex items-center justify-center text-lg bg-purple-500/15 border border-purple-500/40">🎰</div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-white">สล็อต / ไฮโล / ยี่กี / ราศี</div>
            <div className="text-[11px] text-navy-400">เกมทันที ไม่ต้องรอผล — ยอดเงินใช้กระเป๋าเดียวกัน</div>
          </div>
          <span className="text-navy-500">›</span>
        </Link>
      </section>

      {families.map(fam => (
        <section key={fam.key} className="bg-navy-800/70 border border-navy-700 rounded-2xl overflow-hidden">
          <header className="px-4 py-3 border-b border-navy-700 font-bold text-white text-sm">{fam.title}</header>
          <div className="divide-y divide-navy-700/60">
            {fam.markets.map(m => (
              <MarketRow key={m.key} m={m} accent={typeAccent(m.typeCode)} nowSql={nowSql} nowMs={nowMs}
                expanded={openKey === m.key} onToggle={() => setOpenKey(openKey === m.key ? '' : m.key)} />
            ))}
          </div>
        </section>
      ))}

      {/* bottom bar แบบ provider — กลับ / โพย */}
      <div className="flex gap-3 pt-1">
        <Link to="/lotteries" className="flex-1 text-center text-sm font-bold py-2.5 rounded-xl bg-navy-800 border border-navy-600 text-navy-200 hover:border-cyan-500/50">‹ เลือกรอบแบบการ์ด</Link>
        <Link to="/my-bets" className="flex-1 text-center text-sm font-bold py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 text-white">โพยของฉัน ›</Link>
      </div>
    </div>
  );
}

function MarketRow({ m, accent, nowSql, nowMs, expanded, onToggle }) {
  const navigate = useNavigate();
  // รอบที่กำลังเปิดรับ (ใกล้สุด)
  const liveRound = m.rounds.find(d => isBettingOpen(d, nowSql));
  // รอบถัดไปที่ยังไม่ออกผล
  const next = m.rounds.find(d => !['settled', 'cancelled'].includes(d.status));
  const blind = !liveRound && next && !['closed', 'settled', 'cancelled'].includes(next.status)
    && next.draw_at > nowSql;
  const drawing = !liveRound && next && next.status === 'closed' && next.draw_at <= nowSql;

  const closeMs = liveRound ? Date.parse(String(liveRound.close_at).replace(' ', 'T') + 'Z') - nowMs : NaN;
  const openAt = next ? bettingOpenAtSql(next.close_at, next.type_code) : null;
  const openMs = openAt ? Date.parse(String(openAt).replace(' ', 'T') + 'Z') - nowMs : NaN;

  const status = liveRound
    ? { text: `ปิดใน ${fmtHMS(closeMs)}`, cls: 'bg-green-500/20 text-green-300 border-green-500/40' }
    : drawing
      ? { text: 'กำลังออกรางวัล', cls: 'bg-gold-500/20 text-gold-300 border-gold-500/40 animate-pulse' }
      : blind
        ? { text: openMs > 0 ? `🔒 เปิด ${thaiHM(openAt)} น.` : '🔒 ยังไม่เปิด', cls: 'bg-navy-700 text-navy-300 border-navy-600' }
        : next
          ? { text: 'หมดรอบ', cls: 'bg-navy-700 text-navy-300 border-navy-600' }
          : { text: '—', cls: 'bg-navy-700 text-navy-300 border-navy-600' };

  const sub = liveRound
    ? `ออกรางวัล ${thaiHM(liveRound.draw_at)} น.`
    : next
      ? `${blind ? 'ออกรางวัล' : drawing ? 'ออก' : 'รอบถัดไป'} ${thaiHM(next.draw_at)} น.`
      : '';

  return (
    <div>
      <div role="button" tabIndex={0}
        onClick={() => liveRound ? navigate(`/bet/${liveRound.id}`) : onToggle()}
        onKeyDown={e => { if (e.key === 'Enter') liveRound ? navigate(`/bet/${liveRound.id}`) : onToggle(); }}
        className={`flex items-center gap-3 px-4 py-3 transition w-full text-left ${liveRound ? 'hover:bg-green-500/10 cursor-pointer' : 'hover:bg-navy-700/40 cursor-pointer'}`}>
        <FlagIcon code={m.typeCode} className="w-9 h-6 shrink-0 text-[9px] rounded" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-white truncate">
            {m.catName || m.typeName}
            {m.rounds.length > 1 && <span className="ml-1.5 text-[10px] font-normal text-navy-400">{m.rounds.length} รอบ</span>}
          </div>
          {sub && <div className="text-[11px] text-navy-400 truncate">{sub}</div>}
        </div>
        <span className={`text-[10px] font-bold px-2 py-1 rounded-lg border whitespace-nowrap ${status.cls}`}>
          {status.text}
        </span>
        <span className={`text-navy-500 text-sm transition-transform ${expanded ? 'rotate-90' : ''}`}>›</span>
      </div>
      {expanded && (
        <div className="divide-y divide-navy-700/60 border-t border-navy-700/60 bg-navy-900/40">
          {m.rounds.map(d => <RoundRow key={d.id} d={d} accent={accent} nowSql={nowSql} nowMs={nowMs} />)}
        </div>
      )}
    </div>
  );
}

function RoundRow({ d, accent, nowSql, nowMs }) {
  const navigate = useNavigate();
  const live = isBettingOpen(d, nowSql);
  const opensAt = bettingOpenAtSql(d.close_at, d.type_code);
  const blind = !live && !['settled', 'cancelled'].includes(d.status) && d.draw_at > nowSql;
  const drawing = d.status === 'closed' && d.draw_at <= nowSql;
  const opensMs = opensAt ? Date.parse(String(opensAt).replace(' ', 'T') + 'Z') - nowMs : NaN;
  const closeMs = live ? Date.parse(String(d.close_at).replace(' ', 'T') + 'Z') - nowMs : NaN;
  const ann = annSummary(d.announce);

  const badge = live
    ? { text: `ปิดใน ${fmtHMS(closeMs)}`, cls: 'bg-green-500/20 text-green-300 border-green-500/40' }
    : drawing
      ? { text: 'กำลังออกรางวัล', cls: 'bg-gold-500/20 text-gold-300 border-gold-500/40 animate-pulse' }
      : blind
        ? { text: opensMs > 0 ? `🔒 เปิด ${thaiHM(opensAt)} น.` : '🔒 ยังไม่เปิด', cls: 'bg-navy-700 text-navy-300 border-navy-600' }
        : { text: d.status === 'settled' ? 'ออกผลแล้ว' : 'หมดรอบ', cls: 'bg-navy-700 text-navy-300 border-navy-600' };

  return (
    <button onClick={() => live ? navigate(`/bet/${d.id}`) : navigate(`/results?draw=${d.id}`)}
      className={`flex items-center gap-3 px-4 py-2.5 w-full text-left hover:bg-navy-700/40 transition ${live ? '' : 'opacity-75'}`}>
      {blind ? (
        <div className="w-8 h-10 rounded-md shrink-0 flex items-center justify-center text-sm"
          style={{ background: 'repeating-linear-gradient(45deg,#1e293b,#1e293b 5px,#334155 5px,#334155 10px)', border: '1px solid #475569' }}>🂠</div>
      ) : (
        <div className={`w-8 h-10 rounded-md shrink-0 flex items-center justify-center text-sm border ${live ? 'bg-green-500/15 border-green-500/40' : drawing ? 'bg-gold-500/15 border-gold-500/40' : 'bg-navy-700/60 border-navy-600'}`}>
          {live ? '🎯' : drawing ? '🎰' : d.status === 'settled' ? '🏆' : '🔒'}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="text-xs font-semibold text-white">{drawLabel(d)}</div>
        <div className="text-[10px] text-navy-400">
          {blind ? `ออกรางวัล ${thaiHM(d.draw_at)} น.` : `ออก ${fmtDateTime(d.draw_at)}`}
          {ann && <span className="ml-1 text-amber-300">📣 {ann}</span>}
        </div>
      </div>
      <span className={`text-[10px] font-bold px-2 py-1 rounded-lg border whitespace-nowrap ${badge.cls}`}>{badge.text}</span>
    </button>
  );
}

// HH:MM:SS แบบ provider — tick ทุกวินาที
function fmtHMS(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return '00:00:00';
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}
