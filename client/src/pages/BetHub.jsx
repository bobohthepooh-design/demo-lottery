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

  // Card grid style — เขียวเมื่อเปิด, เทาเมื่อปิด
  const cardBg = live
    ? 'bg-gradient-to-br from-green-900/80 to-green-950 border-green-400/60'
    : drawing ? 'bg-gradient-to-br from-gold-900/80 to-amber-950 border-gold-400/60 animate-pulse'
    : 'bg-gradient-to-br from-navy-800 to-navy-900 border-navy-600/50';
  const cardCls = `${cardBg} border rounded-2xl p-4 flex flex-col items-center text-center hover:scale-[1.02] transition-transform duration-200 shadow-lg`;

  const go = () => {
    if (d.status === 'settled' || d.status === 'cancelled') {
      navigate('/results');
    } else {
      navigate(`/bet/${d.id}`);
    }
  };

  return (
    <div className={cardCls}>
      {/* ธง + ชื่อตลาด */}
      <div className="flex items-center gap-2 mb-2">
        <FlagIcon code={d.type_code} className="w-7 h-5 text-[9px] rounded-sm" />
        <span className="text-xs font-bold px-2 py-0.5 rounded-full border border-green-400/60 text-green-300">{d.type_name_th}</span>
      </div>
      <div className="font-black text-white text-base leading-tight mb-1 line-clamp-2">{drawLabel(d)}</div>
      <div className="text-[10px] text-navy-400 mb-2">{d.draw_code}</div>

      {/* เลขอั้น */}
      {ann && (
        <div className="text-[9px] font-bold px-2 py-0.5 rounded bg-amber-500/20 border border-amber-400 text-amber-300 mb-2">
          📣 {ann.length > 40 ? `${ann.slice(0, 40)}…` : ann}
        </div>
      )}

      {/* Countdown / Status */}
      <div className="mt-auto w-full">
        {live ? (
          <div className="bg-black/30 rounded-lg p-2 mb-3">
            <div className="text-[10px] text-navy-400 mb-1">ปิดรับใน</div>
            <div className="font-bold text-green-300 text-sm">{fmtHMS(closeMs)}</div>
          </div>
        ) : (
          <div className={`text-xs font-bold px-3 py-2 rounded-lg mb-3 ${drawing ? 'bg-gold-500/20 text-gold-300 border border-gold-400/50' : 'bg-navy-700/50 text-navy-400'}`}>
            {drawing ? '🎰 กำลังออกรางวัล…'
              : awaiting ? '🔒 รอผล'
              : blind ? `🔒 เปิด ${thaiHM(opensAt)} น.`
              : d.status === 'settled' ? '🏆 ออกผลแล้ว'
              : '🗓️ รอเปิดรับ'}
          </div>
        )}

        {/* ปุ่มแทง */}
        {live ? (
          <button onClick={go} className="w-full font-bold py-2.5 rounded-lg bg-green-500 hover:bg-green-400 text-white transition">
            แทงเลย
          </button>
        ) : (
          <button disabled className="w-full font-semibold py-2.5 rounded-lg cursor-not-allowed bg-navy-700 text-navy-400 border border-navy-600">
            {d.status === 'settled' ? 'ดูผล' : 'รอเปิดรับ'}
          </button>
        )}
      </div>
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
    <div className="max-w-6xl mx-auto px-3 sm:px-4 pt-4 pb-8">
      {/* Hero */}
      <div className="text-center mb-6">
        <div className="kicker mb-2">Lottery Hall</div>
        <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black tracking-wide bg-gradient-to-r from-gold-200 via-gold-400 to-amber-500 bg-clip-text text-transparent drop-shadow-[0_0_18px_rgba(244,201,78,0.35)]">
          เลือกหวยที่ต้องการแทง
        </h1>
        <p className="text-xs sm:text-sm text-navy-300 mt-1.5">เลือกประเภทหวย แล้วเลือกตลาดและรอบที่ต้องการ</p>
      </div>

      {!loaded ? (
        <SkeletonGrid count={6} />
      ) : typeGroups.length === 0 ? (
        <EmptyState title="ไม่มีรอบหวยที่เปิดรับในขณะนี้" sub="ลองตรวจสอบอีกครั้งภายหลัง" />
      ) : (
        /* ประเภทหวย — card grid ต่อประเภท (ไม่ต้องกดขยาย) */
        <div className="space-y-8">
        {typeGroups.map(tg => {
          const liveCount = tg.liveRounds;
          return (
            <section key={tg.typeCode}>
              <div className="flex items-center gap-3 mb-4">
                <FlagIcon code={tg.typeCode} className="w-8 h-6 rounded-md overflow-hidden" />
                <h2 className="text-xl font-bold text-white">{tg.typeName}</h2>
                {liveCount > 0 && (
                  <span className="text-xs font-bold px-2 py-1 rounded-full bg-green-500/15 border border-green-500/40 text-green-300">
                    {liveCount} เปิด
                  </span>
                )}
              </div>

              {/* แสดงรอบทั้งหมดของประเภทนี้เป็น card grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {tg.catList.flatMap(cat => cat.rounds).map(d => (
                  <RoundCard key={d.id} d={d} nowSql={nowSql} nowMs={nowMs} />
                ))}
              </div>
            </section>
          );
        })}
      </div>
      )}
    </div>
  );
}
