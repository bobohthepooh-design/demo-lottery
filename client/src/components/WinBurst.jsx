// ลูกโป่ง emoji กระจายตอนถูกรางวัล — ใส่ใน container ที่มี position:relative
const PIECES = ['🎉', '✨', '🪙', '⭐', '💰', '🏆', '🎊'];

export default function WinBurst({ count = 14 }) {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-visible" aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => {
        const ang = (i / count) * Math.PI * 2 + (i % 3) * 0.35;
        const dist = 42 + (i % 4) * 20;
        return (
          <span key={i} className="win-burst"
            style={{
              left: '50%', top: '42%',
              '--dx': `${Math.cos(ang) * dist}px`,
              '--dy': `${Math.sin(ang) * dist - 24}px`,
              animationDelay: `${(i % 6) * 0.06}s`,
            }}>
            {PIECES[i % PIECES.length]}
          </span>
        );
      })}
    </div>
  );
}
