import { Outlet, Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { satang } from '../api.js';
import MfaModal from './MfaModal.jsx';
import { useState } from 'react';

const nav = [
  { to: '/', label: 'หน้าแรก', end: true },
  { to: '/lotteries', label: 'หวยทั้งหมด' },
  { to: '/results', label: 'ผลรางวัล' },
  { to: '/my-bets', label: 'โพยของฉัน', auth: true },
  { to: '/wallet', label: 'กระเป๋าเครดิต', auth: true },
  { to: '/profile', label: 'โปรไฟล์', auth: true },
  { to: '/admin', label: 'ผู้ดูแลระบบ', auth: true, admin: true },
];

export default function Layout() {
  const { user, balance, logout, isAdmin, mfaRequired } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();

  const doLogout = async () => { await logout(); navigate('/'); };

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-navy-900 border-b border-gold-500/30 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 flex items-center justify-between h-16">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-gold-400 to-gold-600 flex items-center justify-center text-navy-950 font-bold text-lg">฿</div>
            <div>
              <div className="font-bold text-gold-400 leading-tight">Demo Lottery</div>
              <div className="text-[10px] text-navy-300 -mt-0.5">ระบบจำลอง • ไม่ใชเงินจริง</div>
            </div>
          </Link>

          <nav className="hidden md:flex items-center gap-1">
            {nav.filter(n => !n.auth || user).filter(n => !n.admin || isAdmin).map(n => (
              <NavLink key={n.to} to={n.to} end={n.end}
                className={({ isActive }) => `px-3 py-2 rounded-lg text-sm transition ${isActive ? 'bg-navy-700 text-gold-300' : 'text-navy-200 hover:bg-navy-800'}`}>
                {n.label}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            {user ? (
              <>
                <div className="hidden sm:block text-right">
                  <div className="text-[10px] text-navy-300">เครดิตจำลอง</div>
                  <div className="text-gold-400 font-bold">฿{satang(balance)}</div>
                </div>
                <button onClick={doLogout} className="text-sm text-navy-200 hover:text-gold-300 border border-navy-600 rounded-lg px-3 py-1.5">
                  ออกจากระบบ
                </button>
              </>
            ) : (
              <div className="flex gap-2">
                <Link to="/login" className="text-sm px-3 py-1.5 rounded-lg border border-gold-500/50 text-gold-300 hover:bg-navy-800">เข้าสู่ระบบ</Link>
                <Link to="/register" className="text-sm px-3 py-1.5 rounded-lg bg-gold-500 text-navy-950 font-semibold hover:bg-gold-400">สมัครสมาชิก</Link>
              </div>
            )}
            <button className="md:hidden text-navy-200 text-xl" onClick={() => setMenuOpen(!menuOpen)}>☰</button>
          </div>
        </div>
        {menuOpen && (
          <nav className="md:hidden border-t border-navy-700 bg-navy-900 px-4 py-2 space-y-1">
            {nav.filter(n => !n.auth || user).filter(n => !n.admin || isAdmin).map(n => (
              <NavLink key={n.to} to={n.to} end={n.end} onClick={() => setMenuOpen(false)}
                className={({ isActive }) => `block px-3 py-2 rounded-lg text-sm ${isActive ? 'bg-navy-700 text-gold-300' : 'text-navy-200'}`}>
                {n.label}
              </NavLink>
            ))}
            {user && <div className="px-3 py-2 text-gold-400 font-bold">เครดิต ฿{satang(balance)}</div>}
          </nav>
        )}
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-6">
        <Outlet />
      </main>

      <footer className="border-t border-navy-800 py-4 text-center text-xs text-navy-300">
        Demo Lottery Platform — เพื่อการศึกษาเท่านั้น • ใช้เครดิตเสมือน ไม่เกี่ยวข้องกับการพนันเงินจริง
      </footer>

      {mfaRequired && user && <MfaModal />}
    </div>
  );
}
