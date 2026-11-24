import { ReactNode } from 'react';

/**
 * LuxuryButton - ปุ่มสไตล์ Luxury Gold
 * variant: 'primary' (ทอง gradient), 'outline' (ขอบทอง), 'ghost' (โปร่ง)
 */
export default function LuxuryButton({ 
  children, 
  className = '', 
  variant = 'primary', 
  disabled = false, 
  ...props 
}) {
  const baseClasses = 'luxury-btn font-semibold';
  
  const variantClasses = {
    primary: '',
    outline: 'luxury-btn-outline',
    ghost: 'luxury-btn-ghost',
  };
  
  const disabledClasses = disabled ? 'opacity-50 cursor-not-allowed pointer-events-none' : '';
  
  return (
    <button 
      className={`${baseClasses} ${variantClasses[variant]} ${disabledClasses} ${className}`}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}
