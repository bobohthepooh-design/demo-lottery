import { useEffect, useRef, useState } from 'react';

/** ตารางสัญลักษณ์ (ใช้ร่วมกันทั้งตอนขูดและหลังเปิดเผย) */
export function SymbolGrid({ grid, className = '' }) {
  return (
    <div className={`grid grid-cols-3 gap-1.5 p-2 bg-navy-900 rounded-2xl border border-gold-500/40 ${className}`}>
      {grid.map((s, i) => (
        <div key={i} className="aspect-square flex items-center justify-center text-2xl sm:text-3xl bg-gradient-to-br from-navy-800 to-navy-950 rounded-xl border border-navy-700">
          {s}
        </div>
      ))}
    </div>
  );
}

const THRESHOLD = 0.35;

/**
 * บัตรขูด scratch-off — canvas ปิดทับตารางสัญลักษณ์
 * - แปรง gradient นุ่ม + interpolation ตามระยะ + rAF batch → ลากลื่น
 * - วัด % จากภาพย่อ 48x48 (ไม่อ่าน full-res canvas → ไม่กระตุก)
 * - ขูดได้ ~45% → canvas fade หาย (grid ยังอยู่) แล้วค่อย onComplete()
 */
export default function ScratchCard({ grid, onComplete, disabled }) {
  const canvasRef = useRef(null);
  const probeRef = useRef(null);      // canvas ย่อสำหรับวัด %
  const drawing = useRef(false);
  const pending = useRef(null);       // จุดล่าสุดที่รอ stamp ใน rAF
  const lastPt = useRef(null);
  const doneRef = useRef(false);
  const rafRef = useRef(0);
  const [pct, setPct] = useState(0);
  const [cleared, setCleared] = useState(false);

  // วาดชั้นเงิน + ลาย + ข้อความครั้งเดียวตอน mount
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = cv.getBoundingClientRect();
    cv.width = Math.max(1, rect.width * dpr);
    cv.height = Math.max(1, rect.height * dpr);
    const ctx = cv.getContext('2d');
    ctx.scale(dpr, dpr);
    const w = rect.width, h = rect.height;

    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, '#e2e8f0'); g.addColorStop(0.5, '#94a3b8'); g.addColorStop(1, '#64748b');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= w; x += 16) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    for (let y = 0; y <= h; y += 16) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }

    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(51,65,85,0.9)';
    ctx.font = 'bold 20px "Sarabun", sans-serif';
    ctx.fillText('ขูดตรงนี้', w / 2, h / 2 - 6);
    ctx.font = '14px "Sarabun", sans-serif';
    ctx.fillStyle = 'rgba(71,85,105,0.85)';
    ctx.fillText('เพื่อเปิดเผยสัญลักษณ์', w / 2, h / 2 + 18);
    ctx.font = '18px sans-serif';
    ctx.fillText('✦ ✦ ✦', w / 2, h / 2 + 42);
  }, [grid]);

  // แปรงวงกลม gradient — ขอบนุ่มละลายเหมือนเล็บขูดจริง
  const stamp = (ctx, x, y) => {
    const dpr = window.devicePixelRatio || 1;
    const R = 38 * dpr;
    const grad = ctx.createRadialGradient(x, y, 0, x, y, R);
    grad.addColorStop(0, 'rgba(0,0,0,1)');
    grad.addColorStop(0.65, 'rgba(0,0,0,1)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, R, 0, Math.PI * 2);
    ctx.fill();
  };

  // วาดเส้นจาก lastPt → point ใหม่ (แบ่งเป็นจุดย่อยตามระยะ กันลากเร็วเป็นเส้นขาด)
  const strokeTo = (ctx, x, y) => {
    const dpr = window.devicePixelRatio || 1;
    const prev = lastPt.current;
    if (prev) {
      const dist = Math.hypot(x - prev.x, y - prev.y);
      const steps = Math.max(1, Math.floor(dist / (12 * dpr)));
      for (let i = 1; i <= steps; i++) {
        stamp(ctx, prev.x + (x - prev.x) * (i / steps), prev.y + (y - prev.y) * (i / steps));
      }
    } else {
      stamp(ctx, x, y);
    }
    lastPt.current = { x, y };
  };

  // rAF loop — flush จุดที่ค้างทีละ frame
  useEffect(() => {
    const tick = () => {
      if (pending.current && !doneRef.current) {
        const cv = canvasRef.current;
        if (cv) {
          const ctx = cv.getContext('2d');
          ctx.globalCompositeOperation = 'destination-out';
          strokeTo(ctx, pending.current.x, pending.current.y);
          ctx.globalCompositeOperation = 'source-over';
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  const scratchAt = (e) => {
    const cv = canvasRef.current;
    if (!cv || doneRef.current || disabled) return;
    const r = cv.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    pending.current = { x: (e.clientX - r.left) * dpr, y: (e.clientY - r.top) * dpr };
  };

  // วัด % จากภาพย่อ — drawImage ลง canvas 48x48 แล้วนับ alpha (ถูกมาก ไม่กระตุก)
  useEffect(() => {
    const probe = document.createElement('canvas');
    probe.width = 48; probe.height = 48;
    const pctx = probe.getContext('2d', { willReadFrequently: true });
    probeRef.current = probe;
    const iv = setInterval(() => {
      const cv = canvasRef.current;
      if (!cv || doneRef.current) return;
      pctx.clearRect(0, 0, 48, 48);
      pctx.drawImage(cv, 0, 0, 48, 48);
      const data = pctx.getImageData(0, 0, 48, 48).data;
      let clear = 0;
      for (let i = 3; i < data.length; i += 4) if (data[i] < 40) clear++;
      const ratio = clear / (48 * 48);
      setPct(Math.min(100, Math.round(ratio * 100)));
      if (ratio > THRESHOLD) {
        doneRef.current = true;
        clearInterval(iv);
        setCleared(true);               // canvas จางหาย — grid ยังอยู่ด้านล่าง
        setTimeout(() => onComplete?.(), 450);
      }
    }, 300);
    return () => clearInterval(iv);
  }, [onComplete]);

  const finished = cleared || disabled;
  return (
    <div
      className="relative select-none"
      style={{ touchAction: 'none', overscrollBehavior: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none' }}
    >
      <SymbolGrid grid={grid} />
      <canvas
        ref={canvasRef}
        className={`absolute inset-0 w-full h-full rounded-2xl cursor-crosshair transition-opacity duration-500 ${finished ? 'pointer-events-none opacity-0' : 'opacity-100'}`}
        onPointerDown={(e) => { if (disabled || doneRef.current) return; drawing.current = true; lastPt.current = null; pending.current = null; e.currentTarget.setPointerCapture(e.pointerId); scratchAt(e); }}
        onPointerMove={(e) => { if (drawing.current) scratchAt(e); }}
        onPointerUp={() => { drawing.current = false; lastPt.current = null; pending.current = null; }}
        onPointerCancel={() => { drawing.current = false; lastPt.current = null; pending.current = null; }}
      />
      {!finished && (
        <div className="absolute bottom-2 right-3 text-[10px] font-bold text-white/90 bg-black/40 px-2 py-0.5 rounded-full pointer-events-none">
          ขูดแล้ว {pct}%
        </div>
      )}
    </div>
  );
}
