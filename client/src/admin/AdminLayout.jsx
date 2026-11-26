import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { ConfirmHost } from './confirm.jsx';
import { useAuth } from '../auth.jsx';
import { api } from '../api.js';
import { Icon } from '../components/icons.jsx';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '../components/shadcn/sheet.jsx';
import { toast } from '../components/toast.js';
import { adminGroups } from './navConfig.js';
import CommandPalette from './CommandPalette.jsx';
import { useEffect, useMemo, useRef, useState } from 'react';

export default function AdminLayout() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [chatUnread, setChatUnread] = useState(0);
  const [payPending, setPayPending] = useState(0); // คำขอเติม/ถอนที่รอตรวจสอบ
  const [apprPending, setApprPending] = useState(0); // คำขอ maker-checker ที่รออนุมัติ
  const [navOpen, setNavOpen] = useState(false); // mobile nav drawer
  const [paletteOpen, setPaletteOpen] = useState(false); // command palette (Ctrl+K)
  const prevUnread = useRef(0);

  const perms = user?.permissions || [];
  const hasPerm = (p) => !p || perms.includes(p) || perms.includes('*');
  const visibleGroups = useMemo(() => adminGroups
    .map(g => ({ ...g, items: g.items.filter(i => hasPerm(i.perm)) }))
    .filter(g => g.items.length > 0), [perms]);

  // badge จำนวนแชทที่ยังไม่อ่าน — poll 15 วิ + อัปเดตทันทีเมื่อ SSE แจ้ง 'chat'
  // ถ้ามีข้อความใหม่เข้ามาแบบ real-time → เด้ง toast แจ้งเตือน
  useEffect(() => {
    const load = (notify = false) => api('/admin/chat/unread')
      .then(r => {
        const n = r.unread || 0;
        if (notify && n > prevUnread.current) toast(`มีข้อความแชทใหม่จากสมาชิก (${n} ข้อความยังไม่อ่าน)`, 'info');
        prevUnread.current = n;
        setChatUnread(n);
      })
      .catch(() => {});
    load();
    const t = setInterval(() => load(), 15000);
    const h = (e) => { if (e.detail?.kind === 'chat') load(true); };
    window.addEventListener('sys:update', h);
    return () => { clearInterval(t); window.removeEventListener('sys:update', h); };
  }, []);

  // badge จำนวนคำขอเติม/ถอนที่รอตรวจสอบ — poll 30 วิ (SSE 'payments' ถ้ามีจะอัปเดตเร็วขึ้น)
  useEffect(() => {
    const load = () => api('/admin/payments?status=pending')
      .then(r => setPayPending((r.requests || []).length))
      .catch(() => {});
    load();
    const t = setInterval(load, 30000);
    const h = (e) => { if (['payments', 'notify', 'approvals'].includes(e.detail?.kind)) load(); };
    window.addEventListener('sys:update', h);
    return () => { clearInterval(t); window.removeEventListener('sys:update', h); };
  }, []);

  // badge จำนวนคำขออนุมัติที่รออยู่ — poll 30 วิ (SSE 'approvals' อัปเดตเร็วขึ้น)
  useEffect(() => {
    const perms = user?.permissions || [];
    if (!perms.includes('approvals.view') && !perms.includes('*')) return;
    const load = () => api('/admin/approvals?status=pending&limit=1')
      .then(r => setApprPending(r.total || 0))
      .catch(() => {});
    load();
    const t = setInterval(load, 30000);
    const h = (e) => { if (e.detail?.kind === 'approvals') load(); };
    window.addEventListener('sys:update', h);
    return () => { clearInterval(t); window.removeEventListener('sys:update', h); };
  }, [user?.permissions]);

  // keyboard shortcuts — กดตัวอักษรเดี่ยวขณะไม่ได้พิมพ์ใน input เพื่อกระโดดไปหน้าต่างๆ
  // o=ภาพรวม r=รายงาน h=สุขภาพ m=สมาชิก l=ประเภทหวย d=รอบหวย b=โพย c=แชท w=เครดิต a=audit s=ตั้งค่า
  useEffect(() => {
    const MAP = { o: '/admin', r: '/admin/reports', h: '/admin/health', m: '/admin/members', l: '/admin/lotteries', d: '/admin/draws', b: '/admin/bets', c: '/admin/chat', w: '/admin/wallet', a: '/admin/audit', s: '/admin/settings', p: '/admin/approvals' };
    const allowed = new Set(visibleGroups.flatMap(g => g.items.map(i => i.to)));
    const onKey = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      const to = MAP[e.key.toLowerCase()];
      if (to && allowed.has(to)) { e.preventDefault(); navigate(to); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate, visibleGroups]);

  // Ctrl+K / Cmd+K — เปิด command palette (ข้ามตอนโฟกัสอยู่ในช่องพิมพ์)
  useEffect(() => {
    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'k') return;
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      e.preventDefault();
      setPaletteOpen(o => !o);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // nav groups — ใช้ร่วมกันระหว่าง sidebar (lg) และ mobile Sheet drawer
  // inSheet=true แสดง group label ใน drawer (sidebar ซ่อน label บน mobile เพราะ aside ถูกซ่อนทั้งก้อนอยู่แล้ว)
  const renderNav = (inSheet = false) => (
    <nav className={inSheet
      ? 'flex flex-col gap-0.5 p-2 flex-1 min-h-0 overflow-y-auto'
      : 'hidden lg:flex lg:flex-col gap-0.5 lg:overflow-x-visible lg:overflow-y-auto lg:flex-1 lg:min-h-0 p-2'}>
      {visibleGroups.map(g => (
        <div key={g.label} className="contents">
          <div className={inSheet
            ? 'text-[10px] font-bold uppercase tracking-[0.14em] px-3 pt-3 pb-1 text-[var(--muted-gray)]'
            : 'hidden lg:block text-[10px] font-bold uppercase tracking-[0.14em] px-3 pt-3 pb-1 text-[var(--muted-gray)]'}>
            {g.label}
          </div>
          {g.items.map(i => (
            <NavLink key={i.to} to={i.to} end={i.end} onClick={() => setNavOpen(false)}
              className={({ isActive }) => `relative flex items-center gap-2.5 whitespace-nowrap px-3 py-2 rounded-lg text-[13px] transition-colors border ${isActive
                ? 'font-semibold bg-gradient-to-r from-[color-mix(in_srgb,var(--gold-primary)_20%,transparent)] to-[color-mix(in_srgb,var(--gold-primary)_10%,transparent)] text-[var(--gold-bright)] border-[var(--border-gold)]'
                : 'text-[var(--muted-gray)] border-transparent'}`}>
              <Icon name={i.icon} className="w-4 h-4 shrink-0" />
              {i.label}
              {i.to === '/admin/chat' && chatUnread > 0 && (
                <span className="ml-auto min-w-[18px] h-[18px] px-1 rounded-full text-[9px] font-black flex items-center justify-center bg-[var(--danger-red)] text-[var(--white)]">
                  {chatUnread > 99 ? '99+' : chatUnread}
                </span>
              )}
              {i.to === '/admin/payments' && payPending > 0 && (
                <span className="ml-auto min-w-[18px] h-[18px] px-1 rounded-full text-[9px] font-black flex items-center justify-center bg-[var(--warning-amber)] text-[var(--bg-deep-black)]">
                  {payPending > 99 ? '99+' : payPending}
                </span>
              )}
              {i.to === '/admin/approvals' && apprPending > 0 && (
                <span className="ml-auto min-w-[18px] h-[18px] px-1 rounded-full text-[9px] font-black flex items-center justify-center bg-[var(--success-green)] text-[var(--bg-deep-black)]">
                  {apprPending > 99 ? '99+' : apprPending}
                </span>
              )}
            </NavLink>
          ))}
        </div>
      ))}
    </nav>
  );

  return (
    <div className="admin-compact flex flex-col lg:flex-row gap-6 bg-[var(--bg-deep-black)]">
      <aside className="hidden lg:block lg:w-60 shrink-0">
        {/* lg: sticky — ติดบนตอนเลื่อนแต่ไม่คำนวณตำแหน่งจาก vw (fixed+calc(50vw) ทำให้
            เด้งทุกครั้งที่ scrollbar โผล่/หาย) aside ยืดเต็มสูงแถว flex อยู่แล้ว */}
        <div className="rounded-xl lg:sticky lg:top-24 lg:bottom-auto lg:h-auto lg:max-h-[calc(100vh-7.5rem)] lg:w-60 lg:flex lg:flex-col
          bg-gradient-to-b from-[var(--bg-card)] to-[var(--bg-dark-surface)] border border-[var(--border-gold)] shadow-[var(--shadow-pop)]">
          <div className="hidden lg:flex items-center gap-2.5 px-4 pt-4 pb-3 border-b border-[var(--border-light)]">
            <span className="w-7 h-7 rounded-lg flex items-center justify-center bg-[color-mix(in_srgb,var(--gold-primary)_20%,transparent)] border border-[var(--border-gold)] text-[var(--gold-primary)]">
              <Icon name="settings" className="w-4 h-4" />
            </span>
            <div className="leading-tight">
              <div className="font-display font-bold text-sm text-[var(--white)]">Admin Panel</div>
              <div className="text-[10px] text-[var(--muted-gray)]">ระบบจัดการหลังบ้าน</div>
            </div>
            <span className="ml-auto text-[9px] font-bold tracking-wider px-1.5 py-0.5 rounded border border-[var(--border-gold)] bg-[color-mix(in_srgb,var(--gold-primary)_15%,transparent)] text-[var(--gold-bright)]">STAFF</span>
          </div>
          {renderNav()}
          {user && (
            <div className="hidden lg:flex items-center gap-2.5 px-4 py-3 border-t border-[var(--border-light)]">
              <span className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold bg-[var(--bg-dark-surface)] border border-[var(--border-light)] text-[var(--gold-primary)]">
                {(user.displayName || user.username || '?').slice(0, 1).toUpperCase()}
              </span>
              <div className="leading-tight min-w-0">
                <div className="text-xs font-semibold truncate text-[var(--white)]">{user.displayName || user.username}</div>
                <div className="text-[10px] truncate text-[var(--muted-gray)]">{(user.roles || []).join(', ') || 'staff'}</div>
              </div>
            </div>
          )}
        </div>
      </aside>
      <div className="flex-1 min-w-0">
        {/* mobile: hamburger เปิด nav drawer (desktop ใช้ sidebar แทน) */}
        <button type="button" onClick={() => setNavOpen(true)} aria-label="เปิดเมนู"
          className="lg:hidden mb-3 inline-flex items-center gap-2 px-3 py-2 rounded-lg text-[13px] font-semibold
            bg-[var(--bg-card)] border border-[var(--border-gold)] text-[var(--gold-bright)]
            shadow-[var(--shadow-pop)]">
          <Icon name="menu" className="w-4 h-4" />
          เมนู
        </button>
        <div key={location.pathname} className="page-enter"><Outlet /></div>
      </div>
      <Sheet open={navOpen} onOpenChange={setNavOpen}>
        <SheetContent side="left" className="w-[85vw] sm:max-w-xs p-0 gap-0 border-[var(--border-gold)] bg-[var(--bg-deep-black)]">
          <SheetHeader className="px-4 pt-4 pb-3 border-b border-[var(--border-light)]">
            <div className="flex items-center gap-2.5">
              <span className="w-7 h-7 rounded-lg flex items-center justify-center bg-[color-mix(in_srgb,var(--gold-primary)_20%,transparent)] border border-[var(--border-gold)] text-[var(--gold-primary)]">
                <Icon name="settings" className="w-4 h-4" />
              </span>
              <div className="leading-tight">
                <SheetTitle className="font-display font-bold text-sm text-[var(--white)]">Admin Panel</SheetTitle>
                <div className="text-[10px] text-[var(--muted-gray)]">ระบบจัดการหลังบ้าน</div>
              </div>
            </div>
          </SheetHeader>
          {renderNav(true)}
          {user && (
            <div className="flex items-center gap-2.5 px-4 py-3 border-t border-[var(--border-light)]">
              <span className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold bg-[var(--bg-dark-surface)] border border-[var(--border-light)] text-[var(--gold-primary)]">
                {(user.displayName || user.username || '?').slice(0, 1).toUpperCase()}
              </span>
              <div className="leading-tight min-w-0">
                <div className="text-xs font-semibold truncate text-[var(--white)]">{user.displayName || user.username}</div>
                <div className="text-[10px] truncate text-[var(--muted-gray)]">{(user.roles || []).join(', ') || 'staff'}</div>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
      <ConfirmHost />
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  );
}
