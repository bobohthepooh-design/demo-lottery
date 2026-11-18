import { useEffect, useState } from 'react';
import { api, satang, thaiTime } from '../api.js';
import { FlagIcon } from './ResultLine.jsx';

// Ticker ผู้ชนะล่าสุด — "🎉 ชื่อ*** ถูกรางวัล ฿x,xxx — หวย X" เลื่อนวน
// ข้อมูลจาก /lottery/winners (public, mask ชื่อฝั่ง server แล้ว)
export default function WinTicker() {
  const [winners, setWinners] = useState([]);

  useEffect(() => {
    const load = () => api('/lottery/winners?limit=15').then(r => setWinners(r.winners || [])).catch(() => {});
    load();
    const t = setInterval(load, 60000);
    const h = () => load();
    window.addEventListener('sys:update', h);
    return () => { clearInterval(t); window.removeEventListener('sys:update', h); };
  }, []);

  if (!winners.length) return null;

  const item = (w, i) => (
    <span key={i} className="ticker-item text-xs whitespace-nowrap flex items-center gap-1.5">
      <span>🎉</span>
      <span className="font-bold text-gold-300">{w.player}</span>
      <span className="text-navy-300">ถูกรางวัล</span>
      <span className="font-mono font-bold text-green-300">{satang(w.payout)} ฿</span>
      <span className="text-navy-400 inline-flex items-center gap-1">
        <FlagIcon code={w.typeCode} className="w-4 h-4 text-[8px]" />{w.typeName}
      </span>
      {w.settledAt && <span className="text-navy-500">{thaiTime(w.settledAt)} น.</span>}
    </span>
  );

  return (
    <div className="max-w-7xl w-full mx-auto px-4 pt-2">
      <div className="rounded-xl overflow-hidden border border-gold-500/40 bg-gradient-to-r from-[#f8fafc]/80 via-navy-900/80 to-[#f8fafc]/80">
        <div className="flex items-center gap-2 px-4 py-1 bg-black/50 border-b border-gold-500/30">
          <span className="text-xs font-bold text-gold-300">🏆 ผู้ชนะล่าสุด</span>
          <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full font-semibold bg-green-500/15 text-green-300">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            สด
          </span>
          <span className="text-[10px] text-navy-400">เครดิตเสมือนเพื่อการศึกษา</span>
        </div>
        <div className="overflow-hidden py-1.5">
          <div className="flex w-max animate-marquee-xfast gap-10 px-4">
            {[...winners, ...winners].map(item)}
          </div>
        </div>
      </div>
    </div>
  );
}
