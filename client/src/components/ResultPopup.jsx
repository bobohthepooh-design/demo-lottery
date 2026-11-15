import { useEffect, useRef, useState } from 'react';
import { api, fmtDate, thaiTime } from '../api.js';
import { resultSchema } from '../lotterySchema.js';
import { FlagIcon } from './ResultLine.jsx';
import { ZodiacChip, zodiacList, ZODIAC_GLYPH } from './ZodiacChip.jsx';
import { sourceBadge } from '../resultSource.js';

// Popup ประกาศผลรางวัล "ฉบับย่อ" — การ์ดเล็กมุมขวาล่างเด้งเมื่อผลใหม่ออก
// (SSE 'results' หรือ polling 60 วิ) — ไม่บังเนื้อหา เล่นหลายผลต่อเนื่องใน queue

function parseData(r) {
  let d = r.winning_numbers;
  if (typeof d === 'string') { try { d = JSON.parse(d); } catch { d = {}; } }
  return d || {};
}

// ค่าเซลล์ → tokens (ตัวเลข = lotto-ball, อย่างอื่น = text)
function ValueTokens({ raw, ballSize = '0.85em' }) {
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
        <span key={i} className="lotto-ball" style={{ fontSize: '1em', minWidth: '1.85em', height: '1.85em' }}>{c}</span>
      ))}
    </span>
  );
}

function PrizeChip({ f, raw }) {
  return (
    <span className="inline-flex flex-col items-center bg-navy-900/90 border border-gold-400/40 rounded-lg px-2 py-1">
      <span className="text-[9px] text-navy-400 leading-none">{f.short || f.label}</span>
      <span className="font-mono font-bold text-gold-300 text-xs mt-0.5">
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
          <span className="w-5 h-6 rounded text-[10px] font-black flex items-center justify-center text-navy-950"
            style={{ background: 'linear-gradient(180deg,#fde68a,#f59e0b)' }}>{ZODIAC_GLYPH[s] || '✦'}</span>
        </span>
      ))}
    </span>
  );
}

// ตัวนับถอยหลังวินาที — auto-close 9 วิ
function CountdownText({ seconds }) {
  const [left, setLeft] = useState(seconds);
  useEffect(() => {
    setLeft(seconds);
    const t = setInterval(() => setLeft(v => Math.max(0, v - 1)), 1000);
    return () => clearInterval(t);
  }, [seconds]);
  return <span className="text-[9px] text-navy-500">ปิดใน {left} วิ</span>;
}

function MiniCard({ r, remaining, onClose, onNext }) {
  useEffect(() => {
    const t = setTimeout(onClose, 9000); // auto-close 9 วิ
    return () => clearTimeout(t);
  }, [r.id, onClose]);

  const data = parseData(r);
  const schema = resultSchema(r.type_code, r.category_code);
  const fields = (schema?.fields || []).filter(f => !f.optional);
  const known = new Set(fields.map(f => f.key));
  const hero = fields[0] || null;
  const subs = fields.slice(1).concat(
    Object.keys(data).filter(k => !known.has(k)).map(k => ({ key: k, label: k, short: k }))
  ).slice(0, 4);

  return (
    <div className="fixed bottom-4 right-4 z-[90] w-[300px] max-w-[calc(100vw-2rem)] animate-result-pop">
      <div className="bg-gradient-to-b from-navy-800 to-navy-950 border border-gold-500/60 rounded-2xl shadow-2xl shadow-black/60 overflow-hidden">
        <div className="hr-shine h-1" />
        {/* head */}
        <div className="flex items-center gap-2 px-3 pt-2.5 pb-1">
          <FlagIcon code={r.type_code} className="w-7 h-5 text-[9px]" />
          <div className="min-w-0">
            <div className="text-[11px] font-bold text-white leading-tight truncate">
              {r.category_name_th || r.type_name_th} <span className="text-navy-400 font-normal">• ผลออกแล้ว</span>
            </div>
            <div className="text-[9px] text-navy-500">{fmtDate(r.draw_at)} • ออก {thaiTime(r.draw_at)} น.{(() => { const b = sourceBadge(r.source); return b ? ` • ${b.short}` : ''; })()}</div>
          </div>
          <button onClick={onClose} aria-label="ปิด"
            className="ml-auto w-5 h-5 rounded-md bg-navy-700 text-navy-400 text-[10px] hover:text-white hover:bg-navy-600 shrink-0">✕</button>
        </div>
        {/* body */}
        <div className="px-3 pb-2">
          {hero && (
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className="text-[9px] text-navy-400 w-14 shrink-0">{hero.short || hero.label}</span>
              <HeroValue f={hero} raw={data[hero.key]} />
            </div>
          )}
          {subs.length > 0 && (
            <div className="flex gap-1 flex-wrap mt-1.5">
              {subs.map(f => <PrizeChip key={f.key} f={f} raw={data[f.key]} />)}
            </div>
          )}
        </div>
        {/* foot */}
        <div className="flex items-center gap-2 px-3 py-1.5 border-t border-navy-700/70 bg-navy-900/60">
          {remaining > 1 ? (
            <button onClick={onNext}
              className="text-[10px] font-bold px-2.5 py-1 rounded-md bg-gradient-to-r from-gold-400 to-gold-600 text-navy-950 hover:brightness-110">
              ผลถัดไป ▶
            </button>
          ) : null}
          {remaining > 1 && <span className="text-[9px] text-navy-400">อีก {remaining - 1} ผล</span>}
          <span className="ml-auto"><CountdownText seconds={9} /></span>
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
    if (fresh.length) setQueue(q => [...q, ...fresh].slice(-4));
  };

  const check = () => api('/lottery/results')
    .then(r => {
      const rows = r.results || [];
      if (seenRef.current === null) {
        seenRef.current = new Set(rows.map(x => x.id));
        // เปิดเว็บมาใหม่: เด้งเฉพาะผลที่เผยแพร่หลังจากครั้งที่แล้วมาดู + ไม่เกิน 12 ชม.
        const lastSeen = Number(localStorage.getItem(LS_KEY) || 0);
        const cutoff = Math.max(lastSeen, Date.now() - 12 * 3600e3);
        const missed = rows.filter(x => { const ts = pubTs(x); return ts > cutoff; });
        if (missed.length) enqueue(missed);
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
