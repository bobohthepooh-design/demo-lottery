import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, fmtDateTime, drawLabel } from '../api.js';
import { FlagIcon } from '../components/ResultLine.jsx';
import { isBettingOpen, bettingOpenAtSql, thaiHM } from '../bettingWindow.js';
import { SkeletonGrid } from '../components/Skeleton.jsx';
import EmptyState from '../components/EmptyState.jsx';
import { useAuth } from '../auth.jsx';
import { annSummary } from '../ann.js';
import { typeAccent } from '../typeAccent.js';
// Types ที่เป็นเกมด่วน/ยี่กี — ไม่ใช่หวยใน hub นี้ (อยู่หน้าเกมด่วน)
const INSTANT = new Set(['SC', 'HL', 'KI', 'CF']);

const isAwaitingDraw = (d, nowSql) => d.status === 'closed' && d.draw_at > nowSql;
const isBlind = (d, nowSql) => !isBettingOpen(d, nowSql) && ['scheduled', 'open'].includes(d.status) && d.close_at > nowSql;
const isDrawing = (d, nowSql) => d.status === 'closed' && d.draw_at <= nowSql;

function fmtHMS(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return '--:--:--';
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(ss).padStart(2,'0')}`;
}

function RoundCard({ d, nowSql, nowMs }) {
  const navigate = useNavigate();
  const live = isBettingOpen(d, nowSql);
  const blind = isBlind(d, nowSql);
  const awaiting = isAwaitingDraw(d, nowSql);
  const drawing = isDrawing(d, nowSql);
  const opensAt = bettingOpenAtSql(d.close_at, d.type_code);
  const opensMs = opensAt ? Date.parse(String(opensAt).replace(' ', 'T') + 'Z') - nowMs : NaN;
  const closeMs = live ? Date.parse(String(d.close_at).replace(' ', 'T') + 'Z') - nowMs : NaN;
  const ann = annSummary(d);
  const ac = typeAccent(d.type_code);

  // Luxury card styling
  const cardStyle = drawing
    ? { background: 'linear-gradient(135deg, var(--gold-600), var(--warning-amber))', borderColor: 'var(--gold-primary)' }
    : live 
      ? { background: 'var(--bg-card)', borderColor: 'var(--success-green)' }
      : { background: 'var(--bg-card)', borderColor: ac.border };

  const cardCls = `border rounded p-2.5 sm:p-3 flex items-center gap-2 sm:gap-3 hover:scale-[1.01] transition-transform duration-200 shadow-lg relative`;

  const go = () => {
    if (d.status === 'settled' || d.status === 'cancelled') {
      navigate('/results');
    } else {
      navigate(`/bet/${d.id}`);
    }
  };

  return (
    <div className={cardCls} style={cardStyle}>
      {/* Live indicator */}
      {live && (
        <div className="absolute top-2 right-2 w-2.5 h-2.5 rounded-full bg-green-400 animate-pulse" />
      )}
      {/* ธง + ชื่อตลาด */}
      <div className="flex items-center gap-1.5 sm:gap-2">
        <FlagIcon code={d.type_code} className="w-5 h-3.5 sm:w-6 sm:h-4 rounded-md" />
        <div>
          <div className="font-bold text-xs sm:text-sm" style={{ color: 'var(--white)' }}>{drawLabel(d)}</div>
          <div className="text-[10px] sm:text-xs" style={{ color: 'var(--muted-gray)' }}>{d.draw_code}</div>
        </div>
      </div>

      {/* เลขอั้น */}
      {ann && (
        <div className="text-xs font-bold px-2 py-0.5 rounded" style={{
          background: 'rgba(245, 158, 11, 0.2)',
          border: '1px solid var(--warning-amber)',
          color: 'var(--warning-amber)'
        }}>
          📣 {ann.length > 30 ? `${ann.slice(0, 30)}…` : ann}
        </div>
      )}

      <div className="ml-auto flex items-center gap-2 sm:gap-3">
        {/* Countdown / Status */}
        {live ? (
          <div className="rounded p-1.5 sm:p-2 text-right" style={{ background: 'rgba(0, 0, 0, 0.3)' }}>
            <div className="text-[10px] sm:text-xs mb-0.5" style={{ color: 'var(--muted-gray)' }}>ปิดใน</div>
            <div className="font-bold text-sm sm:text-lg" style={{ color: 'var(--success-green)' }}>{fmtHMS(closeMs)}</div>
          </div>
        ) : (
          <div className={`text-[10px] sm:text-xs font-bold px-1.5 sm:px-2 py-0.75 sm:py-1 rounded ${drawing ? 'bg-gold-500/20 text-gold-300 border border-gold-400/50' : 'bg-navy-700/50 text-navy-400'}`}>
            {drawing ? '🎰 กำลังออกรางวัล…'
              : awaiting ? '🔒 รอผล'
              : blind ? `🔒 เปิด ${thaiHM(opensAt)} น.`
              : d.status === 'settled' ? '🏆 ออกผลแล้ว'
              : '🗓️ รอเปิดรับ'}
          </div>
        )}

        {/* ปุ่มแทง */}
        {live ? (
          <button onClick={go} className="px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg bg-green-500 hover:bg-green-400 text-white font-bold text-xs sm:text-sm transition">
            แทงเลย
          </button>
        ) : (
          <button disabled className="px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg cursor-not-allowed bg-navy-700 text-navy-400 border border-navy-600 text-xs sm:text-sm font-semibold">
            {d.status === 'settled' ? 'ดูผล' : 'รอเปิดรับ'}
          </button>
        )}
      </div>
    </div>
  );
}

function TypeCard({ tg, onClick }) {
  const ac = typeAccent(tg.typeCode);
  return (
    <div onClick={onClick} className="rounded-xl p-3 sm:p-4 flex flex-col items-center text-center hover:scale-[1.03] transition-transform duration-200 shadow-lg cursor-pointer" style={{
      background: 'var(--bg-card)',
      border: `2px solid ${ac.border}`
    }}
    onMouseEnter={e => {
      e.currentTarget.style.borderColor = 'var(--border-gold)';
      e.currentTarget.style.boxShadow = 'var(--shadow-gold)';
    }}
    onMouseLeave={e => {
      e.currentTarget.style.borderColor = ac.border;
      e.currentTarget.style.boxShadow = 'var(--shadow-md)';
    }}>
      <FlagIcon code={tg.typeCode} className="w-10 h-7 sm:w-12 sm:h-8 rounded-lg mb-1.5 sm:mb-2" />
      <h3 className={`text-sm sm:text-base lg:text-lg font-bold mb-0.5 sm:mb-1`} style={{ color: ac.text }}>{tg.typeName}</h3>
      <div className="text-xs sm:text-sm mb-1.5 sm:mb-2" style={{ color: 'var(--muted-gray)' }}>{tg.totalRounds} รอบ</div>
      {tg.liveRounds > 0 && (
        <div className="text-[10px] sm:text-xs font-bold px-1.5 sm:px-2 py-0.75 sm:py-1 rounded-full" style={{
          background: 'rgba(34, 197, 94, 0.2)',
          color: 'var(--success-green)',
          border: '1px solid rgba(34, 197, 94, 0.3)'
        }}>
          {tg.liveRounds} เปิด
        </div>
      )}
    </div>
  );
}

export default function BetHub() {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const [draws, setDraws] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [hiddenBetTypes, setHiddenBetTypes] = useState([]);
  const [nowMs, setNowMs] = useState(Date.now());
  const [selectedType, setSelectedType] = useState(null); // เลือกประเภทแล้วแสดง list รอบ

  const load = useCallback(async () => {
    try {
      const [cfg, d] = await Promise.all([
        api('/lottery/public-config').catch(() => null),
        api('/lottery/draws?upcoming=1'),
      ]);
      setHiddenBetTypes(cfg?.hiddenBetTypes || []);
      setDraws(d.draws || []);
    } catch { setDraws([]); }
    finally { setLoaded(true); }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 1000);
    const onSys = () => load();
    window.addEventListener('sys:update', onSys);
    return () => { clearInterval(t); window.removeEventListener('sys:update', onSys); };
  }, [load]);

  const nowSql = new Date(nowMs).toISOString().slice(0, 19).replace('T', ' ');

  // Group draws: type → category → rounds
  const typeGroups = useMemo(() => {
    if (!draws) return [];
    const hiddenSet = new Set(hiddenBetTypes);
    const byType = new Map();

    for (const d of draws) {
      if (!isAdmin && hiddenSet.has(d.type_code)) continue;
      if (INSTANT.has(d.type_code)) continue;
      if (d.type_code === 'HR') continue; // ยกเว้นหวยราศี
      // แสดง "รอบถัดไป" ของทุกประเภทเสมอ — รอบที่ยังไม่เปิด (blind) เอาไว้แค่รอบแรกที่ใกล้สุดต่อหมวด
      // (กัน list ยาว — หวยรายเดือนมีรอบล่วงหน้าเป็นเดือน)

      const tc = d.type_code;
      const cc = d.category_code || '';

      if (!byType.has(tc)) {
        byType.set(tc, { typeCode: tc, typeName: d.type_name_th, cats: new Map() });
      }
      const tg = byType.get(tc);
      if (!tg.cats.has(cc)) {
        tg.cats.set(cc, { catCode: cc, catName: d.category_name_th || d.type_name_th, rounds: [] });
      }
      tg.cats.get(cc).rounds.push(d);
    }

    return [...byType.values()].map(tg => {
      const catList = [...tg.cats.values()].map(cat => {
        // เหลือรอบ blind แค่รอบแรก (รอบถัดไป) ต่อหมวด — รอบไกลกว่านั้นไม่ต้องโชว์
        const blinds = cat.rounds.filter(d => isBlind(d, nowSql))
          .sort((a, b) => String(a.draw_at).localeCompare(String(b.draw_at)));
        if (blinds.length > 1) {
          const keep = new Set([blinds[0].id]);
          cat.rounds = cat.rounds.filter(d => !isBlind(d, nowSql) || keep.has(d.id));
        }
        // รอบที่แทงได้ขึ้นก่อน (live → รอผล → อนาคต) รอบเก่า/ออกผลแล้วอยู่ล่างสุด
        const rank = (d) => isBettingOpen(d, nowSql) ? 0
          : isAwaitingDraw(d, nowSql) ? 1
          : d.draw_at > nowSql ? 2
          : ['settled', 'cancelled'].includes(d.status) ? 4 : 3;
        cat.rounds.sort((a, b) => rank(a) - rank(b) || String(a.draw_at).localeCompare(String(b.draw_at)));
        const pool = cat.rounds.filter(d => !['settled', 'cancelled'].includes(d.status));
        cat.liveRound = pool.find(d => isBettingOpen(d, nowSql));
        cat.next = cat.liveRound
          || pool.find(d => isAwaitingDraw(d, nowSql))
          || pool.find(d => d.draw_at > nowSql)
          || pool[0];
        cat.roundCount = cat.rounds.length;
        cat.liveCount = cat.rounds.filter(d => isBettingOpen(d, nowSql)).length;
        return cat;
      });

      catList.sort((a, b) => {
        const aLive = a.liveRound ? 1 : 0;
        const bLive = b.liveRound ? 1 : 0;
        if (aLive !== bLive) return bLive - aLive;
        return String(a.next?.draw_at || '9').localeCompare(String(b.next?.draw_at || '9'));
      });

      const totalRounds = catList.reduce((s, c) => s + c.roundCount, 0);
      const liveRounds = catList.reduce((s, c) => s + c.liveCount, 0);
      // มีหลายหมวด = ต้องกดเลือกหมวดย่อยก่อน
      const hasCategories = catList.length > 1;

      return { ...tg, catList, totalRounds, liveRounds, hasCategories };
    }).sort((a, b) => {
      const aLive = a.liveRounds > 0 ? 1 : 0;
      const bLive = b.liveRounds > 0 ? 1 : 0;
      if (aLive !== bLive) return bLive - aLive;
      return a.typeName.localeCompare(b.typeName);
    });
  }, [draws, hiddenBetTypes, nowMs, isAdmin, nowSql]);

  return (
    <div className="max-w-7xl mx-auto px-2 sm:px-3 lg:px-4 pt-2 sm:pt-3 pb-4">
      {/* Hero */}
      <div className="text-center mb-2 sm:mb-3">
        <div className="kicker mb-1">Lottery Hall</div>
        <h1 className="text-base sm:text-lg lg:text-xl xl:text-2xl font-black tracking-wide bg-gradient-to-r from-gold-200 via-gold-400 to-amber-500 bg-clip-text text-transparent drop-shadow-[0_0_10px_rgba(244,201,78,0.2)]">
          เลือกหวยที่ต้องการแทง
        </h1>
        <p className="text-[10px] sm:text-[11px] text-navy-300 mt-0.5">เลือกประเภทหวย แล้วเลือกตลาดและรอบที่ต้องการ</p>
      </div>

      {!loaded ? (
        <SkeletonGrid count={6} />
      ) : typeGroups.length === 0 ? (
        <EmptyState title="ไม่มีรอบหวยที่เปิดรับในขณะนี้" sub="ลองตรวจสอบอีกครั้งภายหลัง" />
      ) : selectedType ? (
        /* เลือกประเภทแล้ว — แสดง list รอบ */
        <div>
          <button
            onClick={() => setSelectedType(null)}
            className="flex items-center gap-2 mb-4 px-3 py-2 rounded-lg bg-navy-700/50 hover:bg-navy-700 border border-navy-600 text-navy-300 hover:text-white transition"
          >
            ← กลับเลือกประเภทอื่น
          </button>

          <div className={`flex items-center gap-2 mb-3 px-3 py-2 rounded-lg border ${typeAccent(selectedType.typeCode).chip}`}>
            <FlagIcon code={selectedType.typeCode} className="w-6 h-4 rounded-md" />
            <h2 className={`text-base font-bold ${typeAccent(selectedType.typeCode).text}`}>{selectedType.typeName}</h2>
            {selectedType.liveRounds > 0 && (
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-green-500/20 border border-green-500/50 text-green-300">
                {selectedType.liveRounds} เปิด
              </span>
            )}
          </div>

          <div className="space-y-2">
            {selectedType.catList.flatMap(cat => cat.rounds).map(d => (
              <RoundCard key={d.id} d={d} nowSql={nowSql} nowMs={nowMs} />
            ))}
          </div>
        </div>
      ) : (
        /* เมนูหลัก — card grid ประเภทหวย */
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3">
          {typeGroups.map(tg => (
            <TypeCard key={tg.typeCode} tg={tg} onClick={() => setSelectedType(tg)} />
          ))}
        </div>
      )}
    </div>
  );
}
