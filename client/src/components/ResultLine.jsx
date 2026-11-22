import { fmtDate, thaiTime } from '../api.js';
import { resultSchema } from '../lotterySchema.js';
import { ZodiacChip, zodiacList } from './ZodiacChip.jsx';
import { sourceBadge } from '../resultSource.js';

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
function FlagHR() {
  // หวยปีนักษัตร — โลโก้สัตว์ชวด 🐀 + จุดวงล้อนักษัตร 12 ตัว บนพื้นไล่สีม่วง-ทอง
  return (
    <svg viewBox="0 0 30 20" className="w-full h-full" aria-label="HR">
      <defs>
        <linearGradient id="hr-flag-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#6d28d9" />
          <stop offset="1" stopColor="#f59e0b" />
        </linearGradient>
      </defs>
      <rect width="30" height="20" fill="url(#hr-flag-g)" />
      {/* วงล้อนักษัตร 12 จุด */}
      {Array.from({ length: 12 }, (_, i) => {
        const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
        return <circle key={i} cx={15 + Math.cos(a) * 12.5} cy={10 + Math.sin(a) * 8.5} r="0.7"
          fill={i % 3 === 0 ? '#fde68a' : '#c4b5fd'} opacity={i % 3 === 0 ? 0.95 : 0.6} />;
      })}
      <circle cx="15" cy="10" r="6.5" fill="#ffffff" opacity="0.95" />
      <text x="15" y="14.6" fontSize="9" textAnchor="middle">🐀</text>
    </svg>
  );
}
function FlagGS() {
  // สลากออมสิน (GSB) — ตึกธนาคารทองบนพื้นเขียวมรกต
  return (
    <svg viewBox="0 0 30 20" className="w-full h-full" aria-label="GS">
      <defs>
        <linearGradient id="gs-flag-g" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#065f46" />
          <stop offset="1" stopColor="#022c22" />
        </linearGradient>
      </defs>
      <rect width="30" height="20" fill="url(#gs-flag-g)" />
      {/* หลังคา */}
      <path d="M3 8 L15 3 L27 8 Z" fill="#f5c518" />
      <rect x="3" y="8" width="24" height="1.6" fill="#d4a017" />
      {/* เสา 4 ต้น */}
      {[6, 11, 16, 21].map(x => <rect key={x} x={x - 0.8} y="9.6" width="1.6" height="7" fill="#f5c518" />)}
      {/* ฐานตึก */}
      <rect x="3" y="16.6" width="24" height="1.8" fill="#f5c518" />
      <rect x="5" y="18.4" width="20" height="1.6" fill="#d4a017" />
    </svg>
  );
}
const FLAGS = { TH: FlagTH, LA: FlagLA, HN: FlagVN, HR: FlagHR, GS: FlagGS };

const FALLBACK_EMOJI = { KI: '🔢', SC: '🎰', HL: '🎲' };
export function FlagIcon({ code, className = '' }) {
  const F = FLAGS[code];
  if (!F) return <span className={className}>{FALLBACK_EMOJI[code] || '🎟️'}</span>;
  return (
    <span className={`inline-block overflow-hidden rounded-[3px] ring-1 ring-white/20 shrink-0 ${className}`}>
      <F />
    </span>
  );
}

// การ์ดผลรางวัล 1 ประเทศ — หัวข้อ + คอลัมน์แยกตามประเภทรางวัล
// compact = true สำหรับหน้าแรก (เล็กลง แสดง field หลักเท่านั้น ไม่แสดง sourceChecks/fairness)
export default function ResultLine({ r, compact = false }) {
  // API ส่ง winning (ไม่ใช่ winning_numbers) — รองรับทั้งสองชื่อ
  let data = r.winning_numbers || r.winning;
  if (typeof data === 'string') { try { data = JSON.parse(data); } catch { data = {}; } }
  const schema = resultSchema(r.type_code, r.category_code);
  const fields = (schema?.fields?.length ? schema.fields : []).filter(f => !f.optional);
  const known = new Set(fields.map(f => f.key));
  const extras = Object.entries(data || {}).filter(([k, v]) => !known.has(k) && v !== '');
  const sourceChecks = r.source_checks || [];
  const hasMismatch = sourceChecks.some(c => c.verification_status === 'mismatch');

  // compact mode: แสดง field หลักทั้งหมด (ไม่ filter keywords เพื่อให้ครบถ้วน)
  const isCompact = compact;
  const compactFields = fields.slice(0, 6); // แสดง 6 field แรกเพื่อไม่ให้ล้น

  const displayFields = isCompact ? compactFields : fields;
  const displayExtras = isCompact ? [] : extras;

  const cell = (key, label, raw) => {
    const vals = raw === undefined || raw === null || raw === '' ? '—'
      : (Array.isArray(raw) ? raw : [raw]).join(', ');
    const tokens = String(vals).split(/([,\s]+)/);
    return (
      <div key={key} className={`shrink-0 text-center ${isCompact ? 'min-w-[3rem]' : 'min-w-[3.6rem]'}`}>
        <div className={`leading-tight text-navy-300 ${isCompact ? 'text-[9px]' : 'text-[10px]'}`}>{label}</div>
        <div className={`font-mono font-bold text-gold-300 whitespace-nowrap flex flex-wrap justify-center gap-1 ${isCompact ? 'text-[11px] max-w-[8.5rem] sm:max-w-[11rem]' : 'text-sm max-w-[12rem] sm:max-w-[14rem] lg:max-w-[16rem]'}`}>
          {tokens.map((t, ti) => /^\d/.test(t) ? (
            <span key={ti} className="lotto-ball" style={{ fontSize: isCompact ? '0.95em' : '1.05em' }}>{t}</span>
          ) : <span key={ti}>{t}</span>)}
        </div>
      </div>
    );
  };
  return (
    <div className={`bg-navy-800/70 border border-navy-700/60 rounded-lg ${isCompact ? 'px-2 py-1.5' : 'px-3 py-2'}`}>
      <div className={`flex items-center gap-2 ${isCompact ? 'text-[10px]' : 'text-[11px]'}`}>
        <FlagIcon code={r.type_code} className={isCompact ? 'w-5 h-5 text-[9px]' : 'w-6 h-6 text-[10px]'} />
        <span className={`font-semibold text-navy-950 ${isCompact ? 'truncate' : ''}`}>{r.category_name_th || r.type_name_th}</span>
        {!isCompact && (() => { const b = sourceBadge(r.source); return b && (
          <span className={`text-[9px] px-1.5 py-0.5 rounded ${b.cls}`} title={r.source}>{b.label}</span>
        ); })()}
        {!isCompact && r.fairness?.method === 'deterministic' && (
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/40"
            title={`Provably fair — ผล generate จาก seed "${r.fairness.seed}" ตรวจสอบย้อนหลังได้ที่ /api/lottery/fairness/gen?kind=${r.fairness.kind}&code=${r.draw_code}`}>🔐 ตรวจสอบได้</span>
        )}
        <span className={`text-navy-400 ml-auto ${isCompact ? 'truncate text-[10px]' : ''}`}>{fmtDate(r.draw_at)}{!isCompact && ` • ออก ${thaiTime(r.draw_at)} น.`}</span>
      </div>
      {!isCompact && sourceChecks.length > 0 && (
        <div className={`mt-1 text-[9px] ${hasMismatch ? 'text-amber-300' : 'text-navy-400'}`}>
          {hasMismatch ? '⚠ แหล่งข้อมูลไม่ตรงกัน' : 'ตรวจแหล่งข้อมูล'}:{' '}
          {sourceChecks.map(c => {
            const status = {
              matched: 'ตรงกัน', mismatch: 'ไม่ตรง', unverified: 'ยังไม่มีแหล่งเทียบ',
              unavailable: 'ดึงไม่สำเร็จ', date_mismatch: 'วันที่ไม่ตรง',
            }[c.verification_status] || c.verification_status;
            return `${c.source} (${status})`;
          }).join(' · ')}
          {hasMismatch && ` — ใช้ ${r.source}`}
        </div>
      )}
      {r.type_code === 'HR' ? (
        // หวยราษี — แสดงผลเป็นชิปราศีเหมือนช่องสัญลักษณ์หวยขูด
        <div className={`flex gap-4 mt-1.5 flex-wrap items-center ${isCompact ? 'gap-2' : ''}`}>
          {data?.zodiac ? (
            <div className="flex items-center gap-1.5">
              <span className={`text-navy-400 ${isCompact ? 'text-[8px]' : 'text-[9px]'}`}>รางวัลใหญ่</span>
              <ZodiacChip sign={String(data.zodiac)} hero small />
            </div>
          ) : null}
          {data?.seq ? (
            <div className="flex items-center gap-1 flex-wrap">
              <span className={`text-navy-400 mr-1 ${isCompact ? 'text-[8px]' : 'text-[9px]'}`}>ผล 6 ราศี</span>
              {zodiacList(data.seq).map((s, i) => <ZodiacChip key={i} sign={s} hero={i === 0} small />)}
            </div>
          ) : null}
        </div>
      ) : (
      <div className={`flex gap-4 mt-1.5 flex-wrap items-center ${isCompact ? 'gap-2' : ''}`}>
        {displayFields.map(f => cell(f.key, f.short || f.label, data?.[f.key]))}
        {displayExtras.map(([k, v]) => cell(k, k, v))}
      </div>
      )}
    </div>
  );
}
