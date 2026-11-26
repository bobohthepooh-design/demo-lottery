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
        <h1 className="text-2xl font-bold [color:var(--white)]">แชทสมาชิก</h1>
        {totalUnread > 0 && (
          <span className="text-xs rounded-full px-3 py-1 font-bold [background:rgba(212,_175,_55,_0.15)] [border:1px_solid_var(--border-gold)] [color:var(--gold-primary)]">
            ยังไม่อ่าน {totalUnread} ข้อความ
          </span>
        )}
      </div>

      {/* แถบแจ้งเตือน — สมาชิกส่งข้อความมา ยังไม่อ่าน */}
      {unreadThreads.length > 0 && (
        <div className="rounded-xl px-4 py-2.5 flex flex-wrap items-center gap-2 [background:rgba(245,_158,_11,_0.1)] [border:1px_solid_rgba(245,_158,_11,_0.4)]">
          <span className="text-sm font-bold [color:var(--warning-amber)]">📩 มีข้อความใหม่จากสมาชิก:</span>
          {unreadThreads.map(t => (
            <button key={t.threadId} onClick={() => setSel(t.userId)}
              className="text-xs rounded-full px-3 py-1 font-semibold transition [background:rgba(245,_158,_11,_0.2)] [border:1px_solid_rgba(245,_158,_11,_0.4)] [color:var(--light-gray)]">
              {t.displayName || t.username} ({t.unread} ข้อความ) — กดเพื่ออ่าน
            </button>
          ))}
        </div>
      )}

      <div className="flex gap-4 h-[calc(100vh-13rem)] min-h-[420px]">
        {/* รายการ thread */}
        <div className={`w-full md:w-80 shrink-0 flex-col rounded-xl overflow-hidden ${sel ? 'hidden md:flex' : 'flex'} [background:var(--bg-dark-surface)] [border:1px_solid_var(--border-light)]`}>
          <div className="px-3 py-2.5 text-xs font-bold uppercase tracking-wide [border-bottom:1px_solid_var(--border-light)] [color:var(--muted-gray)]">บทสนทนา ({threads.length})</div>
          <div className="flex-1 overflow-y-auto [border-color:var(--border-light)]">
            {threads.length === 0 && <div className="p-6 text-center text-xs [color:var(--muted-gray)]">ยังไม่มีข้อความจากสมาชิก</div>}
            {threads.map(t => (
              <button key={t.threadId} onClick={() => setSel(t.userId)}
                className="w-full text-left px-3 py-2.5 transition"
                style={sel === t.userId ? { background: 'rgba(212, 175, 55, 0.1)', borderLeft: '2px solid var(--gold-primary)' } : { borderBottom: '1px solid var(--border-light)' }}
                onMouseEnter={e => { if (sel !== t.userId) e.currentTarget.style.background = 'var(--bg-card-hover)'; }}
                onMouseLeave={e => { if (sel !== t.userId) e.currentTarget.style.background = 'transparent'; }}>
                <div className="flex items-center gap-2">
                  <span className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 [background:var(--bg-card)] [border:1px_solid_var(--border-light)] [color:var(--gold-primary)]">
                    {(t.displayName || t.username || '?').slice(0, 1).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold truncate [color:var(--white)]">{t.displayName || t.username}</span>
                      <span className="text-[10px] shrink-0 [color:var(--dark-gray)]">{t.lastMsgAt ? fmtDateTime(t.lastMsgAt).slice(0, 10) : ''}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className={`text-xs truncate`} style={{ color: t.lastIsAdmin ? 'var(--muted-gray)' : 'var(--light-gray)' }}>
                        {t.lastIsAdmin ? 'คุณ: ' : ''}{t.lastBody || '—'}
                      </span>
                      {t.unread > 0 && <span className="min-w-4 h-4 px-1 rounded-full text-white text-[9px] font-black flex items-center justify-center shrink-0 [background:var(--danger-red)]">{t.unread}</span>}
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* หน้าต่างแชท */}
        <div className={`flex-1 flex-col rounded-xl overflow-hidden ${sel ? 'flex' : 'hidden md:flex'} [background:var(--bg-dark-surface)] [border:1px_solid_var(--border-light)]`}>
          {!sel ? (
            <div className="flex-1 flex items-center justify-center text-sm [color:var(--muted-gray)]">เลือกบทสนทนาจากรายการด้านซ้าย</div>
          ) : (
            <>
              <div className="flex items-center gap-2 px-4 py-3 [border-bottom:1px_solid_var(--border-light)] [background:var(--bg-card)]">
                <button onClick={() => setSel(null)} className="md:hidden mr-1 [color:var(--muted-gray)]">←</button>
                <span className="font-bold [color:var(--white)]">{selThread?.displayName || selThread?.username || `User #${sel}`}</span>
                <span className="text-xs [color:var(--muted-gray)]">@{selThread?.username}</span>
              </div>
              <ScrollArea className="flex-1 min-h-0 px-4 py-3 [background:var(--bg-deep-black)]">
                <div className="space-y-2 min-h-full flex flex-col">
                {msgs.map(m => (
                  <div key={m.id} className={`flex ${m.isAdmin ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[75%] rounded-2xl px-3 py-2 text-[13px] leading-snug whitespace-pre-wrap break-words ${
                      m.isAdmin
                        ? 'rounded-br-sm'
                        : 'rounded-bl-sm'
                    }`} style={m.isAdmin ? { background: 'linear-gradient(to bottom right, rgba(212, 175, 55, 0.8), rgba(212, 175, 55, 0.9))', color: 'var(--bg-deep-black)' } : { background: 'var(--bg-card)', border: '1px solid var(--border-light)', color: 'var(--light-gray)' }}>
                      {m.body}
                      <div className="text-[8px] mt-0.5" style={{ color: m.isAdmin ? 'rgba(16, 17, 20, 0.7)' : 'var(--dark-gray)' }}>{fmtDateTime(m.createdAt)}</div>
                    </div>
                  </div>
                ))}
                <div ref={bottomRef} />
                </div>
              </ScrollArea>
              <div className="p-3 flex gap-2 [border-top:1px_solid_var(--border-light)] [background:var(--bg-card)]">
                <input value={input} onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
                  maxLength={500} placeholder={`ตอบกลับ ${selThread?.displayName || selThread?.username || ''}...`}
                  className="flex-1 rounded-xl px-3 py-2 text-sm focus:outline-none [background:var(--bg-dark-surface)] [border:1px_solid_var(--border-light)] [color:var(--white)]" />
                <Button onClick={send} disabled={busy || !input.trim()} size="md" className="px-4 [background:linear-gradient(135deg,_var(--gold-gradient-start),_var(--gold-gradient-end))] [color:var(--bg-deep-black)]">
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
