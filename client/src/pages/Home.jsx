import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { api, fmtDateTime, satang } from '../api.js';
import { useAuth } from '../auth.jsx';
import { FlagIcon } from '../components/ResultLine.jsx';
import { typeAccent } from '../typeAccent.js';
import { marketInfo, MODE_BADGE, sourceBadge, isOfficial } from '../resultSource.js';

// ผลย่อกระชับสำหรับการ์ดผลรางวัล — เฉพาะเลขหลักที่คนดูบ่อย
const asList = (v) => Array.isArray(v) ? v.join(' ') : (v ?? '');
function compactResult(w) {
  if (!w) return null;
  const parts = [];
  const firstOf = (v) => (Array.isArray(v) ? v[0] : v);
  if (w.p1) { parts.push(`อ.1 ${firstOf(w.p1)}`); if (w.p2) parts.push(`อ.2 ${firstOf(w.p2)}`); }
  else if (w.first) parts.push(`รางวัล1 ${w.first}`);
  if (w.last4) parts.push(`ท้าย4 ${w.last4}`);
  if (w.main || w.num4) parts.push(w.main || w.num4);
  if (w.zodiac) parts.push(w.zodiac);
  const top = w.top3 ?? w.last3 ?? w.front3;
  const bot = w.bottom2 ?? w.last2 ?? w.top2;
  if (top) parts.push(`บน ${asList(top)}`);
  if (bot) parts.push(`ล่าง ${asList(bot)}`);
  return parts.length ? parts.join(' · ') : null;
}

export default function Home() {
  const { user, demoNotice, isAdmin, balance } = useAuth();
  const [hiddenBetTypes, setHiddenBetTypes] = useState([]);
  const [cashbackPct, setCashbackPct] = useState(0); // โปรคืนยอดเสีย %/วัน — 0 = ปิด
  const [todayDraws, setTodayDraws] = useState([]); // ผล+รอบวันนี้สำหรับ section ผลรางวัล

  useEffect(() => {
    api('/lottery/public-config').then(r => {
      setHiddenBetTypes(Array.isArray(r.hiddenBetTypes) ? r.hiddenBetTypes : []);
      setCashbackPct(Number(r.cashbackPercent) || 0);
    }).catch(() => {});
    const loadToday = () => api('/lottery/today').then(r => setTodayDraws(r.draws || [])).catch(() => {});
    loadToday();
    const t = setInterval(loadToday, 30000); // refresh อัตโนมัติ — ผลใหม่ขึ้นเอง
    const h = () => loadToday();
    window.addEventListener('sys:update', h);
    return () => { clearInterval(t); window.removeEventListener('sys:update', h); };
  }, []);

  // admin ซ่อนเมนูแทงหวยรายประเภทได้ (blind mode) — admin เองเห็นทั้งหมดเสมอ
  const hiddenSet = new Set(hiddenBetTypes);
  const drawVisible = d => isAdmin || !hiddenSet.has(d.type_code);

  // ปุ่มลัดหลัก — portal-style: แทงหวย / เล่นเกม / ผลรางวัล / กระเป๋า (guest → เข้าสู่ระบบ)
  const quickActions = user ? [
    { to: '/play', icon: '🎯', label: 'แทงหวย', cls: 'from-red-600 to-rose-700', sub: 'เลือกรอบ' },
    { to: '/games', icon: '🎮', label: 'เล่นเกม', cls: 'from-violet-600 to-purple-700', sub: 'ด่วน' },
    { to: '/results', icon: '🏆', label: 'ผลรางวัล', cls: 'from-amber-600 to-yellow-700', sub: 'ล่าสุด' },
    { to: '/wallet', icon: '💳', label: 'กระเป๋า', cls: 'from-emerald-600 to-teal-700', sub: satang(balance) },
  ] : [
    { to: '/play', icon: '🎯', label: 'แทงหวย', cls: 'from-red-600 to-rose-700', sub: 'เลือกรอบ' },
    { to: '/games', icon: '🎮', label: 'เล่นเกม', cls: 'from-violet-600 to-purple-700', sub: 'ด่วน' },
    { to: '/results', icon: '🏆', label: 'ผลรางวัล', cls: 'from-amber-600 to-yellow-700', sub: 'ล่าสุด' },
    { to: '/register', icon: '👤', label: 'สมัครสมาชิก', cls: 'from-sky-600 to-blue-700', sub: 'เริ่มต้น' },
  ];

  // ผลรางวัลวันนี้ — เฉพาะตลาดที่มีผลจริงแล้ว ล่าสุดต่อ ตลาด
  const resultCards = (() => {
    // เฉพาะหวย — ไม่เอาเกมด่วน (สล็อต/ไฮโล/ยี่กี) มาแสดงในส่วนผลรางวัล
    const INSTANT = new Set(['SC', 'HL', 'KI', 'CF']); // เกมด่วนไม่มีรอบ — ราศี (HR) เป็นหวยจริง แสดงผลได้
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

  return (
    <div className="space-y-6">
      {/* welcome — member เท่านั้น */}
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

      {/* ปุ่มลัดหลัก — portal-style icon tiles */}
      <div className="grid grid-cols-4 gap-2 sm:gap-3">
        {quickActions.map(a => (
          <Link key={a.label} to={a.to}
            className={`rounded-2xl bg-gradient-to-br ${a.cls} py-4 px-2 flex flex-col items-center gap-1.5 text-white hover:brightness-110 active:scale-95 transition shadow-lg`}>
            <span className="text-2xl">{a.icon}</span>
            <span className="text-xs sm:text-sm font-bold">{a.label}</span>
            <span className="text-[9px] opacity-80 font-mono truncate max-w-full px-1">{a.sub}</span>
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

      {/* ผลรางวัลวันนี้ — ล่าสุดของแต่ละตลาด */}
      {resultCards.length > 0 && (
        <section>
          <div className="flex items-end justify-between mb-4 flex-wrap gap-2">
            <div>
              <h2 className="text-xl font-bold text-white">ผลรางวัลล่าสุด</h2>
              <p className="text-xs text-navy-400 mt-0.5">ของแต่ละตลาด — ดูย้อนหลังได้ที่หน้าผลรางวัล</p>
            </div>
            <Link to="/results" className="text-sm text-gold-400 hover:text-gold-300 font-semibold">ผลรางวัลทั้งหมด →</Link>
          </div>
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
            {resultCards.slice(0, 8).map(g => {
              const ac = typeAccent(g.type_code);
              const last = g.settled[0];
              const nxt = g.pending.find(d => d.status === 'open' || d.status === 'scheduled');
              const txt = last ? compactResult(last.winning) : null;
              const srcB = last ? sourceBadge(last.result_source) : null;
              const mi = marketInfo(g.type_code, g.cat_code);
              return (
                <Link key={`${g.type_code}|${g.cat_code || ''}`} to="/results"
                  className="bg-navy-800/70 border border-navy-700 hover:border-gold-500/40 rounded-xl p-3 transition group flex flex-col">
                  <div className="flex items-center gap-2">
                    <FlagIcon code={g.type_code} className="w-6 h-6 text-[10px]" />
                    <div className="min-w-0 flex-1">
                      <div className={`text-sm font-bold ${ac.text} truncate group-hover:text-gold-300 transition`}>{g.label}</div>
                      <div className="text-[10px] text-navy-500 font-mono truncate">{last?.draw_code || g.type_name_th}</div>
                    </div>
                    {last
                      ? (srcB && <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold shrink-0 ${srcB.cls}`} title={mi ? `ที่มา: ${mi.src}${mi.mode === 'auto' && !isOfficial(mi) ? ' — ไม่ใช่ผลทางการ' : ''}` : ''}>{srcB.short}</span>)
                      : (mi && <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold shrink-0 ${MODE_BADGE[mi.mode]?.cls || ''}`} title={mi.mode === 'auto' && !isOfficial(mi) ? 'ผลจากเว็บภายนอก — ไม่ใช่ผลทางการ' : ''}>{mi.mode === 'auto' && !isOfficial(mi) ? '⚠️ ' : ''}{MODE_BADGE[mi.mode]?.label}</span>)}
                  </div>
                  <div className="mt-2 flex-1 min-h-[1.25rem]">
                    {last ? (
                      <div className="text-xs font-mono tabular-nums text-slate-100 truncate" title={txt}>{txt}</div>
                    ) : (
                      <div className="text-[11px] text-navy-400 truncate">
                        {nxt ? `⏳ ถัดไป ${fmtDateTime(nxt.draw_at)}` : 'ไม่มีรอบวันนี้'}
                      </div>
                    )}
                  </div>
                  <div className="mt-3 pt-2 border-t border-navy-700/60 flex items-center justify-between text-[10px] text-navy-400">
                    <span>
                      {last ? `ออก ${fmtDateTime(last.draw_at)}` : nxt ? `ถัดไป ${fmtDateTime(nxt.draw_at)}` : '—'}
                      {g.settled.length > 1 && <span className="text-navy-500"> • วันนี้ {g.settled.length} งวด</span>}
                    </span>
                    <span className="truncate max-w-[45%]" title={mi?.src || ''}>{mi?.src || ''}</span>
                  </div>
                </Link>
              );
            })}
          </div>
          {resultCards.length > 8 && (
            <Link to="/results" className="mt-3 block text-center text-sm text-navy-300 hover:text-gold-300 transition">
              + อีก {resultCards.length - 8} ตลาด — ดูผลรางวัลทั้งหมด →
            </Link>
          )}
        </section>
      )}
    </div>
  );
}
