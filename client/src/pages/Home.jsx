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
        <div className="suit-pattern flex items-center gap-3 bg-navy-800/80 border border-gold-500/40 rounded-2xl px-4 py-3 shadow-[0_0_20px_rgba(244,201,78,0.08)]">
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
          <span className="shrink-0 text-[10px] font-black px-2.5 py-1 rounded-full bg-gradient-to-r from-gold-300 to-gold-500 text-navy-950 border border-gold-400/60 shadow-sm tracking-wider">
            DEMO MODE
          </span>
        </div>
      )}

      {/* ปุ่มลัดหลัก — modern icon tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        {quickActions.map(a => (
          <Link key={a.label} to={a.to}
            className="group relative rounded-2xl bg-navy-800/70 border border-navy-600 py-4 px-2 flex flex-col items-center gap-2 text-white transition-all duration-200 hover:bg-navy-700/70 hover:border-gold-400/50 hover:shadow-lg hover:shadow-gold-500/10 active:scale-95">
            <span className="text-2xl drop-shadow-lg">{a.icon}</span>
            <div className="text-center">
              <div className="text-sm font-bold tracking-wide">{a.label}</div>
              <div className="text-[10px] opacity-80 font-mono truncate max-w-full px-1 mt-0.5">{a.sub}</div>
            </div>
          </Link>
        ))}
      </div>

      {/* โปร cashback — แสดงเมื่อ admin เปิดใช้ */}
      {cashbackPct > 0 && (
        <div className="rounded-xl border border-gold-500/40 bg-gradient-to-r from-gold-500/15 via-navy-800/60 to-gold-500/15 px-4 py-2.5 flex items-center gap-2 text-sm">
          <span className="text-lg">🎁</span>
          <span className="text-gold-200">โปรโมชั่น: <b className="text-gold-300">คืนยอดเสีย {cashbackPct}%</b> ทุกวัน — คำนวณจากผลการแทงย้อนหลัง 24 ชม. (เครดิตเสมือนเพื่อการศึกษา)</span>
        </div>
      )}

      {/* Responsible gambling — เตือนเบาๆ + ลิงก์เอกสาร */}
      {user && (
        <div className="rounded-xl border border-navy-700 bg-navy-800/50 px-4 py-2.5 flex items-center gap-2 text-xs text-navy-400">
          <span>🛡️</span>
          <span className="flex-1">เล่นอย่างมีความรับผิดชอบ — ตั้งวงเงินได้ที่โปรไฟล์ • ระบบจำลองเพื่อการศึกษา</span>
          <Link to="/legal" className="text-gold-400 hover:text-gold-300 font-semibold shrink-0">ข้อกำหนด/PDPA →</Link>
        </div>
      )}

      {/* ticker ผลล่าสุดวิ่ง — Magic UI marquee */}
      {resultCards.length > 0 && (
        <div className="rounded-xl border border-navy-700 bg-navy-900/60 overflow-hidden">
          <Marquee speed={45} className="py-2 text-xs">
            {resultCards.map(g => {
              const last = g.settled[0];
              return last ? (
                <span key={`${g.type_code}|${g.cat_code || ''}`} className="text-navy-300">
                  🏆 {g.label}: <b className="text-gold-300">{fmtDateTime(last.draw_at)}</b>
                </span>
              ) : null;
            })}
          </Marquee>
        </div>
      )}

      {/* ผลรางวัลล่าสุด — การ์ดแบบเดียวกับหน้า Results (LC-style) เฉพาะ 5-6 รายการล่าสุด */}
      {recentResults.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-end justify-between flex-wrap gap-2">
            <div>
              <div className="kicker mb-1">Latest Results</div>
              <h2 className="text-xl font-bold text-white">ผลรางวัลล่าสุด</h2>
              <p className="text-xs text-navy-400 mt-0.5">{recentResults.length} ตลาดล่าสุด — ดูย้อนหลังได้ที่หน้าผลรางวัล</p>
            </div>
            <Link to="/results" className="text-sm text-gold-400 hover:text-gold-300 font-semibold">ผลรางวัลทั้งหมด →</Link>
          </div>
          {recentGroups.map(([code, items]) => (
            <div key={code}>
              <div className="flex items-center gap-1.5 mb-1.5">
                <FlagIcon code={code} className="w-4 h-4 text-[8px]" />
                <span className="text-xs font-bold text-navy-200">{GROUP_LABEL[code] || code}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
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
                      className="bg-navy-800/70 border border-navy-700/60 rounded-xl px-3 py-2.5 hover:border-gold-500/40 transition">
                      <Link to="/results" className="block">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <FlagIcon code={d.type_code} className="w-4 h-4 text-[8px]" />
                        <span className="text-xs font-bold text-white">{d.category_name_th || d.type_name_th}</span>
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/40 font-bold">ออกผลแล้ว</span>
                        {badge && <span className={`text-[9px] px-1.5 py-0.5 rounded ${badge.cls}`}>{badge.short}</span>}
                      </div>
                      <div className="text-[10px] text-navy-400 mt-1">งวดวันที่ {thaiDate(d.draw_at)}</div>
                      {heroes.length > 0 && (
                        <div className="grid grid-cols-3 gap-1 mt-2">
                          {heroes.map(h => (
                            <div key={h.label} className="text-center bg-navy-900/60 rounded-lg py-1.5 px-1">
                              <div className="text-[8px] text-navy-400 leading-tight">{h.label}</div>
                              <div className="font-mono font-bold text-gold-300 text-sm leading-tight mt-0.5 break-all">{h.num}</div>
                            </div>
                          ))}
                        </div>
                      )}
                      </Link>
                      {sumAll.length > 0 && (
                        <button onClick={() => setCardOpen(e => ({ ...e, [ck]: !open }))}
                          className="mt-1.5 w-full text-left text-[10px] text-navy-400 hover:text-gold-300 transition">
                          {open ? '▾ ย่อผลทุกรางวัล' : '▸ ดูผลทุกรางวัล'}
                        </button>
                      )}
                      {open && sumAll.length > 0 && (
                        <div className="mt-1 text-[10px] text-navy-200 bg-navy-900/70 rounded-lg px-2 py-1.5 font-mono leading-relaxed break-all">
                          {sumAll.map((p, i) => <div key={i}>{p}</div>)}
                        </div>
                      )}
                      <div className="text-[9px] text-navy-500 mt-1.5">
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
