// Card มาตรฐาน — <Card> / <CardHeader title sub actions> / <CardBody>
// variant: default(navy) subtle(navy-900/60) gold(กรอบทอง สำหรับยอดเงิน/สำคัญ) danger(red)
const VARIANTS = {
  default: 'bg-gradient-to-b from-navy-800/95 to-navy-900/95 border border-navy-700/60 shadow-lg shadow-black/30',
  subtle: 'bg-navy-900/70 border border-navy-700/50',
  gold: 'bg-gradient-to-br from-gold-200 via-gold-300 to-gold-400 border border-gold-500/60 shadow-xl shadow-gold-500/20',
  danger: 'bg-red-500/10 border border-red-500/40',
  success: 'bg-emerald-500/10 border border-emerald-500/40',
};

export function Card({ variant = 'default', className = '', children, ...rest }) {
  return (
    <div className={`rounded-xl ${VARIANTS[variant]} ${className}`} {...rest}>
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
