import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

// Embed widget — หน้าจอเดียวสำหรับ iframe: /embed/results?lottery=lao-morning&limit=5
// ไม่ใช้ Layout/ auth — public เสมอ
export default function EmbedResults() {
  const [params] = useSearchParams();
  const lottery = params.get('lottery') || 'thai-government';
  const limit = Math.min(Math.max(parseInt(params.get('limit'), 10) || 5, 1), 20);
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    fetch(`/api/public/results?lottery=${encodeURIComponent(lottery)}&limit=${limit}`)
      .then(r => r.json())
      .then(j => { if (j.success) setData(j.data); else setErr(j.error || 'error'); })
      .catch(e => setErr(e.message));
  }, [lottery, limit]);

  return (
    <div className="min-h-screen bg-[#0a1526] text-white p-3 font-sans">
      <div className="max-w-md mx-auto">
        <div className="text-center text-[11px] text-slate-400 mb-2 tracking-widest uppercase">
          ผลรางวัล • {lottery}
        </div>
        {err && <div className="text-red-400 text-xs text-center py-4">{err}</div>}
        {!data && !err && <div className="text-slate-400 text-xs text-center py-4">กำลังโหลด…</div>}
        <div className="space-y-2">
          {(data || []).map(d => (
            <div key={d.drawCode} className="bg-[#0f1e33] border border-gold-500/25 rounded-lg p-2.5">
              <div className="flex items-center justify-between text-[11px] mb-1">
                <span className="font-bold text-gold-300">{d.lotteryName}</span>
                <span className="text-slate-400">{d.displayName}</span>
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px]">
                {d.prizes.slice(0, 6).map(p => (
                  <div key={p.slug} className="flex justify-between gap-2">
                    <span className="text-slate-400 truncate">{p.name}</span>
                    <span className="font-mono text-amber-300">{p.numbers.join(' ')}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {data && !data.length && <div className="text-slate-400 text-xs text-center py-4">ยังไม่มีผล</div>}
        </div>
        <div className="text-center text-[9px] text-slate-500 mt-2">DemoLottery — ผล demo/การศึกษา</div>
      </div>
    </div>
  );
}
