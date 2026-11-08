// แสดงผลรางวัลสไตล์หน้า official — กล่องตัวเลขแยกตามประเภท
// label แยกตามประเภทหวย (typeCode) และ field ใน winning_numbers

const LABELS = {
  TH: {
    first: 'รางวัลที่ 1', front3: 'เลขหน้า 3 ตัว', top3: 'เลขท้าย 3 ตัวบน',
    bottom2: 'เลขท้าย 2 ตัว',
  },
  LA: {
    last4: 'เลขท้าย 4 ตัว', last3: 'เลขท้าย 3 ตัว', last2: 'เลขท้าย 2 ตัว',
  },
  LAD: {
    last2: 'เลขท้าย 2 ตัว',
  },
  HN: {
    num4: 'เลข 4 ตัว', top3: 'เลข 3 ตัวบน', top2: 'เลข 2 ตัวบน', bottom2: 'เลข 2 ตัวล่าง',
  },
};
const GENERIC = {
  first: 'รางวัลที่ 1', top3: '3 ตัวบน', bottom2: '2 ตัวล่าง', front3: '3 ตัวหน้า',
  back3: '3 ตัวหลัง', main: 'เลขหลัก', num4: 'เลข 4 ตัว', top2: '2 ตัวบน',
  last4: 'เลขท้าย 4 ตัว', last3: 'เลขท้าย 3 ตัว', last2: 'เลขท้าย 2 ตัว',
};
const ORDER = ['first', 'num4', 'last4', 'front3', 'top3', 'last3', 'top2', 'bottom2', 'last2', 'back3', 'main'];

function DigitBoxes({ value, highlight = false, dim = false }) {
  return (
    <div className="flex gap-1.5 flex-wrap">
      {String(value).split('').map((d, i) => (
        <div key={i}
          className={`w-9 h-11 md:w-11 md:h-13 rounded-lg flex items-center justify-center text-2xl md:text-3xl font-black font-mono
            ${highlight
              ? 'bg-gradient-to-b from-gold-300 to-gold-500 text-navy-950 shadow-lg shadow-gold-500/30'
              : dim
                ? 'bg-navy-900/60 border border-navy-600 text-navy-300'
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

  const labels = { ...GENERIC, ...(LABELS[typeCode] || {}) };
  const keys = Object.keys(data).sort((a, b) => {
    const ia = ORDER.indexOf(a), ib = ORDER.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });

  return (
    <div className={`space-y-2.5 ${compact ? 'text-sm' : ''}`}>
      {keys.map(k => {
        const v = data[k];
        const isArr = Array.isArray(v);
        const main = isArr ? v[0] : v;
        return (
          <div key={k} className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="text-navy-300 text-xs md:text-sm w-32 shrink-0">{labels[k] || k}</span>
            <div className="flex items-center gap-2 flex-wrap">
              <DigitBoxes value={main} highlight={k === 'first' || k === 'num4' || k === 'last4'} />
              {isArr && v.length > 1 && (
                <span className="text-[10px] text-navy-400">
                  + อีก {v.length - 1} รางวัล: {v.slice(1).join(', ')}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
