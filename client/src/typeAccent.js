// สี accent ตามประเภทหวย — class ต้องเป็น literal เพื่อให้ Tailwind generate
// TH=แดง, LA=ฟ้า, HN=เหลืองอำพัน, อื่นๆ=ทอง
const ACCENTS = {
  TH: {
    bar: 'bg-red-500', text: 'text-red-400', chip: 'bg-red-500/15 text-red-300 border-red-500/40',
    border: 'border-red-500/40', glow: 'hover:border-red-500/50',
    head: 'from-red-500/25', dot: 'bg-red-400',
  },
  LA: {
    bar: 'bg-sky-500', text: 'text-sky-400', chip: 'bg-sky-500/15 text-sky-300 border-sky-500/40',
    border: 'border-sky-500/40', glow: 'hover:border-sky-500/50',
    head: 'from-sky-500/25', dot: 'bg-sky-400',
  },
  HN: {
    bar: 'bg-amber-500', text: 'text-amber-400', chip: 'bg-amber-500/15 text-amber-300 border-amber-500/40',
    border: 'border-amber-500/40', glow: 'hover:border-amber-500/50',
    head: 'from-amber-500/25', dot: 'bg-amber-400',
  },
};

const FALLBACK = {
  bar: 'bg-gold-500', text: 'text-gold-400', chip: 'bg-gold-500/15 text-gold-300 border-gold-500/40',
  border: 'border-gold-500/40', glow: 'hover:border-gold-500/50',
  head: 'from-gold-500/25', dot: 'bg-gold-400',
};

export const typeAccent = (code) => ACCENTS[code] || FALLBACK;
