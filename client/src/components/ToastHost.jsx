import { useEffect, useState } from 'react';

const KIND_STYLE = {
  success: 'border-green-500/50 text-green-300',
  error: 'border-red-500/50 text-red-300',
  info: 'border-gold-500/40 text-gold-200',
};
const KIND_ICON = { success: '✅', error: '❌', info: 'ℹ️' };

let nextId = 0;

// Toast stack — mount ครั้งเดียวใน Layout
export default function ToastHost() {
  const [items, setItems] = useState([]);

  useEffect(() => {
    const onToast = (e) => {
      const { message, kind } = e.detail || {};
      if (!message) return;
      const id = ++nextId;
      setItems(list => [...list.slice(-4), { id, message, kind: KIND_STYLE[kind] ? kind : 'info' }]);
      setTimeout(() => setItems(list => list.filter(t => t.id !== id)), 4000);
    };
    window.addEventListener('app:toast', onToast);
    return () => window.removeEventListener('app:toast', onToast);
  }, []);

  if (!items.length) return null;

  return (
    <div className="fixed bottom-20 lg:bottom-6 right-4 z-[60] space-y-2 max-w-xs w-full pointer-events-none">
      {items.map(t => (
        <div key={t.id}
          className={`pointer-events-auto bg-navy-800/95 backdrop-blur border rounded-lg px-4 py-2.5 text-sm shadow-lg shadow-black/40 animate-toast ${KIND_STYLE[t.kind]}`}>
          <span className="mr-1.5">{KIND_ICON[t.kind]}</span>{t.message}
        </div>
      ))}
    </div>
  );
}
