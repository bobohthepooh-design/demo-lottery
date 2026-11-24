import { forwardRef } from 'react';

/**
 * LuxuryInput - ช่องกรอกสไตล์ Luxury Gold
 * พื้นเข้ม + border จาง + glow ทองเมื่อ focus
 */
const LuxuryInput = forwardRef(({ className = '', ...props }, ref) => {
  return (
    <input
      ref={ref}
      className={`luxury-input ${className}`}
      {...props}
    />
  );
});

LuxuryInput.displayName = 'LuxuryInput';

export default LuxuryInput;
