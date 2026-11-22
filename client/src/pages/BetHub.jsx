import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, fmtDateTime, drawLabel } from '../api.js';
import { FlagIcon } from '../components/ResultLine.jsx';
import { isBettingOpen, bettingOpenAtSql, thaiHM } from '../bettingWindow.js';
import { SkeletonGrid } from '../components/Skeleton.jsx';
import EmptyState from '../components/EmptyState.jsx';
import { useAuth } from '../auth.jsx';
import { annSummary } from '../ann.js';

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

function RoundRow({ d, nowSql, nowMs }) {
  const navigate = useNavigate();
  const live = isBettingOpen(d, nowSql);
  const blind = isBlind(d, nowSql);
  const awaiting = isAwaitingDraw(d, nowSql);
  const drawing = isDrawing(d, nowSql);
  const opensAt = bettingOpenAtSql(d.close_at, d.type_code);
  const opensMs = opensAt ? Date.parse(String(opensAt).replace(' ', 'T') + 'Z') - nowMs : NaN;
  const closeMs = live ? Date.parse(String(d.close_at).replace(' ', 'T') + 'Z') - nowMs : NaN;
  const ann = annSummary(d);
  const badge = live
    ? { text: `ปิดใน ${fmtHMS(closeMs)}`, cls: 'bg-green-600/20 text-green-300 border border-green-500/40', dot: 'bg-green-400' }
    : drawing
      ? { text: 'กำลังออกรางวัล', cls: 'bg-cyan-600/20 text-cyan-300 border border-cyan-500/40', dot: 'bg-cyan-400 animate-pulse' }
      : awaiting
        ? { text: '⏳ รอผล', cls: 'bg-amber-600/20 text-amber-300 border border-amber-500/40', dot: 'bg-amber-400' }
        : blind
          ? { text: opensMs > 0 ? `🔒 เปิด ${thaiHM(opensAt)} น.` : '🔒 ยังไม่เปิด', cls: 'bg-navy-600/30 text-navy-200 border border-navy-500/30', dot: 'bg-navy-400' }
          : { text: d.status === 'settled' ? 'ออกผลแล้ว' : 'หมดรอบ', cls: 'bg-navy-600/30 text-navy-300 border border-navy-500/30', dot: 'bg-navy-500' };

  const go = () => {
    // รอบที่ยังไม่ออกผล → ไปหน้าแทง (ดูรายละเอียด/กติกา/นับถอยหลังได้)
    // รอบที่ออกผลแล้ว/ยกเลิก → ไปหน้าผลรางวัล
    if (d.status === 'settled' || d.status === 'cancelled') {
      navigate('/results');
    } else {
      navigate(`/bet/${d.id}`);
    }
  };

  return (
    <button
      onClick={go}
      className={`flex items-center gap-4 px-5 py-3.5 w-full text-left rounded-2xl transition-all duration-200 border ${
        live
          ? 'bg-gradient-to-r from-green-900/20 to-navy-800/60 border-green-500/30 hover:border-green-400/50 hover:shadow-lg hover:shadow-green-500/10'
          : 'bg-navy-800/40 border-navy-700/40 hover:border-navy-600/60 hover:bg-navy-800/60'
      }`}
    >
      <FlagIcon code={d.type_code} className="w-10 h-12 shrink-0 rounded-lg overflow-hidden" />
      <div className="flex-1 min-w-0">
        <div className="text-base font-semibold text-white truncate">{drawLabel(d)}</div>
        <div className="text-sm text-navy-400 mt-0.5">
          {blind ? `ออกรางวัล ${thaiHM(d.draw_at)} น.` : `ออก ${fmtDateTime(d.draw_at)}`}
          {ann && <span className="ml-2 text-amber-300 font-medium">📣 {ann}</span>}
        </div>
      </div>
      <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full whitespace-nowrap ${badge.cls}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} />
        {badge.text}
      </span>
      <span className="text-navy-500 text-base shrink-0">›</span>
    </button>
  );
}

// Tile สำหรับประเภทหวยหลัก (level 1)
function TypeTile({ tg, expanded, onClick }) {
  const hasLive = tg.liveRounds > 0;
  return (
    <button
      onClick={onClick}
      className={`relative flex flex-col items-center gap-2 p-4 rounded-2xl border transition-all duration-200 text-center ${
        expanded
          ? 'bg-gradient-to-br from-gold-500/20 to-navy-800/80 border-gold-400/60 shadow-lg shadow-gold-500/10'
          : hasLive
            ? 'bg-navy-800/60 border-green-500/30 hover:border-green-400/50 hover:shadow-lg hover:shadow-green-500/10'
            : 'bg-navy-800/40 border-navy-700/40 hover:border-navy-600/60 hover:bg-navy-800/60'
      }`}
    >
      <FlagIcon code={tg.typeCode} className="w-12 h-9 rounded-lg overflow-hidden" />
      <div className="text-sm font-bold text-white leading-tight">{tg.typeName}</div>
      <div className="flex items-center gap-1.5 text-xs">
        {hasLive ? (
          <span className="inline-flex items-center gap-1 text-green-300 font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            {tg.liveRounds} รอบ
          </span>
        ) : (
          <span className="text-navy-400">{tg.totalRounds} รอบ</span>
        )}
      </div>
      {tg.hasCategories && (
        <div className="text-xs text-navy-400">{tg.catList.length} ตลาด</div>
      )}
      {expanded && (
        <div className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-gold-400 shadow shadow-gold-400/50" />
      )}
    </button>
  );
}

// Tile สำหรับหมวด/ตลาดย่อย (level 2)
function CategoryTile({ cat, typeCode, expanded, onClick }) {
  const hasLive = cat.liveCount > 0;
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all duration-200 text-center ${
        expanded
          ? 'bg-gradient-to-br from-cyan-500/20 to-navy-800/80 border-cyan-400/60 shadow-lg shadow-cyan-500/10'
          : hasLive
            ? 'bg-navy-800/60 border-green-500/25 hover:border-green-400/40'
            : 'bg-navy-800/40 border-navy-700/40 hover:border-navy-600/60'
      }`}
    >
      <FlagIcon code={typeCode} className="w-9 h-7 rounded-md overflow-hidden" />
      <div className="text-xs font-semibold text-white leading-tight truncate w-full">{cat.catName}</div>
      <div className="flex items-center gap-1 text-xs">
        {hasLive ? (
          <span className="inline-flex items-center gap-0.5 text-green-300 font-semibold">
            <span className="w-1 h-1 rounded-full bg-green-400 animate-pulse" />
            {cat.liveCount}
          </span>
        ) : (
          <span className="text-navy-400">{cat.roundCount} รอบ</span>
        )}
      </div>
    </button>
  );
}

export default function BetHub() {
  const { isAdmin } = useAuth();
  const [draws, setDraws] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [hiddenBetTypes, setHiddenBetTypes] = useState([]);
  const [openType, setOpenType] = useState('');
  const [openCat, setOpenCat] = useState('');
  const [nowMs, setNowMs] = useState(Date.now());

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
        cat.rounds.sort((a, b) => String(a.draw_at).localeCompare(String(b.draw_at)));
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

  // หา type ที่เปิดอยู่ (เผื่อ data refresh แล้ว type หายไป)
  const activeType = typeGroups.find(t => t.typeCode === openType) || null;
  const activeCat = activeType?.catList.find(c => c.catCode === openCat) || null;

  return (
    <div className="max-w-6xl mx-auto px-3 sm:px-4 pt-4 pb-8">
      {/* Hero */}
      <div className="text-center mb-6">
        <h1 className="text-3xl sm:text-4xl font-black text-gold-300 tracking-wide">
          เลือกหวยที่ต้องการแทง
        </h1>
        <p className="text-sm text-navy-300 mt-1">เลือกประเภทหวย แล้วเลือกตลาดและรอบที่ต้องการ</p>
      </div>

      {!loaded ? (
        <SkeletonGrid count={6} />
      ) : typeGroups.length === 0 ? (
        <EmptyState title="ไม่มีรอบหวยที่เปิดรับในขณะนี้" sub="ลองตรวจสอบอีกครั้งภายหลัง" />
      ) : (
        <>
          {/* Type Grid — 3 columns */}
          <div className="grid grid-cols-3 gap-3 mb-6">
            {typeGroups.map(tg => (
              <TypeTile
                key={tg.typeCode}
                tg={tg}
                expanded={openType === tg.typeCode}
                onClick={() => {
                  if (openType === tg.typeCode) {
                    setOpenType(''); setOpenCat('');
                  } else {
                    setOpenType(tg.typeCode); setOpenCat('');
                  }
                }}
              />
            ))}
          </div>

          {/* Expanded Type Content */}
          {activeType && (
            <div className="animate-fade-in">
              {/* Type Header */}
              <div className="flex items-center gap-3 mb-4">
                <FlagIcon code={activeType.typeCode} className="w-8 h-6 rounded-md overflow-hidden" />
                <h2 className="text-xl font-bold text-white">{activeType.typeName}</h2>
                <span className="text-sm text-navy-300">
                  {activeType.hasCategories
                    ? `${activeType.totalRounds} รอบ • ${activeType.catList.length} ตลาด`
                    : `${activeType.totalRounds} รอบ`}
                </span>
                <button
                  onClick={() => { setOpenType(''); setOpenCat(''); }}
                  className="ml-auto text-sm text-navy-400 hover:text-white transition-colors"
                >
                  ✕ ปิด
                </button>
              </div>

              {/* Type without categories — show rounds directly */}
              {!activeType.hasCategories && activeType.catList[0] && (
                <div className="space-y-2">
                  {activeType.catList[0].rounds.map(d => (
                    <RoundRow key={d.id} d={d} nowSql={nowSql} nowMs={nowMs} />
                  ))}
                </div>
              )}

              {/* Type with categories — show category grid + selected category rounds */}
              {activeType.hasCategories && (
                <>
                  {/* Category Grid — 3 columns */}
                  <div className="grid grid-cols-3 gap-2 mb-4">
                    {activeType.catList.map(cat => (
                      <CategoryTile
                        key={cat.catCode}
                        cat={cat}
                        typeCode={activeType.typeCode}
                        expanded={openCat === cat.catCode}
                        onClick={() => setOpenCat(openCat === cat.catCode ? '' : cat.catCode)}
                      />
                    ))}
                  </div>

                  {/* Selected Category Rounds */}
                  {activeCat && (
                    <div className="mt-4">
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-base font-semibold text-navy-200">{activeCat.catName}</span>
                        <span className="text-sm text-navy-400">{activeCat.roundCount} รอบ</span>
                        <button
                          onClick={() => setOpenCat('')}
                          className="ml-auto text-sm text-navy-400 hover:text-white transition-colors"
                        >
                          ✕ ปิด
                        </button>
                      </div>
                      <div className="space-y-2">
                        {activeCat.rounds.map(d => (
                          <RoundRow key={d.id} d={d} nowSql={nowSql} nowMs={nowMs} />
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
