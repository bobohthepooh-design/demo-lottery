import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { api, fmtDateTime, satang, thaiDate, thaiTime } from '../api.js';
import { useAuth } from '../auth.jsx';
import { FlagIcon } from '../components/ResultLine.jsx';
import { sourceBadge, sourceName } from '../resultSource.js';
import { heroNumbers, resultSummary } from '../resultFields.js';
import { Marquee } from '../components/ui/index.js';
const GROUP_ORDER = ['TH', 'LA', 'HN', 'GS', 'HR'];
const GROUP_LABEL = { TH: 'ไทย', LA: 'ลาว', HN: 'ฮานอย', GS: 'ออมสิน', HR: 'ราศี' };

// สี accent ของปุ่มลัด 4 ปุ่มหลัก — ทำให้แต่ละอันมีตัวตนชัดเจน
const QUICK_ACCENT = {
  '/play':     { bg1: 'rgba(212,175,55,0.16)', border: 'rgba(212,175,55,0.55)', glow: 'rgba(212,175,55,0.22)', line: 'linear-gradient(90deg, transparent, #D4AF37, transparent)', iconBg: 'linear-gradient(135deg, rgba(212,175,55,0.35), rgba(212,175,55,0.10))', sub: '#F5D76E' },
  '/games':    { bg1: 'rgba(168,85,247,0.14)', border: 'rgba(168,85,247,0.5)',  glow: 'rgba(168,85,247,0.2)',  line: 'linear-gradient(90deg, transparent, #a855f7, transparent)', iconBg: 'linear-gradient(135deg, rgba(168,85,247,0.35), rgba(168,85,247,0.10))', sub: '#d8b4fe' },
  '/results':  { bg1: 'rgba(245,158,11,0.13)', border: 'rgba(245,158,11,0.5)',  glow: 'rgba(245,158,11,0.2)',  line: 'linear-gradient(90deg, transparent, #f59e0b, transparent)', iconBg: 'linear-gradient(135deg, rgba(245,158,11,0.32), rgba(245,158,11,0.08))', sub: '#fcd34d' },
  '/wallet':   { bg1: 'rgba(52,211,153,0.13)', border: 'rgba(52,211,153,0.5)',  glow: 'rgba(52,211,153,0.2)',  line: 'linear-gradient(90deg, transparent, #34d399, transparent)', iconBg: 'linear-gradient(135deg, rgba(52,211,153,0.32), rgba(52,211,153,0.08))', sub: '#6ee7b7' },
  '/register': { bg1: 'rgba(59,130,246,0.13)', border: 'rgba(59,130,246,0.5)',  glow: 'rgba(59,130,246,0.2)',  line: 'linear-gradient(90deg, transparent, #3b82f6, transparent)', iconBg: 'linear-gradient(135deg, rgba(59,130,246,0.32), rgba(59,130,246,0.08))', sub: '#93c5fd' },
  default:     { bg1: 'rgba(212,175,55,0.10)', border: 'rgba(212,175,55,0.45)', glow: 'rgba(212,175,55,0.18)', line: 'linear-gradient(90deg, transparent, #D4AF37, transparent)', iconBg: 'linear-gradient(135deg, rgba(212,175,55,0.28), rgba(212,175,55,0.08))', sub: '#F5D76E' },
};

export default function Home() {
  const { user, demoNotice, isAdmin, balance } = useAuth();
  const [hiddenBetTypes, setHiddenBetTypes] = useState([]);
  const [betMenuOn, setBetMenuOn] = useState(true); // admin blind mode — ปิดแล้วซ่อนปุ่มแทงทุกอัน
  const [cashbackPct, setCashbackPct] = useState(0); // โปรคืนยอดเสีย %/วัน — 0 = ปิด
  const [todayDraws, setTodayDraws] = useState([]); // ผล+รอบวันนี้สำหรับ ticker
  const [latestResults, setLatestResults] = useState([]); // ผลล่าสุดข้ามตลาด (ไม่จำกัดวัน)
  const [cardOpen, setCardOpen] = useState({}); // การ์ดผลล่าสุด — ขยายดูผลทุกรางวัล

  useEffect(() => {
    api('/lottery/public-config').then(r => {
      setHiddenBetTypes(Array.isArray(r.hiddenBetTypes) ? r.hiddenBetTypes : []);
      setBetMenuOn(r.bettingMenuEnabled !== false);
      setCashbackPct(Number(r.cashbackPercent) || 0);
    }).catch(() => {});
    const loadToday = () => api('/lottery/today').then(r => setTodayDraws(r.draws || [])).catch(() => {});
    // ผลล่าสุดข้ามตลาด — ดึงเผื่อๆ ไว้ 24 แล้วค่อย dedupe ตลาด+ตัด 6 การ์ด
    // (limit=6 ตรงๆ อาจได้ตลาดซ้ำเยอะ → การ์ดจริงเหลือน้อยกว่า 6)
    const loadLatest = () => api('/lottery/latest-results?limit=24&exclude=SC,HL,KI,CF,HR').then(r => setLatestResults(r.draws || [])).catch(() => {});
    loadToday(); loadLatest();
    const t = setInterval(() => { loadToday(); loadLatest(); }, 30000); // refresh อัตโนมัติ — ผลใหม่ขึ้นเอง
    const h = () => { loadToday(); loadLatest(); };
    window.addEventListener('sys:update', h);
    return () => { clearInterval(t); window.removeEventListener('sys:update', h); };
  }, []);

  // admin ซ่อนเมนูแทงหวยรายประเภทได้ (blind mode) — admin เองเห็นทั้งหมดเสมอ
  const hiddenSet = new Set(hiddenBetTypes);
  const drawVisible = d => isAdmin || !hiddenSet.has(d.type_code);

  // ปุ่มลัดหลัก — เรียบ template เดียวกันทุกปุ่ม (พื้น navy กลาง ไม่แสบตา)
  // blind mode (betMenuOn=false) → ซ่อนทางเข้าการเดิมพันทั้งหมด ยกเว้น admin ที่เห็นปกติ
  const showBet = betMenuOn || isAdmin;
  const quickActions = (user ? [
    { to: '/play', icon: '🎯', label: 'แทงหวย', sub: 'เลือกรอบ', bet: true },
    { to: '/games', icon: '🎮', label: 'เล่นเกม', sub: 'ด่วน', bet: true },
    { to: '/results', icon: '🏆', label: 'ผลรางวัล', sub: 'ล่าสุด' },
    { to: '/wallet', icon: '💳', label: 'กระเป๋า', sub: satang(balance) },
  ] : [
    { to: '/play', icon: '🎯', label: 'แทงหวย', sub: 'เลือกรอบ', bet: true },
    { to: '/games', icon: '🎮', label: 'เล่นเกม', sub: 'ด่วน', bet: true },
    { to: '/results', icon: '🏆', label: 'ผลรางวัล', sub: 'ล่าสุด' },
    { to: '/wallet', icon: '💳', label: 'กระเป๋า', sub: 'เครดิต' },
  ]).filter(a => showBet || !a.bet);

  // ผลรางวัลวันนี้ — เฉพาะตลาดที่มีผลจริงแล้ว ล่าสุดต่อ ตลาด (เฉพาะหวย ไม่รวมหวยราศี HR/เกมด่วน)
  const resultCards = (() => {
    const INSTANT = new Set(['SC', 'HL', 'KI', 'CF', 'HR']); // เกมด่วน+ราศี ไม่แสดงในผลรางวัล
    const todays = todayDraws.filter(d => drawVisible(d) && !INSTANT.has(d.type_code));
    const mk = new Map();
    for (const d of todays) {
      const k = `${d.type_code}|${d.category_code || ''}`;
      if (!mk.has(k)) mk.set(k, { label: d.category_name_th || d.type_name_th, type_code: d.type_code, cat_code: d.category_code, type_name_th: d.type_name_th, settled: [], pending: [] });
      const g = mk.get(k);
      if (d.status === 'settled' && d.winning) g.settled.push(d);
      else if (d.status !== 'cancelled') g.pending.push(d);
    }
    return [...mk.values()].map(g => {
      g.settled.sort((a, b) => String(b.draw_at).localeCompare(String(a.draw_at)));
      g.pending.sort((a, b) => String(a.draw_at).localeCompare(String(b.draw_at)));
      return g;
    }).filter(g => g.settled.length > 0)
      .sort((a, b) => String(b.settled[0].draw_at).localeCompare(String(a.settled[0].draw_at)));
  })();

  // ผลรางวัลล่าสุด 6 การ์ด — แสดงแบบเดียวกับหน้า Results (LC-style) แต่เฉพาะ 5-6 ล่าสุด
  const recentResults = (() => {
    const src = latestResults.length ? latestResults : todayDraws;
    const INSTANT = new Set(['SC', 'HL', 'KI', 'CF', 'HR']);
    const seen = new Set();
    return src
      .filter(d => drawVisible(d) && !INSTANT.has(d.type_code) && d.winning)
      .filter(d => { const k = `${d.type_code}|${d.category_code || ''}`; if (seen.has(k)) return false; seen.add(k); return true; })
      .sort((a, b) => String(b.draw_at).localeCompare(String(a.draw_at)))
      .slice(0, 6);
  })();
  // จัดกลุ่มตามประเทศสำหรับหัวข้อการ์ด
  const recentGroups = (() => {
    const m = new Map();
    for (const d of recentResults) {
      const k = d.type_code || '';
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(d);
    }
    return [...m.entries()].sort((a, b) => {
      const ia = GROUP_ORDER.indexOf(a[0]), ib = GROUP_ORDER.indexOf(b[0]);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
  })();

  return (
    <div className="space-y-6">
      {/* hero banner — gradient frame + แสงกวาด + orb ลอย (animation อยู่ใน index.css) */}
      <div className="hero-banner rounded-2xl px-4 sm:px-6 py-4 sm:py-5">
        <span className="hero-orb w-24 h-24 sm:w-36 sm:h-36" style={{ top: '-30%', left: '4%', background: 'rgba(212,175,55,0.35)' }} />
        <span className="hero-orb w-20 h-20 sm:w-28 sm:h-28" style={{ bottom: '-35%', right: '8%', background: 'rgba(168,85,247,0.30)', animationDelay: '1.2s' }} />
        <span className="hero-orb w-16 h-16 sm:w-24 sm:h-24" style={{ top: '-25%', right: '30%', background: 'rgba(59,130,246,0.28)', animationDelay: '2.4s' }} />
        <div className="relative flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="font-display font-black text-lg sm:text-2xl tracking-wide" style={{
              background: 'linear-gradient(90deg, #F5D76E, #D4AF37 40%, #fff3c4 60%, #D4AF37)',
              backgroundSize: '200% 100%',
              WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
            }}>LOTTERY DEMO</div>
            <div className="text-[11px] sm:text-xs mt-0.5" style={{ color: 'var(--muted-gray)' }}>
              หวยออนไลน์ • เกมด่วน • ผลรางวัลอัปเดตอัตโนมัติ
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-1.5 text-xl sm:text-2xl shrink-0 select-none" aria-hidden="true">
            <span className="animate-float" style={{ animationDelay: '0s' }}>🎱</span>
            <span className="animate-float" style={{ animationDelay: '0.6s' }}>🎰</span>
            <span className="animate-float" style={{ animationDelay: '1.2s' }}>🏆</span>
          </div>
        </div>
      </div>
      {/* welcome — member เท่านั้น */}
      {user && (
        <div className="flex items-center gap-2.5 sm:gap-3 rounded-2xl px-3 sm:px-4 py-2.5 sm:py-3" style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border-gold)',
          boxShadow: 'var(--shadow-gold)'
        }}>
          <span className="w-9 h-9 sm:w-10 sm:h-10 rounded-full font-display font-black text-base sm:text-lg flex items-center justify-center shrink-0" style={{
            background: 'linear-gradient(135deg, var(--gold-gradient-start), var(--gold-gradient-end))',
            color: 'var(--bg-deep-black)',
            boxShadow: 'var(--shadow-gold)'
          }}>
            {(user.displayName || user.username || '?').slice(0, 1).toUpperCase()}
          </span>
          <div className="flex-1 min-w-0">
            <div className="font-display font-bold text-sm sm:text-base lg:text-lg" style={{ color: 'var(--white)' }}>
              สวัสดีค่ะ {user.displayName || user.username} ~
            </div>
            <div className="text-[10px] sm:text-xs truncate" style={{ color: 'var(--muted-gray)' }}>
              {demoNotice || 'โหมดทดลอง — ใช้เครดิตเสมือนเท่านั้น'}
            </div>
          </div>
          <span className="shrink-0 text-[9px] sm:text-[10px] font-black px-2 sm:px-2.5 py-0.75 sm:py-1 rounded-full tracking-wider" style={{
            background: 'linear-gradient(135deg, var(--gold-gradient-start), var(--gold-gradient-end))',
            color: 'var(--bg-deep-black)',
            border: '1px solid var(--border-gold)'
          }}>
            DEMO MODE
          </span>
        </div>
      )}


      {/* ปุ่มลัดหลัก — luxury icon tiles เด่นขึ้น */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        {quickActions.map(a => {
          const ac = QUICK_ACCENT[a.to] || QUICK_ACCENT.default;
          return (
          <Link key={a.label} to={a.to}
            className="qa-card group relative rounded-2xl py-4 sm:py-5 px-2 flex flex-col items-center gap-2 sm:gap-2.5 transition-all duration-200 hover:-translate-y-1 active:scale-95 overflow-hidden"
            style={{
              background: `linear-gradient(160deg, ${ac.bg1}, var(--bg-card) 70%)`,
              border: `1px solid ${ac.border}`,
              boxShadow: `0 6px 18px ${ac.glow}`
            }}>
            <span className="absolute top-0 inset-x-6 h-0.5 rounded-full" style={{ background: ac.line }} />
            <span className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center text-2xl sm:text-3xl shrink-0 transition group-hover:scale-110" style={{
              background: ac.iconBg,
              border: `1px solid ${ac.border}`,
              boxShadow: `0 4px 14px ${ac.glow}`
            }}>{a.icon}</span>
            <div className="text-center">
              <div className="text-sm sm:text-base font-black tracking-wide" style={{ color: 'var(--white)' }}>{a.label}</div>
              <div className="text-[10px] sm:text-[11px] font-bold font-mono mt-0.5" style={{ color: ac.sub }}>{a.sub}</div>
            </div>
          </Link>
          );
        })}
      </div>

      {/* โปร cashback */}
      {cashbackPct > 0 && (
        <div className="rounded-xl px-3 sm:px-4 py-2 sm:py-2.5 flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm" style={{
          border: '1px solid var(--border-gold)',
          background: 'linear-gradient(90deg, rgba(212, 175, 55, 0.15), var(--bg-card), rgba(212, 175, 55, 0.15))'
        }}>
          <span className="text-base sm:text-lg">🎁</span>
          <span style={{ color: 'var(--gold-bright)' }}>โปรโมชั่น: <b>คืนยอดเสีย {cashbackPct}%</b> ทุกวัน — คำนวณจากผลการแทงย้อนหลัง 24 ชม. (เครดิตเสมือนเพื่อการศึกษา)</span>
        </div>
      )}

      {/* Responsible gambling */}
      {user && (
        <div className="rounded-xl px-3 sm:px-4 py-2 sm:py-2.5 flex items-center gap-1.5 sm:gap-2 text-[10px] sm:text-xs" style={{
          border: '1px solid var(--border-light)',
          background: 'var(--bg-card)',
          color: 'var(--muted-gray)'
        }}>
          <span>🛡️</span>
          <span className="flex-1">เล่นอย่างมีความรับผิดชอบ — ตั้งวงเงินได้ที่โปรไฟล์ • ระบบจำลองเพื่อการศึกษา</span>
          <Link to="/legal" style={{ color: 'var(--gold-primary)' }} className="font-semibold shrink-0">ข้อกำหนด/PDPA →</Link>
        </div>
      )}

      {/* ticker ผลล่าสุด */}
      {resultCards.length > 0 && (
        <div className="rounded-xl overflow-hidden" style={{
          border: '1px solid var(--border-light)',
          background: 'var(--bg-card)'
        }}>
          <Marquee speed={45} className="py-2 text-xs">
            {resultCards.map(g => {
              const last = g.settled[0];
              return last ? (
                <span key={`${g.type_code}|${g.cat_code || ''}`} style={{ color: 'var(--muted-gray)' }}>
                  🏆 {g.label}: <b style={{ color: 'var(--gold-bright)' }}>{fmtDateTime(last.draw_at)}</b>
                </span>
              ) : null;
            })}
          </Marquee>
        </div>
      )}

      {/* ผลรางวัลล่าสุด — luxury cards */}
      {recentResults.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-end justify-between flex-wrap gap-2">
            <div>
              <div className="kicker mb-1">Latest Results</div>
              <h2 className="text-xl font-bold" style={{ color: 'var(--white)' }}>ผลรางวัลล่าสุด</h2>
              <p className="text-xs mt-0.5" style={{ color: 'var(--muted-gray)' }}>{recentResults.length} ตลาดล่าสุด — ดูย้อนหลังได้ที่หน้าผลรางวัล</p>
            </div>
            <Link to="/results" style={{ color: 'var(--gold-primary)' }} className="text-sm font-semibold">ผลรางวัลทั้งหมด →</Link>
          </div>
          {recentGroups.map(([code, items]) => (
            <div key={code}>
              <div className="flex items-center gap-1.5 mb-1.5">
                <FlagIcon code={code} className="w-4 h-4 text-[8px]" />
                <span className="text-xs font-bold" style={{ color: 'var(--light-gray)' }}>{GROUP_LABEL[code] || code}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5 sm:gap-2">
                {items.map(d => {
                  let w = d.winning;
                  if (typeof w === 'string') { try { w = JSON.parse(w); } catch { w = null; } }
                  const heroes = heroNumbers(w);
                  const badge = sourceBadge(d.result_source);
                  const sumAll = resultSummary(w) || [];
                  const ck = `${d.type_code}|${d.category_code || ''}`;
                  const open = !!cardOpen[ck];
                  return (
                    <div key={d.id}
                      className="rounded-xl px-2.5 sm:px-3 py-2 sm:py-2.5 transition" style={{
                        background: 'var(--bg-card)',
                        border: '1px solid var(--border-light)'
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.borderColor = 'var(--border-gold)';
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.borderColor = 'var(--border-light)';
                      }}>
                      <Link to="/results" className="block">
                      <div className="flex items-center gap-1 sm:gap-1.5 flex-wrap">
                        <FlagIcon code={d.type_code} className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[7px] sm:text-[8px]" />
                        <span className="text-[10px] sm:text-xs font-bold" style={{ color: 'var(--white)' }}>{d.category_name_th || d.type_name_th}</span>
                        <span className="text-[8px] sm:text-[9px] px-1 sm:px-1.5 py-0.5 rounded font-bold" style={{
                          background: 'rgba(34, 197, 94, 0.15)',
                          color: 'var(--success-green)',
                          border: '1px solid rgba(34, 197, 94, 0.3)'
                        }}>ออกผลแล้ว</span>
                        {badge && <span className={`text-[8px] sm:text-[9px] px-1 sm:px-1.5 py-0.5 rounded ${badge.cls}`}>{badge.short}</span>}
                      </div>
                      <div className="text-[9px] sm:text-[10px] mt-0.5 sm:mt-1" style={{ color: 'var(--muted-gray)' }}>งวดวันที่ {thaiDate(d.draw_at)}</div>
                      {heroes.length > 0 && (
                        <div className="grid grid-cols-3 gap-0.5 sm:gap-1 mt-1.5 sm:mt-2">
                          {heroes.map(h => (
                            <div key={h.label} className="text-center rounded-lg py-1 sm:py-1.5 px-0.5 sm:px-1" style={{ background: 'var(--bg-dark-surface)' }}>
                              <div className="text-[7px] sm:text-[8px] leading-tight" style={{ color: 'var(--muted-gray)' }}>{h.label}</div>
                              <div className="font-mono font-bold text-xs sm:text-sm leading-tight mt-0.5 break-all" style={{ color: 'var(--gold-bright)' }}>{h.num}</div>
                            </div>
                          ))}
                        </div>
                      )}
                      </Link>
                      {sumAll.length > 0 && (
                        <button onClick={() => setCardOpen(e => ({ ...e, [ck]: !open }))}
                          className="mt-1 sm:mt-1.5 w-full text-left text-xs sm:text-sm font-bold transition" style={{ color: 'var(--muted-gray)' }}>
                          {open ? '▾ ย่อผลทุกรางวัล' : '▸ ดูผลทุกรางวัล'}
                        </button>
                      )}
                      {open && sumAll.length > 0 && (
                        <div className="mt-0.5 sm:mt-1 text-sm sm:text-base font-mono font-bold leading-relaxed break-all rounded-lg px-1.5 sm:px-2 py-1.5 sm:py-2" style={{
                          color: 'var(--light-gray)',
                          background: 'var(--bg-dark-surface)'
                        }}>
                          {sumAll.map((p, i) => <div key={i}>{p}</div>)}
                        </div>
                      )}
                      <div className="text-[8px] sm:text-[9px] mt-1 sm:mt-1.5" style={{ color: 'var(--dark-gray)' }}>
                        แหล่ง: {sourceName(d.result_source)} · อัปเดต {thaiTime(d.published_at || d.draw_at)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
