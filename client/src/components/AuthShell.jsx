// AuthShell — กรอบหน้า login/register/forgot ที่มี brand identity เดียวกัน
export default function AuthShell({ title, sub, children, footer }) {
  return (
    <div className="max-w-md mx-auto">
      <div className="text-center mb-6">
        <img src="/glo-logo.svg" alt="โลโก้สำนักงานสลากกินแบ่งรัฐบาล"
          className="h-12 w-auto mx-auto rounded-xl border border-gold-500/50 bg-navy-950 px-3 py-1.5 shadow-[0_0_18px_rgba(226,168,18,0.2)]" />
        <div className="font-display font-bold text-gold-300 tracking-[0.22em] text-lg mt-2.5">DEMO LOTTERY</div>
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
