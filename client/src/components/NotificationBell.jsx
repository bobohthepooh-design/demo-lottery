import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { Icon } from './icons.jsx';

const TYPE_ICON = { win: '🏆', credit: '💰', deposit: '💳', withdraw: '🏧', refund: '↩️', system: '🔔' };

// กระดิ่งแจ้งเตือน — poll ทุก 60 วิ + refetch เมื่อ SSE แจ้ง update
export default function NotificationBell() {
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();

  const load = () => api('/notifications').then(r => { setItems(r.notifications); setUnread(r.unread); }).catch(() => {});

  useEffect(() => {
    load();
    const t = setInterval(load, 60000);
    const onUpdate = () => load();
    window.addEventListener('sys:update', onUpdate);
    return () => { clearInterval(t); window.removeEventListener('sys:update', onUpdate); };
  }, []);

  // ปิด dropdown เมื่อคลิกข้างนอก
  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const markAll = async () => {
    try { await api('/notifications/read', { method: 'POST', body: {} }); setUnread(0); setItems(xs => xs.map(x => ({ ...x, read_at: x.read_at || 'now' }))); }
    catch {}
  };

  const openItem = async (n) => {
    if (!n.read_at) {
      try { await api('/notifications/read', { method: 'POST', body: { ids: [n.id] } }); } catch {}
      setItems(xs => xs.map(x => x.id === n.id ? { ...x, read_at: 'now' } : x));
      setUnread(u => Math.max(0, u - 1));
    }
    setOpen(false);
    if (n.link) navigate(n.link);
  };

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(!open)} title="การแจ้งเตือน"
        className="relative flex items-center justify-center w-9 h-9 rounded-lg border border-navy-600/80 bg-navy-900/60 text-navy-200 hover:text-gold-300 hover:border-gold-500/50 transition">
        <Icon name="bell" className="w-4.5 h-4.5" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="fixed right-3 top-16 w-[calc(100vw-24px)] max-w-sm bg-navy-800 border border-navy-600 rounded-xl shadow-2xl z-50 overflow-hidden sm:absolute sm:right-0 sm:top-full sm:mt-2 sm:w-80 sm:max-w-[90vw]">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-navy-700">
            <span className="text-sm font-bold text-white">การแจ้งเตือน</span>
            {unread > 0 && (
              <button onClick={markAll} className="text-xs text-gold-400 hover:underline">อ่านทั้งหมด</button>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {items.length === 0 && <div className="px-4 py-6 text-center text-xs text-navy-400">ยังไม่มีการแจ้งเตือน</div>}
            {items.map(n => (
              <button key={n.id} onClick={() => openItem(n)}
                className={`w-full text-left px-4 py-3 border-b border-navy-700/50 hover:bg-navy-700/40 transition ${n.read_at ? 'opacity-60' : ''}`}>
                <div className="flex items-start gap-2">
                  <span className="text-base leading-5">{TYPE_ICON[n.type] || '🔔'}</span>
                  <div className="min-w-0 flex-1">
                    <div className={`text-xs ${n.read_at ? 'text-navy-300' : 'text-white font-semibold'}`}>{n.title}</div>
                    {n.body && <div className="text-[11px] text-navy-400 truncate mt-0.5">{n.body}</div>}
                    <div className="text-[10px] text-navy-500 mt-1">{n.created_at}</div>
                  </div>
                  {!n.read_at && <span className="w-2 h-2 rounded-full bg-gold-400 mt-1.5 shrink-0" />}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
