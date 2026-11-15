import { useEffect, useRef, useState } from 'react';

// สล็อต 5 รีล × 3 แถวจ่าย (paylines) — ตู้สล็อตสไตล์ casino จริง
// grid 15 ช่อง row-major (3 แถว × 5 รีล): คอลัมน์ c = รีลที่ c, แถว r = payline ที่ r
// spinKey เพิ่มค่า = เริ่มหมุน, grid = ผลจริงจาก server (settle ไปแล้ว แค่แสดงผลทีหลัง)
const REELS = 5;
const STOP_AT = [1300, 1600, 1900, 2200, 2500]; // ms — รีลหยุดทีละตัวจากซ้ายไปขวา
const BULBS = 16; // หลอดไฟ marquee วิ่งเป็นจังหวะ

// grid row-major 3×5: รีล c = index c, c+5, c+10
const reelOf = (grid, c) => grid ? [grid[c], grid[c + 5], grid[c + 10]] : null;

// ช่องสัญลักษณ์บนแถบรีล — พื้นขาวแบบสล็อตจริง (สัญลักษณ์เข้มบนแถบขาว)
function ReelCell({ sym, isWin, isSpinning, masked }) {
  return (
    <div className={`w-12 h-12 sm:w-14 sm:h-14 rounded-[4px] border flex items-center justify-center overflow-hidden transition-all duration-300
      ${isSpinning
        ? 'border-slate-300 bg-gradient-to-b from-slate-100 to-slate-200 blur-[1.5px] saturate-150'
        : isWin
          ? 'border-amber-300 bg-gradient-to-b from-amber-200 to-yellow-400 shadow-[0_0_16px_rgba(251,191,36,0.8)] scale-[1.04]'
          : 'border-slate-300/80 bg-gradient-to-b from-white to-slate-100 shadow-[inset_0_-3px_5px_rgba(0,0,0,0.15)]'}`}>
      <span className="leading-none text-2xl sm:text-[28px] drop-shadow-sm">
        {masked && !sym ? '❓' : (sym || '❓')}
      </span>
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
  const [view, setView] = useState(() => (grid && grid.length === 15 ? [0, 1, 2, 3, 4].map(c => reelOf(grid, c)) : [[null, null, null], [null, null, null], [null, null, null], [null, null, null], [null, null, null]]));
  const [isSpinning, setIsSpinning] = useState(false);
  const [stopped, setStopped] = useState([true, true, true, true, true]);
  const doneRef = useRef(false);

  // เริ่มหมุนเมื่อ spinKey เปลี่ยน + มี grid (ผลจริงจาก server)
  useEffect(() => {
    if (!spinKey || !grid || grid.length !== 15) return;
    doneRef.current = false;
    const locked = [false, false, false, false, false];
    const rand = () => icons[Math.floor(Math.random() * icons.length)] || '❓';
    setIsSpinning(true);
    setStopped([false, false, false, false, false]);
    setView([0, 1, 2, 3, 4].map(() => [rand(), rand(), rand()]));
    const iv = setInterval(() => {
      setView(v => v.map((col, i) => (locked[i] ? col : [rand(), rand(), rand()])));
    }, 80);
    const timers = STOP_AT.map((ms, c) => setTimeout(() => {
      locked[c] = true;
      const targetCol = reelOf(grid, c);
      setView(v => { const n = [...v]; n[c] = targetCol; return n; });
      setStopped(s => { const n = [...s]; n[c] = true; return n; });
    }, ms));
    const fin = setTimeout(() => {
      clearInterval(iv);
      setIsSpinning(false);
      if (!doneRef.current) { doneRef.current = true; onDone?.(); }
    }, STOP_AT[4] + 450);
    return () => { clearInterval(iv); timers.forEach(clearTimeout); clearTimeout(fin); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spinKey]);

  // idle / ผลที่เปิดเผยแล้ว — แสดงผลจริงนิ่งๆ
  useEffect(() => {
    if (!isSpinning && grid && grid.length === 15) setView([0, 1, 2, 3, 4].map(c => reelOf(grid, c)));
  }, [grid, isSpinning]);

  // cell (row r, col/reel c) ชนะถ้าอยู่ใน cells ของเพย์ไลน์ที่ถูก
  // รองรับทั้ง format ใหม่ {cells:[[r,c]]} และ format เก่า {row,count} (ผลย้อนหลัง)
  const cellWin = (r, c) => !isSpinning && (lines || []).some(l =>
    l.cells ? l.cells.some(([rr, cc]) => rr === r && cc === c) : (l.row === r && c < (l.count || 3)));
  const rowWin = (r) => !isSpinning && (lines || []).some(l =>
    l.cells ? l.cells.some(([rr]) => rr === r) : l.row === r);
  const anyWin = (lines || []).length > 0 && !isSpinning;
  const cellCls = compact ? 'w-10 h-10 text-xl' : '';

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
          <div className="relative rounded-lg bg-[#05070d] border-2 border-black shadow-[inset_0_4px_18px_rgba(0,0,0,0.9)] px-2 sm:px-2.5 py-2">
            <div className="flex">
              {/* ตัวชี้ payline ซ้าย-ขวา */}
              <div className="flex flex-col justify-around py-1 pr-1 gap-0.5">
                {[0, 1, 2].map(r => (
                  <span key={r} className={`text-[8px] font-black w-4 text-center ${rowWin(r) ? 'text-amber-300' : 'text-slate-600'}`}>
                    {rowWin(r) ? '►' : '·'}
                  </span>
                ))}
              </div>

              <div className="flex gap-1 sm:gap-1.5">
                {view.map((col, c) => (
                  <div key={c} className="flex flex-col gap-1 sm:gap-1.5">
                    {col.map((sym, r) => (
                      <ReelCell key={r} sym={masked && !grid && !isSpinning ? '❓' : sym}
                        isWin={cellWin(r, c)} isSpinning={isSpinning && !stopped[c]}
                        masked={masked && !grid && !isSpinning} />
                    ))}
                  </div>
                ))}
              </div>

              <div className="flex flex-col justify-around py-1 pl-1 gap-0.5">
                {[0, 1, 2].map(r => (
                  <span key={r} className={`text-[8px] font-black w-4 text-center ${rowWin(r) ? 'text-amber-300' : 'text-slate-600'}`}>
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
          <div className="mt-2 rounded-lg bg-gradient-to-b from-[#1c2438] to-[#0d1220] border border-white/10 px-2 sm:px-3 py-2 flex items-center gap-2 sm:gap-3">
            <Display label="BET" value={betLabel} />
            <Display label="CREDIT" value={creditLabel} accent="text-emerald-300" />
            <Display label="LINES" value="1-2-3" accent="text-sky-300" />

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
