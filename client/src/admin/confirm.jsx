import { useSyncExternalStore } from 'react';

// Confirm dialog แบบ promise — ใช้ได้ทั่ว admin: const ok = await confirmAction({...})
let state = { open: false, opts: null, resolve: null };
const listeners = new Set();
const emit = () => listeners.forEach(l => l());

let hostMounted = false;
export function markHostMounted() { hostMounted = true; }

export function confirmAction(opts = {}) {
  // fallback: ถ้า ConfirmHost ยังไม่ mount (เช่น bundle เก่า/edge case) ใช้ native confirm แทนค้าง
  if (!hostMounted) {
    const o = { title: 'ยืนยันการดำเนินการ', message: 'คุณต้องการดำเนินการนี้หรือไม่?', ...opts };
    return Promise.resolve(window.confirm(`${o.title}\n\n${o.message}`));
  }
  return new Promise(resolve => {
    state = {
      open: true,
      resolve,
      opts: {
        title: 'ยืนยันการดำเนินการ',
        message: 'คุณต้องการดำเนินการนี้หรือไม่?',
        confirmLabel: 'ยืนยัน',
        cancelLabel: 'ยกเลิก',
        danger: false,
        ...opts,
      },
    };
    emit();
  });
}

function settle(ok) {
  const r = state.resolve;
  state = { open: false, opts: null, resolve: null };
  emit();
  r?.(ok);
}

export function ConfirmHost() {
  markHostMounted();
  const snap = useSyncExternalStore(
    cb => { listeners.add(cb); return () => listeners.delete(cb); },
    () => state,
  );
  if (!snap.open || !snap.opts) return null;
  const o = snap.opts;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4" onClick={() => settle(false)}>
      <div className="bg-navy-800 border border-gold-500/40 rounded-2xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <div className="text-4xl mb-2 text-center">{o.danger ? '⚠️' : '❓'}</div>
        <h2 className="text-lg font-bold text-white text-center">{o.title}</h2>
        <p className="text-sm text-navy-200 text-center mt-2 whitespace-pre-line">{o.message}</p>
        <div className="flex gap-3 mt-5">
          <button onClick={() => settle(false)}
            className="flex-1 border border-navy-600 text-navy-200 py-2.5 rounded-lg hover:bg-navy-700">
            {o.cancelLabel}
          </button>
          <button onClick={() => settle(true)} autoFocus={o.danger}
            className={`flex-1 font-bold py-2.5 rounded-lg ${o.danger ? 'bg-red-500 text-white hover:bg-gold-400' : 'bg-gold-500 text-navy-950 hover:bg-gold-400'}`}>
            {o.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
