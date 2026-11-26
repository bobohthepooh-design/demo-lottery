import { useEffect, useRef } from 'react';

// แถวลูกบอลหวย — signature effect (adapt จาก folio-books-hero):
// ลูกบอลใกล้ cursor ยกตัวขึ้นเป็นคลื่น gaussian falloff + spring physics
// ปิดอัตโนมัติบน touch / reduced-motion (แสดง static แทน)
const BALL_NUMS = [9, 14, 23, 36, 42, 7, 18, 31, 5, 27, 44, 12, 33, 20, 8];

export default function LotteryBalls({ count = BALL_NUMS.length }) {
  const wrapRef = useRef(null);
  const ballsRef = useRef([]);
  const stateRef = useRef(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const coarse = matchMedia('(pointer: coarse)').matches;
    const balls = ballsRef.current.filter(Boolean);
    if (!balls.length) return;

    // touch/reduced → static row (CSS handles subtle float), ไม่ต้องรัน physics
    if (reduced || coarse) return;

    const n = balls.length;
    // spring state per ball: {y, v} — y = lift 0..1
    const st = balls.map(() => ({ y: 0, v: 0 }));
    let px = -9999, py = -9999, inside = false, raf = 0, last = 0;

    const onMove = e => {
      const r = wrap.getBoundingClientRect();
      px = e.clientX - r.left;
      py = e.clientY - r.top;
      inside = px >= 0 && px <= r.width && py >= -80 && py <= r.height + 80;
    };
    const onLeave = () => { inside = false; };

    const tick = t => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min((t - last) / 1000 || 0.016, 0.05);
      last = t;
      const wr = wrap.getBoundingClientRect();
      const s = Math.max(wr.width, wr.height) * 0.16; // influence radius
      let moving = false;
      for (let i = 0; i < n; i++) {
        const b = balls[i];
        const br = b.getBoundingClientRect();
        const bx = br.left - wr.left + br.width / 2;
        const by = br.top - wr.top + br.height / 2;
        // gaussian falloff — ลูกใกล้ cursor ยกสูงสุด เพื่อนบ้าน taper
        const dx = bx - px, dy = (by - py) * 0.55;
        const infl = inside ? Math.exp(-(dx * dx + dy * dy) / (s * s)) : 0;
        const target = Math.min(1, infl * 1.15);
        const o = st[i];
        // spring K=70 C=12.5 (จาก reference) — 4 substeps
        const h = dt / 4;
        for (let k = 0; k < 4; k++) {
          o.v += ((target - o.y) * 70 - o.v * 12.5) * h;
          o.y += o.v * h;
        }
        if (Math.abs(o.y - target) > 0.002 || Math.abs(o.v) > 0.002) moving = true;
        const lift = o.y;
        b.style.transform = `translateY(${-lift * 34}px) scale(${1 + lift * 0.1})`;
        b.style.zIndex = String(10 + Math.round(lift * 20));
      }
      // หยุด rAF เมื่อทุกลูกอยู่ที่ target แล้ว (ประหยัด battery)
      if (!moving && !inside) cancelAnimationFrame(raf), (raf = 0);
      else if (!raf) raf = requestAnimationFrame(tick);
    };

    const kick = () => { if (!raf) { last = performance.now(); raf = requestAnimationFrame(tick); } };
    wrap.addEventListener('pointermove', e => { onMove(e); kick(); });
    wrap.addEventListener('pointerleave', onLeave);
    window.addEventListener('pointermove', onMove, { passive: true });
    document.documentElement.addEventListener('pointerleave', onLeave);
    // idle wake — คอยเช็คเป็นระยะเผื่อ state ค้าง
    const idle = setInterval(kick, 1200);
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(idle);
      wrap.removeEventListener('pointermove', onMove);
      wrap.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('pointermove', onMove);
      document.documentElement.removeEventListener('pointerleave', onLeave);
      balls.forEach(b => { b.style.transform = ''; b.style.zIndex = ''; });
    };
  }, []);

  return (
    <div ref={wrapRef} className="hero-balls" aria-hidden="true">
      {BALL_NUMS.slice(0, count).map((num, i) => (
        <span
          key={i}
          ref={el => { ballsRef.current[i] = el; }}
          className="hero-ball"
          style={{ ['--i']: i, animationDelay: `${(i % 5) * 0.35}s` }}
        >
          {num}
        </span>
      ))}
    </div>
  );
}
