import { useEffect, useRef, useState } from 'react';
import { api, fmtDateTime } from '../api.js';
import { toast } from '../components/toast.js';
import { Button } from '../components/ui/index.js';
import { ScrollArea } from '../components/shadcn/scroll-area.jsx';

// หน้าแชทแอดมิน — รายการ thread สมาชิก + ตอบกลับ 1:1
export default function AdminChat() {
  const [threads, setThreads] = useState([]);
  const [sel, setSel] = useState(null); // userId ที่เลือก
  const [msgs, setMsgs] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef(null);

  const loadThreads = () => api('/admin/chat/threads').then(r => setThreads(r.threads || [])).catch(() => {});
  const loadMsgs = (uid) => api(`/admin/chat/threads/${uid}/messages`)
    .then(r => setMsgs(r.messages || [])).catch(() => {});

  useEffect(() => {
    loadThreads();
    const t = setInterval(loadThreads, 10000);
    const h = (e) => { if (e.detail?.kind === 'chat') loadThreads(); };
    window.addEventListener('sys:update', h);
    return () => { clearInterval(t); window.removeEventListener('sys:update', h); };
  }, []);

  useEffect(() => {
    if (!sel) { setMsgs([]); return; }
    loadMsgs(sel);
    const t = setInterval(() => loadMsgs(sel), 5000);
    return () => clearInterval(t);
  }, [sel]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs.length, sel]);

  const send = async () => {
    const body = input.trim();
    if (!body || busy || !sel) return;
    setBusy(true);
    try {
      await api(`/admin/chat/threads/${sel}/messages`, { method: 'POST', body: { body } });
      setInput('');
      loadMsgs(sel); loadThreads();
    } catch (e) { toast(e.message, 'error'); }
    finally { setBusy(false); }
  };

  const totalUnread = threads.reduce((s, t) => s + (t.unread || 0), 0);
  const unreadThreads = threads.filter(t => t.unread > 0);
  const selThread = threads.find(t => t.userId === sel);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">แชทสมาชิก</h1>
        {totalUnread > 0 && (
          <span className="text-xs bg-gold-500/15 border border-gold-500/40 text-gold-300 rounded-full px-3 py-1 font-bold">
            ยังไม่อ่าน {totalUnread} ข้อความ
          </span>
        )}
      </div>

      {/* แถบแจ้งเตือน — สมาชิกส่งข้อความมา ยังไม่อ่าน */}
      {unreadThreads.length > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/40 rounded-xl px-4 py-2.5 flex flex-wrap items-center gap-2">
          <span className="text-amber-300 text-sm font-bold">📩 มีข้อความใหม่จากสมาชิก:</span>
          {unreadThreads.map(t => (
            <button key={t.threadId} onClick={() => setSel(t.userId)}
              className="text-xs bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-200 rounded-full px-3 py-1 font-semibold transition">
              {t.displayName || t.username} ({t.unread} ข้อความ) — กดเพื่ออ่าน
            </button>
          ))}
        </div>
      )}

      <div className="flex gap-4 h-[calc(100vh-13rem)] min-h-[420px]">
        {/* รายการ thread */}
        <div className={`w-full md:w-80 shrink-0 flex-col bg-navy-800 border border-navy-700 rounded-xl overflow-hidden ${sel ? 'hidden md:flex' : 'flex'}`}>
          <div className="px-3 py-2.5 border-b border-navy-700 text-xs font-bold text-navy-300 uppercase tracking-wide">บทสนทนา ({threads.length})</div>
          <div className="flex-1 overflow-y-auto divide-y divide-navy-700/60">
            {threads.length === 0 && <div className="p-6 text-center text-xs text-navy-400">ยังไม่มีข้อความจากสมาชิก</div>}
            {threads.map(t => (
              <button key={t.threadId} onClick={() => setSel(t.userId)}
                className={`w-full text-left px-3 py-2.5 hover:bg-navy-700/40 transition ${sel === t.userId ? 'bg-gold-500/10 border-l-2 border-gold-400' : ''}`}>
                <div className="flex items-center gap-2">
                  <span className="w-8 h-8 rounded-full bg-navy-700 border border-navy-600 flex items-center justify-center text-xs font-bold text-gold-300 shrink-0">
                    {(t.displayName || t.username || '?').slice(0, 1).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-white truncate">{t.displayName || t.username}</span>
                      <span className="text-[10px] text-navy-500 shrink-0">{t.lastMsgAt ? fmtDateTime(t.lastMsgAt).slice(0, 10) : ''}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className={`text-xs truncate ${t.lastIsAdmin ? 'text-navy-400' : 'text-navy-200'}`}>
                        {t.lastIsAdmin ? 'คุณ: ' : ''}{t.lastBody || '—'}
                      </span>
                      {t.unread > 0 && <span className="min-w-4 h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-black flex items-center justify-center shrink-0">{t.unread}</span>}
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* หน้าต่างแชท */}
        <div className={`flex-1 flex-col bg-navy-800 border border-navy-700 rounded-xl overflow-hidden ${sel ? 'flex' : 'hidden md:flex'}`}>
          {!sel ? (
            <div className="flex-1 flex items-center justify-center text-sm text-navy-400">เลือกบทสนทนาจากรายการด้านซ้าย</div>
          ) : (
            <>
              <div className="flex items-center gap-2 px-4 py-3 border-b border-navy-700 bg-navy-900/60">
                <button onClick={() => setSel(null)} className="md:hidden text-navy-400 hover:text-white mr-1">←</button>
                <span className="font-bold text-white">{selThread?.displayName || selThread?.username || `User #${sel}`}</span>
                <span className="text-xs text-navy-400">@{selThread?.username}</span>
              </div>
              <ScrollArea className="flex-1 bg-navy-950/40 px-4 py-3">
                <div className="space-y-2 min-h-full flex flex-col">
                {msgs.map(m => (
                  <div key={m.id} className={`flex ${m.isAdmin ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[75%] rounded-2xl px-3 py-2 text-[13px] leading-snug whitespace-pre-wrap break-words ${
                      m.isAdmin
                        ? 'bg-gradient-to-br from-gold-500/80 to-gold-600/80 text-navy-950 rounded-br-sm'
                        : 'bg-navy-700 border border-navy-600 text-navy-100 rounded-bl-sm'
                    }`}>
                      {m.body}
                      <div className={`text-[8px] mt-0.5 ${m.isAdmin ? 'text-navy-800/70' : 'text-navy-500'}`}>{fmtDateTime(m.createdAt)}</div>
                    </div>
                  </div>
                ))}
                <div ref={bottomRef} />
                </div>
              </ScrollArea>
              <div className="p-3 border-t border-navy-700 bg-navy-900/60 flex gap-2">
                <input value={input} onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
                  maxLength={500} placeholder={`ตอบกลับ ${selThread?.displayName || selThread?.username || ''}...`}
                  className="flex-1 bg-navy-900 border border-navy-600 rounded-xl px-3 py-2 text-sm focus:outline-none" />
                <Button onClick={send} disabled={busy || !input.trim()} size="md" className="px-4">
                  ส่ง
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
