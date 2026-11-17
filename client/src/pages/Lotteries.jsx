import { useEffect, useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { api, fmtDateTime, drawLabel } from '../api.js';
import { useAuth } from '../auth.jsx';
import Countdown from '../components/Countdown.jsx';
import { FlagIcon } from '../components/ResultLine.jsx';
import { typeAccent } from '../typeAccent.js';
import { kindBadge } from '../resultSource.js';
import LuckyNumbers from '../components/LuckyNumbers.jsx';
import { annSummary } from '../ann.js';

const STATUS_TH = { scheduled: 'กำหนดการ', open: 'รับแทงอยู่', closed: 'ปิดรับ', settled: 'ออกผลแล้ว', cancelled: 'ยกเลิก' };

export default function Lotteries() {
  const [allDraws, setAllDraws] = useState([]);   // รอบ upcoming ทั้งหมด
  const [hiddenBetTypes, setHiddenBetTypes] = useState([]);
  const [types, setTypes] = useState([]);         // สำหรับ sidebar ประเภทหวย (desktop)
  const [rulesByType, setRulesByType] = useState({}); // กติกาต่อ type — ไว้โชว์อัตราจ่ายบนการ์ด
  const [country, setCountry] = useState('');     // ฟิลเตอร์กลุ่มประเทศ
  const [openOnly, setOpenOnly] = useState(false); // เฉพาะรอบที่เปิดรับอยู่
  const { isAdmin } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const selType = params.get('type');

  useEffect(() => {
    const load = () => api('/lottery/draws?upcoming=1').then(r => setAllDraws(r.draws)).catch(() => {});
    load();
    const t = setInterval(load, 30000); // refresh อัตโนมัติ — สถานะรอบเปลี่ยนโดย admin จะขึ้นเอง
    api('/lottery/public-config').then(r => setHiddenBetTypes(Array.isArray(r.hiddenBetTypes) ? r.hiddenBetTypes : [])).catch(() => {});
    api('/lottery/types').then(async r => {
      const ts = r.types || [];
      setTypes(ts);
      // โหลดกติกาของแต่ละประเภทครั้งเดียว — ใช้แสดงอัตราจ่ายสูงสุดบนการ์ดรอบ
      const map = {};
      await Promise.all(ts.filter(t => !INSTANT.has(t.code)).map(async t => {
        try { const rr = await api(`/lottery/types/${t.id}`); map[t.id] = rr.rules || []; } catch {}
      }));
      setRulesByType(map);
    }).catch(() => {});
    return () => clearInterval(t);
  }, []);

  // SSE — refetch ทันทีเมื่อ server แจ้งการเปลี่ยนแปลง
  useEffect(() => {
    const h = () => {
      api('/lottery/draws?upcoming=1').then(r => setAllDraws(r.draws)).catch(() => {});
      api('/lottery/public-config').then(r => setHiddenBetTypes(Array.isArray(r.hiddenBetTypes) ? r.hiddenBetTypes : [])).catch(() => {});
    };
    window.addEventListener('sys:update', h);
    return () => window.removeEventListener('sys:update', h);
  }, []);

  // admin ซ่อนเมนูแทงหวยรายประเภทได้ — กรองรอบของประเภทที่ถูกซ่อนออก (admin เห็นทั้งหมด)
  const hiddenSet = new Set(hiddenBetTypes);
  const pool = isAdmin ? allDraws : allDraws.filter(d => !hiddenSet.has(d.type_code));

  // กรองรอบตามประเภทประเทศที่เลือก (client-side — pool มีทุกประเภทที่มองเห็นอยู่แล้ว)
  const COUNTRY_OF = { TH: 'ไทย', LA: 'ลาว', HN: 'ฮานอย', GS: 'ออมสิน', HR: 'ราศี' };
  const countryOf = (code) => COUNTRY_OF[code] || 'อื่นๆ';
  let draws = selType ? pool.filter(d => String(d.lottery_type_id) === String(selType)) : pool;
  if (country) draws = draws.filter(d => countryOf(d.type_code) === country);
  const nowSql0 = new Date().toISOString().slice(0, 19).replace('T', ' ');
  if (openOnly) draws = draws.filter(d => d.status === 'open' && d.close_at > nowSql0);
  // เกมด่วน (ขูด/ไฮโล/ยี่กี) ไม่มีรอบแทง — ไม่แสดงในเมนูประเภทหวย (เล่นที่หน้าเกมของตัวเอง)
  const INSTANT = new Set(['SC', 'HL', 'KI']);
  const visibleTypes = types.filter(t => (isAdmin || !hiddenSet.has(t.code)) && !INSTANT.has(t.code));
  // ประเทศที่มีประเภทให้เลือกจริง — ใช้ทำ chips filter
  const countries = [...new Set(visibleTypes.map(t => countryOf(t.code)))];

  const nowSql = new Date().toISOString().slice(0, 19).replace('T', ' ');
  const isLive = d => d.status === 'open' && d.close_at > nowSql;
  // รอบปัจจุบัน = รอบที่เปิดรับและใกล้วันออกรางวัลที่สุด ของแต่ละประเภท/หมวด
  const liveMap = new Map();
  for (const d of draws.filter(isLive)) {
    const key = `${d.lottery_type_id}:${d.category_id || 0}`;
    if (!liveMap.has(key) || d.draw_at < liveMap.get(key).draw_at) liveMap.set(key, d);
  }
  const liveDraws = [...liveMap.values()].sort((a, b) => a.draw_at.localeCompare(b.draw_at));
  const liveIds = new Set(liveDraws.map(d => d.id));
  const otherDraws = draws.filter(d => !liveIds.has(d.id))
    .sort((a, b) => a.draw_at.localeCompare(b.draw_at));
  // separa: abertas p/ aposta (mas não são a rodada em destaque) vs. futuras/encerradas
  const openOthers = otherDraws.filter(isLive);
  // ปิดรับแล้วรอผล — โชว์เด่นๆ แยกจากรอบทั่วไป (live draw experience)
  const drawingDraws = otherDraws.filter(d => d.status === 'closed');
  const upcomingOthers = otherDraws.filter(d => !isLive(d) && d.status !== 'closed');

  const ZODIAC_GLYPHS = ['🐭', '🐂', '🐯', '🐰', '🐉', '🐍', '🐴', '🐐', '🐵', '🐓', '🐕', '🐷'];

  const DrawCard = ({ d, featured, soft }) => {
    const live = isLive(d);
    const drawing = d.status === 'closed'; // ปิดรับแล้ว รอผล — ช่วง "ดูก่อนออก"
    const ac = typeAccent(d.type_code);
    const isHR = d.type_code === 'HR';
    const cardCls = isHR
      ? 'border-violet-400/70 animate-hr-glow bg-gradient-to-b from-indigo-950/80 to-navy-900'
      : featured
        ? 'border-green-500/60 animate-online-border bg-gradient-to-b from-navy-800 to-navy-900'
        : soft
          ? 'border-navy-600/50 bg-gradient-to-b from-navy-800/50 to-navy-900/50'
          : 'border-navy-700 hover:border-navy-500 bg-gradient-to-b from-navy-800 to-navy-900';
    return (
    <div className={`${cardCls} border rounded-xl p-5 pt-4 hoverable flex flex-col`}>
      {isHR ? (
        <div className="hr-shine h-1.5 w-full rounded-full mb-2" />
      ) : (
        <div className={`h-1 w-10 rounded-full mb-2 ${featured ? 'bg-green-400' : soft ? `${ac.bar} opacity-40` : ac.bar}`} />
      )}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <FlagIcon code={d.type_code} className="w-6 h-4 text-[8px]" />
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${ac.chip}`}>{d.type_name_th}</span>
          </div>
          <div className="font-bold text-navy-950 text-lg leading-snug mt-1">{drawLabel(d)}</div>
          <div className="text-xs text-navy-400 mt-0.5">{d.draw_code}</div>
          {(() => { const b = kindBadge(d.result_kind); return b && (
            <div className={`mt-1 text-[9px] px-1.5 py-0.5 rounded inline-block ${b.cls}`}>{b.label}</div>
          ); })()}
          {(() => { const s = annSummary(d.announce); return s ? (
            <div className="ann-blink mt-1 text-[10px] font-bold px-1.5 py-0.5 rounded inline-block bg-amber-500/20 border border-amber-400 text-amber-300">
              📣 เลขอั้น: {s}
            </div>
          ) : null; })()}
          {(() => {
            // อัตราจ่ายเด่น — สูงสุดของกติกาที่ใช้กับรอบนี้ (category ตรงหรือทั่วไป)
            const rs = (rulesByType[d.lottery_type_id] || []).filter(r =>
              r.is_active && (!r.category_id || r.category_id === d.category_id));
            if (!rs.length) return null;
            const max = Math.max(...rs.map(r => Number(r.payout_multiplier) || 0));
            return <div className="mt-1 text-[10px] text-gold-400/90 font-semibold">💰 สูงสุดจ่าย x{max} • {rs.length} แบบ</div>;
          })()}
          {isHR && (
            <div className="mt-1.5">
              <span className="animate-hr-badge inline-block text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-200 border border-violet-400/40">
                ✨ ออกผลทุกชั่วโมง • ทายปีนักษัตร 1 ใน 12
              </span>
            </div>
          )}
        </div>
        {featured ? (
          isHR ? (
            <span className="animate-hr-badge inline-flex items-center gap-1.5 text-xs font-bold px-3.5 py-1.5 rounded-full bg-violet-500/30 text-violet-100 border border-violet-300/70 shadow-lg shadow-violet-500/40">
              <span className="online-dot inline-block w-2.5 h-2.5 rounded-full bg-violet-300" />
              ✨ รับแทงอยู่
            </span>
          ) : (
            <span className="animate-online inline-flex items-center gap-1.5 text-xs font-bold px-3.5 py-1.5 rounded-full bg-green-500/25 text-green-300 border border-green-400/60 shadow-lg shadow-green-500/30">
              <span className="online-dot inline-block w-2.5 h-2.5 rounded-full bg-green-400" />
              🎯 รับแทงอยู่
            </span>
          )
        ) : (
          <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${drawing ? 'bg-gold-500/25 text-gold-300 border border-gold-400/60 animate-pulse' : d.status === 'open' ? (isHR ? 'bg-violet-500/25 text-violet-200 border border-violet-400/50' : 'bg-blue-500/20 text-blue-300 border border-blue-500/40') : d.status === 'settled' ? 'bg-gold-500/20 text-gold-300' : 'bg-navy-700 text-navy-300'}`}>
            {drawing ? '🎰 กำลังออกรางวัล…' : STATUS_TH[d.status] || d.status}
          </span>
        )}
      </div>
      {isHR && (
        <div className="flex items-center justify-between mt-3 text-lg leading-none select-none" aria-hidden="true">
          {ZODIAC_GLYPHS.map((g, i) => (
            <span key={g} className="zodiac-float text-violet-300/90" style={{ animationDelay: `${i * 0.22}s` }}>{g}</span>
          ))}
        </div>
      )}
      <div className="mt-3 text-sm text-navy-300 space-y-1">
        <div>🕐 ออกรางวัล: <span className="text-white">{fmtDateTime(d.draw_at)}</span></div>
        <div>⏱️ ปิดรับโพย: <Countdown closeAt={d.close_at} /></div>
        {live && (() => {
          // เหลือเวลาอีกไม่เกิน 30 นาทีถึงเวลาปิดรับ → badge เร่งด่วน (เวลา close_at เป็นเวลาไทย)
          const t = Date.parse(String(d.close_at).replace(' ', 'T') + '+07:00');
          const mins = Math.round((t - Date.now()) / 60000);
          return Number.isFinite(mins) && mins > 0 && mins <= 30 ? (
            <div className="text-[11px] font-bold text-orange-300 animate-pulse">⏰ ปิดรับในอีก ~{mins} นาที — รีบแทง!</div>
          ) : null;
        })()}
      </div>
      {/* ปุ่มแทงด่วนทุกการ์ด — ติดก้นกรอบเสมอ (mt-auto) • เปิดรับกดได้เลย, ปิด/ยังไม่เปิดแสดงสถานะเป็นปุ่ม disabled */}
      <div className="mt-auto pt-4">
      {live ? (
        <Link to={`/bet/${d.id}`} className={`mt-4 block text-center ${isHR ? 'hr-shine text-white' : `bg-gradient-to-r ${featured ? ac.btnLive : ac.btn}`} font-bold py-2.5 rounded-lg hover:brightness-110 transition`}>
          {isHR ? '🔮 แทงปีนักษัตรรอบนี้' : '🎯 แทงหวยรอบนี้'}
        </Link>
      ) : (
        <button disabled className={`mt-4 w-full border font-semibold py-2.5 rounded-lg cursor-not-allowed ${drawing ? 'border-gold-500/50 text-gold-300 bg-gold-500/10 animate-pulse' : 'border-navy-600 text-navy-400'}`}>
          {d.status === 'cancelled' ? '🚫 ยกเลิกรอบแล้ว'
            : d.status === 'settled' ? '🏆 ออกผลแล้ว'
            : drawing ? '🎰 กำลังออกรางวัล…'
            : d.status === 'closed' ? '🔒 ปิดรับแล้ว'
            : '🗓️ ยังไม่เปิดรับ'}
        </button>
      )}
      </div>
    </div>
    );
  };

  return (
    <div className="lg:flex lg:gap-6 lg:items-start">
      {/* Sidebar ประเภทหวย — desktop only (มือถือใช้ bottom nav/hamburger) */}
      <aside className="hidden lg:block w-60 shrink-0 sticky top-24">
        <div className="bg-navy-800/70 border border-navy-700 rounded-2xl p-3 space-y-1">
          <div className="kicker px-2 pt-1 pb-2">ประเภทหวย</div>
          <Link to="/lotteries" onClick={() => setCountry('')}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold transition ${!selType ? 'bg-[#22d3ee]/15 text-[#67e8f9] border border-[#22d3ee]/40' : 'text-navy-200 hover:bg-navy-800/60 border border-transparent'}`}>
            🌐 ทั้งหมด
          </Link>
          {visibleTypes.map(t => (
            <Link key={t.id} to={`/lotteries?type=${t.id}`} onClick={() => setCountry('')}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold transition ${selType === String(t.id) ? 'bg-[#22d3ee]/15 text-[#67e8f9] border border-[#22d3ee]/40' : 'text-navy-200 hover:bg-navy-800/60 border border-transparent'}`}>
              <FlagIcon code={t.code} className="w-6 h-4 text-[8px] shrink-0" />
              <span className="truncate">{t.name_th}</span>
            </Link>
          ))}
        </div>
      </aside>

    <div className="flex-1 min-w-0 space-y-6">
      {/* ตัวกรองประเทศ + เฉพาะที่เปิดรับ — ใช้ได้ทั้งมือถือ/desktop */}
      <div className="flex items-center gap-2 flex-wrap">
        {[['', 'ทั้งหมด'], ...countries.map(c => [c, c])].map(([v, label]) => (
          <button key={v} onClick={() => { setCountry(v); if (selType) navigate('/lotteries', { replace: true }); }}
            className={`text-xs px-3 py-1.5 rounded-full border font-semibold transition ${country === v ? 'bg-[#22d3ee]/15 text-[#67e8f9] border-[#22d3ee]/50' : 'border-navy-600 text-navy-300 hover:border-navy-500'}`}>
            {label}
          </button>
        ))}
        <label className="ml-auto text-xs text-navy-300 flex items-center gap-1.5 cursor-pointer">
          <input type="checkbox" checked={openOnly} onChange={e => setOpenOnly(e.target.checked)} className="accent-green-500" />
          เฉพาะที่เปิดรับ
        </label>
      </div>

      {/* รอบที่เปิดรับตอนนี้ — แสดงก่อนเสมอพร้อม badge ONLINE */}
      {liveDraws.length > 0 && (
        <section>
          <h2 className="text-sm font-bold text-green-400 mb-2 flex items-center gap-2">
            <span className="online-dot inline-block w-2.5 h-2.5 rounded-full bg-green-400" />
            ออนไลน์ตอนนี้ — กำลังรับแทง ({liveDraws.length})
          </h2>
          <div className="grid md:grid-cols-2 gap-4">
            {liveDraws.map(d => <DrawCard key={d.id} d={d} featured />)}
          </div>
        </section>
      )}

      {/* Outras rodadas abertas p/ aposta — não são a "rodada atual" em destaque */}
      {openOthers.length > 0 && (
        <section>
          <h2 className="text-sm font-bold text-blue-300 mb-2 flex items-center gap-2">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-blue-400" />
            อื่นๆ ที่ยังเปิดรับ ({openOthers.length})
          </h2>
          <p className="text-xs text-navy-400 mb-3">รอบเหล่านี้ยังรับแทงได้ แต่ไม่ใช่รอบหลักด้านบน</p>
          <div className="grid md:grid-cols-2 gap-4">
            {openOthers.map(d => <DrawCard key={d.id} d={d} soft />)}
          </div>
        </section>
      )}

      {/* ปิดรับแล้ว รอผลรางวัล — ช่วง "ดูก่อนออก" */}
      {drawingDraws.length > 0 && (
        <section>
          <h2 className="text-sm font-bold text-gold-300 mb-2 flex items-center gap-2">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-gold-400 animate-pulse" />
            🎰 กำลังออกรางวัล ({drawingDraws.length})
          </h2>
          <div className="grid md:grid-cols-2 gap-4">
            {drawingDraws.map(d => <DrawCard key={d.id} d={d} />)}
          </div>
        </section>
      )}

      {/* Rodadas futuras / já encerradas */}
      {upcomingOthers.length > 0 && (
        <section>
          <h2 className="text-sm font-bold text-navy-300 mb-2">รอบถัดไป / รอบที่ผ่านมา</h2>
          <div className="grid md:grid-cols-2 gap-4">
            {upcomingOthers.map(d => <DrawCard key={d.id} d={d} />)}
          </div>
        </section>
      )}
      {!draws.length && <div className="text-navy-300 text-center py-10">ไม่พบรอบหวย</div>}

      {/* เลขเด็ด/เลขดัง — สถิติจากผลจริงภายนอก */}
      <LuckyNumbers />
    </div>
    </div>
  );
}
