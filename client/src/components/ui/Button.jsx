import { Link } from 'react-router-dom';

// Button มาตรฐานเดียวทั้งเว็บ — variant: primary(ทอง=เงิน/CTA) accent(cyan=nav/interactive)
// ghost(ขอบ) danger(แดง) subtle(พื้นเรียบ) — size: sm md lg
const SIZES = {
  sm: { padding: '0.375rem 0.75rem', fontSize: '13px', borderRadius: 'var(--radius-lg)' },
  md: { padding: '0.625rem 1rem', fontSize: '0.875rem', borderRadius: 'var(--radius-lg)' },
  lg: { padding: '0.75rem 1.5rem', fontSize: '1rem', borderRadius: 'var(--radius-xl)' },
};

const getVariantStyle = (variant) => {
  const styles = {
    primary: {
      background: 'linear-gradient(135deg, var(--gold-gradient-start), var(--gold-gradient-end))',
      color: 'var(--bg-deep-black)',
      borderColor: 'rgba(212, 175, 55, 0.6)',
      boxShadow: 'var(--shadow-gold)',
      fontWeight: 'bold'
    },
    accent: {
      background: 'rgba(212, 175, 55, 0.15)',
      color: 'var(--gold-bright)',
      borderColor: 'rgba(212, 175, 55, 0.4)',
      fontWeight: '600'
    },
    ghost: {
      background: 'var(--bg-dark-surface)',
      color: 'var(--light-gray)',
      borderColor: 'var(--border-light)',
      fontWeight: 'normal'
    },
    secondary: {
      background: 'var(--bg-card)',
      color: 'var(--light-gray)',
      borderColor: 'var(--border-light)',
      fontWeight: '600'
    },
    danger: {
      background: 'linear-gradient(135deg, #dc2626, #b91c1c)',
      color: 'var(--white)',
      borderColor: 'rgba(239, 68, 68, 0.5)',
      fontWeight: 'bold'
    },
    warning: {
      background: 'linear-gradient(135deg, #f59e0b, #d97706)',
      color: 'var(--bg-deep-black)',
      borderColor: 'rgba(245, 158, 11, 0.6)',
      fontWeight: 'bold'
    },
    success: {
      background: 'linear-gradient(135deg, #059669, #047857)',
      color: 'var(--white)',
      borderColor: 'rgba(34, 197, 94, 0.5)',
      fontWeight: 'bold'
    },
    subtle: {
      background: 'var(--bg-card-hover)',
      color: 'var(--light-gray)',
      borderColor: 'var(--border-light)',
      fontWeight: 'normal'
    },
    dark: {
      background: 'var(--bg-deep-black)',
      color: 'var(--gold-primary)',
      borderColor: 'var(--border-light)',
      fontWeight: 'bold',
      boxShadow: 'var(--shadow-lg)'
    }
  };
  return styles[variant] || styles.primary;
};

export default function Button({ variant = 'primary', size = 'md', to, className = '', style, children, ...rest }) {
  const variantStyle = getVariantStyle(variant);
  const sizeStyle = SIZES[size] || SIZES.md;
  const baseStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.375rem',
    transition: 'all var(--transition-base)',
    cursor: 'pointer',
    border: '1px solid',
    ...variantStyle,
    ...sizeStyle,
    ...style
  };

  const hoverStyle = {
    primary: { filter: 'brightness(1.1)', boxShadow: 'var(--shadow-gold-lg)' },
    accent: { background: 'rgba(212, 175, 55, 0.25)', borderColor: 'rgba(212, 175, 55, 0.7)' },
    ghost: { background: 'var(--bg-card-hover)', borderColor: 'var(--border-gold)', color: 'var(--gold-primary)' },
    secondary: { background: 'var(--bg-card-hover)', borderColor: 'var(--border-gold)', color: 'var(--white)' },
    danger: { filter: 'brightness(1.1)' },
    warning: { filter: 'brightness(1.1)' },
    success: { filter: 'brightness(1.1)' },
    subtle: { background: 'var(--bg-card)', color: 'var(--white)' },
    dark: { background: 'var(--bg-card)', color: 'var(--gold-bright)' }
  };

  const combinedStyle = {
    ...baseStyle
  };

  const handleMouseEnter = (e) => {
    Object.assign(e.target.style, hoverStyle[variant] || hoverStyle.primary);
  };

  const handleMouseLeave = (e) => {
    Object.assign(e.target.style, baseStyle);
  };

  if (to) return <Link to={to} className={className} style={combinedStyle} onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave} {...rest}>{children}</Link>;
  return <button className={className} style={combinedStyle} onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave} {...rest}>{children}</button>;
}
