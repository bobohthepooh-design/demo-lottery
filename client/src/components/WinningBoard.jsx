import { resultSchema } from '../lotterySchema.js';
import { ZodiacChip, zodiacList } from './ZodiacChip.jsx';

// แสดงผลรางวัลสไตล์เว็บออกผลทางการ — แสดงทุกรางวัลของประเทศนั้นครบถ้วน
// field ที่ยังไม่มีผลจะแสดง "—" (รอประกาศ)

export function DigitBoxes({ value, hero = false, pending = false, compact = false }) {
  if (pending) {
    return <span className="inline-block px-2 py-1 rounded-lg bg-navy-900/50 border border-dashed border-navy-600 text-navy-500 text-[10px]">รอประกาศ</span>;
  }
  const cls = hero
    ? 'bg-gradient-to-b from-gold-300 to-gold-500 text-navy-950 shadow-lg shadow-gold-500/40'
    : 'bg-navy-900 border border-gold-500/40 text-gold-300';
  const size = hero
    ? (compact ? 'w-8 h-11 md:w-12 md:h-16 text-xl md:text-4xl' : 'w-10 h-14 md:w-14 md:h-20 text-3xl md:text-5xl')
    : (compact ? 'w-6 h-8 md:w-8 md:h-11 text-sm md:text-xl' : 'w-8 h-11 md:w-10 md:h-14 text-xl md:text-3xl');
  return (
    <div className="flex gap-1 flex-wrap">
      {String(value).split('').map((d, i) => (
        <div key={i} className={`${size} rounded-lg flex items-center justify-center font-black font-mono ${cls}`}>{d}</div>
      ))}
    </div>
  );
}

export default function WinningBoard({ winningNumbers, typeCode, categoryCode, compact = false }) {
  let data = winningNumbers;
  if (typeof data === 'string') { try { data = JSON.parse(data); } catch { data = {}; } }
  if (!data || typeof data !== 'object') data = {};

  const schema = resultSchema(typeCode, categoryCode);
  // แสดงทุกรางวัลตามโครงสร้างประเทศ + field เสริมที่มีข้อมูลแต่ไม่อยู่ใน schema
  const fields = schema?.fields?.length
    ? schema.fields
    : Object.keys(data).map(k => ({ key: k, label: k, digits: 0 }));
  const known = new Set(fields.map(f => f.key));
  const extra = Object.keys(data).filter(k => !known.has(k)).map(k => ({ key: k, label: k, digits: 0 }));
  const rows = [...fields, ...extra];
  if (!rows.length) return null;

  // compact = หน้าบ้าน/มือถือ — กล่องเล็กลงอีก
  const labelCls = compact ? 'text-[10px] w-20 shrink-0 leading-tight' : 'text-xs md:text-sm w-32 md:w-40 shrink-0';
  const rowGap = compact ? 'space-y-1' : 'space-y-2 md:space-y-3';

  return (
    <div className={rowGap}>
      {rows.map(f => {
        const raw = data[f.key];
        const hasValue = raw !== undefined && raw !== null && raw !== '';
        const isHero = f.hero || f.key === schema?.hero;
        // หวยราษี — แสดงเป็นชิปราศีเหมือนช่องสัญลักษณ์หวยขูด (ไม่ใช่กล่องตัวเลข)
        if (f.zodiac || f.seq) {
          const signs = hasValue ? zodiacList(raw) : [];
          return (
            <div key={f.key} className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <span className={`${labelCls} text-navy-300 leading-tight`}>
                {f.label}
                {f.seq && <span className="block text-[10px] text-gold-500/80">6 รางวัล</span>}
              </span>
              <div className="flex items-center gap-1.5 flex-wrap">
                {!signs.length ? (
                  <DigitBoxes pending compact={compact} />
                ) : f.seq ? (
                  signs.map((s, i) => <ZodiacChip key={i} sign={s} hero={i === 0} small={compact} />)
                ) : (
                  <ZodiacChip sign={signs[0]} hero={isHero || f.zodiac} small={compact} />
                )}
              </div>
            </div>
          );
        }
        const values = hasValue ? (Array.isArray(raw) ? raw : [raw]).map(String) : [];
        const prizeCount = f.set5 ? 1 : Math.max(values.length, f.prizes || 1);
        return (
          <div key={f.key} className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <span className={`${labelCls} text-navy-300 leading-tight`}>
              {f.label}
              {prizeCount > 1 && <span className="block text-[10px] text-gold-500/80">{prizeCount} รางวัล</span>}
            </span>
            <div className="flex items-center gap-2 flex-wrap">
              {!hasValue ? (
                <DigitBoxes pending compact={compact} />
              ) : values.map((v, i) => (
                <div key={i} className="flex flex-col items-center gap-0.5">
                  {prizeCount > 1 && <span className="text-[9px] text-navy-500">รางวัลที่ {i + 1}</span>}
                  <DigitBoxes value={v} hero={isHero && values.length === 1} compact={compact} />
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
