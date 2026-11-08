import { resultSchema } from '../lotterySchema.js';

// แสดงผลรางวัลสไตล์เว็บออกผลทางการ — เรียงตามโครงสร้างจริงของแต่ละประเทศ
// supporting: winningNumbers string|object, typeCode, categoryCode, compact

function DigitBoxes({ value, hero = false, dim = false }) {
  const cls = hero
    ? 'bg-gradient-to-b from-gold-300 to-gold-500 text-navy-950 shadow-lg shadow-gold-500/40'
    : dim
      ? 'bg-navy-900/60 border border-navy-600 text-navy-300'
      : 'bg-navy-900 border border-gold-500/40 text-gold-300';
  const size = hero ? 'w-10 h-14 md:w-14 md:h-20 text-3xl md:text-5xl' : 'w-8 h-11 md:w-10 md:h-14 text-xl md:text-3xl';
  return (
    <div className="flex gap-1.5 flex-wrap">
      {String(value).split('').map((d, i) => (
        <div key={i} className={`${size} rounded-lg flex items-center justify-center font-black font-mono ${cls}`}>{d}</div>
      ))}
    </div>
  );
}

export default function WinningBoard({ winningNumbers, typeCode, categoryCode, compact = false }) {
  let data = winningNumbers;
  if (typeof data === 'string') { try { data = JSON.parse(data); } catch { data = {}; } }
  if (!data || typeof data !== 'object') return null;

  const schema = resultSchema(typeCode, categoryCode);
  const fields = schema?.fields || Object.keys(data).map(k => ({ key: k, label: k, digits: 0 }));

  // field ที่มีในข้อมูลจริง เรียงตาม schema (field ที่ไม่อยู่ใน schema ต่อท้าย)
  const present = fields.filter(f => data[f.key] !== undefined && data[f.key] !== null && data[f.key] !== '');
  const known = new Set(fields.map(f => f.key));
  const extra = Object.keys(data).filter(k => !known.has(k)).map(k => ({ key: k, label: k, digits: 0 }));
  const rows = [...present, ...extra];
  if (!rows.length) return null;

  const labelCls = compact ? 'text-[11px] md:text-xs w-28 shrink-0' : 'text-xs md:text-sm w-32 md:w-40 shrink-0';

  return (
    <div className={`space-y-2 ${compact ? '' : 'md:space-y-3'}`}>
      {rows.map(f => {
        const raw = data[f.key];
        const values = (Array.isArray(raw) ? raw : [raw]).map(String);
        const isHero = f.hero || f.key === schema?.hero;
        const prizeCount = values.length;
        return (
          <div key={f.key} className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <span className={`${labelCls} text-navy-300 leading-tight`}>
              {f.label}
              {prizeCount > 1 && <span className="block text-[10px] text-gold-500/80">{prizeCount} รางวัล</span>}
            </span>
            <div className="flex items-center gap-2 flex-wrap">
              {values.map((v, i) => (
                <div key={i} className="flex flex-col items-center gap-0.5">
                  {prizeCount > 1 && <span className="text-[9px] text-navy-500">รางวัลที่ {i + 1}</span>}
                  <DigitBoxes value={v} hero={isHero && prizeCount === 1} dim={!isHero && prizeCount === 1 && f.optional} />
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
