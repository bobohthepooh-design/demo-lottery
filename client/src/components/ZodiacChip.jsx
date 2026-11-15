// ชิปราศี — แสดงผลหวยราศีเป็นกล่องสัญลักษณ์เหมือนช่องสัญลักษณ์ของหวยขูด
// ใช้ร่วมกันระหว่าง WinningBoard (ผลในโพย/หน้าผล) และ ResultLine (ผลล่าสุดหน้าแรก)

// ปีนักษัตรไทย (ตาม server/src/lib/zodiac.js) → รูปสัตว์
export const ZODIAC_EMOJI = {
  'ชวด': '🐭', 'ฉลู': '🐂', 'ขาล': '🐯', 'เถาะ': '🐰',
  'มะโรง': '🐉', 'มะเส็ง': '🐍', 'มะเมีย': '🐴', 'มะแม': '🐐',
  'วอก': '🐵', 'ระกา': '🐓', 'จอ': '🐕', 'กุน': '🐷',
};

// ราศีสากลรุ่นเก่า (ผลย้อนหลังใน DB) → สัญลักษณ์ ♈
const LEGACY_GLYPH = {
  'เมษ': '♈', 'พฤษภ': '♉', 'เมถุน': '♊', 'กรกฎ': '♋',
  'สิงห์': '♌', 'กันย์': '♍', 'ตุลย์': '♎', 'พิจิก': '♏',
  'ธนู': '♐', 'มังกร': '♑', 'กุมภ์': '♒', 'มีน': '♓',
};

// glyph สำหรับแสดง — ปีนักษัตรใหม่ = emoji สัตว์, ราศีเก่า = สัญลักษณ์ ♈
export const zodiacGlyph = (sign) => ZODIAC_EMOJI[sign] || LEGACY_GLYPH[sign] || '✦';
export const isZodiacEmoji = (sign) => !!ZODIAC_EMOJI[sign];

// แปลงค่า seq (array หรือ string คั่นด้วย -) เป็น array ชื่อราศีสะอาด
export function zodiacList(raw) {
  const arr = Array.isArray(raw) ? raw : String(raw ?? '').split('-');
  return arr.map(s => String(s).trim()).filter(Boolean);
}

export function ZodiacChip({ sign, hero = false, small = false }) {
  const emoji = ZODIAC_EMOJI[sign];
  const glyph = zodiacGlyph(sign);
  const isEmoji = !!emoji;
  const box = hero
    ? 'w-12 h-14 sm:w-14 sm:h-16 text-2xl sm:text-3xl border-gold-300 shadow-[0_0_18px_rgba(244,201,78,0.45)]'
    : small
      ? 'w-8 h-9 text-base border-gold-500/40'
      : 'w-10 h-12 text-xl border-gold-500/50';
  return (
    <span className="inline-flex flex-col items-center gap-0.5">
      <span className={`${box} rounded-lg bg-gradient-to-b from-gold-200 via-gold-400 to-gold-600 text-navy-950 font-black flex items-center justify-center border shadow-md`}>
        {isEmoji ? <span className="leading-none" style={{ fontSize: small ? '1.5em' : '1.3em' }}>{glyph}</span> : glyph}
      </span>
      <span className="text-[9px] leading-none text-navy-400">{sign}</span>
    </span>
  );
}
