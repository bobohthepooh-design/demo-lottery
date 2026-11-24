// AuthShell — กรอบหน้า login/register/forgot ที่มี brand identity เดียวกัน
export default function AuthShell({ title, sub, children, footer }) {
  return (
    <div className="max-w-md mx-auto">
      <div className="text-center mb-6">
        <img src="/devin.svg" alt="Devin"
          className="w-14 h-14 mx-auto rounded-2xl object-contain"
          style={{
            border: '1px solid var(--border-gold)',
            background: 'var(--bg-deep-black)',
            boxShadow: 'var(--shadow-gold)'
          }} />
        <div className="font-display font-bold tracking-[0.22em] text-lg mt-2.5 luxury-gradient-text">DEVIN</div>
        {sub && <p className="text-xs mt-1" style={{ color: 'var(--muted-gray)' }}>{sub}</p>}
      </div>
      <div className="rounded-2xl p-6 sm:p-8 shadow-xl"
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border-light)',
          boxShadow: 'var(--shadow-lg)'
        }}>
        {title && <h1 className="text-xl font-bold mb-5" style={{ color: 'var(--white)' }}>{title}</h1>}
        {children}
      </div>
      {footer}
    </div>
  );
}
