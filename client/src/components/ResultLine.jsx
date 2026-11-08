import { fmtDate, thaiTime } from '../api.js';
import { resultSchema } from '../lotterySchema.js';

// ธงประเทศเป็น SVG — flag emoji ไม่ render บน Windows desktop และบาง platform แสดงผลไม่เหมือนกัน
function FlagTH() {
  return (
    <svg viewBox="0 0 30 20" className="w-full h-full" aria-label="TH">
      <rect width="30" height="20" fill="#A51931" />
      <rect y="5" width="30" height="2.5" fill="#F4F5F8" />
      <rect y="7.5" width="30" height="5" fill="#2D2A4A" />
      <rect y="12.5" width="30" height="2.5" fill="#F4F5F8" />
      <rect y="15" width="30" height="5" fill="#A51931" />
    </svg>
  );
}
function FlagLA() {
  return (
    <svg viewBox="0 0 30 20" className="w-full h-full" aria-label="LA">
      <rect width="10" height="20" fill="#CE1126" />
      <rect x="10" width="10" height="20" fill="#002868" />
      <rect x="20" width="10" height="20" fill="#CE1126" />
      <circle cx="15" cy="10" r="3" fill="#FFFFFF" />
    </svg>
  );
}
function FlagVN() {
  return (
    <svg viewBox="0 0 30 20" className="w-full h-full" aria-label="VN">
      <rect width="30" height="20" fill="#DA251D" />
      <path fill="#FF0" d="M15 6 L15.94 8.71 L18.8 8.76 L16.52 10.49 L17.35 13.24 L15 11.6 L12.65 13.24 L13.48 10.49 L11.2 8.76 L14.06 8.71 Z" />
    </svg>
  );
}
const FLAGS = { TH: FlagTH, LA: FlagLA, HN: FlagVN };

export function FlagIcon({ code, className = '' }) {
  const F = FLAGS[code];
  if (!F) return <span className={className}>🎟️</span>;
  return (
    <span className={`inline-block overflow-hidden rounded-[3px] ring-1 ring-white/20 shrink-0 ${className}`}>
      <F />
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
        <div className="text-xs font-mono font-bold text-amber-600 whitespace-nowrap">{vals}</div>
      </div>
    );
  };
  return (
    <div className="bg-navy-800/70 border border-navy-700/60 rounded-lg px-3 py-2">
      <div className="flex items-center gap-2 text-[11px]">
        <FlagIcon code={r.type_code} className="w-6 h-6 text-[10px]" />
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
