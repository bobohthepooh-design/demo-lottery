import { Outlet, NavLink } from 'react-router-dom';
import { ConfirmHost } from './confirm.jsx';
import { useAuth } from '../auth.jsx';

const items = [
  { to: '/admin', label: 'ภาพรวม', end: true },
  { to: '/admin/members', label: 'สมาชิก' },
  { to: '/admin/lotteries', label: 'ประเภทหวย/กติกา' },
  { to: '/admin/draws', label: 'รอบหวย' },
  { to: '/admin/wallet', label: 'จัดการเครดิต' },
  { to: '/admin/bets', label: 'ตรวจโพย' },
  { to: '/admin/reports', label: 'รายงาน' },
  { to: '/admin/banner', label: 'แบนเนอร์หน้าแรก' },
  { to: '/admin/audit', label: 'Audit Log', superOnly: true },
  { to: '/admin/security', label: 'Security Events', superOnly: true },
  { to: '/admin/settings', label: 'ตั้งค่าระบบ', superOnly: true },
  { to: '/admin/roles', label: 'สิทธิ์การใช้งาน', superOnly: true },
];

export default function AdminLayout() {
  const { user } = useAuth();
  const isSuper = (user?.roles || []).includes('super_admin');
  const visible = items.filter(i => !i.superOnly || isSuper);
  return (
    <div className="flex flex-col lg:flex-row gap-6">
      <aside className="lg:w-56 shrink-0">
        <div className="bg-navy-800 border border-gold-500/30 rounded-xl p-4 lg:sticky lg:top-24">
          <div className="text-gold-400 font-bold mb-3 px-2">⚙️ Admin Panel</div>
          <nav className="flex lg:flex-col gap-1 overflow-x-auto">
            {visible.map(i => (
              <NavLink key={i.to} to={i.to} end={i.end}
                className={({ isActive }) => `whitespace-nowrap px-3 py-2 rounded-lg text-sm ${isActive ? 'bg-navy-700 text-gold-300 font-semibold' : 'text-navy-200 hover:bg-navy-700/60'}`}>
                {i.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </aside>
      <div className="flex-1 min-w-0"><Outlet /></div>
      <ConfirmHost />
    </div>
  );
}
