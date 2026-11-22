import { useEffect, useRef, useState } from 'react';
import { api, fmtDateTime } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Icon } from './icons.jsx';

// Widget แชทลอยมุมขวาล่าง — สมาชิกคุยกับแอดมิน 1:1
// แสดงเฉพาะสมาชิกที่ login (ไม่แสดงบนหน้า /admin — admin ใช้หน้าแชทของตัวเอง)

export default function ChatWidget() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState([]);
  const [unread, setUnread] = useState(0);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const bottomRef = useRef(null);
  const loadedRef = useRef(false);

  const loadThread = () => api('/chat/thread')
    .then(r => { setMsgs(r.messages || []); loadedRef.current = true; })
    .catch(() => {});
  const loadUnread = () => api('/chat/unread').then(r => setUnread(r.unread || 0)).catch(() => {});

  // badge poll ทุก 30 วิ + refetch ทันทีเมื่อ SSE แจ้ง 'chat'
  useEffect(() => {
    if (!user) return;
    loadUnread();
    const t = setInterval(loadUnread, 30000);
    const h = (e) => { if (e.detail?.kind === 'chat') { loadUnread(); if (open) loadThread(); } };
    window.addEventListener('sys:update', h);
    return () => { clearInterval(t); window.removeEventListener('sys:update', h); };
  }, [user, open]);

  // โหลดข้อความตอนเปิด + poll เบาๆ ทุก 8 วิขณะเปิด + scroll ลงล่าง
  useEffect(() => {
    if (!open) return;
    loadThread();
    const t = setInterval(loadThread, 8000);
    return () => clearInterval(t);
  }, [open]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs.length, open]);

  const send = async () => {
    const body = input.trim();
    if (!body || busy) return;
    setBusy(true); setErr('');
    try {
      await api('/chat/messages', { method: 'POST', body: { body } });
      setInput('');
      loadThread();
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  if (!user) return null;

  return (
    <>
      {/* ปุ่มลอย — มุมขวาล่าง เหนือ bottom nav บนมือถือ */}
      <button onClick={() => { setOpen(o => !o); if (!open) { loadThread(); loadUnread(); setUnread(0); } }}
        aria-label="แชทกับแอดมิน"
        className="fixed bottom-20 lg:bottom-6 right-4 z-40 w-12 h-12 rounded-full bg-gradient-to-br from-gold-400 to-gold-600 text-navy-950 shadow-lg shadow-gold-500/30 flex items-center justify-center hover:scale-105 transition border border-gold-200/60">
        <Icon name="chat" className="w-6 h-6" />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-red-500 text-white text-[10px] font-black flex items-center justify-center border-2 border-navy-950">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {/* กล่องแชท */}
      {open && (
        <div className="fixed bottom-36 lg:bottom-20 right-4 z-40 w-[340px] max-w-[calc(100vw-2rem)] h-[460px] max-h-[calc(100vh-10rem)] flex flex-col rounded-2xl border border-gold-500/40 bg-navy-900 shadow-2xl shadow-black/60 overflow-hidden animate-result-pop">
          <div className="h-1 bg-gradient-to-r from-gold-500/50 to-gold-600/50 shrink-0" />
          <div className="flex items-center gap-2 px-3 py-2.5 border-b border-navy-700 bg-navy-800/80">
            <span className="w-8 h-8 rounded-full bg-gold-500/15 border border-gold-500/40 flex items-center justify-center text-gold-400">
              <Icon name="chat" className="w-4 h-4" />
            </span>
            <div className="leading-tight">
              <div className="text-sm font-bold text-white">แชทกับแอดมิน</div>
              <div className="text-[10px] text-green-400 flex items-center gap-1"><span className="online-dot w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />ออนไลน์ • ตอบภายในเวลาทำการ</div>
            </div>
            <button onClick={() => setOpen(false)} className="ml-auto text-navy-400 hover:text-white text-lg px-2">✕</button>
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2 bg-navy-950/50">
            {!loadedRef.current && <div className="text-center text-xs text-navy-400 py-6">กำลังโหลด...</div>}
            {loadedRef.current && msgs.length === 0 && (
              <div className="text-center text-xs text-navy-400 py-8">
                ยังไม่มีข้อความ — สวัสดีค่ะ มีอะไรให้ช่วยเหลือไหมคะ?<br />
                <span className="text-navy-500">(ระบบทดลอง — ข้อความไม่ได้ส่งออกจริง)</span>
              </div>
            )}
            {msgs.map(m => (
              <div key={m.id} className={`flex ${m.mine ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[78%] rounded-2xl px-3 py-2 text-[13px] leading-snug whitespace-pre-wrap break-words ${
                  m.mine
                    ? 'bg-gradient-to-br from-gold-500/80 to-gold-600/80 text-navy-950 rounded-br-sm'
                    : 'bg-navy-800 border border-navy-600 text-navy-100 rounded-bl-sm'
                }`}>
                  {!m.mine && <div className="text-[9px] text-gold-400/80 font-semibold mb-0.5">{m.isAdmin ? 'แอดมิน' : m.sender}</div>}
                  {m.body}
                  <div className={`text-[8px] mt-0.5 ${m.mine ? 'text-navy-800/70' : 'text-navy-500'}`}>{fmtDateTime(m.createdAt)}</div>
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          {err && <div className="text-red-400 text-xs px-3 py-1">{err}</div>}
          <div className="p-2 border-t border-navy-700 bg-navy-800/60 flex gap-2">
            <input value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
              maxLength={500} placeholder="พิมพ์ข้อความถึงแอดมิน..."
              className="flex-1 bg-navy-900 border border-navy-600 rounded-xl px-3 py-2 text-sm focus:outline-none" />
            <button onClick={send} disabled={busy || !input.trim()}
              className="bg-gold-500 text-navy-950 font-bold px-4 rounded-xl text-sm disabled:opacity-50 hover:brightness-105">
              ส่ง
            </button>
          </div>
        </div>
      )}
    </>
  );
}
