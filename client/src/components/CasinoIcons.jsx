// ไอคอน casino สำหรับ bottom nav — filled shapes + gold gradient + รายละเอียดเรียบง่าย
// ใช้แทน stroke Icon ใน bottom nav ให้ดูหรูขึ้น (สีทอง/ขาว สไตล์บาคาร่า)

// โทนสี — gold = รางวัล/เงิน, green = active/นำทาง (สไตล์ LINE), gray = inactive
const TONES = {
  gold: ['#ffe9a3', '#f5c542', '#c9930a'],
  green: ['#fff3c4', '#e2a812', '#b8860b'],
  gray: ['#dcebf8', '#6b8aa8', '#2f5580'],
};

function Svg({ id, tone = 'gold', children, className }) {
  const [top, mid, bot] = TONES[tone] || TONES.gold;
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={top} />
          <stop offset="45%" stopColor={mid} />
          <stop offset="100%" stopColor={bot} />
        </linearGradient>
      </defs>
      {children}
    </svg>
  );
}

const ICONS = {
  // บ้าน — หลังคาทอง + ตัวบ้านขาว
  home: (g) => (
    <>
      <path d="M3.5 10.8 12 4l8.5 6.8a.8.8 0 0 1 .3 1.1l-.6 1a.8.8 0 0 1-1.1.3L12 8.6l-7.1 5.6a.8.8 0 0 1-1.1-.3l-.6-1a.8.8 0 0 1 .3-1.1Z" fill={g} />
      <path d="M6 11.5V20a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-8.5l-1.2.9V19H7.2v-6.6L6 11.5Z" fill={g} />
      <rect x="10.5" y="14" width="3" height="6" rx="0.8" fill="#0a1526" />
    </>
  ),
  // หวย — ลูกบอลลอตเตอรี่มีเลข 7
  lotteries: (g) => (
    <>
      <circle cx="12" cy="12" r="8.5" fill={g} />
      <circle cx="12" cy="12" r="8.5" fill="none" stroke="#3d4f80" strokeWidth="0.8" />
      <circle cx="9" cy="9.5" r="2.2" fill="#fff8e0" opacity="0.85" />
      <text x="12" y="16.8" textAnchor="middle" fontSize="9" fontWeight="800" fill="#3d4f80" fontFamily="system-ui">7</text>
    </>
  ),
  // โพย — สลิป/mockbet พร้อมเส้นประและดาว
  bets: (g) => (
    <>
      <path d="M4 7.5A1.5 1.5 0 0 1 5.5 6h13A1.5 1.5 0 0 1 20 7.5v2a2 2 0 0 0 0 4v2a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 15.5v-2a2 2 0 0 0 0-4v-2Z" fill={g} />
      <path d="M14.5 6v12" stroke="#0a1526" strokeWidth="1.1" strokeDasharray="2 1.8" />
      <path d="M16.8 10.2l.7 1.4 1.5.2-1.1 1 .3 1.5-1.4-.7-1.4.7.3-1.5-1.1-1 1.5-.2.7-1.4Z" fill="#fff8e0" />
    </>
  ),
  // ผลงาน — ถ้วยรางวัลทอง
  reports: (g) => (
    <>
      <path d="M7 4h10v5a5 5 0 0 1-10 0V4Z" fill={g} />
      <path d="M7 5H4.5a3.5 3.5 0 0 0 3 4.2M17 5h2.5a3.5 3.5 0 0 1-3 4.2" fill="none" stroke={g} strokeWidth="1.6" strokeLinecap="round" />
      <rect x="10.8" y="13.5" width="2.4" height="3" fill={g} />
      <path d="M8.5 19.5h7l-1-3h-5l-1 3Z" fill={g} />
      <circle cx="12" cy="7" r="1.2" fill="#fff8e0" opacity="0.9" />
    </>
  ),
  // กระเป๋า — กระเป๋าสตางค์ + เหรียญทอง
  wallet: (g) => (
    <>
      <rect x="3.5" y="7" width="17" height="12" rx="2.2" fill={g} />
      <rect x="3.5" y="7" width="17" height="12" rx="2.2" fill="none" stroke="#3d4f80" strokeWidth="0.7" />
      <path d="M3.5 10.5h17" stroke="#3d4f80" strokeWidth="0.9" />
      <circle cx="16.5" cy="14.8" r="1.6" fill="#fff8e0" stroke="#3d4f80" strokeWidth="0.6" />
    </>
  ),
  // เข้าสู่ระบบ — กุญแจทอง
  roles: (g) => (
    <>
      <circle cx="8" cy="12" r="4.2" fill="none" stroke={g} strokeWidth="2.4" />
      <path d="M11.2 12h9.3M17.5 12v3.2M20 12v2.4" stroke={g} strokeWidth="2.4" strokeLinecap="round" />
    </>
  ),
  // เมนูเพิ่มเติม — จุด 9 ช่อง (grid)
  menu: (g) => (
    <>
      {[5, 12, 19].map(cx => [6.5, 12, 17.5].map(cy => (
        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="1.9" fill={g} />
      )))}
    </>
  ),
};

export function CasinoIcon({ name, className = 'w-6 h-6', tone = 'gold' }) {
  const draw = ICONS[name] || ICONS.home;
  return <Svg id={`cg-${name}-${tone}`} tone={tone} className={className}>{draw(`url(#cg-${name}-${tone})`)}</Svg>;
}
