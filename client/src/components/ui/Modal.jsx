import { useEffect } from 'react';
import { createPortal } from 'react-dom';

// Modal มาตรฐาน — portal + ESC ปิด + คลิก backdrop ปิด + z-index เดียวทั้งเว็บ
// ใช้แทน createPortal+overlay ที่เขียนเองในแต่ละหน้า
export default function Modal({ open, onClose, title, children, footer, wide, dismissable = true, contentClassName = '' }) {
  useEffect(() => {
    if (!open || !dismissable) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose, dismissable]);

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[9990] flex items-center justify-center bg-black/70 p-4 overflow-y-auto"
      onClick={dismissable ? onClose : undefined} role="dialog" aria-modal="true" aria-label={title || undefined}>
      <div className={`bg-navy-800 border border-navy-600/80 rounded-2xl shadow-2xl shadow-black/60 w-full ${wide ? 'max-w-2xl' : 'max-w-md'} my-8 max-h-[90vh] flex flex-col ${contentClassName}`}>
        onClick={e => e.stopPropagation()}>
        {title && (
          <div className="flex items-center justify-between px-5 py-4 border-b border-navy-700/60">
            <h2 className="font-bold text-white">{title}</h2>
            {dismissable && (
              <button onClick={onClose} aria-label="ปิด"
                className="w-8 h-8 rounded-lg text-navy-400 hover:text-white hover:bg-navy-700 transition text-lg leading-none">✕</button>
            )}
          </div>
        )}
        <div className="p-5 overflow-y-auto">{children}</div>
        {footer && <div className="px-5 py-4 border-t border-navy-700/60 flex gap-3">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}
