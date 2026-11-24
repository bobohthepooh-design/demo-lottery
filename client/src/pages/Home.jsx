import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { api, fmtDateTime, satang, thaiDate, thaiTime } from '../api.js';
import { useAuth } from '../auth.jsx';
import { FlagIcon } from '../components/ResultLine.jsx';
import Countdown from '../components/Countdown.jsx';
import { sourceBadge, sourceName } from '../resultSource.js';
import { heroNumbers, resultSummary } from '../resultFields.js';
import { Marquee } from '../components/ui/index.js';
const GROUP_ORDER = ['TH', 'LA', 'HN', 'GS', 'HR'];
const GROUP_LABEL = { TH: 'ไทย', LA: 'ลาว', HN: 'ฮานอย', GS: 'ออมสิน', HR: 'ราศี' };

export default function Home() {
  const { user, demoNotice, isAdmin, balance } = useAuth();
  const [hiddenBetTypes, setHiddenBetTypes] = useState([]);
  const [cashbackPct, setCashbackPct] = useState(0); // โปรคืนยอดเสีย %/วัน — 0 = ปิด
  const [todayDraws, setTodayDraws] = useState([]); // ผล+รอบวันนี้สำหรับ ticker
  const [latestResults, setLatestResults] = useState([]); // ผลล่าสุดข้ามตลาด (ไม่จำกัดวัน)
  const [cardOpen, setCardOpen] = useState({}); // การ์ดผลล่าสุด — ขยายดูผลทุกรางวัล

  useEffect(() => {
    api('/lottery/public-config').then(r => {
      setHiddenBetTypes(Array.isArray(r.hiddenBetTypes) ? r.hiddenBetTypes : []);
      setCashbackPct(Number(r.cashbackPercent) || 0);
    }).catch(() => {});
    const loadToday = () => api('/lottery/today').then(r => setTodayDraws(r.draws || [])).catch(() => {});
    // ผลล่าสุด 6 รายการข้ามตลาด (1 ต่อตลาด) — server กรองเกมด่วน/ราศีออกแล้ว
    const loadLatest = () => api('/lottery/latest-results?limit=6&exclude=SC,HL,KI,CF,HR').then(r => setLatestResults(r.draws || [])).catch(() => {});
    loadToday(); loadLatest();
    const t = setInterval(() => { loadToday(); loadLatest(); }, 30000); // refresh อัตโนมัติ — ผลใหม่ขึ้นเอง
    const h = () => { loadToday(); loadLatest(); };
    window.addEventListener('sys:update', h);
    return () => { clearInterval(t); window.removeEventListener('sys:update', h); };
  }, []);

  // admin ซ่อนเมนูแทงหวยรายประเภทได้ (blind mode) — admin เองเห็นทั้งหมดเสมอ
  const hiddenSet = new Set(hiddenBetTypes);
  const drawVisible = d => isAdmin || !hiddenSet.has(d.type_code);

  // รอบถัดไปที่เปิดรับ — แสดง countdown บน hero
  const nextOpen = todayDraws
    .filter(d => d.status === 'open' && drawVisible(d))
    .sort((a, b) => String(a.close_at).localeCompare(String(b.close_at)))[0] || null;

  // ปุ่มลัดหลัก — เรียบ template เดียวกันทุกปุ่ม (พื้น navy กลาง ไม่แสบตา)
  const quickActions = user ? [
    { to: '/play', icon: '🎯', label: 'แทงหวย', sub: 'เลือกรอบ' },
    { to: '/games', icon: '🎮', label: 'เล่นเกม', sub: 'ด่วน' },
    { to: '/results', icon: '🏆', label: 'ผลรางวัล', sub: 'ล่าสุด' },
    { to: '/wallet', icon: '💳', label: 'กระเป๋า', sub: satang(balance) },
  ] : [
    { to: '/play', icon: '🎯', label: 'แทงหวย', sub: 'เลือกรอบ' },
    { to: '/games', icon: '🎮', label: 'เล่นเกม', sub: 'ด่วน' },
    { to: '/results', icon: '🏆', label: 'ผลรางวัล', sub: 'ล่าสุด' },
    { to: '/register', icon: '👤', label: 'สมัครสมาชิก', sub: 'เริ่มต้น' },
  ];

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

      {/* hero — โต๊ะ felt 카지노 เหลี่ยมทอง (ใช้ทุกคน เห็นก่อนทุกอย่าง) */}
      <section className="casino-hero-felt casino-rail relative overflow-hidden rounded-3xl px-5 py-8 sm:px-12 sm:py-14 text-center">
        {/* เหรียญทองตกแต่งมุม — decorative เท่านั้น */}
        <div aria-hidden className="absolute rounded-full hidden sm:block" style={{
          width: '4.5rem', height: '4.5rem', top: '12%', left: '7%',
          background: 'radial-gradient(circle at 35% 30%, #fde68a, #d4af37 60%, #8a6405)',
          boxShadow: '0 8px 20px rgba(0,0,0,0.5), inset 0 0 0 4px rgba(120,85,10,0.5)',
          opacity: 0.9
        }} />
        <div aria-hidden className="absolute rounded-full hidden sm:block" style={{
          width: '3rem', height: '3rem', bottom: '14%', right: '9%',
          background: 'radial-gradient(circle at 35% 30%, #3a3f4a, #14171f 65%, #05070c)',
          boxShadow: '0 8px 20px rgba(0,0,0,0.5), inset 0 0 0 3px rgba(212,175,55,0.4)',
          opacity: 0.9
        }} />
        <div className="relative">
          <div className="text-[10px] sm:text-xs font-bold tracking-[0.3em] uppercase" style={{ color: 'var(--gold-primary)' }}>
            ระบบสาธิต · Demo Lottery
          </div>
          <h1 className="font-display font-black leading-tight mt-2" style={{ fontSize: 'clamp(1.9rem, 6.5vw, 3.25rem)' }}>
            <span style={{
              background: 'linear-gradient(100deg, #F5D76E 10%, #D4AF37 50%, #F5D76E 90%)',
              WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
              filter: 'drop-shadow(0 2px 14px rgba(212, 175, 55, 0.35))'
            }}>หวยออนไลน์</span>
          </h1>
          <p className="mt-2 text-xs sm:text-sm md:text-base max-w-md mx-auto leading-relaxed" style={{ color: 'var(--light-gray)' }}>
            เลือกตลาด เลือกเลข ส่งโพยในไม่กี่แตะ — ผลรางวัลอัปเดตอัตโนมัติ<br className="hidden sm:block" />
            <span className="text-[10px] sm:text-xs" style={{ color: 'var(--muted-gray)' }}>ระบบสาธิต • ใช้เครดิตเสมือนเพื่อการศึกษาเท่านั้น</span>
          </p>
          {nextOpen && (
            <div className="mt-4 inline-flex items-center gap-2 rounded-full px-4 py-1.5 sm:py-2" style={{
              background: 'rgba(0,0,0,0.45)',
              border: '1px solid var(--border-gold)',
              boxShadow: 'var(--shadow-md)'
            }}>
              <span className="text-xs" style={{ color: 'var(--muted-gray)' }}>🔥 รอบถัดไปปิดรับใน</span>
              <span style={{ color: 'var(--gold-bright)', fontFamily: 'monospace', fontWeight: 800, fontSize: '0.85rem' }}>
                <Countdown closeAt={nextOpen.close_at} />
              </span>
            </div>
          )}
          <div className="mt-5 flex flex-wrap justify-center gap-2.5 sm:gap-3">
            <Link to="/play" className="px-6 py-2.5 sm:px-7 sm:py-3 rounded-xl font-bold text-sm sm:text-base transition hover:-translate-y-0.5" style={{
              background: 'linear-gradient(135deg, var(--gold-gradient-start), var(--gold-gradient-end))',
              color: 'var(--bg-deep-black)',
              boxShadow: 'var(--shadow-gold-lg)'
            }}>🎯 แทงเลย</Link>
            <Link to="/results" className="px-6 py-2.5 sm:px-7 sm:py-3 rounded-xl font-bold text-sm sm:text-base transition hover:-translate-y-0.5" style={{
              border: '1px solid var(--border-gold)',
              color: 'var(--gold-primary)',
              background: 'rgba(0,0,0,0.35)',
              backdropFilter: 'blur(4px)'
            }}>🏆 ผลรางวัล</Link>
            {!user && (
              <Link to="/register" className="px-6 py-2.5 sm:px-7 sm:py-3 rounded-xl font-bold text-sm sm:text-base transition hover:-translate-y-0.5" style={{
                border: '1px solid var(--border-light)',
                color: 'var(--white)',
                background: 'rgba(255,255,255,0.06)'
              }}>👤 สมัครสมาชิก</Link>
            )}
          </div>
        </div>
      </section>

      {/* ปุ่มลัดหลัก — luxury icon tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3 lg:gap-4">
        {quickActions.map(a => (
          <Link key={a.label} to={a.to}
            className="group relative rounded-2xl py-3 sm:py-4 px-1.5 sm:px-2 flex flex-col items-center gap-1.5 sm:gap-2 transition-all duration-200 active:scale-95"
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-light)'
            }}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = 'var(--border-gold)';
              e.currentTarget.style.boxShadow = 'var(--shadow-gold)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = 'var(--border-light)';
              e.currentTarget.style.boxShadow = 'none';
            }}>
            <span className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center text-lg sm:text-xl shrink-0 transition group-hover:scale-110" style={{
              background: 'linear-gradient(135deg, rgba(212, 175, 55, 0.18), rgba(212, 175, 55, 0.06))',
              border: '1px solid var(--border-gold)',
              boxShadow: 'var(--shadow-sm)'
            }}>{a.icon}</span>
            <div className="text-center">
              <div className="text-xs sm:text-sm font-bold tracking-wide" style={{ color: 'var(--white)' }}>{a.label}</div>
              <div className="text-[9px] sm:text-[10px] opacity-80 font-mono truncate max-w-full px-0.5 sm:px-1 mt-0.5" style={{ color: 'var(--muted-gray)' }}>{a.sub}</div>
            </div>
          </Link>
        ))}
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
                          className="mt-1 sm:mt-1.5 w-full text-left text-[9px] sm:text-[10px] transition" style={{ color: 'var(--muted-gray)' }}>
                          {open ? '▾ ย่อผลทุกรางวัล' : '▸ ดูผลทุกรางวัล'}
                        </button>
                      )}
                      {open && sumAll.length > 0 && (
                        <div className="mt-0.5 sm:mt-1 text-[9px] sm:text-[10px] font-mono leading-relaxed break-all rounded-lg px-1.5 sm:px-2 py-1 sm:py-1.5" style={{
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
