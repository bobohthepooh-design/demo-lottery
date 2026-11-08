// สี accent ตามประเภทหวย — class ต้องเป็น literal เพื่อให้ Tailwind generate
// โทนพาสเทล: TH=กุหลาบ, LA=ฟ้า, HN=อำพัน (เข้มขึ้นเล็กน้อยให้อ่านได้บนพื้นสว่าง)
const ACCENTS = {
  TH: {
    bar: 'bg-rose-400', text: 'text-rose-500', chip: 'bg-rose-100 text-rose-600 border-rose-300',
    border: 'border-rose-300', glow: 'hover:border-rose-400',
    head: 'from-rose-200', dot: 'bg-rose-400',
  },
  LA: {
    bar: 'bg-sky-400', text: 'text-sky-600', chip: 'bg-sky-100 text-sky-700 border-sky-300',
    border: 'border-sky-300', glow: 'hover:border-sky-400',
    head: 'from-sky-200', dot: 'bg-sky-400',
  },
  HN: {
    bar: 'bg-amber-400', text: 'text-amber-600', chip: 'bg-amber-100 text-amber-700 border-amber-300',
    border: 'border-amber-300', glow: 'hover:border-amber-400',
    head: 'from-amber-200', dot: 'bg-amber-400',
  },
};

const FALLBACK = {
  bar: 'bg-gold-400', text: 'text-gold-500', chip: 'bg-gold-200 text-gold-600 border-gold-300',
  border: 'border-gold-300', glow: 'hover:border-gold-400',
  head: 'from-gold-200', dot: 'bg-gold-400',
};

export const typeAccent = (code) => ACCENTS[code] || FALLBACK;
