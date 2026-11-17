import { forwardRef } from 'react';

// Input มาตรฐาน — label + input + hint/error ในตัว, focus ring เดียวทั้งเว็บ
const baseCls = 'w-full bg-navy-900 border border-navy-600 rounded-lg px-4 py-3 text-white placeholder:text-navy-500 focus:outline-none focus:border-cyan-400/70 transition';

export const Input = forwardRef(function Input({ label, hint, error, className = '', inputClassName = '', id, ...rest }, ref) {
  const inputId = id || rest.name;
  return (
    <div className={className}>
      {label && <label htmlFor={inputId} className="block text-xs font-semibold text-navy-300 mb-1.5">{label}</label>}
      <input ref={ref} id={inputId} className={`${baseCls} ${error ? 'border-red-500/60' : ''} ${inputClassName}`} aria-invalid={!!error || undefined} {...rest} />
      {error ? <div className="text-red-400 text-xs mt-1.5" role="alert">{error}</div>
        : hint && <div className="text-navy-400 text-xs mt-1.5">{hint}</div>}
    </div>
  );
});

export function Select({ label, hint, error, className = '', id, children, ...rest }) {
  const inputId = id || rest.name;
  return (
    <div className={className}>
      {label && <label htmlFor={inputId} className="block text-xs font-semibold text-navy-300 mb-1.5">{label}</label>}
      <select id={inputId} className={`${baseCls} ${error ? 'border-red-500/60' : ''}`} {...rest}>{children}</select>
      {error ? <div className="text-red-400 text-xs mt-1.5" role="alert">{error}</div>
        : hint && <div className="text-navy-400 text-xs mt-1.5">{hint}</div>}
    </div>
  );
}
