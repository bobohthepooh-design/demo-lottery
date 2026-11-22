// สี accent ตามประเภทหวย — class ต้องเป็น literal เพื่อให้ Tailwind generate
// TH=ฟ้าอ่อน, LA=เขียวมรกต (ต่างจากฟ้าชัดเจน), HN=แดง, GS=ชมพู — โทนประจำหมวดแต่ละประเทศ
// btn = pastel (รอบเปิดรับทั่วไป), btnLive = เข้มกว่า (รอบ ONLINE กำลังมาแรง)
const ACCENTS = {
  TH: {
    bar: 'bg-sky-400', text: 'text-sky-300', chip: 'bg-sky-400/15 text-sky-300 border-sky-400/50',
    border: 'border-sky-400/60', glow: 'hover:border-sky-300',
    head: 'from-sky-600', dot: 'bg-sky-400',
    btn: 'from-sky-400/40 to-blue-600/40 text-sky-200',
    btnLive: 'from-sky-400 to-blue-600 text-white',
  },
  LA: {
    bar: 'bg-emerald-500', text: 'text-emerald-300', chip: 'bg-emerald-500/15 text-emerald-300 border-emerald-400/50',
    border: 'border-emerald-400/60', glow: 'hover:border-emerald-300',
    head: 'from-emerald-600', dot: 'bg-emerald-400',
    btn: 'from-emerald-500/40 to-emerald-700/40 text-emerald-200',
    btnLive: 'from-emerald-500 to-emerald-700 text-white',
  },
  HN: {
    bar: 'bg-red-500', text: 'text-red-400', chip: 'bg-red-500/15 text-red-300 border-red-400/50',
    border: 'border-red-400/60', glow: 'hover:border-red-400',
    head: 'from-red-700', dot: 'bg-red-400',
    btn: 'from-red-500/40 to-red-800/40 text-red-200',
    btnLive: 'from-red-500 to-red-800 text-white',
  },
  HR: {
    bar: 'bg-violet-500', text: 'text-violet-400', chip: 'bg-violet-500/15 text-violet-300 border-violet-400/50',
    border: 'border-violet-400/60', glow: 'hover:border-violet-400',
    head: 'from-violet-500', dot: 'bg-violet-400',
    btn: 'from-violet-500/40 to-purple-600/40 text-violet-200',
    btnLive: 'from-violet-500 to-purple-700 text-white',
  },
  GS: {
    bar: 'bg-pink-500', text: 'text-pink-300', chip: 'bg-pink-500/15 text-pink-300 border-pink-400/50',
    border: 'border-pink-400/60', glow: 'hover:border-pink-400',
    head: 'from-pink-600', dot: 'bg-pink-400',
    btn: 'from-pink-500/50 to-rose-600/50 text-pink-100',
    btnLive: 'from-pink-500 to-rose-600 text-white',
  },
  SC: {
    bar: 'bg-red-500', text: 'text-red-400', chip: 'bg-gold-500/15 text-gold-300 border-gold-400/50',
    border: 'border-red-400/60', glow: 'hover:border-red-400',
    head: 'from-red-600', dot: 'bg-gold-400',
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
