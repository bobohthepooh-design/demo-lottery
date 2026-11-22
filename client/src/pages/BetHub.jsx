import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, fmtDateTime, drawLabel } from '../api.js';
import { FlagIcon } from '../components/ResultLine.jsx';
import { isBettingOpen, bettingOpenAtSql, thaiHM } from '../bettingWindow.js';
import { SkeletonGrid } from '../components/Skeleton.jsx';
import EmptyState from '../components/EmptyState.jsx';
import { annSummary } from '../ann.js';
import { useAuth } from '../auth.jsx';

// เรียงกลุ่มตลาดแบบ provider — เกม → หวยรางวัล → หวยไทย → ลาว → ฮานอย
const FAMILIES = [
  { key: 'HR', title: 'หวยราศี' },
  { key: 'TH', title: 'หวยไทย' },
  { key: 'GS', title: 'สลากออมสิน / ธ.ก.ส.' },
  { key: 'LA', title: 'หวยลาว' },
  { key: 'HN', title: 'หวยฮานอย' },
];
const INSTANT = new Set(['SC', 'HL', 'KI', 'CF']); // เกมด่วนไม่มีรอบ — อยู่ใน /games

// สถานะรอบที่ปิดรับแล้วแต่ยังไม่ถึงเวลาออกรางวัล — ต่างจาก blind (ยังไม่เปิด) และ drawing (ถึงเวลาออกแล้ว)
const isAwaitingDraw = (d, nowSql) => d.status === 'closed' && d.draw_at > nowSql;
// blind = ยังไม่เปิดรับจริง (status scheduled/open แต่ยังไม่ถึงเวลาเปิด หรือยังไม่ถึงเวลาปิด)
const isBlind = (d, nowSql) => !isBettingOpen(d, nowSql)
  && ['scheduled', 'open'].includes(d.status) && d.close_at > nowSql;
const isDrawing = (d, nowSql) => d.status === 'closed' && d.draw_at <= nowSql;

// หน้า provider-style — ตลาดเป็นแถวเดียวต่อการ์ด แสดงสถานะรอบถัดไป (countdown/หมดรอบ/blind)
// กดตลาดที่เปิดรับ → หน้าแทง / กดตลาดอื่น → กางรายการรอบย่อย
export default function BetHub() {
  const { isAdmin } = useAuth();
  const [draws, setDraws] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [hiddenBetTypes, setHiddenBetTypes] = useState([]);
  const [openKey, setOpenKey] = useState(''); // key ตลาดที่กางรายการรอบอยู่
  const [nowMs, setNowMs] = useState(Date.now());

  const loadConfig = () => api('/lottery/public-config')
    .then(r => setHiddenBetTypes(Array.isArray(r.hiddenBetTypes) ? r.hiddenBetTypes : []))
    .catch(() => {});
  const load = () => api('/lottery/draws?upcoming=1')
    .then(r => { setDraws(r.draws || []); setLoaded(true); })
    .catch(() => setLoaded(true));
  const refresh = () => { load(); loadConfig(); };

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 30000);
    const tick = setInterval(() => setNowMs(Date.now()), 1000);
    const h = () => refresh();
    window.addEventListener('sys:update', h);
    return () => { clearInterval(t); clearInterval(tick); window.removeEventListener('sys:update', h); };
  }, []);

  const hiddenSet = new Set(hiddenBetTypes);
  const nowSql = new Date(nowMs).toISOString().slice(0, 19).replace('T', ' ');

  // จัดกลุ่มตลาด: family > type+category
  const families = useMemo(() => {
    const map = new Map();
    for (const d of draws) {
      if (!isAdmin && hiddenSet.has(d.type_code)) continue; // admin เห็นทั้งหมดเหมือน /lotteries
      if (INSTANT.has(d.type_code)) continue;
      const key = `${d.type_code}:${d.category_code || d.category_id || ''}`;
      if (!map.has(key)) {
        map.set(key, {
          key,
          typeCode: d.type_code,
          typeName: d.type_name_th,
          catName: d.category_name_th || '',
          rounds: [],
        });
      }
      map.get(key).rounds.push(d);
    }
    const actionable = d => !['settled', 'cancelled'].includes(d.status);
    for (const m of map.values()) {
      m.rounds.sort((a, b) => String(a.draw_at).localeCompare(String(b.draw_at)));
      const pool = m.rounds.filter(actionable);
      m.liveRound = pool.find(d => isBettingOpen(d, nowSql));
      // รอบแสดงผล: live → ปิดรับรอผล → รอบอนาคตที่ใกล้สุด (กันรอบ closed ค้างจากเมื่อวานมาแทรก)
      m.next = m.liveRound
        || pool.find(d => isAwaitingDraw(d, nowSql))
        || pool.find(d => d.draw_at > nowSql)
        || pool[0];
    }
    const byPriority = (a, b) => (b.liveRound ? 1 : 0) - (a.liveRound ? 1 : 0)
      || String(a.next?.draw_at || '9').localeCompare(String(b.next?.draw_at || '9'));
    const fams = FAMILIES.map(f => ({
      ...f,
      markets: [...map.values()].filter(m => m.typeCode === f.key).sort(byPriority),
    })).filter(f => f.markets.length);
    const rest = [...map.values()].filter(m => !FAMILIES.some(f => f.key === m.typeCode)).sort(byPriority);
    if (rest.length) fams.push({ key: 'OTHER', title: 'หวยอื่น ๆ', markets: rest });
    return fams;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draws, hiddenBetTypes, nowMs, isAdmin]);

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
          <header className="px-4 py-3 border-b border-navy-700 font-bold text-white text-sm flex items-center gap-2">
            <span className="w-1.5 h-4 rounded-full bg-cyan-400" />{fam.title}
          </header>
          {/* icon tiles — แบ่งตามหมวดตลาด เหมือน provider แต่เป็นไอคอนแทน list */}
          <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2 p-3">
            {fam.markets.map(m => (
              <MarketTile key={m.key} m={m} nowSql={nowSql} nowMs={nowMs}
                expanded={openKey === m.key} onToggle={() => setOpenKey(openKey === m.key ? '' : m.key)} />
            ))}
          </div>
          {/* รอบย่อยของตลาดที่กางอยู่ */}
          {fam.markets.filter(m => openKey === m.key).map(m => (
            <div key={m.key} className="border-t border-navy-700/60 bg-navy-900/40 divide-y divide-navy-700/60">
              {m.rounds.map(d => <RoundRow key={d.id} d={d} nowSql={nowSql} nowMs={nowMs} />)}
            </div>
          ))}
        </section>
      ))}

      {/* bottom bar — หน้าหลัก / โพย */}
      <div className="flex gap-3 pt-1">
        <Link to="/" className="flex-1 text-center text-sm font-bold py-2.5 rounded-xl bg-navy-800 border border-navy-600 text-navy-200 hover:border-cyan-500/50">‹ หน้าหลัก</Link>
        <Link to="/my-bets" className="flex-1 text-center text-sm font-bold py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 text-white">โพยของฉัน ›</Link>
      </div>
    </div>
  );
}

// icon tile ของตลาด — ธง + ชื่อ + สถานะย่อ; live → เข้าหน้าแทง, อื่นๆ → กางรอบย่อย
function MarketTile({ m, nowSql, nowMs, expanded, onToggle }) {
  const navigate = useNavigate();
  const liveRound = m.liveRound;
  const next = m.next;
  const blind = !liveRound && next && isBlind(next, nowSql);
  const awaiting = !liveRound && next && isAwaitingDraw(next, nowSql);
  const drawing = !liveRound && !awaiting && next && isDrawing(next, nowSql);

  const closeMs = liveRound ? Date.parse(String(liveRound.close_at).replace(' ', 'T') + 'Z') - nowMs : NaN;
  const openAt = next ? bettingOpenAtSql(next.close_at, next.type_code) : null;
  const openMs = openAt ? Date.parse(String(openAt).replace(' ', 'T') + 'Z') - nowMs : NaN;

  // สี/ข้อความสถานะย่อบน tile
  const state = liveRound
    ? { dot: 'bg-green-400', text: fmtHMS(closeMs), cls: 'border-green-500/50 bg-green-500/10', icon: '🎯' }
    : drawing
      ? { dot: 'bg-gold-400 animate-pulse', text: 'ออกผล', cls: 'border-gold-500/50 bg-gold-500/10', icon: '🎰' }
      : awaiting
        ? { dot: 'bg-amber-400', text: 'รอผล', cls: 'border-amber-500/40 bg-amber-500/10', icon: '⏳' }
        : blind
          ? { dot: 'bg-navy-500', text: openMs > 0 ? thaiHM(openAt) : 'เร็วๆ นี้', cls: 'border-navy-600 bg-navy-800/60 opacity-80', icon: '🔒' }
          : { dot: 'bg-navy-600', text: 'หมดรอบ', cls: 'border-navy-700 bg-navy-800/40 opacity-60', icon: '🔒' };

  const name = m.catName || m.typeName;
  return (
    <button type="button" aria-expanded={expanded}
      onClick={() => liveRound ? navigate(`/bet/${liveRound.id}`) : onToggle()}
      className={`relative flex flex-col items-center gap-1.5 rounded-xl border px-2 py-3 transition active:scale-95 ${state.cls} ${expanded ? 'ring-1 ring-cyan-400/60' : ''}`}>
      {blind && (
        <span className="absolute inset-0 rounded-xl pointer-events-none opacity-[0.06]"
          style={{ background: 'repeating-linear-gradient(45deg,#fff,#fff 4px,transparent 4px,transparent 8px)' }} />
      )}
      <FlagIcon code={m.typeCode} className="w-10 h-7 text-[10px] rounded shadow" />
      <span className="text-[11px] font-bold text-white leading-tight text-center line-clamp-2 min-h-[2rem]">{name}</span>
      <span className={`inline-flex items-center gap-1 text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-full ${liveRound ? 'bg-green-500/20 text-green-300' : 'bg-navy-900/80 text-navy-300 border border-navy-700'}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${state.dot}`} />{state.text}
      </span>
      {m.rounds.length > 1 && <span className="text-[8px] text-navy-500">{m.rounds.length} รอบ</span>}
    </button>
  );
}

function RoundRow({ d, nowSql, nowMs }) {
  const navigate = useNavigate();
  const live = isBettingOpen(d, nowSql);
  const blind = isBlind(d, nowSql);
  const awaiting = isAwaitingDraw(d, nowSql);
  const drawing = isDrawing(d, nowSql);
  const opensAt = bettingOpenAtSql(d.close_at, d.type_code);
  const opensMs = opensAt ? Date.parse(String(opensAt).replace(' ', 'T') + 'Z') - nowMs : NaN;
  const closeMs = live ? Date.parse(String(d.close_at).replace(' ', 'T') + 'Z') - nowMs : NaN;
  const ann = annSummary(d.announce);

  const badge = live
    ? { text: `ปิดใน ${fmtHMS(closeMs)}`, cls: 'bg-green-500/20 text-green-300 border-green-500/40' }
    : drawing
      ? { text: 'กำลังออกรางวัล', cls: 'bg-gold-500/20 text-gold-300 border-gold-500/40 animate-pulse' }
      : awaiting
        ? { text: '⏳ รอผล', cls: 'bg-amber-500/15 text-amber-300 border-amber-500/40' }
        : blind
          ? { text: opensMs > 0 ? `🔒 เปิด ${thaiHM(opensAt)} น.` : '🔒 ยังไม่เปิด', cls: 'bg-navy-700 text-navy-300 border-navy-600' }
          : { text: d.status === 'settled' ? 'ออกผลแล้ว' : 'หมดรอบ', cls: 'bg-navy-700 text-navy-300 border-navy-600' };

  return (
    <button onClick={() => navigate(live ? `/bet/${d.id}` : '/results')}
      className={`flex items-center gap-3 px-4 py-2.5 w-full text-left hover:bg-navy-700/40 transition ${live ? '' : 'opacity-75'}`}>
      {blind ? (
        <div className="w-8 h-10 rounded-md shrink-0 flex items-center justify-center text-sm"
          style={{ background: 'repeating-linear-gradient(45deg,#1e293b,#1e293b 5px,#334155 5px,#334155 10px)', border: '1px solid #475569' }}>🂠</div>
      ) : (
        <div className={`w-8 h-10 rounded-md shrink-0 flex items-center justify-center text-sm border ${live ? 'bg-green-500/15 border-green-500/40' : drawing ? 'bg-gold-500/15 border-gold-500/40' : 'bg-navy-700/60 border-navy-600'}`}>
          {live ? '🎯' : drawing ? '🎰' : awaiting ? '⏳' : d.status === 'settled' ? '🏆' : '🔒'}
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
