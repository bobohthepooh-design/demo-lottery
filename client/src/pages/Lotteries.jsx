import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, fmtDateTime } from '../api.js';
import ResultLine from '../components/ResultLine.jsx';

const STATUS_TH = { scheduled: 'กำหนดการ', open: 'เปิดรับ', closed: 'ปิดรับ', settled: 'ออกผลแล้ว', cancelled: 'ยกเลิก' };

export default function Lotteries() {
  const [types, setTypes] = useState([]);
  const [draws, setDraws] = useState([]);
  const [results, setResults] = useState([]);
  const [params] = useSearchParams();
  const selType = params.get('type');

  useEffect(() => {
    api('/lottery/types').then(r => setTypes(r.types)).catch(() => {});
    api('/lottery/results').then(r => setResults(r.results)).catch(() => {});
  }, []);

  useEffect(() => {
    const q = selType ? `?type=${selType}` : '';
    api(`/lottery/draws${q}`).then(r => setDraws(r.draws)).catch(() => {});
  }, [selType]);

  // ผล 3 ครั้งล่าสุด (กรองตามประเภทที่เลือกอยู่ ถ้ามี)
  const selCode = types.find(t => String(t.id) === String(selType))?.code;
  const recentResults = results
    .filter(r => !selCode || r.type_code === selCode)
    .slice(0, 3);

  return (
    <div className="space-y-6">
      {/* ผลรางวัล 3 ครั้งล่าสุด — อยู่ด้านบนเสมอ */}
      {recentResults.length > 0 && (
        <section>
          <h2 className="text-sm font-bold text-navy-300 mb-2">ผลรางวัล 3 ครั้งล่าสุด</h2>
          <div className="space-y-1.5">
            {recentResults.map(r => <ResultLine key={r.id} r={r} />)}
          </div>
        </section>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Link to="/lotteries" className={`px-4 py-2 rounded-lg text-sm ${!selType ? 'bg-gold-500 text-navy-950 font-bold' : 'bg-navy-800 text-navy-200 border border-navy-700'}`}>ทั้งหมด</Link>
        {types.map(t => (
          <Link key={t.id} to={`/lotteries?type=${t.id}`}
            className={`px-4 py-2 rounded-lg text-sm ${selType == t.id ? 'bg-gold-500 text-navy-950 font-bold' : 'bg-navy-800 text-navy-200 border border-navy-700 hover:border-gold-500/40'}`}>
            {t.name_th}
          </Link>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {draws.map(d => (
          <div key={d.id} className="bg-navy-800 border border-navy-700 rounded-xl p-5">
            <div className="flex items-start justify-between">
              <div>
                <div className="font-bold text-white text-lg">{d.type_name_th}{d.category_name_th ? ` — ${d.category_name_th}` : ''}</div>
                <div className="text-sm text-navy-300">{d.draw_code}</div>
              </div>
              <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${d.status === 'open' ? 'bg-green-500/20 text-green-300' : d.status === 'settled' ? 'bg-gold-500/20 text-gold-300' : 'bg-navy-700 text-navy-300'}`}>
                {STATUS_TH[d.status] || d.status}
              </span>
            </div>
            <div className="mt-3 text-sm text-navy-300 space-y-1">
              <div>🕐 ออกรางวัล: <span className="text-white">{fmtDateTime(d.draw_at)}</span></div>
              <div>⏱️ ปิดรับโพย: <span className="text-white">{fmtDateTime(d.close_at)}</span></div>
            </div>
            {d.status === 'open' && (
              <Link to={`/bet/${d.id}`} className="mt-4 block text-center bg-gold-500 text-navy-950 font-bold py-2.5 rounded-lg hover:bg-gold-400">
                แทงหวยรอบนี้
              </Link>
            )}
          </div>
        ))}
        {!draws.length && <div className="text-navy-300 col-span-2 text-center py-10">ไม่พบรอบหวย</div>}
      </div>
    </div>
  );
}
