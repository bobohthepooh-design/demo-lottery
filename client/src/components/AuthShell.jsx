// AuthShell — กรอบหน้า login/register/forgot ที่มี brand identity เดียวกัน
export default function AuthShell({ title, sub, children, footer }) {
  return (
    <div className="max-w-md mx-auto">
      <div className="text-center mb-6">
        <img src="/devin.svg" alt="Devin"
          className="w-14 h-14 mx-auto rounded-2xl border border-gold-400/60 bg-navy-950 object-contain shadow-[0_0_20px_rgba(244,201,78,0.35)]" />
        <div className="font-display font-bold tracking-[0.22em] text-lg mt-2.5 bg-gradient-to-r from-gold-200 via-gold-400 to-gold-500 bg-clip-text text-transparent">DEVIN</div>
        {sub && <p className="text-xs text-navy-400 mt-1">{sub}</p>}
      </div>
      <div className="bg-navy-800 border border-navy-700 rounded-2xl p-6 sm:p-8 shadow-xl shadow-black/30">
        {title && <h1 className="text-xl font-bold text-white mb-5">{title}</h1>}
        {children}
      </div>
      {footer}
    </div>
  );
}
