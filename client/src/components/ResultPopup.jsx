import { useEffect, useRef, useState } from 'react';
import { api, fmtDate, thaiTime } from '../api.js';
import { resultSchema } from '../lotterySchema.js';
import { FlagIcon } from './ResultLine.jsx';
import { ZodiacChip, zodiacList, zodiacGlyph, isZodiacEmoji } from './ZodiacChip.jsx';
import { sourceBadge } from '../resultSource.js';
import WinBurst from './WinBurst.jsx';

// Popup ประกาศผลรางวัล "ฉบับย่อ" — การ์ดเล็กมุมขวาล่างเด้งเมื่อผลใหม่ออก
// (SSE 'results' หรือ polling 60 วิ) — ไม่บังเนื้อหา เล่นหลายผลต่อเนื่องใน queue

function parseData(r) {
  let d = r.winning_numbers;
  if (typeof d === 'string') { try { d = JSON.parse(d); } catch { d = {}; } }
  return d || {};
}

// ค่าเซลล์ → tokens (ตัวเลข = lotto-ball, อย่างอื่น = text)
function ValueTokens({ raw, ballSize = '0.95em' }) {
  const vals = Array.isArray(raw) ? raw.join(', ') : (raw ?? '—');
  return (
    <span className="inline-flex flex-wrap gap-1 justify-center items-center">
      {String(vals).split(/([,\s]+)/).map((t, ti) => /^\d/.test(t) ? (
        <span key={ti} className="lotto-ball" style={{ fontSize: ballSize }}>{t}</span>
      ) : <span key={ti}>{t}</span>)}
    </span>
  );
}

// ค่ารางวัลหลัก — เลข = ลูกบอลทอง, ราศี = ชิปราศี
function HeroValue({ f, raw }) {
  if (f.zodiac || f.seq) {
    const signs = zodiacList(raw);
    if (!signs.length) return <span className="text-navy-500 text-sm">—</span>;
    return (
      <span className="inline-flex gap-1 flex-wrap">
        {signs.map((s, i) => <ZodiacChip key={i} sign={s} hero={f.seq ? i === 0 : true} small={!f.seq} />)}
      </span>
    );
  }
  const vals = Array.isArray(raw) ? raw : [raw];
  return (
    <span className="inline-flex gap-1 flex-wrap">
      {vals.flatMap(v => String(v).split('')).filter(c => c.trim()).map((c, i) => (
        <span key={i} className="lotto-ball animate-digit"
          style={{ fontSize: '1.15em', minWidth: '1.9em', height: '1.9em', animationDelay: `${0.15 + i * 0.09}s` }}>{c}</span>
      ))}  
    </span>
  );
}

function PrizeChip({ f, raw }) {
  return (
    <span className="inline-flex flex-col items-center bg-navy-900/90 border border-gold-400/40 rounded-xl px-3 py-1.5">
      <span className="text-[10px] text-navy-400 leading-none">{f.short || f.label}</span>
      <span className="font-mono font-bold text-gold-300 text-sm mt-1">
        {f.zodiac || f.seq ? <SeqSigns raw={raw} /> : <ValueTokens raw={raw} />}
      </span>
    </span>
  );
}

// รางวัลรองที่เป็นราศี — แสดงชิปราศีเล็กๆ แทนข้อความ
function SeqSigns({ raw }) {
  const signs = zodiacList(raw);
  if (!signs.length) return <>—</>;
  return (
    <span className="inline-flex gap-0.5 flex-wrap justify-center">
      {signs.map((s, i) => (
        <span key={i} className="inline-flex flex-col items-center">
          <span className="w-7 h-8 rounded-md text-lg font-black flex items-center justify-center text-navy-950"
            style={{ background: 'linear-gradient(180deg,#fde68a,#f59e0b)' }}>
            {isZodiacEmoji(s)
              ? <span className="leading-none text-xl">{zodiacGlyph(s)}</span>
              : <span className="leading-none">{zodiacGlyph(s)}</span>}
          </span>
        </span>
      ))}
    </span>
  );
}

// ตัวนับถอยหลังวินาที — auto-close 8 วิ
function CountdownText({ seconds }) {
  const [left, setLeft] = useState(seconds);
  useEffect(() => {
    setLeft(seconds);
    const t = setInterval(() => setLeft(v => Math.max(0, v - 1)), 1000);
    return () => clearInterval(t);
  }, [seconds]);
  return <span className="text-[10px] text-navy-500">ปิดใน {left} วิ</span>;
}

function MiniCard({ r, remaining, onClose, onNext }) {
  useEffect(() => {
    const t = setTimeout(onClose, 8000); // auto-close 8 วิ
    return () => clearTimeout(t);
  }, [r.id, onClose]);

  // confetti ทองราว ๆ 5 วิ ตอนผลออก — แล้วหายเอง (component remount ทุกผลผ่าน key=cur.id)
  const [showFx, setShowFx] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setShowFx(false), 5200);
    return () => clearTimeout(t);
  }, [r.id]);

  const data = parseData(r);
  const isHR = r.type_code === 'HR';
  const schema = resultSchema(r.type_code, r.category_code);
  const fields = (schema?.fields || []).filter(f => !f.optional);
  const known = new Set(fields.map(f => f.key));
  const hero = fields[0] || null;
  const subs = fields.slice(1).concat(
    Object.keys(data).filter(k => !known.has(k)).map(k => ({ key: k, label: k, short: k }))
  ).slice(0, 4);

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 pointer-events-none">
      {/* backdrop จางๆ — ไม่บล็อกคลิก (pointer-events-none) */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" />
      {/* confetti ทองตกจากบนจอ — ฉลองผลออก ~5 วิ */}
      {showFx && (
        <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
          {Array.from({ length: 26 }).map((_, i) => (
            <span key={i} className="confetti-piece"
              style={{
                left: `${(i * 37 + 11) % 100}%`,
                background: ['#d4af37', '#fbbf24', '#fde68a', '#22c55e', '#f472b6', '#60a5fa'][i % 6],
                animationDuration: `${2.2 + (i % 4) * 0.5}s`,
                animationDelay: `${(i % 8) * 0.12}s`,
                borderRadius: i % 3 === 0 ? '50%' : '2px',
              }} />
          ))}
        </div>
      )}
      <div className="relative w-full max-w-md max-h-[92vh] overflow-y-auto animate-result-pop pointer-events-auto">
      <div className="bg-gradient-to-b from-navy-800 to-navy-950 border border-gold-500/60 rounded-2xl shadow-2xl shadow-black/60 overflow-hidden">
        {/* ribbon ผลรางวัล — แถบทองเด่นเหมือนใบประกาศ + เส้น shine */}
        <div className="bg-gradient-to-r from-gold-500 via-gold-300 to-gold-500 text-center py-1.5">
          <span className="text-[11px] font-black tracking-[0.35em] text-navy-950 uppercase">🏆 ผลรางวัล</span>
        </div>
        <div className="hr-shine h-1" />
        {/* head */}
        <div className="flex items-center gap-3 px-5 pt-3 pb-2">
          <FlagIcon code={r.type_code} className="w-10 h-7 text-[11px]" />
          <div className="min-w-0">
            <div className="text-base font-bold text-white leading-tight truncate">
              {r.category_name_th || r.type_name_th} <span className="text-navy-400 font-normal">• ผลออกแล้ว</span>
            </div>
            <div className="text-[11px] text-navy-500 mt-0.5">{fmtDate(r.draw_at)} • ออก {thaiTime(r.draw_at)} น.{(() => { const b = sourceBadge(r.source); return b ? ` • ${b.short}` : ''; })()}</div>
          </div>
          <button onClick={onClose} aria-label="ปิด"
            className="ml-auto w-8 h-8 rounded-lg bg-navy-700 text-navy-400 text-sm hover:text-white hover:bg-navy-600 shrink-0">✕</button>
        </div>
        {/* body */}
        <div className="px-5 pb-3 relative">
          {isHR ? (
            // หวยราศี — ชิปราศีแบบ WinningBoard: รางวัลใหญ่ตัวเด่น + ผล 6 ราศีครบ
            <div className="mt-3 space-y-3">
              <div className="flex items-center gap-3">
                <span className="text-xs text-navy-400 w-16 shrink-0">รางวัลใหญ่</span>
                {data.zodiac
                  ? <ZodiacChip sign={String(data.zodiac)} hero />
                  : <span className="text-navy-500 text-sm">—</span>}
              </div>
              <div className="flex items-start gap-3">
                <span className="text-xs text-navy-400 w-16 shrink-0 pt-2">ผล 6 ราศี</span>
                <div className="flex gap-1.5 flex-wrap">
                  {zodiacList(data.seq).length
                    ? zodiacList(data.seq).map((sg, i) => <ZodiacChip key={i} sign={sg} hero={i === 0} />)
                    : <span className="text-navy-500 text-sm">—</span>}
                </div>
              </div>
            </div>
          ) : (<>
          {hero && (
            <div className="flex items-center gap-3 mt-2 flex-wrap">
              <span className="text-xs text-navy-400 w-16 shrink-0">{hero.short || hero.label}</span>
              <HeroValue f={hero} raw={data[hero.key]} />
            </div>
          )}
          {subs.length > 0 && (
            <div className="grid grid-cols-2 gap-1.5 mt-3">
              {subs.map(f => <PrizeChip key={f.key} f={f} raw={data[f.key]} />)}
            </div>
          )}
          </>)}
          <WinBurst count={12} />
        </div>
        {/* foot */}
        <div className="flex items-center gap-3 px-5 py-3 border-t border-navy-700/70 bg-navy-900/60">
          {remaining > 1 ? (
            <button onClick={onNext}
              className="text-xs font-bold px-4 py-1.5 rounded-lg bg-gradient-to-r from-gold-400 to-gold-600 text-navy-950 hover:brightness-110">
              ผลถัดไป ▶
            </button>
          ) : null}
          {remaining > 1 && <span className="text-[11px] text-navy-400">อีก {remaining - 1} ผล</span>}
          <a href="/results" onClick={onClose}
            className="text-[11px] font-semibold text-cyan-300 hover:text-cyan-200 underline underline-offset-2">
            ดูผลทั้งหมด →
          </a>
          <span className="ml-auto"><CountdownText seconds={11} /></span>
        </div>
      </div>
      </div>
    </div>
  );
}

const LS_KEY = 'lp:resultsSeenAt';
// DB เก็บเวลาเป็น UTC 'YYYY-MM-DD HH:MM:SS' — ต้องใส่ Z ไม่งั้น parse เป็น local time คลาด 7 ชม.
const pubTs = (x) => Date.parse(String(x.published_at || x.draw_at || '').replace(' ', 'T') + 'Z');

export default function ResultPopup() {
  const [queue, setQueue] = useState([]);
  const seenRef = useRef(null); // null = ยังไม่เคยโหลด baseline

  const enqueue = (rows) => {
    const fresh = rows
      .map(x => ({ x, ts: pubTs(x) }))
      .filter(({ ts }) => Number.isFinite(ts))
      .sort((a, b) => a.ts - b.ts)
      .map(({ x }) => x);
    // กัน id ซ้ำในคิว + เก็บไว้สูงสุด 2 ใบล่าสุด (เดิม 4 ใบ = เด้งรัวครึ่งนาที)
    if (fresh.length) setQueue(q => {
      const have = new Set(q.map(i => i.id));
      const add = fresh.filter(x => !have.has(x.id));
      return add.length ? [...q, ...add].slice(-2) : q;
    });
  };

  const check = () => api('/lottery/results')
    .then(r => {
      const rows = r.results || [];
      if (seenRef.current === null) {
        seenRef.current = new Set(rows.map(x => x.id));
        // เปิดเว็บมาใหม่: เด้งเฉพาะผลที่เพิ่งออกจริง — backlog เกิน 30 นาทีไม่เด้ง
        // (ผลเก่ายังดูได้ที่หน้า /results — popup มีไว้แจ้งเฉพาะของสด)
        const lastSeen = Number(localStorage.getItem(LS_KEY) || 0);
        const cutoff = Math.max(lastSeen, Date.now() - 30 * 60e3);
        const missed = rows.filter(x => { const ts = pubTs(x); return ts > cutoff; });
        if (missed.length) {
          // เฉพาะ 2 ผลล่าสุดจริงๆ (API ไม่ได้เรียงตามเวลา — เรียงใหม่→เก่าแล้วตัด)
          const latest = [...missed].sort((a, b) => pubTs(b) - pubTs(a)).slice(0, 2);
          enqueue(latest);
        }
        localStorage.setItem(LS_KEY, String(Date.now()));
        return;
      }
      const unseen = rows.filter(x => !seenRef.current.has(x.id));
      if (!unseen.length) return;
      unseen.forEach(x => seenRef.current.add(x.id));

      // กันแจ้งเตือนรัว: เด้งเฉพาะผลที่เพิ่งประกาศ <10 นาที (ข้ามผลย้อนหลัง/backfill)
      const now = Date.now();
      const fresh = unseen.filter(x => {
        const ts = pubTs(x);
        return Number.isFinite(ts) && now - ts < 10 * 60 * 1000;
      });
      if (!fresh.length) return;
      // ผลที่ออกตอนแท็บเบื้องหลังยังเข้าคิว — จะเด้งให้ทันทีที่ผู้ใช้กลับมาดูหน้า
      enqueue(fresh);
    })
    .catch(() => {});

  useEffect(() => {
    check();
    const t = setInterval(check, 60000); // fallback กรณี SSE หลุด
    const h = (e) => { if (e.detail?.kind === 'results') check(); };
    window.addEventListener('sys:update', h);
    return () => { clearInterval(t); window.removeEventListener('sys:update', h); };
  }, []);

  if (!queue.length) return null;
  const [cur, ...rest] = queue;
  const close = () => setQueue(rest);
  const next = () => setQueue(rest);
  return <MiniCard key={cur.id} r={cur} remaining={queue.length} onClose={close} onNext={next} />;
}
