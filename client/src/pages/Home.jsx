import { Link, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { api, fmtDateTime, thaiDate, thaiTime, satang } from '../api.js';
import { useAuth } from '../auth.jsx';
import { FlagIcon } from '../components/ResultLine.jsx';
import { resultSchema } from '../lotterySchema.js';
import { SkeletonGrid } from '../components/Skeleton.jsx';
import { typeAccent } from '../typeAccent.js';
import { mergeBanner } from '../bannerConfig.js';

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

// ระยะเวลาที่เหลือแบบอ่านเข้าใจง่าย ไม่ให้สับสนกับเวลาดน.
function durationText(closeAtSql, now) {
  const diff = msLeft(closeAtSql, now);
  if (diff <= 0) return 'ปิดรับแล้ว';
  const sec = Math.floor(diff / 1000);
  const d = Math.floor(sec / 86400), h = Math.floor(sec % 86400 / 3600);
  const m = Math.floor(sec % 3600 / 60), s = sec % 60;
  if (d > 0) return `อีก ${d} วัน ${h} ชม. ${m} นาที`;
  if (h > 0) return `อีก ${h} ชม. ${m} นาที ${s} วินาที`;
  if (m > 0) return `อีก ${m} นาที ${s} วินาที`;
  return `อีก ${s} วินาที`;
}

// แถวรอบหวยของแต่ละประเทศ/หมวด — แสดงเวลาออกรางวัล + นับถอยหลังปิดรับ
function DrawLine({ d, now }) {
  const closed = d.status !== 'open';
  return (
    <div className="bg-navy-800/70 border border-navy-700/60 rounded-lg px-3 py-1.5 flex items-center gap-2 overflow-x-auto whitespace-nowrap">
      <FlagIcon code={d.type_code} className="w-5 h-5 text-[9px]" />
      <span className={`text-[11px] font-semibold shrink-0 ${typeAccent(d.type_code).text}`}>
        {d.type_name_th}{d.category_name_th ? ` ${d.category_name_th}` : ''}
      </span>
      <span className="text-[10px] text-navy-400 shrink-0">ออก {fmtDateTime(d.draw_at)}</span>
      <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded shrink-0 ${closed ? 'bg-navy-700 text-navy-400' : 'bg-gold-500/15 text-gold-300'}`}>
        {closed ? 'ปิดรับแล้ว' : `⏳ ${countdownText(d.close_at, now)}`}
      </span>
    </div>
  );
}

// แถว ticker ผลรางวัล — เลขเด่นๆ จาก schema
function tickerText(r) {
  let data = r.winning_numbers;
  if (typeof data === 'string') { try { data = JSON.parse(data); } catch { data = {}; } }
  const schema = resultSchema(r.type_code, r.category_code);
  const fields = (schema?.fields || []).filter(f => !f.optional && f.key !== 'main');
  const parts = fields.map(f => {
    const v = data?.[f.key];
    const vals = Array.isArray(v) ? v.join(', ') : v;
    return vals ? `${f.short || f.label} ${vals}` : null;
  }).filter(Boolean);
  const upd = r.published_at ? ` • อัปเดต ${thaiDate(r.published_at)} ${thaiTime(r.published_at)} น.` : '';
  const src = r.source === 'manual' ? ' • ✏️ กรอกเอง' : r.source === 'auto' ? ' • 🤖 อัตโนมัติ' : '';
  return `${r.type_name_th}${r.category_name_th ? ` ${r.category_name_th}` : ''}: ${parts.join(' • ') || '—'}${src}${upd}`;
}

// นับถอยหลังแบบตัวเลขใหญ่สำหรับ hero card
function BigCountdown({ closeAt }) {
  const [left, setLeft] = useState(() => {
    const t = new Date(String(closeAt).replace(' ', 'T') + 'Z').getTime();
    return isNaN(t) ? 0 : Math.max(0, Math.floor((t - Date.now()) / 1000));
  });
  useEffect(() => {
    const t = setInterval(() => {
      const tt = new Date(String(closeAt).replace(' ', 'T') + 'Z').getTime();
      setLeft(isNaN(tt) ? 0 : Math.max(0, Math.floor((tt - Date.now()) / 1000)));
    }, 1000);
    return () => clearInterval(t);
  }, [closeAt]);
  if (left <= 0) return <span className="text-red-400 font-bold">ปิดรับแล้ว</span>;
  const d = Math.floor(left / 86400), h = Math.floor(left % 86400 / 3600);
  const m = Math.floor(left % 3600 / 60), s = left % 60;
  const p = n => String(n).padStart(2, '0');
  const cells = d > 0
    ? [[d, 'วัน'], [h, 'ชม.'], [m, 'นาที'], [s, 'วิ']]
    : [[h, 'ชม.'], [m, 'นาที'], [s, 'วิ']];
  return (
    <div className="flex items-end gap-2 justify-center">
      {cells.map(([v, label], i) => (
        <div key={i} className="text-center">
          <div className="font-mono font-black text-3xl sm:text-4xl text-gold-300"
            style={{ textShadow: '0 0 18px rgba(212,175,55,.45)' }}>{p(v)}</div>
          <div className="text-[10px] text-navy-300">{label}</div>
        </div>
      ))}
    </div>
  );
}

export default function Home() {
  const { user, balance } = useAuth();
  const navigate = useNavigate();
  const now = useNow();
  const [types, setTypes] = useState([]);
  const [draws, setDraws] = useState([]);
  const [results, setResults] = useState([]);
  const [banner, setBanner] = useState(null);

  useEffect(() => {
    api('/lottery/types').then(r => setTypes(r.types)).catch(() => {});
    api('/lottery/draws?upcoming=1').then(r => setDraws(r.draws)).catch(() => {});
    api('/lottery/results').then(r => setResults(r.results)).catch(() => {});
    api('/lottery/public-config').then(r => setBanner(mergeBanner(r.banner))).catch(() => {});
  }, [user]);

  // รอบเปิดรับที่ใกล้ปิดสุดของแต่ละประเทศ/หมวด
  const openByCategory = [];
  const seenDraw = new Set();
  const sorted = [...draws]
    .filter(d => d.status === 'open' || d.status === 'scheduled')
    .sort((a, b) => String(a.close_at).localeCompare(String(b.close_at)));
  for (const d of sorted) {
    const key = `${d.type_code}:${d.category_code || ''}`;
    if (seenDraw.has(key)) continue;
    seenDraw.add(key);
    openByCategory.push(d);
  }

  // แจ้งเตือนรอบที่ใกล้ปิดรับสุด (สูงสุด 3 รอบ) — กระพริบแดงเมื่อเหลือ < 1 ชม.
  const alertDraws = sorted
    .filter(d => d.status === 'open' && msLeft(d.close_at, now) > 0)
    .slice(0, 3);

  const openCount = draws.filter(d => d.status === 'open').length;
  const b = mergeBanner(banner);

  return (
    <div className="space-y-8">
      {/* Hero — ดึงดูดให้เข้ามาแทง (ข้อความแก้ไขได้ที่ /admin/banner) */}
      {b.enabled && (
      <section className="relative overflow-hidden rounded-2xl border border-gold-500/40 bg-gradient-to-br from-navy-800 via-navy-900 to-navy-950 px-5 py-8 sm:px-10 sm:py-12 text-center">
        <div className="absolute -top-16 -left-16 w-56 h-56 rounded-full bg-gold-500/15 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-16 -right-16 w-56 h-56 rounded-full bg-blue-500/15 blur-3xl pointer-events-none" />
        <div className="relative">
          <div className="text-4xl sm:text-5xl mb-2 animate-float">{b.emoji}</div>
          <h1 className="text-2xl sm:text-4xl font-black leading-tight">
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-gold-300 via-gold-400 to-gold-500">
              {b.title}
            </span>
          </h1>
          <p className="text-navy-200 text-sm sm:text-base mt-2">
            {b.markets}
          </p>
          <p className="text-gold-300/90 text-xs sm:text-sm mt-1 font-semibold">
            ✨ {b.promo} ✨
          </p>
          <div className="flex items-center justify-center gap-3 mt-5 flex-wrap">
            <Link to="/lotteries"
              className="bg-gradient-to-r from-gold-500 to-gold-600 text-navy-950 font-bold px-7 py-3 rounded-xl text-sm sm:text-base shadow-lg shadow-gold-500/25 hover:brightness-110 transition">
              {b.cta_bet}
            </Link>
            {!user && (
              <Link to="/register"
                className="border border-gold-500/50 text-gold-300 font-semibold px-6 py-3 rounded-xl text-sm sm:text-base hover:bg-navy-700/60 transition">
                {b.cta_register}
              </Link>
            )}
          </div>
          {/* สถิติสด */}
          {b.show_stats && (
          <div className="flex items-center justify-center gap-4 sm:gap-8 mt-6 text-xs sm:text-sm flex-wrap">
            <div><span className="text-gold-300 font-bold text-lg">{openCount}</span> <span className="text-navy-300">รอบเปิดรับ</span></div>
            <div className="w-px h-6 bg-navy-600 hidden sm:block" />
            <div><span className="text-gold-300 font-bold text-lg">{types.length}</span> <span className="text-navy-300">ตลาดหวย</span></div>
            <div className="w-px h-6 bg-navy-600 hidden sm:block" />
            <div><span className="text-gold-300 font-bold text-lg">x1,000</span> <span className="text-navy-300">อัตราจ่ายสูงสุด</span></div>
          </div>
          )}
        </div>
      </section>
      )}

      {/* รอบที่ใกล้ปิดรับที่สุด + กระเป๋าเครดิต (login) */}
      {alertDraws.length > 0 && (
        <section className="grid lg:grid-cols-3 gap-4">
          {/* countdown ใหญ่ — รอบปิดเร็วสุด */}
          {(() => {
            const d = alertDraws[0];
            const ac = typeAccent(d.type_code);
            return (
              <div className={`lg:col-span-2 relative overflow-hidden rounded-2xl border ${ac.border} bg-gradient-to-br from-navy-800 via-navy-900 to-navy-950 p-5 sm:p-6`}>
                <div className={`absolute -top-10 -right-10 w-40 h-40 rounded-full ${ac.bar} opacity-10 blur-3xl pointer-events-none`} />
                <div className="flex items-center gap-2 text-xs font-bold text-navy-300 mb-3">
                  <span className="inline-block w-2 h-2 rounded-full bg-red-400 animate-pulse" />
                  รอบที่ใกล้ปิดรับที่สุด
                  {alertDraws.length > 1 && <span className="text-navy-500 font-normal">(และอีก {alertDraws.length - 1} รอบ)</span>}
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                  <FlagIcon code={d.type_code} className="w-10 h-10 text-xs" />
                  <div>
                    <div className={`font-bold text-lg ${ac.text}`}>
                      {d.type_name_th}{d.category_name_th ? ` ${d.category_name_th}` : ''}
                    </div>
                    <div className="text-xs text-navy-300">ออกรางวัล {fmtDateTime(d.draw_at)} • ปิดรับ {thaiTime(d.close_at)} น.</div>
                  </div>
                </div>
                <div className="my-4"><BigCountdown closeAt={d.close_at} /></div>
                <div className="flex justify-center">
                  {user ? (
                    <button onClick={() => navigate(`/bet/${d.id}`)}
                      className="bg-gradient-to-r from-gold-500 to-gold-600 text-navy-950 font-bold px-8 py-3 rounded-xl text-sm shadow-lg shadow-gold-500/25 hover:brightness-110 transition">
                      🎟️ แทงรอบนี้เลย
                    </button>
                  ) : (
                    <Link to="/login" className="bg-gradient-to-r from-gold-500 to-gold-600 text-navy-950 font-bold px-8 py-3 rounded-xl text-sm shadow-lg shadow-gold-500/25 hover:brightness-110 transition">
                      เข้าสู่ระบบเพื่อแทง
                    </Link>
                  )}
                </div>
              </div>
            );
          })()}

          {/* กระเป๋าเครดิต — เฉพาะสมาชิก */}
          {user && (
            <div className="bg-gradient-to-b from-navy-800 to-navy-900 border border-gold-500/40 rounded-2xl p-5 flex flex-col justify-between">
              <div>
                <div className="text-xs text-navy-300">เครดิตของคุณ</div>
                <div className="text-3xl font-black text-gold-400 mt-1">฿{satang(balance)}</div>
              </div>
              <div className="flex gap-2 mt-4">
                <button onClick={() => navigate('/wallet?action=deposit')}
                  className="flex-1 bg-gold-500 text-navy-950 text-xs font-bold py-2.5 rounded-lg hover:bg-gold-400">
                  ＋ เติมเครดิต
                </button>
                <button onClick={() => navigate('/wallet?action=withdraw')}
                  className="flex-1 border border-navy-500 text-navy-200 text-xs font-semibold py-2.5 rounded-lg hover:bg-navy-700">
                  － ถอนเครดิต
                </button>
              </div>
              <Link to="/wallet" className="block text-center text-[11px] text-navy-400 hover:text-gold-300 mt-2">ดูประวัติธุรกรรม →</Link>
            </div>
          )}
        </section>
      )}

      {/* Ticker ผลรางวัลล่าสุดแบบเลื่อน */}
      {results.length > 0 && (
        <div className="bg-navy-800/80 border border-gold-500/30 rounded-xl overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-1.5 bg-gold-500/10 border-b border-gold-500/20">
            <span className="text-xs font-bold text-gold-300">📢 ผลรางวัลล่าสุด</span>
            <span className="text-[10px] text-navy-400">(ชี้เพื่อหยุดเลื่อน)</span>
          </div>
          <div className="overflow-hidden py-1.5">
            <div className="flex w-max animate-marquee gap-8 px-4">
              {[...results, ...results].map((r, i) => (
                <span key={i} className="text-xs text-navy-200 whitespace-nowrap flex items-center gap-1.5">
                  <FlagIcon code={r.type_code} className="w-5 h-5 text-[9px]" />
                  {tickerText(r)}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* แจ้งเตือนเวลาปิดรับโพย — แบบข้อความวิ่งประหยัดพื้นที่ */}
      {alertDraws.length > 0 && (
        <div className="bg-gradient-to-r from-amber-500/15 to-red-500/10 border border-amber-500/40 rounded-xl overflow-hidden">
          <div className="flex items-center">
            <span className="shrink-0 px-3 py-1.5 text-[11px] font-bold text-amber-300 bg-amber-500/15 border-r border-amber-500/30">
              🔔 ใกล้ปิดรับ
            </span>
            <div className="overflow-hidden flex-1 py-1.5">
              <div className="flex w-max animate-marquee-fast gap-10 px-4">
                {[...alertDraws, ...alertDraws].map((d, i) => {
                  const left = msLeft(d.close_at, now);
                  const urgent = left > 0 && left < 3600e3;
                  return (
                    <span key={i} className="text-xs whitespace-nowrap flex items-center gap-1.5">
                      <FlagIcon code={d.type_code} className="w-4 h-4 text-[8px]" />
                      <span className="font-semibold text-white">
                        {d.type_name_th}{d.category_name_th ? ` ${d.category_name_th}` : ''}
                      </span>
                      <span className="text-navy-400">ปิด {thaiTime(d.close_at)} น.</span>
                      <span className={`font-bold px-1.5 py-0.5 rounded ${urgent ? 'bg-red-500/25 text-red-300' : 'bg-amber-500/20 text-amber-300'}`}>
                        {durationText(d.close_at, now)}
                      </span>
                    </span>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ประเภทหวยที่รองรับ + รอบที่เปิดรับ/นับถอยหลังของแต่ละประเทศ */}
      <section>
        <h2 className="text-xl font-bold text-white mb-4">ประเภทหวยที่รองรับ</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {types.map(t => {
            const typeDraws = openByCategory.filter(d => d.type_code === t.code);
            const ac = typeAccent(t.code);
            return (
              <div key={t.id} className={`bg-gradient-to-b from-navy-800 to-navy-900 border border-navy-700 rounded-xl p-4 pt-3 flex flex-col hoverable ${ac.glow}`}>
                <div className={`h-1 w-10 rounded-full mb-2 ${ac.bar}`} />
                <Link to={`/lotteries?type=${t.id}`} className="group">
                  <FlagIcon code={t.code} className="w-9 h-9 text-xs mb-1" />
                  <div className={`font-bold ${ac.text} group-hover:brightness-125`}>{t.name_th}</div>
                  <div className="text-xs text-navy-300 mt-1 mb-3">{t.description}</div>
                </Link>
                {typeDraws.length > 0 ? (
                  <div className="space-y-1 mt-auto pt-3">
                    {typeDraws.slice(0, 4).map(d => <DrawLine key={d.id} d={d} now={now} />)}
                    {typeDraws.length > 4 && (
                      <div className="text-[10px] text-navy-500 text-center">+อีก {typeDraws.length - 4} รอบ</div>
                    )}
                    <Link to={`/lotteries?type=${t.id}`}
                      className="block mt-2 text-center text-xs font-bold bg-gold-500/15 text-gold-300 border border-gold-500/40 rounded-lg py-1.5 hover:bg-gold-500/25 transition">
                      🎟️ แทงรอบนี้เลย →
                    </Link>
                  </div>
                ) : (
                  <div className="text-[11px] text-navy-500 mt-auto">ไม่มีรอบที่เปิดรับ</div>
                )}
              </div>
            );
          })}
          {!types.length && <SkeletonGrid count={3} />}
        </div>
        <div className="mt-3 text-right">
          <Link to="/lotteries" className="text-sm text-gold-400 hover:underline">ดูรอบหวยทั้งหมด →</Link>
        </div>
      </section>

    </div>
  );
}
