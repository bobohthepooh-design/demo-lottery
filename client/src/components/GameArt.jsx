// ภาพประกอบเกมด่วนสไตล์คาสิโน — SVG ล้วน (ไม่ต้องพึ่งไฟล์ภาพภายนอก)
// ใช้แทน badge ตัวอักษร SC/HL/HR บนการ์ดหน้าแรก

const GOLD = { top: '#ffe9a3', mid: '#f5c542', bot: '#b8860b' };

function Defs({ id }) {
  return (
    <defs>
      <linearGradient id={`${id}-g`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={GOLD.top} />
        <stop offset="55%" stopColor={GOLD.mid} />
        <stop offset="100%" stopColor={GOLD.bot} />
      </linearGradient>
      <linearGradient id={`${id}-d`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#3b4a63" />
        <stop offset="100%" stopColor="#101a2e" />
      </linearGradient>
      <radialGradient id={`${id}-orb`} cx="35%" cy="30%" r="80%">
        <stop offset="0%" stopColor="#c4b5fd" />
        <stop offset="55%" stopColor="#7c3aed" />
        <stop offset="100%" stopColor="#2e1065" />
      </radialGradient>
    </defs>
  );
}

const SCENES = {
  // MIG-หวยขูด — บัตรสีทอง + เหรียญขูด + ดาวเรือง
  SC: (id) => (
    <>
      {/* บัตรขูดเอียงเล็กน้อย */}
      <g transform="rotate(-8 32 34)">
        <rect x="10" y="16" width="44" height="34" rx="5" fill={`url(#${id}-g)`} stroke="#7a5200" strokeWidth="1" />
        <rect x="10" y="16" width="44" height="10" rx="5" fill="#00000022" />
        <text x="32" y="24" textAnchor="middle" fontSize="6.5" fontWeight="900" fill="#5c3d00" letterSpacing="1">SCRATCH</text>
        {/* ช่องขูด 3 ช่อง */}
        {[18, 28, 38].map((x, i) => (
          <g key={i}>
            <rect x={x} y="30" width="8" height="12" rx="1.5" fill="#0a1220" opacity="0.85" />
            <circle cx={x + 4} cy="36" r="2.6" fill={i === 1 ? '#fde68a' : '#94a3b8'} opacity={i === 1 ? 1 : 0.7} />
          </g>
        ))}
        {/* แถบขูดเงิน */}
        <rect x="14" y="45" width="36" height="3.4" rx="1.7" fill="#cbd5e1" />
      </g>
      {/* เหรียญทองลอยข้างบัตร */}
      <circle cx="50" cy="14" r="7" fill={`url(#${id}-g)`} stroke="#7a5200" strokeWidth="0.8" />
      <circle cx="50" cy="14" r="4.6" fill="none" stroke="#7a5200" strokeWidth="0.7" />
      <text x="50" y="17" textAnchor="middle" fontSize="7" fontWeight="900" fill="#5c3d00">฿</text>
      {/* ดาวประกาย */}
      <path d="M14 12l1.2 2.4 2.6.3-1.9 1.8.5 2.6-2.4-1.3-2.4 1.3.5-2.6-1.9-1.8 2.6-.3Z" fill="#fff8e0" />
    </>
  ),

  // HL-ไฮโล — เต๋า 3 ลูกแต้ม 3-4-5 + ลูกเต๋าโปร่งใส
  HL: (id) => (
    <>
      {/* เต๋าลูกที่ 1 (แต้ม 3) */}
      <g transform="rotate(-10 24 38)">
        <rect x="12" y="26" width="24" height="24" rx="5" fill="#f8fafc" stroke="#94a3b8" strokeWidth="1" />
        {[0, 1, 2].map(i => <circle key={i} cx={19} cy={33 + i * 6} r="2" fill="#1e293b" />)}
      </g>
      {/* เต๋าลูกที่ 2 (แต้ม 4) */}
      <g transform="rotate(6 44 36)">
        <rect x="32" y="24" width="24" height="24" rx="5" fill={`url(#${id}-g)`} stroke="#7a5200" strokeWidth="1" />
        {[[38, 30], [50, 30], [38, 42], [50, 42]].map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r="2.2" fill="#3b2a00" />
        ))}
      </g>
      {/* แต้มรวม 12 → "สูง" */}
      <circle cx="52" cy="10" r="8" fill="#0f172a" stroke={`url(#${id}-g)`} strokeWidth="1.4" />
      <text x="52" y="13.5" textAnchor="middle" fontSize="7" fontWeight="900" fill="#f5c542">12</text>
      {/* ประกาย */}
      <path d="M10 12l1 2 2.2.3-1.6 1.5.4 2.2-2-.9-2 .9.4-2.2-1.6-1.5 2.2-.3Z" fill="#fff8e0" opacity="0.9" />
    </>
  ),

  // HR-ราศี — ลูกแก้วคริสตัล + ราศี ♈ + วงล้อจักรราศี
  HR: (id) => (
    <>
      {/* ฐานลูกแก้ว */}
      <ellipse cx="32" cy="52" rx="14" ry="4" fill="#00000055" />
      <path d="M20 50h24l-3 6H23Z" fill={`url(#${id}-g)`} stroke="#7a5200" strokeWidth="0.8" />
      {/* ลูกแก้ว */}
      <circle cx="32" cy="34" r="17" fill={`url(#${id}-orb)`} stroke="#c4b5fd" strokeWidth="1" opacity="0.95" />
      <ellipse cx="26" cy="27" rx="6" ry="4" fill="#ffffff" opacity="0.35" transform="rotate(-25 26 27)" />
      {/* ราศีเมษเรืองในลูกแก้ว */}
      <text x="32" y="41" textAnchor="middle" fontSize="15" fontWeight="900" fill="#fde68a"
        style={{ filter: 'drop-shadow(0 0 4px #f5c542)' }}>♈</text>
      {/* วงล้อราศีรอบนอก — จุดเล็ก 12 จุด */}
      {Array.from({ length: 12 }, (_, i) => {
        const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
        const x = 32 + Math.cos(a) * 23.5, y = 34 + Math.sin(a) * 23.5;
        return <circle key={i} cx={x} cy={y} r="1.1" fill="#c4b5fd" opacity={i % 3 === 0 ? 0.95 : 0.55} />;
      })}
      {/* ดาวลอย */}
      <path d="M54 12l1 2 2.2.3-1.6 1.5.4 2.2-2-.9-2 .9.4-2.2-1.6-1.5 2.2-.3Z" fill="#c4b5fd" />
      <circle cx="10" cy="16" r="1.6" fill="#fde68a" />
    </>
  ),
};

export function GameArt({ code, className = 'w-14 h-14' }) {
  const id = `ga-${code}`;
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <Defs id={id} />
      {(SCENES[code] || SCENES.SC)(id)}
    </svg>
  );
}
