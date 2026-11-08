// แสดงผลรางวัลสไตล์หน้า official — กล่องตัวเลขแยกตามประเภท
const FIELD_LABELS = {
  top3: '3 ตัวบน',
  bottom2: '2 ตัวล่าง',
  front3: '3 ตัวหน้า',
  back3: '3 ตัวหลัง',
  main: 'เลขหลัก',
  first: 'รางวัลที่ 1',
};

const FIELD_ORDER = ['first', 'top3', 'bottom2', 'front3', 'back3', 'main'];

function DigitBoxes({ value, highlight = false }) {
  return (
    <div className="flex gap-1.5">
      {String(value).split('').map((d, i) => (
        <div key={i}
          className={`w-10 h-12 md:w-12 md:h-14 rounded-lg flex items-center justify-center text-2xl md:text-3xl font-black font-mono
            ${highlight
              ? 'bg-gradient-to-b from-gold-300 to-gold-500 text-navy-950 shadow-lg shadow-gold-500/30'
              : 'bg-navy-900 border border-gold-500/40 text-gold-300'}`}>
          {d}
        </div>
      ))}
    </div>
  );
}

export default function WinningBoard({ winningNumbers, typeCode, compact = false }) {
  let data = winningNumbers;
  if (typeof data === 'string') { try { data = JSON.parse(data); } catch { data = {}; } }
  if (!data || typeof data !== 'object') return null;

  const keys = Object.keys(data).sort((a, b) => {
    const ia = FIELD_ORDER.indexOf(a), ib = FIELD_ORDER.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });

  return (
    <div className={`space-y-3 ${compact ? 'text-sm' : ''}`}>
      {keys.map(k => (
        <div key={k} className="flex flex-wrap items-center gap-3">
          <span className="text-navy-300 text-xs md:text-sm w-20 shrink-0">{FIELD_LABELS[k] || k}</span>
          <DigitBoxes value={data[k]} highlight={k === 'first' || k === 'top3'} />
        </div>
      ))}
    </div>
  );
}
