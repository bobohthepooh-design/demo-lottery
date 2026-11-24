import { useEffect, useRef, useState } from 'react';
import { satang } from '../api.js';

// นับเลขวิ่งขึ้น/ลงแบบนุ่มๆ เมื่อค่าเปลี่ยน — ใช้กับยอดเงิน/ยอดรวม
// value เป็นหน่วย satang (1฿ = 100) — format คืน "1,234.50"
export default function AnimatedNumber({ value = 0, format = satang, duration = 500 }) {
  const [display, setDisplay] = useState(value);
  const prev = useRef(0); // mount แรกนับจาก 0 → เห็นเอฟเฟกต์ count-up ตอนโหลด
  const raf = useRef(0);

  useEffect(() => {
    const from = prev.current;
    const to = value;
    prev.current = value;
    if (from === to) { setDisplay(to); return undefined; }
    const start = performance.now();
    const tick = now => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(from + (to - from) * eased));
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [value, duration]);

  return <>{format(display)}</>;
}
