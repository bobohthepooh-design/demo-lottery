import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { ConfirmHost } from './confirm.jsx';
import { useAuth } from '../auth.jsx';
import { api } from '../api.js';
import { Icon } from '../components/icons.jsx';
import { toast } from '../components/toast.js';
import { useEffect, useRef, useState } from 'react';

export const adminGroups = [
  {
    label: 'ภาพรวม',
    items: [
      { to: '/admin', label: 'ภาพรวม', icon: 'dashboard', end: true },
      { to: '/admin/reports', label: 'รายงาน', icon: 'reports' },
      { to: '/admin/health', label: 'สุขภาพระบบ', icon: 'bell' },
    ],
  },
  {
    label: 'จัดการข้อมูล',
    items: [
      { to: '/admin/members', label: 'สมาชิก', icon: 'members' },
      { to: '/admin/lotteries', label: 'ประเภทหวย/กติกา', icon: 'lotteries' },
      { to: '/admin/draws', label: 'รอบหวย', icon: 'draws' },
      { to: '/admin/bets', label: 'ตรวจโพย', icon: 'bets' },
      { to: '/admin/chat', label: 'แชทสมาชิก', icon: 'chat' },
      { to: '/admin/broadcast', label: 'แจ้งเตือนสมาชิก', icon: 'volume' },
    ],
  },
  {
    label: 'เครดิต & ระบบ',
    items: [
      { to: '/admin/wallet', label: 'จัดการเครดิต', icon: 'wallet' },
      { to: '/admin/payments', label: 'เติม/ถอนเงิน', icon: 'wallet' },
      { to: '/admin/banner', label: 'แบนเนอร์หน้าแรก', icon: 'banner' },
      { to: '/admin/audit', label: 'Audit Log', icon: 'audit', superOnly: true },
      { to: '/admin/security', label: 'Security Events', icon: 'security', superOnly: true },
      { to: '/admin/settings', label: 'ตั้งค่าระบบ', icon: 'settings', superOnly: true },
      { to: '/admin/roles', label: 'สิทธิ์การใช้งาน', icon: 'roles', superOnly: true },
    ],
  },
];

export default function AdminLayout() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [chatUnread, setChatUnread] = useState(0);
  const [payPending, setPayPending] = useState(0); // คำขอเติม/ถอนที่รอตรวจสอบ
  const prevUnread = useRef(0);

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
    const load = () => api('/admin/payments?status=pending_review')
      .then(r => setPayPending((r.requests || []).length))
      .catch(() => {});
    load();
    const t = setInterval(load, 30000);
    const h = (e) => { if (['payments', 'notify'].includes(e.detail?.kind)) load(); };
    window.addEventListener('sys:update', h);
    return () => { clearInterval(t); window.removeEventListener('sys:update', h); };
  }, []);

  // keyboard shortcuts — กดตัวอักษรเดี่ยวขณะไม่ได้พิมพ์ใน input เพื่อกระโดดไปหน้าต่างๆ
  // o=ภาพรวม r=รายงาน h=สุขภาพ m=สมาชิก l=ประเภทหวย d=รอบหวย b=โพย c=แชท w=เครดิต a=audit s=ตั้งค่า
  useEffect(() => {
    const MAP = { o: '/admin', r: '/admin/reports', h: '/admin/health', m: '/admin/members', l: '/admin/lotteries', d: '/admin/draws', b: '/admin/bets', c: '/admin/chat', w: '/admin/wallet', a: '/admin/audit', s: '/admin/settings' };
    const onKey = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      const to = MAP[e.key.toLowerCase()];
      if (to) { e.preventDefault(); navigate(to); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate]);

  const isSuper = (user?.roles || []).includes('super_admin');
  const visibleGroups = adminGroups
    .map(g => ({ ...g, items: g.items.filter(i => !i.superOnly || isSuper) }))
    .filter(g => g.items.length > 0);
  return (
    <div className="admin-compact flex flex-col lg:flex-row gap-6">
      <aside className="lg:w-60 shrink-0">
        <div className="bg-gradient-to-b from-navy-800/95 to-navy-900/95 border border-navy-700/60 rounded-xl lg:sticky lg:top-24 shadow-xl shadow-black/30 overflow-hidden">
          <div className="flex items-center gap-2.5 px-4 pt-4 pb-3 border-b border-navy-700/60">
            <span className="w-7 h-7 rounded-lg bg-gold-500/20 border border-gold-500/50 flex items-center justify-center text-gold-400">
              <Icon name="settings" className="w-4 h-4" />
            </span>
            <div className="leading-tight">
              <div className="font-display font-bold text-white text-sm">Admin Panel</div>
              <div className="text-[10px] text-navy-400">ระบบจัดการหลังบ้าน</div>
            </div>
            <span className="ml-auto text-[9px] font-bold tracking-wider px-1.5 py-0.5 rounded border border-gold-500/50 bg-gold-500/15 text-gold-300">STAFF</span>
          </div>
          <nav className="flex lg:flex-col gap-0.5 overflow-x-auto lg:overflow-x-visible lg:overflow-y-auto lg:max-h-[calc(100vh-15rem)] p-2">
            {visibleGroups.map(g => (
              <div key={g.label} className="contents">
                <div className="hidden lg:block text-[10px] font-bold uppercase tracking-[0.14em] text-navy-500 px-3 pt-3 pb-1">
                  {g.label}
                </div>
                {g.items.map(i => (
                  <NavLink key={i.to} to={i.to} end={i.end}
                    className={({ isActive }) => `relative flex items-center gap-2.5 whitespace-nowrap px-3 py-2 rounded-lg text-[13px] transition-colors ${isActive
                      ? 'bg-gradient-to-r from-gold-500/20 to-gold-500/10 text-gold-300 font-semibold border border-gold-500/30'
                      : 'text-navy-400 hover:text-navy-200 hover:bg-navy-800/70 border border-transparent'}`}>
                    <Icon name={i.icon} className="w-4 h-4 shrink-0" />
                    {i.label}
                    {i.to === '/admin/chat' && chatUnread > 0 && (
                      <span className="ml-auto min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[9px] font-black flex items-center justify-center">
                        {chatUnread > 99 ? '99+' : chatUnread}
                      </span>
                    )}
                    {i.to === '/admin/payments' && payPending > 0 && (
                      <span className="ml-auto min-w-[18px] h-[18px] px-1 rounded-full bg-amber-500 text-navy-950 text-[9px] font-black flex items-center justify-center">
                        {payPending > 99 ? '99+' : payPending}
                      </span>
                    )}
                  </NavLink>
                ))}
              </div>
            ))}
          </nav>
          {user && (
            <div className="hidden lg:flex items-center gap-2.5 px-4 py-3 border-t border-navy-700/60">
              <span className="w-7 h-7 rounded-full bg-navy-700 border border-navy-600 flex items-center justify-center text-xs font-bold text-gold-300">
                {(user.displayName || user.username || '?').slice(0, 1).toUpperCase()}
              </span>
              <div className="leading-tight min-w-0">
                <div className="text-xs font-semibold text-white truncate">{user.displayName || user.username}</div>
                <div className="text-[10px] text-navy-400 truncate">{(user.roles || []).join(', ') || 'staff'}</div>
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
