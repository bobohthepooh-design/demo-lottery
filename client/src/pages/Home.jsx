import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { api, fmtDateTime } from '../api.js';
import { useAuth } from '../auth.jsx';
import { FlagIcon } from '../components/ResultLine.jsx';
import { SkeletonGrid } from '../components/Skeleton.jsx';
import { typeAccent } from '../typeAccent.js';
import { GameArt } from '../components/GameArt.jsx';
import { mergeBanner } from '../bannerConfig.js';
import { kindBadge, marketInfo, MODE_BADGE } from '../resultSource.js';
import LuckyNumbers from '../components/LuckyNumbers.jsx';

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

// แถวรอบหวยของแต่ละประเทศ/หมวด — แสดงเวลาออกรางวัล + นับถอยหลังปิดรับ
function DrawLine({ d, now }) {
  const isOpen = d.status === 'open';
  const isScheduled = d.status === 'scheduled';
  return (
    <div className={`bg-navy-800/70 border rounded-lg px-3 py-1.5 flex items-center gap-2 overflow-x-auto whitespace-nowrap ${isOpen ? 'border-navy-700/60' : 'border-navy-700/40 opacity-75'}`}>
      <FlagIcon code={d.type_code} className="w-5 h-5 text-[9px]" />
      <span className={`text-[11px] font-semibold shrink-0 ${typeAccent(d.type_code).text}`}>
        {d.category_name_th || d.type_name_th}
      </span>
      <span className="text-[10px] text-navy-400 shrink-0">ออก {fmtDateTime(d.draw_at)}</span>
      {(() => { const b = kindBadge(d.result_kind); return b ? (
        <span className={`text-[8px] px-1 py-0.5 rounded shrink-0 ${b.cls}`}>{b.short}</span>
      ) : null; })()}
      <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded shrink-0 ml-auto ${isOpen ? 'bg-gold-500/15 text-gold-600' : isScheduled ? 'bg-lav-100 text-lav-500 border border-lav-100' : 'bg-navy-100 text-navy-400'}`}>
        {isOpen ? countdownText(d.close_at, now) : isScheduled ? 'กำหนดการ' : 'ปิดรับแล้ว'}
      </span>
    </div>
  );
}

export default function Home() {
  const { user, demoNotice, isAdmin } = useAuth();
  const now = useNow();
  const [types, setTypes] = useState([]);
  const [markets, setMarkets] = useState([]);
  const [draws, setDraws] = useState([]);
  const [banner, setBanner] = useState(null);
  const [hiddenBetTypes, setHiddenBetTypes] = useState([]);
  const [gamePrices, setGamePrices] = useState({ scratch: 5000, hilo: 5000, scratchPrizes: [], hiloMult: null }); // สตางค์/ตัวคูณ — sync จาก server (admin ตั้งได้)
  const [cashbackPct, setCashbackPct] = useState(0); // โปรคืนยอดเสีย %/วัน — 0 = ปิด

  useEffect(() => {
    api('/lottery/types').then(r => setTypes(r.types)).catch(() => {});
    api('/lottery/markets').then(r => setMarkets(r.markets || [])).catch(() => {});
    api('/lottery/public-config').then(r => {
      setBanner(mergeBanner(r.banner));
      setHiddenBetTypes(Array.isArray(r.hiddenBetTypes) ? r.hiddenBetTypes : []);
      setCashbackPct(Number(r.cashbackPercent) || 0);
      if (r.instantGame) setGamePrices({
        scratch: r.instantGame.scratchPrice || 5000,
        hilo: r.instantGame.hiloPrice || 5000,
        scratchPrizes: Array.isArray(r.instantGame.scratchPrizes) ? r.instantGame.scratchPrizes : [],
        hiloMult: r.instantGame.hiloMult || null,
      });
    }).catch(() => {});
    const loadDraws = () => api('/lottery/draws?upcoming=1').then(r => setDraws(r.draws)).catch(() => {});
    loadDraws();
    const t = setInterval(loadDraws, 30000); // refresh อัตโนมัติ — สถานะรอบเปลี่ยนโดย admin จะขึ้นเอง
    return () => clearInterval(t);
  }, [user]);

  // SSE — refetch ทันทีเมื่อ server แจ้งว่ามีการเปลี่ยนแปลง (ผลรางวัล/รอบ/การตั้งค่า)
  useEffect(() => {
    const h = () => {
      api('/lottery/types').then(r => setTypes(r.types)).catch(() => {});
      api('/lottery/markets').then(r => setMarkets(r.markets || [])).catch(() => {});
      api('/lottery/public-config').then(r => {
        setBanner(mergeBanner(r.banner));
        setHiddenBetTypes(Array.isArray(r.hiddenBetTypes) ? r.hiddenBetTypes : []);
        setCashbackPct(Number(r.cashbackPercent) || 0);
        if (r.instantGame) setGamePrices({
          scratch: r.instantGame.scratchPrice || 5000,
          hilo: r.instantGame.hiloPrice || 5000,
          scratchPrizes: Array.isArray(r.instantGame.scratchPrizes) ? r.instantGame.scratchPrizes : [],
          hiloMult: r.instantGame.hiloMult || null,
        });
      }).catch(() => {});
      api('/lottery/draws?upcoming=1').then(r => setDraws(r.draws)).catch(() => {});
    };
    window.addEventListener('sys:update', h);
    return () => window.removeEventListener('sys:update', h);
  }, []);

  // admin ซ่อนเมนูแทงหวยรายประเภทได้ (blind mode) — admin เองเห็นทั้งหมดเสมอ
  const hiddenSet = new Set(hiddenBetTypes);
  const typeVisible = t => isAdmin || !hiddenSet.has(t.code);
  const drawVisible = d => isAdmin || !hiddenSet.has(d.type_code);
  const visTypes = types.filter(typeVisible);
  const visDraws = draws.filter(drawVisible);

  // รอบเปิดรับที่ใกล้ปิดสุดของแต่ละประเทศ/หมวด
  const openByCategory = [];
  const seenDraw = new Set();
  const sorted = [...visDraws]
    .filter(d => d.status === 'open' || d.status === 'scheduled')
    .sort((a, b) => String(a.close_at).localeCompare(String(b.close_at)));
  for (const d of sorted) {
    const key = `${d.type_code}:${d.category_code || ''}`;
    if (seenDraw.has(key)) continue;
    seenDraw.add(key);
    openByCategory.push(d);
  }

  // รอบหวยราศีที่เปิดรับอยู่ใกล้ปิดสุด — สำหรับการ์ดโปรโมชันพิเศษ
  const zodiacDraw = visDraws
    .filter(d => d.type_code === 'HR' && d.status === 'open' && msLeft(d.close_at, now) > 0)
    .sort((a, b) => String(a.close_at).localeCompare(String(b.close_at)))[0];

  // instant games (สล็อต/ไฮโล) + หวยราศี — แสดงการ์ดเด่นบนสุด แถวเดียวกันบน tablet/desktop
  const instantTypes = visTypes.filter(t => ['SC', 'HL', 'KI'].includes(t.code));
  const zodiacType = visTypes.find(t => t.code === 'HR');
  const topRowTypes = [...instantTypes, ...(zodiacType ? [zodiacType] : [])];
  const instantLink = t => ({ SC: '/scratch', HL: '/hilo', KI: '/kiwi' })[t.code] || `/lotteries?type=${t.id}`;
  const baht = (satangVal) => `${(satangVal / 100).toLocaleString('th-TH')} บาท`;
  // อัตราจ่าย/รางวัลจากข้อมูลหลังบ้าน (public-config) — admin เปลี่ยนใน /admin/settings มีผลทันที
  const sp = gamePrices.scratchPrizes;
  const prizeMin = sp.length ? Math.min(...sp.map(p => p.prize)) : null;
  const prizeMax = sp.length ? Math.max(...sp.map(p => p.prize)) : null;
  const scratchPrizeText = prizeMax != null ? `รางวัลสูงสุด ${baht(prizeMax)}` : 'รางวัลสูงสุด 120,000 บาท';
  const hm = gamePrices.hiloMult;
  const hiloOddsText = hm ? `ต่ำ ×${hm.low} • สูง ×${hm.high} • 11 ×${hm.eleven}` : '';
  const instantMeta = {
    SC: { code: 'SC', tag: 'สปินแล้วรู้ผลทันที', desc: `เล่นเกม ${baht(gamePrices.scratch)} → สปิน 5 รีล 3 แถว 20 เพย์ไลน์ → ${scratchPrizeText}`, cta: 'เล่นเกมเลย', grad: 'from-red-700 to-rose-900' },
    HL: { code: 'HL', tag: 'ทอยเต๋า 3 ลูก รู้ผลทันที', desc: `ทาย สูง/ต่ำ/11 ไฮโล — ${hiloOddsText ? `${hiloOddsText} — ` : ''}แทง ${baht(gamePrices.hilo)}/ครั้ง ตลอด 24 ชม.`, cta: 'เล่นไฮโลเลย', grad: 'from-amber-700 to-orange-900' },
    KI: { code: 'KI', tag: 'เลือกเลขทายผลไว', desc: 'เลือกเลข 3-5 ตัว → สุ่มผลทันที → ถูกกี่ตัวจ่ายเท่านั้น มี VIP', cta: 'เล่นยี่กีเลย', grad: 'from-yellow-700 to-amber-900' },
    HR: { code: '✦', tag: 'ปีนักษัตรออกผลทุกชั่วโมง', desc: zodiacDraw ? `รอบถัดไปปิดรับ ${fmtDateTime(zodiacDraw.close_at)}` : 'เลือกได้ 4 รูปแบบการแทง — ตัวแรก/ท้าย 2-3 ตัว + วิ่ง', cta: 'ดูรอบปีนักษัตร', grad: 'from-violet-700 to-purple-900' },
  };

  const openCount = visDraws.filter(d => d.status === 'open').length;
  const b = mergeBanner(banner);

  return (
    <div className="space-y-8">
      {/* Welcome + DEMO badge — member เท่านั้น */}
      {user && (
        <div className="flex items-center gap-3 bg-navy-800/80 border border-navy-700 rounded-2xl px-4 py-3">
          <span className="w-10 h-10 rounded-full bg-gradient-to-br from-gold-300 to-gold-600 text-navy-950 font-display font-black text-lg flex items-center justify-center shadow-md shadow-gold-500/20 shrink-0">
            {(user.displayName || user.username || '?').slice(0, 1).toUpperCase()}
          </span>
          <div className="flex-1 min-w-0">
            <div className="font-display font-bold text-navy-950 text-base sm:text-lg">
              สวัสดีค่ะ {user.displayName || user.username} ~
            </div>
            <div className="text-xs text-navy-400 truncate">
              {demoNotice || 'โหมดทดลอง — ใช้เครดิตเสมือนเท่านั้น'}
            </div>
          </div>
          <span className="animate-demo-badge shrink-0 text-[10px] font-black px-2.5 py-1 rounded-full bg-gradient-to-r from-gold-300 to-gold-500 text-navy-950 border border-gold-400/60 shadow-sm tracking-wider">
            DEMO MODE
          </span>
        </div>
      )}
      {/* โปร cashback — แสดงเมื่อ admin เปิดใช้ */}
      {cashbackPct > 0 && (
        <div className="rounded-xl border border-gold-500/40 bg-gradient-to-r from-gold-500/15 via-navy-800/60 to-gold-500/15 px-4 py-2.5 flex items-center gap-2 text-sm">
          <span className="text-lg">🎁</span>
          <span className="text-gold-200">โปรโมชั่น: <b className="text-gold-300">คืนยอดเสีย {cashbackPct}%</b> ทุกวัน — คำนวณจากผลการแทงย้อนหลัง 24 ชม. (เครดิตเสมือนเพื่อการศึกษา)</span>
        </div>
      )}
      {/* Hero — ดึงดูดให้เข้ามาแทง (ข้อความแก้ไขได้ที่ /admin/banner) */}
      {b.enabled && (
      <section className="casino-frame casino-hero-felt casino-rail relative overflow-hidden rounded-2xl border border-gold-500/50 px-5 py-10 sm:px-12 sm:py-14 text-center">
        <div className="absolute -top-20 left-1/4 w-72 h-72 rounded-full bg-red-500/10 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-20 right-1/4 w-72 h-72 rounded-full bg-gold-500/10 blur-3xl pointer-events-none" />
        {/* ลูกเล่นคาสิโน — ประกายทอง + ชิปโป๊กเกอร์ลอย (decorative) */}
        <span className="casino-sparkle text-xl" style={{ top: '14%', left: '7%', animationDelay: '0.2s' }}>✦</span>
        <span className="casino-sparkle text-sm" style={{ top: '22%', right: '9%', animationDelay: '1.1s' }}>✦</span>
        <span className="casino-sparkle text-lg" style={{ bottom: '24%', left: '12%', animationDelay: '2s' }}>✧</span>
        <span className="casino-sparkle text-sm" style={{ bottom: '30%', right: '14%', animationDelay: '0.7s' }}>✦</span>
        <span className="casino-sparkle text-base hidden sm:block" style={{ top: '55%', left: '4%', animationDelay: '1.6s' }}>✧</span>
        <span className="casino-sparkle text-base hidden sm:block" style={{ top: '60%', right: '5%', animationDelay: '2.6s' }}>✦</span>
        <div className="casino-chip w-12 h-12 sm:w-16 sm:h-16" style={{ bottom: '-6%', left: '5%', background: 'radial-gradient(circle at 35% 30%, #fff3c4, #e2a812 60%, #92600a)', animationDelay: '0.4s' }} />
        <div className="casino-chip w-10 h-10 sm:w-14 sm:h-14" style={{ top: '-4%', right: '7%', background: 'radial-gradient(circle at 35% 30%, #1f2937, #111827 65%, #030712)', animationDelay: '1.8s' }} />
        <div className="casino-chip w-8 h-8 sm:w-11 sm:h-11" style={{ bottom: '12%', right: '3%', background: 'radial-gradient(circle at 35% 30%, #fde68a, #d9a520 60%, #8a6405)', animationDelay: '3s' }} />
        <div className="relative">
          <div className="kicker mb-3">Premier Lottery Lounge · Demo</div>
          {/* ตราสัญลักษณ์โรงเตี๊ยม — emoji ที่ตั้งค่าได้อยู่ในกรอบทอง */}
          <div className="mx-auto mb-4 w-16 h-16 rounded-full border border-gold-400/60 bg-navy-950/60 flex items-center justify-center text-3xl shadow-[0_0_30px_rgba(244,201,78,0.25)]">
            {b.emoji}
          </div>
          <h1 className="text-2xl sm:text-4xl font-black leading-tight tracking-wide">
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-gold-200 via-gold-400 to-gold-500">
              {b.title}
            </span>
          </h1>
          <p className="text-navy-200 text-sm sm:text-base mt-2 tracking-wide">
            {b.markets}
          </p>
          <p className="text-gold-300/90 text-xs sm:text-sm mt-2 font-semibold tracking-wider">
            {b.promo}
          </p>
          <div className="flex items-center justify-center gap-3 mt-6 flex-wrap">
            <Link to="/lotteries"
              className="bg-gradient-to-r from-gold-400 to-gold-600 text-navy-950 font-bold px-8 py-3 rounded-lg text-sm sm:text-base tracking-wide shadow-lg shadow-gold-500/25 hover:brightness-110 transition border border-gold-300/50">
              {b.cta_bet}
            </Link>
            {!user && (
              <Link to="/register"
                className="border border-gold-500/50 text-gold-300 font-semibold px-6 py-3 rounded-lg text-sm sm:text-base tracking-wide hover:bg-navy-800/60 transition">
                {b.cta_register}
              </Link>
            )}
          </div>
          {/* สถิติสด */}
          {b.show_stats && (
          <div className="flex items-center justify-center gap-4 sm:gap-8 mt-7 pt-5 border-t border-gold-500/20 text-xs sm:text-sm flex-wrap">
            <div><span className="text-gold-300 font-bold text-lg">{openCount}</span> <span className="text-navy-300">รอบเปิดรับ</span></div>
            <div className="w-px h-6 bg-gold-500/30 hidden sm:block" />
            <div><span className="text-gold-300 font-bold text-lg">{visTypes.filter(t => t.code !== 'SC' && t.code !== 'HL').length}</span> <span className="text-navy-300">ตลาดหวย</span></div>
            <div className="w-px h-6 bg-gold-500/30 hidden sm:block" />
            <div><span className="text-gold-300 font-bold text-lg">x1,000</span> <span className="text-navy-300">อัตราจ่ายสูงสุด</span></div>
          </div>
          )}
        </div>
      </section>
      )}

      {/* เกมด่วน — สล็อต/ไฮโล แสดงก่อนเสมอ เล่นได้ทันทีไม่ต้องรอผลออกรางวัล */}
      {topRowTypes.length > 0 && (
        <section>
          <div className="flex items-end justify-between mb-4 flex-wrap gap-2">
            <div>
              <div className="kicker mb-1">Live Games</div>
              <h2 className="text-xl font-bold text-white">
                เกมด่วน
              </h2>
              <p className="text-xs text-navy-400 mt-0.5">เกมด่วนเล่นได้ทันทีไม่ต้องรอผลออกรางวัล — เปิดตลอด 24 ชม.</p>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
            {topRowTypes.map((t, i) => {
              const m = instantMeta[t.code] || {};
              const ac = typeAccent(t.code);
              return (
                <div key={t.id} className={`casino-table relative overflow-hidden rounded-2xl p-4 sm:p-5 hoverable deal-in`} style={{ animationDelay: `${i * 90}ms` }}>
                  <div className={`absolute -top-10 -right-10 w-40 h-40 rounded-full ${ac.bar} opacity-10 blur-3xl pointer-events-none`} />
                  <div className="flex items-center gap-3 sm:gap-4">
                    <div className={`w-14 h-14 sm:w-16 sm:h-16 rounded-xl bg-navy-950/60 border border-gold-500/30 flex items-center justify-center shadow-inner shrink-0`}>
                      <GameArt code={t.code} className="w-12 h-12 sm:w-14 sm:h-14" />
                    </div>
                    <div className="min-w-0">
                      <div className={`font-bold text-base sm:text-lg ${ac.text} leading-tight truncate`}>{t.name_th}</div>
                      <div className="text-[11px] text-navy-400 mt-0.5 truncate">{m.tag}</div>
                    </div>
                    <span className={`ml-auto shrink-0 text-[10px] font-bold px-2 py-1 rounded-full border whitespace-nowrap ${t.code === 'HR' ? 'bg-violet-500/20 text-violet-300 border-violet-400/40' : 'bg-green-500/20 text-green-300 border-green-500/40 animate-online'}`}>
                      {t.code === 'HR' ? '✦ รายชั่วโมง' : '● เปิดตลอด'}
                    </span>
                  </div>
                  <p className="text-xs text-navy-300 mt-3">{m.desc}</p>
                  <Link to={user ? instantLink(t) : '/login'}
                    className={`mt-4 block text-center bg-gradient-to-r ${m.grad} font-bold px-6 py-2.5 rounded-lg text-sm tracking-wide shadow-lg hover:brightness-110 transition border border-white/10`}>
                    {m.cta}
                  </Link>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* หมายเหตุ: เคยมีการ์ดโปรโมชันหวยราศีแยก — ตอนนี้ราศีอยู่ในการ์ดแถวเกมด่วนด้านบนแล้ว ไม่ซ้ำ */}

      {/* ประเภทหวยที่รองรับ + รอบที่เปิดรับ/นับถอยหลังของแต่ละประเทศ */}
      <section>
        <div className="flex items-end justify-between mb-4 flex-wrap gap-2">
          <div>
            <div className="kicker mb-1">Lottery Markets</div>
            <h2 className="text-xl font-bold text-white">
              ประเภทหวยที่รองรับ
            </h2>
            <p className="text-xs text-navy-400 mt-0.5">เลือกประเภทเพื่อดูรอบที่เปิดรับและเวลาออกรางวัล</p>
          </div>
          <Link to="/lotteries" className="text-sm text-gold-400 hover:text-gold-300 font-semibold">ดูรอบทั้งหมด →</Link>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {/* exclude เกมบนแถวแรก (SC/HL/HR) — แสดงใน section เกมด่วนด้านบนแล้ว */}
          {visTypes.filter(t => !['SC', 'HL', 'HR', 'KI', 'CF'].includes(t.code)).map((t, i) => {
            const typeDraws = openByCategory.filter(d => d.type_code === t.code);
            const ac = typeAccent(t.code);
            const openN = typeDraws.filter(d => d.status === 'open').length;
            const isHR = t.code === 'HR';
            const cardLink = `/lotteries?type=${t.id}`;
            return (
              <div key={t.id} className={`rounded-2xl overflow-hidden flex flex-col hoverable deal-in ${isHR ? 'border border-violet-400/60 animate-hr-glow bg-navy-800/60' : 'casino-table'}`} style={{ animationDelay: `${i * 90}ms` }}>
                {/* header การ์ด — gradient ตามสีประเภท */}
                <Link to={cardLink} className={`relative block px-4 pt-4 pb-3 bg-gradient-to-br ${isHR ? 'from-violet-900/70' : ac.head} to-transparent group`}>
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-navy-900/80 border border-navy-600/60 flex items-center justify-center shadow-inner shrink-0 group-hover:scale-105 transition">
                      <FlagIcon code={t.code} className="w-8 h-8 text-[10px]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[10px] font-bold uppercase tracking-widest text-navy-400">หวย {t.code}</div>
                      <div className="font-display font-bold text-white text-lg leading-tight truncate group-hover:text-gold-300 transition">{t.name_th}</div>
                    </div>
                    {openN > 0 && (
                      <span className="shrink-0 text-[10px] font-bold px-2 py-1 rounded-full bg-green-500/20 text-green-300 border border-green-500/40">
                        ● {openN} รอบ
                      </span>
                    )}
                  </div>
                </Link>
                {/* body */}
                <div className="px-4 pb-4 pt-2 flex-1 flex flex-col">
                  <div className="text-[11px] text-navy-400 mb-2">{t.description}</div>
                  {/* หมวดย่อยของประเภทนี้ + สถานะว่าเป็นผลจริงหรือเกม/สุ่ม */}
                  {(() => {
                    const ms = markets.filter(m => m.type_id === t.id);
                    if (!ms.length) return null;
                    const SHORT = { auto: '🌐 ผลจริง', manual: '✏️ ผลจริง(กรอกเอง)', game: '🎮 เกม', demo: '🎲 สุ่ม', off: '⛔ ปิด' };
                    return (
                      <div className="flex flex-wrap gap-1 mb-2">
                        {ms.map(m => {
                          const info = marketInfo(m.type_code, m.category_code);
                          const label = info ? SHORT[info.mode] || '' : '';
                          return (
                            <span key={m.key} title={info ? `${info.kind} • ${info.src}` : m.name_th}
                              className="text-[9px] px-1.5 py-0.5 rounded bg-navy-900/70 border border-navy-700/60 text-navy-300 whitespace-nowrap">
                              {m.name_th}{label ? ` · ${label}` : ''}
                            </span>
                          );
                        })}
                      </div>
                    );
                  })()}
                  {isHR && (
                    <div className="flex justify-between text-base leading-none mb-2 select-none" aria-hidden="true">
                      {['🐭','🐂','🐯','🐰','🐉','🐍','🐴','🐐','🐵','🐓','🐕','🐷'].map((g, i) => (
                        <span key={g} className="zodiac-float text-violet-300/80" style={{ animationDelay: `${i * 0.22}s` }}>{g}</span>
                      ))}
                    </div>
                  )}
                  {typeDraws.length > 0 ? (
                    <div className="space-y-1 flex-1">
                      {typeDraws.slice(0, 4).map(d => <DrawLine key={d.id} d={d} now={now} />)}
                      {typeDraws.length > 4 && (
                        <div className="text-[10px] text-navy-500 text-center">+อีก {typeDraws.length - 4} รอบ</div>
                      )}
                    </div>
                  ) : (
                    <div className="text-[11px] text-navy-500 py-3">ไม่มีรอบที่เปิดรับ</div>
                  )}
                  <Link to={cardLink}
                    className={`mt-3 block text-center text-xs font-bold bg-gradient-to-r ${ac.btn} rounded-md py-2 tracking-wide hover:brightness-110 transition shadow-md`}>
                    แทงรอบนี้เลย
                  </Link>
                </div>
              </div>
            );
          })}
          {!types.length && <SkeletonGrid count={3} />}
        </div>
      </section>

      {/* เลขเด็ด/เลขดัง — สถิติจากผลจริงภายนอก */}
      <LuckyNumbers />

    </div>
  );
}
