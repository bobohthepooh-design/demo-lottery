// Card มาตรฐาน — <Card> / <CardHeader title sub actions> / <CardBody>
// variant: default(navy-800) subtle(navy-900/60) gold(กรอบทอง สำหรับยอดเงิน/สำคัญ)
const VARIANTS = {
  default: 'bg-navy-800 border border-navy-700/70',
  subtle: 'bg-navy-900/60 border border-navy-700/60',
  gold: 'bg-gradient-to-br from-[#f7ecc4] via-[#efd78f] to-[#e3c05c] border border-gold-500/40',
  danger: 'bg-red-500/10 border border-red-500/40',
};

export function Card({ variant = 'default', className = '', children, ...rest }) {
  return (
    <div className={`rounded-2xl shadow-lg shadow-black/20 ${VARIANTS[variant]} ${className}`} {...rest}>
      {children}
    </div>
  );
}

export function CardHeader({ title, sub, actions, className = '' }) {
  return (
    <div className={`flex items-center justify-between gap-3 px-5 py-4 border-b border-navy-700/60 ${className}`}>
      <div className="min-w-0">
        <div className="font-bold text-white">{title}</div>
        {sub && <div className="text-xs text-navy-400 mt-0.5">{sub}</div>}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}

export function CardBody({ className = '', children }) {
  return <div className={`p-5 ${className}`}>{children}</div>;
}
