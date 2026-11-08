import { Outlet, NavLink } from 'react-router-dom';
import { ConfirmHost } from './confirm.jsx';
import { useAuth } from '../auth.jsx';

const groups = [
  {
    label: 'ภาพรวม',
    items: [
      { to: '/admin', label: 'ภาพรวม', icon: '📊', end: true },
      { to: '/admin/reports', label: 'รายงาน', icon: '📈' },
    ],
  },
  {
    label: 'จัดการข้อมูล',
    items: [
      { to: '/admin/members', label: 'สมาชิก', icon: '👥' },
      { to: '/admin/lotteries', label: 'ประเภทหวย/กติกา', icon: '🎫' },
      { to: '/admin/draws', label: 'รอบหวย', icon: '🗓️' },
      { to: '/admin/bets', label: 'ตรวจโพย', icon: '🧾' },
    ],
  },
  {
    label: 'เครดิต & ระบบ',
    items: [
      { to: '/admin/wallet', label: 'จัดการเครดิต', icon: '💰' },
      { to: '/admin/banner', label: 'แบนเนอร์หน้าแรก', icon: '📢' },
      { to: '/admin/audit', label: 'Audit Log', icon: '📜', superOnly: true },
      { to: '/admin/security', label: 'Security Events', icon: '🛡️', superOnly: true },
      { to: '/admin/settings', label: 'ตั้งค่าระบบ', icon: '⚙️', superOnly: true },
      { to: '/admin/roles', label: 'สิทธิ์การใช้งาน', icon: '🔐', superOnly: true },
    ],
  },
];

export default function AdminLayout() {
  const { user } = useAuth();
  const isSuper = (user?.roles || []).includes('super_admin');
  const visibleGroups = groups
    .map(g => ({ ...g, items: g.items.filter(i => !i.superOnly || isSuper) }))
    .filter(g => g.items.length > 0);
  return (
    <div className="flex flex-col lg:flex-row gap-6">
      <aside className="lg:w-60 shrink-0">
        <div className="bg-white border border-navy-700 rounded-3xl p-4 lg:sticky lg:top-24 shadow-sm">
          <div className="flex items-center gap-2 text-gold-500 font-display font-bold mb-4 px-2">
            <span className="text-xl">⚙️</span> Admin Panel
            <span className="ml-auto text-[9px] font-black px-1.5 py-0.5 rounded bg-gold-200 text-gold-600 border border-gold-300">STAFF</span>
          </div>
          <nav className="flex lg:flex-col gap-1 overflow-x-auto">
            {visibleGroups.map(g => (
              <div key={g.label} className="contents">
                <div className="hidden lg:block text-[10px] font-bold uppercase tracking-widest text-navy-400 px-3 pt-3 pb-1">
                  {g.label}
                </div>
                {g.items.map(i => (
                  <NavLink key={i.to} to={i.to} end={i.end}
                    className={({ isActive }) => `whitespace-nowrap flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm transition ${isActive ? 'bg-gradient-to-r from-gold-200 to-gold-100 text-gold-600 font-bold shadow-sm' : 'text-navy-300 hover:bg-navy-100 hover:text-navy-950'}`}>
                    <span className="text-base leading-none">{i.icon}</span>
                    {i.label}
                  </NavLink>
                ))}
              </div>
            ))}
          </nav>
        </div>
      </aside>
      <div className="flex-1 min-w-0"><Outlet /></div>
      <ConfirmHost />
    </div>
  );
}
