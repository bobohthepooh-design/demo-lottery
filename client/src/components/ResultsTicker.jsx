import { useEffect, useState } from 'react';
import { api, thaiDate, thaiTime } from '../api.js';
import { FlagIcon } from './ResultLine.jsx';
import { resultSchema } from '../lotterySchema.js';

// แถว ticker ผลรางวัล — เลขเด่นๆ จาก schema
function tickerText(r) {
  let data = r.winning_numbers;
  if (typeof data === 'string') { try { data = JSON.parse(data); } catch { data = {}; } }
  const schema = resultSchema(r.type_code, r.category_code);
  const fields = (schema?.fields || []).filter(f => !f.optional && f.key !== 'main');
  const parts = fields.map(f => {
    const v = data?.[f.key];
    const vals = Array.isArray(v) ? v.join(', ') : v;
    return vals ? `${f.short || f.label} ${vals}` : null;
  }).filter(Boolean);
  const upd = r.published_at ? ` • อัปเดต ${thaiDate(r.published_at)} ${thaiTime(r.published_at)} น.` : '';
  const src = r.source === 'manual' ? ' • ✏️ กรอกเอง' : r.source === 'auto' ? ' • 🤖 อัตโนมัติ' : '';
  return `${r.type_name_th}${r.category_name_th ? ` ${r.category_name_th}` : ''}: ${parts.join(' • ') || '—'}${src}${upd}`;
}

// Ticker ผลรางวัลล่าสุด — แสดงใต้แถบประกาศทุกหน้า
export default function ResultsTicker() {
  const [results, setResults] = useState([]);

  useEffect(() => {
    api('/lottery/results').then(r => setResults(r.results)).catch(() => {});
  }, []);

  if (!results.length) return null;

  return (
    <div className="max-w-7xl w-full mx-auto px-4 pt-3">
      <div className="bg-navy-800/80 border border-royal/40 rounded-xl overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-1.5 bg-royal/15 border-b border-royal/30">
          <span className="text-xs font-bold text-royal-soft">📢 ผลรางวัลล่าสุด</span>
          <span className="text-[10px] text-navy-400">(ชี้เพื่อหยุดเลื่อน)</span>
        </div>
        <div className="overflow-hidden py-1.5">
          <div className="flex w-max animate-marquee gap-8 px-4">
            {[...results, ...results].map((r, i) => (
              <span key={i} className="text-xs text-navy-200 whitespace-nowrap flex items-center gap-1.5">
                <FlagIcon code={r.type_code} className="w-5 h-5 text-[9px]" />
                {tickerText(r)}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
