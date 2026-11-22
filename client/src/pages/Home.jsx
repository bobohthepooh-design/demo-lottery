import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { api, fmtDateTime, satang } from '../api.js';
import { useAuth } from '../auth.jsx';
import ResultLine from '../components/ResultLine.jsx';
import { Marquee } from '../components/ui/index.js';

export default function Home() {
  const { user, demoNotice, isAdmin, balance } = useAuth();
  const [hiddenBetTypes, setHiddenBetTypes] = useState([]);
  const [cashbackPct, setCashbackPct] = useState(0); // โปรคืนยอดเสีย %/วัน — 0 = ปิด
  const [todayDraws, setTodayDraws] = useState([]); // ผล+รอบวันนี้สำหรับ ticker
  const [latestResults, setLatestResults] = useState([]); // ผลล่าสุดข้ามตลาด (ไม่จำกัดวัน)

  useEffect(() => {
    api('/lottery/public-config').then(r => {
      setHiddenBetTypes(Array.isArray(r.hiddenBetTypes) ? r.hiddenBetTypes : []);
      setCashbackPct(Number(r.cashbackPercent) || 0);
    }).catch(() => {});
    const loadToday = () => api('/lottery/today').then(r => setTodayDraws(r.draws || [])).catch(() => {});
    // ผลล่าสุด 4 รายการข้ามตลาด — server กรองเกมด่วน/ราศีออกแล้ว
    const loadLatest = () => api('/lottery/latest-results?limit=4&exclude=SC,HL,KI,CF,HR').then(r => setLatestResults(r.draws || [])).catch(() => {});
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

  // ผลรางวัล 4 รายการล่าสุด — จาก endpoint ข้ามตลาด (fallback todayDraws ถ้า endpoint ไม่มีข้อมูล)
  const recentResults = (() => {
    const src = latestResults.length ? latestResults : todayDraws;
    const INSTANT = new Set(['SC', 'HL', 'KI', 'CF', 'HR']);
    return src
      .filter(d => drawVisible(d) && !INSTANT.has(d.type_code) && d.winning)
      .sort((a, b) => String(b.draw_at).localeCompare(String(a.draw_at)))
      .slice(0, 4);
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

      {/* ผลรางวัล 4 รายการล่าสุด — เรียงตามเวลาจริง */}
      {recentResults.length > 0 && (
        <section>
          <div className="flex items-end justify-between mb-4 flex-wrap gap-2">
            <div>
              <div className="kicker mb-1">Latest Results</div>
              <h2 className="text-xl font-bold text-white">ผลรางวัลล่าสุด</h2>
              <p className="text-xs text-navy-400 mt-0.5">4 รายการล่าสุด — ดูย้อนหลังได้ที่หน้าผลรางวัล</p>
            </div>
            <Link to="/results" className="text-sm text-gold-400 hover:text-gold-300 font-semibold">ผลรางวัลทั้งหมด →</Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {recentResults.map(d => (
              <Link key={d.id} to="/results"
                className="group transition hover:-translate-y-0.5">
                <ResultLine r={d} compact />
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
