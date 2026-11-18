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
  // SC-สล็อต — เครื่องสล็อต 5 รีล × 3 แถว 20 เพย์ไลน์ + คันโยก
  SC: (id) => (
    <>
      {/* ตัวเครื่องสล็อต */}
      <rect x="5" y="8" width="54" height="48" rx="7" fill={`url(#${id}-d)`} stroke="#475569" strokeWidth="1" />
      <rect x="5" y="8" width="54" height="9" rx="7" fill="#00000033" />
      <text x="32" y="15" textAnchor="middle" fontSize="5.5" fontWeight="900" fill="#f5c542" letterSpacing="1.5">SLOT</text>
      {/* 5 รีล × 3 แถวสัญลักษณ์ — 7️⃣ กลางเป็นแจ็คพอต */}
      {[
        ['🍒', '🍋', '🍊', '🍇', '🔔'],
        ['⭐', '💎', '7️⃣', '🍒', '🍋'],
        ['🍊', '🍇', '🔔', '⭐', '💎'],
      ].map((row, r) => row.map((s, c) => (
        <g key={`${r}-${c}`}>
          <rect x={9 + c * 9.5} y={19 + r * 10.5} width="8.5" height="9" rx="1.5"
            fill={r === 1 && c === 2 ? `url(#${id}-g)` : '#ffffff'} stroke="#334155" strokeWidth="0.5" />
          <text x={13.2 + c * 9.5} y={26 + r * 10.5} textAnchor="middle" fontSize="5">{s}</text>
        </g>
      )))}
      {/* คันโยก */}
      <line x1="60" y1="14" x2="60" y2="34" stroke="#f5c542" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="60" cy="37" r="3.2" fill={`url(#${id}-g)`} stroke="#7a5200" strokeWidth="0.6" />
      {/* ดาวประกาย */}
      <path d="M10 44l1 2 2.2.3-1.6 1.5.4 2.2-2-.9-2 .9.4-2.2-1.6-1.5 2.2-.3Z" fill="#fff8e0" opacity="0.9" />
      <circle cx="53" cy="50" r="1.5" fill="#fde68a" />
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

  // HR-ปีนักษัตร — ลูกแก้วคริสตัล + สัตว์ชวด 🐭 + วงล้อนักษัตร 12 ตัว
  HR: (id) => (
    <>
      {/* ฐานลูกแก้ว */}
      <ellipse cx="32" cy="52" rx="14" ry="4" fill="#00000055" />
      <path d="M20 50h24l-3 6H23Z" fill={`url(#${id}-g)`} stroke="#7a5200" strokeWidth="0.8" />
      {/* ลูกแก้ว */}
      <circle cx="32" cy="34" r="17" fill={`url(#${id}-orb)`} stroke="#c4b5fd" strokeWidth="1" opacity="0.95" />
      <ellipse cx="26" cy="27" rx="6" ry="4" fill="#ffffff" opacity="0.35" transform="rotate(-25 26 27)" />
      {/* สัตว์ชวดเรืองในลูกแก้ว */}
      <text x="32" y="42" textAnchor="middle" fontSize="15"
        style={{ filter: 'drop-shadow(0 0 4px #f5c542)' }}>🐀</text>
      {/* วงล้อนักษัตรรอบนอก — จุดเล็ก 12 จุด */}
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
  // KI-ยี่กี — ลูกบอลเลข 3 ตัวเรียง + แผงเลือกเลข
  KI: (id) => (
    <>
      {/* แผงเลือกเลข 3x3 */}
      <rect x="8" y="14" width="30" height="30" rx="5" fill={`url(#${id}-d)`} stroke="#475569" strokeWidth="1" />
      {[0, 1, 2].map(r => [0, 1, 2].map(c => {
        const on = (r * 3 + c) % 4 === 0;
        return <rect key={`${r}-${c}`} x={11 + c * 9} y={17 + r * 9} width="7" height="7" rx="1.5"
          fill={on ? `url(#${id}-g)` : '#1e293b'} stroke={on ? '#7a5200' : '#334155'} strokeWidth="0.6" />;
      }))}
      {/* ลูกบอลเลข 3 ตัว */}
      {[38, 48].map((cx, i) => (
        <g key={i}>
          <circle cx={cx} cy="22" r="8" fill={`url(#${id}-g)`} stroke="#7a5200" strokeWidth="0.8" />
          <text x={cx} y="25.5" textAnchor="middle" fontSize="8" fontWeight="900" fill="#5c3d00">{i === 0 ? '7' : '3'}</text>
        </g>
      ))}
      {/* ดาวประกาย */}
      <path d="M56 44l1.2 2.4 2.6.3-1.9 1.8.5 2.6-2.4-1.3-2.4 1.3.5-2.6-1.9-1.8 2.6-.3Z" fill="#fff8e0" />
      <circle cx="12" cy="50" r="1.8" fill="#fde68a" />
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
