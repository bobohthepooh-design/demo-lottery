import { useEffect, useState } from 'react';
import { api, satang, fmtDateTime } from '../api.js';
import { FlagIcon } from '../components/ResultLine.jsx';
import EmptyState from '../components/EmptyState.jsx';
import { SkeletonCard } from '../components/Skeleton.jsx';
import '../styles/luxury-theme.css';

// Winners board — ผู้ชนะล่าสุด (ชื่อถูก mask ฝั่ง server) public ทุกคนดูได้
export default function Winners() {
  const [winners, setWinners] = useState(null);

  const load = () => api('/lottery/winners?limit=30').then(r => setWinners(r.winners)).catch(() => setWinners([]));
  useEffect(() => {
    load();
    const h = () => load();
    window.addEventListener('sys:update', h);
    return () => window.removeEventListener('sys:update', h);
  }, []);

  const bigWin = (w) => w.payout >= 1000000; // 10,000 บาท+ highlight

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold luxury-gradient-text">🏆 ผู้ชนะล่าสุด</h1>
        <p className="text-xs text-gray-400 mt-1">เครดิตเสมือนเพื่อการศึกษา — ยิ่งโชคดี ยิ่งได้จริง (ในโลกเสมือน) 😉</p>
      </div>

      {winners === null && <div className="space-y-3">{[0, 1, 2].map(i => <SkeletonCard key={i} className="h-20" />)}</div>}

      {winners && !winners.length && (
        <EmptyState emoji="🏆" title="ยังไม่มีผู้ชนะ" hint="รางวัลแรกจะขึ้นที่นี่ทันทีที่มีคนถูกหวย — มาเป็นคนแรกเลย!"
          to="/lotteries" cta="ไปเลือกหวยเลย" />
      )}

      <div className="space-y-2">
        {winners?.map((w, i) => (
          <div key={i}
            className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${bigWin(w) ? 'luxury-card luxury-card-gold-border' : 'luxury-card'}`}>
            <FlagIcon code={w.typeCode} className="w-9 h-6 text-[10px] shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-bold text-white">{w.player}</span>
                {bigWin(w) && <span className="luxury-badge luxury-badge-gold">รางวัลใหญ่</span>}
                {w.isTod && <span className="luxury-badge luxury-badge-info">โต๊ด</span>}
              </div>
              <div className="text-[11px] text-gray-400 truncate">
                {w.typeName} • {w.ruleName}
                {['SC', 'HL', 'KI'].includes(w.typeCode)
                  ? ' • เกมด่วน'
                  : <> • เลข <code className="text-[#F5D76E] font-mono">{w.number}</code>{w.drawCode ? ` • ${w.drawCode}` : ''}</>}
              </div>
              <div className="text-[10px] text-gray-500">{fmtDateTime(w.settledAt)} • เดิมพัน {satang(w.amount)} บาท</div>
            </div>
            <div className="text-right shrink-0">
              <div className={`font-black ${bigWin(w) ? 'text-[#22C55E] text-lg' : 'text-[#22C55E]'}`}>
                +{satang(w.payout)} บาท
              </div>
              <div className="text-[9px] text-gray-500">เครดิต</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
