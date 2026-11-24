import { ReactNode } from 'react';

/**
 * LuxuryCard - การ์ดพื้นฐานสไตล์ Luxury Gold
 * ใช้สีพื้นทองเข้ม + เงา + border ทองจาง
 */
export default function LuxuryCard({ children, className = '', hoverable = true, goldBorder = false, ...props }) {
  const baseClasses = 'luxury-card p-6';
  const hoverClasses = hoverable ? 'hoverable' : '';
  const borderClasses = goldBorder ? 'luxury-card-gold-border' : '';
  
  return (
    <div className={`${baseClasses} ${hoverClasses} ${borderClasses} ${className}`} {...props}>
      {children}
    </div>
  );
}
