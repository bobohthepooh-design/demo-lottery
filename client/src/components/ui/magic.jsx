// Magic UI-inspired effects — pure CSS, no extra deps
// Marquee: scrolling strip | BorderBeam: animated light beam around a card

export function Marquee({ children, className = '', speed = 30, reverse = false }) {
  return (
    <div className={`overflow-hidden whitespace-nowrap ${className}`}>
      <div
        className="inline-flex gap-8 will-change-transform"
        style={{
          animation: `magic-marquee ${speed}s linear infinite${reverse ? ' reverse' : ''}`,
        }}
      >
        <div className="flex gap-8">{children}</div>
        <div className="flex gap-8" aria-hidden="true">{children}</div>
      </div>
    </div>
  );
}

export function BorderBeam({ className = '', size = 120, duration = 6 }) {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 rounded-2xl ${className} [padding:1.5]`}

    >
      <div
        className="absolute inset-[-100%]"
        style={{
          background: `conic-gradient(from 0deg, transparent 0deg, transparent ${360 - size}deg, rgba(240,196,25,0.9) ${360 - size / 2}deg, #22d3ee ${360 - size / 4}deg, transparent ${360}deg)`,
          animation: `magic-spin ${duration}s linear infinite`,
        }}
      />
      <div className="absolute inset-[1.5px] rounded-[14px] bg-navy-900/60" />
    </div>
  );
}
