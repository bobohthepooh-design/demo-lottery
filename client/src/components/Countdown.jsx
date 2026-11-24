import { useEffect, useState } from 'react';

function remainSec(closeAt) {
  const t = new Date(String(closeAt).replace(' ', 'T') + 'Z').getTime();
  if (isNaN(t)) return null;
  return Math.max(0, Math.floor((t - Date.now()) / 1000));
}

// นับถอยหลังเวลาปิดรับ — แดงกะพริบเมื่อเหลือน้อยกว่า 1 ชั่วโมง
export default function Countdown({ closeAt }) {
  const [left, setLeft] = useState(() => remainSec(closeAt));

  useEffect(() => {
    const t = setInterval(() => setLeft(remainSec(closeAt)), 1000);
    return () => clearInterval(t);
  }, [closeAt]);

  if (left === null) return null;
  if (left <= 0) return <span className="text-red-400 font-bold">⏰ ปิดรับแล้ว</span>;

  const d = Math.floor(left / 86400);
  const h = Math.floor((left % 86400) / 3600);
  const m = Math.floor((left % 3600) / 60);
  const s = left % 60;
  const urgent = d === 0 && h < 1;
  // ยิ่งใกล้ปิดยิ่งละเอียด — เหลือหลายวันแสดงแค่ วัน+ชม. ไม่ต้อง วินาที
  const text = d > 0
    ? `⏳ เหลืออีก ${d} วัน ${h} ชม.`
    : h > 0
      ? `⏳ เหลืออีก ${h} ชม. ${m} นาที`
      : m > 0
        ? `⏳ เหลืออีก ${m} นาที ${s} วินาที`
        : `⏳ เหลืออีก ${s} วินาที`;

  return (
    <span className={`${urgent ? 'text-red-400 font-bold animate-pulse' : 'text-navy-200'}`}>
      {text}
    </span>
  );
}
