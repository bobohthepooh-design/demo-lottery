import { useEffect, useState } from 'react';
import { api, fmtDateTime } from '../api.js';
import WinningBoard from '../components/WinningBoard.jsx';

const TYPE_STYLE = { TH: '🇹🇭', LA: '🇱🇦', HN: '🇻🇳' };

export default function Results() {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api('/lottery/results').then(r => setResults(r.results)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <h1 className="text-2xl font-bold text-white">ผลรางวัล</h1>
      {results.map(r => (
        <div key={r.id} className="bg-navy-800 border border-gold-500/30 rounded-2xl p-5 md:p-6">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-navy-700">
            <div className="flex items-center gap-2">
              <span className="text-2xl">{TYPE_STYLE[r.type_code] || '🎟️'}</span>
              <div>
                <div className="font-bold text-white">{r.type_name_th}</div>
                <div className="text-xs text-navy-300 font-mono">{r.draw_code} • ออก {fmtDateTime(r.draw_at)}</div>
              </div>
            </div>
            <div className="text-xs text-navy-400">ออกผล {fmtDateTime(r.published_at)}</div>
          </div>
          <WinningBoard winningNumbers={r.winning_numbers} typeCode={r.type_code} categoryCode={r.category_code} />
        </div>
      ))}
      {!loading && !results.length && (
        <div className="text-center text-navy-400 py-16 bg-navy-800/50 border border-navy-700 rounded-2xl">
          ยังไม่มีผลรางวัล — กรุณารอการออกรางวัลรอบถัดไป
        </div>
      )}
      {loading && <div className="text-center text-navy-400 py-10">กำลังโหลด...</div>}
    </div>
  );
}
