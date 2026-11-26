// AuthShell — กรอบหน้า login/register/forgot ที่มี brand identity เดียวกัน
export default function AuthShell({ title, sub, children, footer }) {
  return (
    <div className="max-w-md mx-auto">
      <div className="text-center mb-6">
        <img src="/devin.svg" alt="Devin"
          className="w-14 h-14 mx-auto rounded-2xl object-contain [border:1px_solid_var(--border-gold)] [background:var(--bg-deep-black)] [box-shadow:var(--shadow-gold)]"
 />
        <div className="font-display font-bold tracking-[0.22em] text-lg mt-2.5 luxury-gradient-text">DEVIN</div>
        {sub && <p className="text-xs mt-1 [color:var(--muted-gray)]">{sub}</p>}
      </div>
      <div className="rounded-2xl p-6 sm:p-8 shadow-xl [background:var(--bg-card)] [border:1px_solid_var(--border-light)] [box-shadow:var(--shadow-lg)]"
>
        {title && <h1 className="text-xl font-bold mb-5 [color:var(--white)]">{title}</h1>}
        {children}
      </div>
      {footer}
    </div>
  );
}
