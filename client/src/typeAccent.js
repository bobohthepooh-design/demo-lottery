// สี accent ตามประเภทหวย — class ต้องเป็น literal เพื่อให้ Tailwind generate
// โทนพาสเทลที่ต่างกันชัดเจน: TH=แดง, LA=น้ำเงิน, HN=อำพัน (แยกจากสีชมพูของ theme)
const ACCENTS = {
  TH: {
    bar: 'bg-red-500', text: 'text-red-600', chip: 'bg-red-100 text-red-700 border-red-300',
    border: 'border-red-300', glow: 'hover:border-red-400',
    head: 'from-red-200', dot: 'bg-red-500',
  },
  LA: {
    bar: 'bg-blue-500', text: 'text-blue-600', chip: 'bg-blue-100 text-blue-700 border-blue-300',
    border: 'border-blue-300', glow: 'hover:border-blue-400',
    head: 'from-blue-200', dot: 'bg-blue-500',
  },
  HN: {
    bar: 'bg-amber-500', text: 'text-amber-600', chip: 'bg-amber-100 text-amber-700 border-amber-300',
    border: 'border-amber-300', glow: 'hover:border-amber-400',
    head: 'from-amber-200', dot: 'bg-amber-500',
  },
};

const FALLBACK = {
  bar: 'bg-gold-500', text: 'text-gold-600', chip: 'bg-gold-200 text-gold-700 border-gold-300',
  border: 'border-gold-300', glow: 'hover:border-gold-400',
  head: 'from-gold-200', dot: 'bg-gold-500',
};

export const typeAccent = (code) => ACCENTS[code] || FALLBACK;
