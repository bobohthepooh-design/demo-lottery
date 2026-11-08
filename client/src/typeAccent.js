// สี accent ตามประเภทหวย — class ต้องเป็น literal เพื่อให้ Tailwind generate
// TH=ชมพู(กุหลาบ), LA=ฟ้า, HN=เหลืองอำพัน — ตรงกับสีประจำหมวดแต่ละประเทศ
const ACCENTS = {
  TH: {
    bar: 'bg-gold-500', text: 'text-gold-600', chip: 'bg-gold-200 text-gold-700 border-gold-300',
    border: 'border-gold-300', glow: 'hover:border-gold-400',
    head: 'from-gold-200', dot: 'bg-gold-500',
    btn: 'from-gold-500 to-gold-600',
  },
  LA: {
    bar: 'bg-blue-500', text: 'text-blue-600', chip: 'bg-blue-100 text-blue-700 border-blue-300',
    border: 'border-blue-300', glow: 'hover:border-blue-400',
    head: 'from-blue-200', dot: 'bg-blue-500',
    btn: 'from-sky-400 to-blue-500',
  },
  HN: {
    bar: 'bg-amber-500', text: 'text-amber-600', chip: 'bg-amber-100 text-amber-700 border-amber-300',
    border: 'border-amber-300', glow: 'hover:border-amber-400',
    head: 'from-amber-200', dot: 'bg-amber-500',
    btn: 'from-amber-400 to-amber-600',
  },
};

const FALLBACK = {
  bar: 'bg-gold-500', text: 'text-gold-600', chip: 'bg-gold-200 text-gold-700 border-gold-300',
  border: 'border-gold-300', glow: 'hover:border-gold-400',
  head: 'from-gold-200', dot: 'bg-gold-500',
  btn: 'from-gold-500 to-gold-600',
};

export const typeAccent = (code) => ACCENTS[code] || FALLBACK;
