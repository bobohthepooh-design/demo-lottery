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
};

const FALLBACK = {
  bar: 'bg-gold-500', text: 'text-gold-600', chip: 'bg-gold-200 text-gold-700 border-gold-300',
  border: 'border-gold-300', glow: 'hover:border-gold-400',
  head: 'from-gold-200', dot: 'bg-gold-500',
  btn: 'from-gold-200 to-gold-300 text-gold-700',
  btnLive: 'from-gold-500 to-gold-600 text-white',
};

export const typeAccent = (code) => ACCENTS[code] || FALLBACK;
