import { fmtDate, thaiTime } from '../api.js';
import { resultSchema } from '../lotterySchema.js';
import { ZodiacChip, zodiacList } from './ZodiacChip.jsx';
import { sourceBadge } from '../resultSource.js';
import { Icon } from './icons.jsx';

// ธงชาติเป็น SVG สีจริง — flag emoji ไม่ render บน Windows desktop
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
// ตึกธนาคาร 3D — golden gradient + ด้านข้างเข้มให้มีมิติ (สลากออมสิน)
function Bank3D({ className = 'w-full h-full' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="gsb3d-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fef3c7" />
          <stop offset="0.5" stopColor="#f59e0b" />
          <stop offset="1" stopColor="#b45309" />
        </linearGradient>
      </defs>
      {/* หลังคาด้านข้าง (ความลึก) */}
      <path d="M10 5.2 L15.5 10 L19.5 12.3 L14 7.5 Z" fill="#d97706" />
      {/* หน้าจั่วสามเหลี่ยม */}
      <path d="M4.5 10 L10 5.2 L15.5 10 Z" fill="url(#gsb3d-g)" />
      {/* ผนังหน้า */}
      <rect x="4.5" y="10" width="11" height="8" fill="url(#gsb3d-g)" />
      {/* ผนังด้านข้าง — โทนเข้มกว่า */}
      <path d="M15.5 10 L19.5 12.3 V20.3 L15.5 18 Z" fill="#92400e" />
      {/* เสา 3 ต้น */}
      <rect x="6.4" y="11.2" width="1.7" height="6.4" fill="#fef3c7" />
      <rect x="9.65" y="11.2" width="1.7" height="6.4" fill="#fef3c7" />
      <rect x="12.9" y="11.2" width="1.7" height="6.4" fill="#fef3c7" />
      {/* ประตู */}
      <rect x="9.5" y="14.8" width="2.9" height="3.2" rx="0.4" fill="#78350f" />
      {/* บันได 2 ชั้น */}
      <rect x="3.8" y="18" width="13.4" height="1.5" fill="#d97706" />
      <rect x="3.2" y="19.5" width="14.6" height="1.5" fill="#92400e" />
      <path d="M17.5 13.8 L19.5 15 V20.5 L17.5 18.7 Z" fill="#b45309" opacity="0.55" />
    </svg>
  );
}

// ไอคอนประเภทหวย/เกม — tile สีตามประเภท + เนื้อในเป็นสีสัน (ธงชาติ / icon 3D)
const FLAG_CODES = { TH: FlagTH, LA: FlagLA, HN: FlagVN };
const TILE_BG = 'linear-gradient(135deg,#334155,#0f172a)'; // พื้นเข้มให้ธงเด่น
const TYPE_ICONS = { HR: 'hr', KI: 'ki', SC: 'sc', HL: 'hl' };
const TYPE_BG = {
  HR: 'linear-gradient(135deg,#a855f7,#f59e0b)',   // ราศี — ม่วง/ทอง
  GS: 'linear-gradient(135deg,#10b981,#064e3b)',   // ออมสิน — เขียวมรกต
  KI: 'linear-gradient(135deg,#84cc16,#3f6212)',   // ยี่กี — เขียวกีวี
  SC: 'linear-gradient(135deg,#f59e0b,#92400e)',   // ขูด — ส้ม/น้ำตาล
  HL: 'linear-gradient(135deg,#f43f5e,#881337)',   // ไฮโล — แดงเข้ม
};
// tile 3D/clay — bevel ขอบบน-ล่าง + gloss แสงด้านบน เหมือน icon ปุ่มกดนูน
const TILE_SHADOW = 'inset 0 1.5px 0 rgba(255,255,255,.4), inset 0 -3px 6px rgba(0,0,0,.3), 0 4px 10px rgba(0,0,0,.45)';
function Tile({ bg, className = '', style, children }) {
  return (
    <span className={`relative inline-flex items-center justify-center rounded-[22%] overflow-hidden shrink-0 ${className}`}
      style={{ background: bg, boxShadow: TILE_SHADOW, ...style }}>
      {children}
      {/* gloss — แสงสะท้อนครึ่งบน */}
      <span className="absolute inset-x-0 top-0 h-[55%] pointer-events-none"
        style={{ background: 'linear-gradient(180deg, rgba(255,255,255,.32), rgba(255,255,255,.05) 70%, transparent)' }} />
      {/* ขอบล่างเข้ม — ความหนา */}
      <span className="absolute inset-x-0 bottom-0 h-[28%] pointer-events-none"
        style={{ background: 'linear-gradient(0deg, rgba(0,0,0,.22), transparent)' }} />
    </span>
  );
}

const FALLBACK_EMOJI = { KI: '🔢', SC: '🎰', HL: '🎲' };
export function FlagIcon({ code, className = '', style }) {
  // ธงชาติ — flag สีจริงบน tile เข้ม
  const F = FLAG_CODES[code];
  if (F) {
    return (
      <Tile bg={TILE_BG} className={className} style={style}>
        <span className="flex items-center justify-center w-[88%] relative z-[1]" style={{ aspectRatio: '3/2' }}>
          <F />
        </span>
      </Tile>
    );
  }
  // ออมสิน — ตึกธนาคาร 3D
  if (code === 'GS') {
    return (
      <Tile bg={TYPE_BG.GS} className={className} style={style}>
        <Bank3D className="w-[78%] h-[78%] relative z-[1]" />
      </Tile>
    );
  }
  const name = TYPE_ICONS[code];
  const bg = TYPE_BG[code];
  if (!name || !bg) return <span className={className} style={style}>{FALLBACK_EMOJI[code] || '🎟️'}</span>;
  return (
    <Tile bg={bg} className={`text-white ${className}`} style={style}>
      <Icon name={name} className="w-[72%] h-[72%] relative z-[1]" />
    </Tile>
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
