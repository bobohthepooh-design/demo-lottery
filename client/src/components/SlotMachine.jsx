import { useEffect, useRef, useState } from 'react';

// สล็อต 5 รีล × 3 แถวจ่าย (paylines) — ตู้สล็อตสไตล์ casino จริง
// รีล = แถบสัญลักษณ์เลื่อนแนวตั้ง (translateY) พร้อม ease-out + motion blur ตามความเร็ว
// spinKey เพิ่มค่า = เริ่มหมุน, grid = ผลจริงจาก server (settle ไปแล้ว แค่แสดงผลทีหลัง)
const REELS = 5;
const REEL_MS = [1350, 1680, 2010, 2340, 2670]; // ms — รีลซ้ายหยุดก่อน ไล่ไปขวา
const BULBS = 16; // หลอดไฟ marquee วิ่งเป็นจังหวะ
const GAP = 6;     // ระยะห่างระหว่างสัญลักษณ์/รีล
const COL_GAP = 6; // ระยะห่างระหว่างคอลัมน์รีล
const CELL_MIN = 34, CELL_MAX = 56; // ขนาดช่องสัญลักษณ์ — ย่อ/ขยายตามความกว้างจอ

// grid row-major 3×5: รีล c = index c, c+5, c+10
const reelOf = (grid, c) => grid ? [grid[c], grid[c + 5], grid[c + 10]] : null;

// ===== รีลที่กำลังหมุน — แถบสัญลักษณ์ยาวเลื่อนขึ้นแล้ว ease-out ล็อกที่ผลจริง =====
function StripReel({ target, icons, duration, onStop, cell, pitch, winH }) {
  const LAND = 26 + Math.floor(Math.random() * 6); // ตำแหน่งใน strip ที่จะหยุด (ผลจริงแทรกไว้)
  const [strip] = useState(() => {
    const arr = Array.from({ length: LAND + 3 }, () => icons[Math.floor(Math.random() * icons.length)] || '❓');
    arr[LAND] = target[0]; arr[LAND + 1] = target[1]; arr[LAND + 2] = target[2];
    return arr;
  });
  const [pos, setPos] = useState(0);   // ตำแหน่งปัจจุบัน (หน่วยช่อง)
  const rafRef = useRef(0);

  useEffect(() => {
    const t0 = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - t0) / duration);
      const e = 1 - Math.pow(1 - t, 3.4); // ease-out — เร็วตอนต้น ช้าลงนิดหน่อยก่อนหยุด
      setPos(e * LAND);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
      else onStop?.();
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // motion blur ตามระยะคงเหลือ — เร็วตอนต้นเบลอมาก หยุดแล้วคมชัด
  const blur = Math.min(2.2, Math.max(0, (LAND - pos) * 0.085));
  return (
    <div style={{ width: cell, height: winH, overflow: 'hidden', position: 'relative' }}>
      <div style={{ transform: `translateY(${-pos * pitch}px)`, filter: `blur(${blur.toFixed(2)}px)` }}>
        {strip.map((s, i) => (
          <div key={i} style={{ height: cell, marginBottom: GAP }} className="flex items-center justify-center">
            <span className="leading-none select-none" style={{ fontSize: Math.round(cell * 0.56) }}>{s}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ===== รีลที่หยุดแล้ว — ช่องสัญลักษณ์นิ่งๆ พร้อมไฮไลต์เพย์ไลน์ =====
function ReelCell({ sym, isWin, cell }) {
  return (
    <div className={`flex items-center justify-center rounded-[4px] border overflow-hidden transition-all duration-300
      ${isWin
        ? 'border-amber-300 bg-gradient-to-b from-amber-200 to-yellow-400 shadow-[0_0_16px_rgba(251,191,36,0.8)] scale-[1.06]'
        : 'border-slate-300/80 bg-gradient-to-b from-white to-slate-100 shadow-[inset_0_-3px_5px_rgba(0,0,0,0.15)]'}`}
      style={{ width: cell, height: cell }}>
      <span className="leading-none select-none" style={{ fontSize: Math.round(cell * 0.56) }}>{sym || '❓'}</span>
    </div>
  );
}

function StaticReel({ col, isWin, justLocked, masked, cell }) {
  return (
    <div className={`flex flex-col ${justLocked ? 'animate-reel-lock' : ''}`} style={{ gap: GAP }}>
      {col.map((sym, r) => (
        <ReelCell key={r} sym={masked && !sym ? '❓' : sym} isWin={isWin(r)} cell={cell} />
      ))}
    </div>
  );
}

// หน้าจอแสดงตัวเลขแบบเครื่อง casino (ตัวอักษรสีอำพันเรืองแสงบนจอดำ)
function Display({ label, value, accent = 'text-amber-300' }) {
  return (
    <div className="flex-1 min-w-0">
      <div className="text-[8px] sm:text-[9px] font-black tracking-[0.2em] text-red-400/90 mb-0.5">{label}</div>
      <div className={`bg-black/80 border border-white/10 rounded-md px-2 py-1 font-mono font-bold text-sm sm:text-base ${accent} truncate shadow-[inset_0_0_12px_rgba(0,0,0,0.9)]`}>
        {value}
      </div>
    </div>
  );
}

export default function SlotMachine({
  icons = [], grid = null, lines = [], spinKey = 0, masked = false, onDone, compact = false,
  title = '★ MEGA SLOTS ★', betLabel = 'BET 20', creditLabel = 'CREDIT',
  onSpin = null, spinning = false, spinDisabled = false,
}) {
  const [phase, setPhase] = useState('idle');        // idle | spinning | done
  const [locked, setLocked] = useState([false, false, false, false, false]);
  const doneRef = useRef(false);
  const reelsRef = useRef(null);
  const [cell, setCell] = useState(48);              // ขนาดช่องสัญลักษณ์ — วัดจากความกว้างจริง (มือถือไม่ล้นขอบ)

  useEffect(() => {
    const el = reelsRef.current;
    if (!el) return;
    const compute = () => {
      const w = el.clientWidth;
      if (w > 0) setCell(Math.max(CELL_MIN, Math.min(CELL_MAX, Math.floor((w - (REELS - 1) * COL_GAP) / REELS))));
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const pitch = cell + GAP;
  const winH = cell * 3 + GAP * 2;

  // เริ่มหมุนเมื่อ spinKey เปลี่ยน + มี grid (ผลจริงจาก server)
  useEffect(() => {
    if (!spinKey || !grid || grid.length !== 15) return;
    doneRef.current = false;
    setLocked([false, false, false, false, false]);
    setPhase('spinning');
  }, [spinKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleStop = (c) => {
    setLocked(s => {
      if (s[c]) return s;
      const n = [...s]; n[c] = true;
      if (n.every(Boolean) && !doneRef.current) {
        doneRef.current = true;
        setPhase('done');
        onDone?.();
      }
      return n;
    });
  };

  const active = phase === 'spinning';
  const cols = [0, 1, 2, 3, 4].map(c => reelOf(grid, c) || [null, null, null]);

  // cell (row r, col/reel c) ชนะถ้าอยู่ใน cells ของเพย์ไลน์ที่ถูก
  // รองรับทั้ง format ใหม่ {cells:[[r,c]]} และ format เก่า {row,count} (ผลย้อนหลัง)
  const cellWin = (r, c) => !active && (lines || []).some(l =>
    l.cells ? l.cells.some(([rr, cc]) => rr === r && cc === c) : (l.row === r && c < (l.count || 3)));
  const rowWin = (r) => !active && (lines || []).some(l =>
    l.cells ? l.cells.some(([rr]) => rr === r) : l.row === r);
  const anyWin = (lines || []).length > 0 && !active;

  return (
    <div className="relative select-none">
      {/* ===== ตู้สล็อต ===== */}
      <div className="rounded-2xl border-2 border-amber-500/60 bg-gradient-to-b from-[#3d1220] via-[#2a0d18] to-[#1a0810] p-2 sm:p-2.5 shadow-[0_10px_40px_rgba(0,0,0,0.7),inset_0_2px_0_rgba(255,255,255,0.08)]">
        {/* ขอบทองด้านใน */}
        <div className="rounded-xl border border-amber-400/30 bg-black/30 p-1.5 sm:p-2">

          {/* ===== Marquee — ป้ายไฟด้านบน ===== */}
          <div className="relative rounded-lg bg-gradient-to-b from-[#101726] to-[#0a0f1c] border border-amber-400/40 px-3 pt-2 pb-1.5 mb-2 overflow-hidden">
            {/* หลอดไฟวิ่งรอบป้าย */}
            <div className="flex justify-between px-1 mb-1">
              {Array.from({ length: BULBS }).map((_, i) => (
                <span key={i} className="slot-bulb w-1.5 h-1.5 rounded-full"
                  style={{ animationDelay: `${(i % 2) * 0.6 + (i * 0.09)}s` }} />
              ))}
            </div>
            <div className="text-center">
              <div className="font-black tracking-[0.18em] text-sm sm:text-base text-transparent bg-clip-text bg-gradient-to-b from-amber-200 via-yellow-300 to-amber-500 drop-shadow-[0_0_8px_rgba(251,191,36,0.7)]">
                {title}
              </div>
              <div className="text-[8px] sm:text-[9px] font-bold tracking-[0.3em] text-red-400/80 mt-0.5">5 REELS • 20 PAYLINES • CLASSIC SLOTS</div>
            </div>
            {/* แสงสะท้อนบนกระจกป้าย */}
            <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-transparent pointer-events-none" />
          </div>

          {/* ===== ช่องรีล (reel window) ===== */}
          <div className="relative rounded-lg bg-[#041008] border-2 border-black shadow-[inset_0_4px_18px_rgba(0,0,0,0.9)] px-1.5 sm:px-2.5 py-2">
            <div className="flex items-center">
              {/* ตัวชี้ payline ซ้าย-ขวา */}
              <div className="flex flex-col justify-around py-1 pr-1" style={{ height: winH, gap: GAP }}>
                {[0, 1, 2].map(r => (
                  <span key={r} className={`text-[8px] font-black w-3 sm:w-4 text-center ${rowWin(r) ? 'text-amber-300' : 'text-slate-600'}`}>
                    {rowWin(r) ? '►' : '·'}
                  </span>
                ))}
              </div>

              <div ref={reelsRef} className="flex" style={{ gap: COL_GAP }}>
                {cols.map((col, c) =>
                  active && !locked[c] ? (
                    <StripReel key={`${spinKey}-${c}`} target={col} icons={icons}
                      duration={REEL_MS[c]} onStop={() => handleStop(c)}
                      cell={cell} pitch={pitch} winH={winH} />
                  ) : (
                    <StaticReel key={c} col={col}
                      isWin={(r) => cellWin(r, c)}
                      justLocked={active && locked[c]}
                      masked={masked && !grid} cell={cell} />
                  ))}
              </div>

              <div className="flex flex-col justify-around py-1 pl-1" style={{ height: winH, gap: GAP }}>
                {[0, 1, 2].map(r => (
                  <span key={r} className={`text-[8px] font-black w-3 sm:w-4 text-center ${rowWin(r) ? 'text-amber-300' : 'text-slate-600'}`}>
                    {rowWin(r) ? '◄' : '·'}
                  </span>
                ))}
              </div>
            </div>

            {/* กระจกรีล — แสงสะท้อนทแยง + ขอบบนล่างเข้ม */}
            <div className="absolute inset-0 rounded-lg pointer-events-none bg-gradient-to-br from-white/15 via-white/[0.03] to-transparent" />
            <div className="absolute inset-x-0 top-0 h-4 rounded-t-lg bg-gradient-to-b from-black/60 to-transparent pointer-events-none" />
            <div className="absolute inset-x-0 bottom-0 h-4 rounded-b-lg bg-gradient-to-t from-black/60 to-transparent pointer-events-none" />
          </div>

          {/* ===== แผงควบคุมล่าง ===== */}
          <div className="mt-2 rounded-lg bg-gradient-to-b from-[#e6ecf4] to-[#081120] border border-white/10 px-2 sm:px-3 py-2 flex items-center gap-2 sm:gap-3">
            <Display label="BET" value={betLabel} />
            <Display label="CREDIT" value={creditLabel} accent="text-gold-300" />
            <Display label="LINES" value="20" accent="text-sky-300" />

            {onSpin && (
              <button onClick={onSpin} disabled={spinning || spinDisabled}
                className="relative shrink-0 w-14 h-14 sm:w-16 sm:h-16 rounded-full border-4 border-amber-300/80 bg-gradient-to-b from-red-400 via-red-600 to-red-800 shadow-[0_4px_0_#450a0a,0_0_20px_rgba(239,68,68,0.5),inset_0_2px_4px_rgba(255,255,255,0.35)] active:translate-y-1 active:shadow-[0_1px_0_#450a0a] disabled:opacity-50 disabled:active:translate-y-0 transition-all">
                <span className="block text-[9px] sm:text-[10px] font-black tracking-widest text-white/90 drop-shadow">{spinning ? '···' : 'SPIN'}</span>
                <span className="block text-base sm:text-lg leading-none mt-0.5">🎰</span>
              </button>
            )}

            {/* ช่องหยอดเหรียญ */}
            <div className="hidden sm:flex flex-col items-center shrink-0">
              <div className="w-3 h-8 rounded-b-md bg-gradient-to-b from-slate-400 to-slate-600 border border-black/60 shadow-inner" />
              <span className="text-[7px] font-black text-slate-500 tracking-wider mt-0.5">COIN</span>
            </div>
          </div>

          {anyWin && (
            <div className="text-center mt-1.5 text-xs font-black text-amber-300 animate-pulse tracking-widest">
              ✦ ถูก {lines.length} เพย์ไลน์! ✦
            </div>
          )}
        </div>
      </div>

      {/* ===== คันโยกข้างตู้ (classic lever) ===== */}
      <div className="absolute -right-1 sm:-right-2 top-[16%] bottom-[22%] w-4 sm:w-5 hidden md:flex flex-col items-center pointer-events-none">
        <div className="w-2.5 h-full rounded-full bg-gradient-to-b from-slate-300 via-slate-500 to-slate-700 border border-black/50 shadow-md" />
        <div key={spinKey} className={`absolute top-0 w-8 h-8 -ml-3 rounded-full border-2 border-amber-200/70 bg-gradient-to-b from-red-400 to-red-700 shadow-[0_3px_8px_rgba(0,0,0,0.6),inset_0_2px_3px_rgba(255,255,255,0.4)] ${spinKey ? 'slot-lever-pull' : ''}`} />
      </div>
    </div>
  );
}
