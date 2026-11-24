import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { ConfirmHost } from './confirm.jsx';
import { useAuth } from '../auth.jsx';
import { api } from '../api.js';
import { Icon } from '../components/icons.jsx';
import { toast } from '../components/toast.js';
import { useEffect, useMemo, useRef, useState } from 'react';

export const adminGroups = [
  {
    label: 'ภาพรวม',
    items: [
      { to: '/admin', label: 'ภาพรวม', icon: 'dashboard', end: true, perm: 'dashboard.admin' },
      { to: '/admin/reports', label: 'รายงาน', icon: 'reports', perm: 'reports.view' },
      { to: '/admin/health', label: 'สุขภาพระบบ', icon: 'bell', perm: 'dashboard.admin' },
    ],
  },
  {
    label: 'กำกับดูแล',
    items: [
      { to: '/admin/approvals', label: 'ศูนย์อนุมัติ', icon: 'audit', perm: 'approvals.view' },
      { to: '/admin/admin-users', label: 'บัญชีผู้ดูแล', icon: 'user', perm: 'admin.users.manage' },
    ],
  },
  {
    label: 'จัดการข้อมูล',
    items: [
      { to: '/admin/members', label: 'สมาชิก', icon: 'members', perm: 'members.manage' },
      { to: '/admin/lotteries', label: 'ประเภทหวย/กติกา', icon: 'lotteries', perm: 'lottery.manage' },
      { to: '/admin/draws', label: 'รอบหวย', icon: 'draws', perm: 'draws.manage' },
      { to: '/admin/bets', label: 'ตรวจโพย', icon: 'bets', perm: 'bets.view_all' },
      { to: '/admin/chat', label: 'แชทสมาชิก', icon: 'chat', perm: 'members.manage' },
      { to: '/admin/tickets', label: 'ตั๋วสนับสนุน', icon: 'ticket', perm: 'members.manage' },
      { to: '/admin/broadcast', label: 'แจ้งเตือนสมาชิก', icon: 'volume', perm: 'members.manage' },
    ],
  },
  {
    label: 'เครดิต & ระบบ',
    items: [
      { to: '/admin/wallet', label: 'จัดการเครดิต', icon: 'wallet', perm: 'wallet.adjust' },
      { to: '/admin/payments', label: 'เติม/ถอนเงิน', icon: 'wallet', perm: 'wallet.adjust' },
      { to: '/admin/banner', label: 'แบนเนอร์หน้าแรก', icon: 'banner', perm: 'settings.manage' },
      { to: '/admin/audit', label: 'Audit Log', icon: 'audit', perm: 'audit.view' },
      { to: '/admin/security', label: 'Security Events', icon: 'security', perm: 'security.view' },
      { to: '/admin/settings', label: 'ตั้งค่าระบบ', icon: 'settings', perm: 'settings.manage' },
      { to: '/admin/roles', label: 'สิทธิ์การใช้งาน', icon: 'roles', perm: 'roles.manage' },
    ],
  },
];

export default function AdminLayout() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [chatUnread, setChatUnread] = useState(0);
  const [payPending, setPayPending] = useState(0); // คำขอเติม/ถอนที่รอตรวจสอบ
  const [apprPending, setApprPending] = useState(0); // คำขอ maker-checker ที่รออนุมัติ
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

  return (
    <div className="admin-compact flex flex-col lg:flex-row gap-6" style={{ backgroundColor: 'var(--bg-deep-black)' }}>
      <aside className="lg:w-60 shrink-0">
        <div className="rounded-xl lg:sticky lg:top-24 overflow-hidden" style={{
          background: 'linear-gradient(180deg, var(--bg-card), var(--bg-dark-surface))',
          border: '1px solid var(--border-gold)',
          boxShadow: 'var(--shadow-pop)'
        }}>
          <div className="flex items-center gap-2.5 px-4 pt-4 pb-3" style={{ borderBottom: '1px solid var(--border-light)' }}>
            <span className="w-7 h-7 rounded-lg flex items-center justify-center" style={{
              background: 'rgba(212, 175, 55, 0.2)',
              border: '1px solid var(--border-gold)',
              color: 'var(--gold-primary)'
            }}>
              <Icon name="settings" className="w-4 h-4" />
            </span>
            <div className="leading-tight">
              <div className="font-display font-bold text-sm" style={{ color: 'var(--white)' }}>Admin Panel</div>
              <div className="text-[10px]" style={{ color: 'var(--muted-gray)' }}>ระบบจัดการหลังบ้าน</div>
            </div>
            <span className="ml-auto text-[9px] font-bold tracking-wider px-1.5 py-0.5 rounded" style={{
              border: '1px solid var(--border-gold)',
              background: 'rgba(212, 175, 55, 0.15)',
              color: 'var(--gold-bright)'
            }}>STAFF</span>
          </div>
          <nav className="flex lg:flex-col gap-0.5 overflow-x-auto lg:overflow-x-visible lg:overflow-y-auto lg:max-h-[calc(100vh-15rem)] p-2">
            {visibleGroups.map(g => (
              <div key={g.label} className="contents">
                <div className="hidden lg:block text-[10px] font-bold uppercase tracking-[0.14em] px-3 pt-3 pb-1" style={{ color: 'var(--muted-gray)' }}>
                  {g.label}
                </div>
                {g.items.map(i => (
                  <NavLink key={i.to} to={i.to} end={i.end}
                    className={({ isActive }) => `relative flex items-center gap-2.5 whitespace-nowrap px-3 py-2 rounded-lg text-[13px] transition-colors ${isActive ? 'font-semibold' : ''}`}
                    style={isActive ? {
                      background: 'linear-gradient(90deg, rgba(212, 175, 55, 0.2), rgba(212, 175, 55, 0.1))',
                      color: 'var(--gold-bright)',
                      border: '1px solid var(--border-gold)'
                    } : {
                      color: 'var(--muted-gray)',
                      border: '1px solid transparent'
                    }}>
                    <Icon name={i.icon} className="w-4 h-4 shrink-0" />
                    {i.label}
                    {i.to === '/admin/chat' && chatUnread > 0 && (
                      <span className="ml-auto min-w-[18px] h-[18px] px-1 rounded-full text-[9px] font-black flex items-center justify-center" style={{
                        background: 'var(--danger-red)',
                        color: 'var(--white)'
                      }}>
                        {chatUnread > 99 ? '99+' : chatUnread}
                      </span>
                    )}
                    {i.to === '/admin/payments' && payPending > 0 && (
                      <span className="ml-auto min-w-[18px] h-[18px] px-1 rounded-full text-[9px] font-black flex items-center justify-center" style={{
                        background: 'var(--warning-amber)',
                        color: 'var(--bg-deep-black)'
                      }}>
                        {payPending > 99 ? '99+' : payPending}
                      </span>
                    )}
                    {i.to === '/admin/approvals' && apprPending > 0 && (
                      <span className="ml-auto min-w-[18px] h-[18px] px-1 rounded-full text-[9px] font-black flex items-center justify-center" style={{
                        background: 'var(--success-green)',
                        color: 'var(--bg-deep-black)'
                      }}>
                        {apprPending > 99 ? '99+' : apprPending}
                      </span>
                    )}
                  </NavLink>
                ))}
              </div>
            ))}
          </nav>
          {user && (
            <div className="hidden lg:flex items-center gap-2.5 px-4 py-3" style={{ borderTop: '1px solid var(--border-light)' }}>
              <span className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold" style={{
                background: 'var(--bg-dark-surface)',
                border: '1px solid var(--border-light)',
                color: 'var(--gold-primary)'
              }}>
                {(user.displayName || user.username || '?').slice(0, 1).toUpperCase()}
              </span>
              <div className="leading-tight min-w-0">
                <div className="text-xs font-semibold truncate" style={{ color: 'var(--white)' }}>{user.displayName || user.username}</div>
                <div className="text-[10px] truncate" style={{ color: 'var(--muted-gray)' }}>{(user.roles || []).join(', ') || 'staff'}</div>
              </div>
            </div>
          )}
        </div>
      </aside>
      <div className="flex-1 min-w-0"><Outlet /></div>
      <ConfirmHost />
    </div>
  );
}
