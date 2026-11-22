import { Link } from 'react-router-dom';

// Button มาตรฐานเดียวทั้งเว็บ — variant: primary(ทอง=เงิน/CTA) accent(cyan=nav/interactive)
// ghost(ขอบ) danger(แดง) subtle(พื้นเรียบ) — size: sm md lg
const VARIANTS = {
  primary: 'bg-gradient-to-r from-gold-400 to-gold-500 text-navy-950 font-bold hover:brightness-110 hover:shadow-lg hover:shadow-gold-500/40 border border-gold-300/60',
  accent: 'bg-gold-500/15 text-gold-200 font-semibold border border-gold-400/40 hover:bg-gold-500/25 hover:border-gold-300/70',
  ghost: 'border border-navy-600 bg-navy-900/60 text-navy-200 hover:border-gold-500/50 hover:text-gold-300',
  secondary: 'border border-navy-600 bg-navy-800 text-navy-200 font-semibold hover:border-navy-500 hover:text-white',
  danger: 'bg-gradient-to-r from-red-600 to-red-700 text-white font-bold hover:brightness-110 border border-red-500/50',
  warning: 'bg-gradient-to-r from-amber-500 to-amber-600 text-navy-950 font-bold hover:brightness-110 border border-amber-400/60',
  success: 'bg-gradient-to-r from-emerald-600 to-emerald-700 text-white font-bold hover:brightness-110 border border-emerald-500/50',
  subtle: 'bg-navy-700/70 border border-navy-600 text-navy-200 hover:bg-navy-700 hover:text-white',
  dark: 'bg-navy-950 text-gold-300 font-bold hover:bg-navy-900 border border-navy-800 shadow-lg',
};
const SIZES = {
  sm: 'px-3 py-1.5 text-[13px] rounded-lg',
  md: 'px-4 py-2.5 text-sm rounded-lg',
  lg: 'px-6 py-3 text-base rounded-xl',
};

export default function Button({ variant = 'primary', size = 'md', to, className = '', children, ...rest }) {
  const cls = `inline-flex items-center justify-center gap-1.5 transition disabled:opacity-45 disabled:cursor-not-allowed ${VARIANTS[variant]} ${SIZES[size]} ${className}`;
  if (to) return <Link to={to} className={cls} {...rest}>{children}</Link>;
  return <button className={cls} {...rest}>{children}</button>;
}
