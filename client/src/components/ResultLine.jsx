import { fmtDate, thaiTime } from '../api.js';
import { resultSchema } from '../lotterySchema.js';

// badge ประเทศ — ใช้ตัวอักษรแทน flag emoji เพราะ Windows desktop ไม่ render flag emoji
const BADGE_STYLE = {
  TH: 'bg-red-600 text-white',
  LA: 'bg-blue-700 text-white',
  HN: 'bg-yellow-400 text-navy-950',
};
export function TypeBadge({ code, className = '' }) {
  if (!code) return <span className={className}>🎟️</span>;
  return (
    <span className={`inline-flex items-center justify-center rounded font-black shrink-0 ${BADGE_STYLE[code] || 'bg-navy-700 text-navy-200'} ${className}`}>
      {code}
    </span>
  );
}

// การ์ดผลรางวัล 1 ประเทศ — หัวข้อ + คอลัมน์แยกตามประเภทรางวัล
export default function ResultLine({ r }) {
  let data = r.winning_numbers;
  if (typeof data === 'string') { try { data = JSON.parse(data); } catch { data = {}; } }
  const schema = resultSchema(r.type_code, r.category_code);
  const fields = (schema?.fields?.length ? schema.fields : []).filter(f => !f.optional);
  const known = new Set(fields.map(f => f.key));
  const extras = Object.entries(data || {}).filter(([k, v]) => !known.has(k) && v !== '');
  const cell = (key, label, raw) => {
    const vals = raw === undefined || raw === null || raw === '' ? '—'
      : (Array.isArray(raw) ? raw : [raw]).join(', ');
    return (
      <div key={key} className="shrink-0 text-center min-w-[3.4rem]">
        <div className="text-[9px] leading-tight text-navy-400">{label}</div>
        <div className="text-xs font-mono font-bold text-gold-300 whitespace-nowrap">{vals}</div>
      </div>
    );
  };
  return (
    <div className="bg-navy-800/70 border border-navy-700/60 rounded-lg px-3 py-2">
      <div className="flex items-center gap-2 text-[11px]">
        <TypeBadge code={r.type_code} className="w-6 h-6 text-[10px]" />
        <span className="font-semibold text-white">{r.type_name_th}{r.category_name_th ? ` ${r.category_name_th}` : ''}</span>
        {r.source && (
          <span className={`text-[9px] px-1.5 py-0.5 rounded ${r.source === 'manual' ? 'bg-amber-500/15 text-amber-300' : 'bg-emerald-500/15 text-emerald-300'}`}>
            {r.source === 'manual' ? '✏️ กรอกเอง' : '🤖 อัตโนมัติ'}
          </span>
        )}
        <span className="text-navy-500 ml-auto">{fmtDate(r.draw_at)} • ออก {thaiTime(r.draw_at)} น.</span>
      </div>
      <div className="flex gap-5 mt-1.5 overflow-x-auto pb-0.5">
        {fields.map(f => cell(f.key, f.short || f.label, data?.[f.key]))}
        {extras.map(([k, v]) => cell(k, k, v))}
      </div>
    </div>
  );
}
