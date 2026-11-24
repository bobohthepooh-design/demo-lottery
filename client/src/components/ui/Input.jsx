import { forwardRef } from 'react';

// Input มาตรฐาน — label + input + hint/error ในตัว, focus ring เดียวทั้งเว็บ
const baseInputStyle = {
  width: '100%',
  background: 'var(--bg-dark-surface)',
  border: '1px solid var(--border-light)',
  borderRadius: 'var(--radius-lg)',
  padding: '0.75rem 1rem',
  color: 'var(--white)',
  transition: 'all var(--transition-base)'
};

const focusStyle = {
  outline: 'none',
  borderColor: 'var(--gold-primary)',
  boxShadow: '0 0 0 3px rgba(212, 175, 55, 0.1)'
};

const errorStyle = {
  borderColor: 'var(--danger-red)'
};

export const Input = forwardRef(function Input({ label, hint, error, className = '', inputClassName = '', id, style, ...rest }, ref) {
  const inputId = id || rest.name;
  const inputStyle = {
    ...baseInputStyle,
    ...(error ? errorStyle : {}),
    ...style
  };

  return (
    <div className={className}>
      {label && <label htmlFor={inputId} className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--muted-gray)' }}>{label}</label>}
      <input
        ref={ref}
        id={inputId}
        className={inputClassName}
        style={inputStyle}
        aria-invalid={!!error || undefined}
        onFocus={(e) => {
          e.target.style.borderColor = 'var(--gold-primary)';
          e.target.style.boxShadow = '0 0 0 3px rgba(212, 175, 55, 0.1)';
        }}
        onBlur={(e) => {
          if (error) {
            e.target.style.borderColor = 'var(--danger-red)';
            e.target.style.boxShadow = 'none';
          } else {
            e.target.style.borderColor = 'var(--border-light)';
            e.target.style.boxShadow = 'none';
          }
        }}
        {...rest}
      />
      {error ? <div className="text-xs mt-1.5" style={{ color: 'var(--danger-red)' }} role="alert">{error}</div>
        : hint && <div className="text-xs mt-1.5" style={{ color: 'var(--dark-gray)' }}>{hint}</div>}
    </div>
  );
});

export function Select({ label, hint, error, className = '', inputClassName = '', id, style, children, ...rest }) {
  const inputId = id || rest.name;
  const selectStyle = {
    ...baseInputStyle,
    ...(error ? errorStyle : {}),
    ...style
  };

  return (
    <div className={className}>
      {label && <label htmlFor={inputId} className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--muted-gray)' }}>{label}</label>}
      <select
        id={inputId}
        className={inputClassName}
        style={selectStyle}
        aria-invalid={!!error || undefined}
        onFocus={(e) => {
          e.target.style.borderColor = 'var(--gold-primary)';
          e.target.style.boxShadow = '0 0 0 3px rgba(212, 175, 55, 0.1)';
        }}
        onBlur={(e) => {
          if (error) {
            e.target.style.borderColor = 'var(--danger-red)';
            e.target.style.boxShadow = 'none';
          } else {
            e.target.style.borderColor = 'var(--border-light)';
            e.target.style.boxShadow = 'none';
          }
        }}
        {...rest}
      >{children}</select>
      {error ? <div className="text-xs mt-1.5" style={{ color: 'var(--danger-red)' }} role="alert">{error}</div>
        : hint && <div className="text-xs mt-1.5" style={{ color: 'var(--dark-gray)' }}>{hint}</div>}
    </div>
  );
}
