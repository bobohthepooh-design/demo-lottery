// สี accent ตามประเภทหวย — class ต้องเป็น literal เพื่อให้ Tailwind generate
// TH=ชมพู(กุหลาบ), LA=ฟ้า, HN=เหลืองอำพัน — ตรงกับสีประจำหมวดแต่ละประเทศ
// btn = pastel (รอบเปิดรับทั่วไป), btnLive = เข้มกว่า (รอบ ONLINE กำลังมาแรง)
const ACCENTS = {
  TH: {
    bar: 'bg-gold-500', text: 'text-gold-600', chip: 'bg-gold-200 text-gold-700 border-gold-300',
    border: 'border-gold-300', glow: 'hover:border-gold-400',
    head: 'from-gold-200', dot: 'bg-gold-500',
    btn: 'from-gold-200 to-gold-300 text-gold-700',
    btnLive: 'from-gold-500 to-gold-600 text-white',
  },
  LA: {
    bar: 'bg-blue-500', text: 'text-blue-600', chip: 'bg-blue-100 text-blue-700 border-blue-300',
    border: 'border-blue-300', glow: 'hover:border-blue-400',
    head: 'from-blue-200', dot: 'bg-blue-500',
    btn: 'from-sky-200 to-sky-300 text-sky-700',
    btnLive: 'from-sky-500 to-blue-600 text-white',
  },
  HN: {
    bar: 'bg-amber-500', text: 'text-amber-600', chip: 'bg-amber-100 text-amber-700 border-amber-300',
    border: 'border-amber-300', glow: 'hover:border-amber-400',
    head: 'from-amber-200', dot: 'bg-amber-500',
    btn: 'from-amber-200 to-amber-300 text-amber-800',
    btnLive: 'from-amber-500 to-amber-700 text-white',
  },
  HR: {
    bar: 'bg-violet-500', text: 'text-violet-400', chip: 'bg-violet-500/15 text-violet-300 border-violet-400/50',
    border: 'border-violet-400/60', glow: 'hover:border-violet-400',
    head: 'from-violet-500', dot: 'bg-violet-400',
    btn: 'from-violet-500/40 to-purple-600/40 text-violet-200',
    btnLive: 'from-violet-500 to-purple-700 text-white',
  },
  SC: {
    bar: 'bg-red-500', text: 'text-red-400', chip: 'bg-red-500/15 text-red-300 border-red-400/50',
    border: 'border-red-400/60', glow: 'hover:border-red-400',
    head: 'from-red-600', dot: 'bg-red-400',
    btn: 'from-red-500/40 to-rose-700/40 text-red-200',
    btnLive: 'from-red-500 to-rose-700 text-white',
  },
  HL: {
    bar: 'bg-orange-500', text: 'text-orange-400', chip: 'bg-orange-500/15 text-orange-300 border-orange-400/50',
    border: 'border-orange-400/60', glow: 'hover:border-orange-400',
    head: 'from-orange-600', dot: 'bg-orange-400',
    btn: 'from-orange-500/40 to-red-700/40 text-orange-200',
    btnLive: 'from-orange-500 to-red-700 text-white',
  },
};

const FALLBACK = {
  bar: 'bg-gold-500', text: 'text-gold-600', chip: 'bg-gold-200 text-gold-700 border-gold-300',
  border: 'border-gold-300', glow: 'hover:border-gold-400',
  head: 'from-gold-200', dot: 'bg-gold-500',
  btn: 'from-gold-200 to-gold-300 text-gold-700',
  btnLive: 'from-gold-500 to-gold-600 text-white',
};

export const typeAccent = (code) => ACCENTS[code] || FALLBACK;
