import { Outlet, Link, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { api, satang } from '../api.js';
import MfaModal from './MfaModal.jsx';
import AnnouncementBar from './AnnouncementBar.jsx';
import ToastHost from './ToastHost.jsx';
import { FlagIcon } from './ResultLine.jsx';
import { typeAccent } from '../typeAccent.js';
import { useEffect, useState } from 'react';

const nav = [
  { to: '/my-bets', label: 'โพยของฉัน', auth: true, memberOnly: true },
  { to: '/performance', label: 'ผลงาน', auth: true, memberOnly: true },
  { to: '/wallet', label: 'กระเป๋าเครดิต', auth: true, memberOnly: true },
  { to: '/profile', label: 'โปรไฟล์', auth: true },
  { to: '/admin', label: 'ผู้ดูแลระบบ', auth: true, admin: true },
];

export default function Layout() {
  const { user, balance, logout, isAdmin, mfaRequired } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [types, setTypes] = useState([]);
  const [now, setNow] = useState(() => new Date());
  const navigate = useNavigate();
  const location = useLocation();
  const selType = new URLSearchParams(location.search).get('type');

  useEffect(() => {
    api('/lottery/types').then(r => setTypes(r.types)).catch(() => {});
  }, []);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // แสดงวันที่+เวลาปัจจุบันบน title tab ด้านบนของเบราว์เซอร์ด้วย
  useEffect(() => {
    const p = n => String(n).padStart(2, '0');
    const dateStr = `${p(now.getDate())}/${p(now.getMonth() + 1)}/${now.getFullYear()}`;
    const timeStr = `${p(now.getHours())}:${p(now.getMinutes())}:${p(now.getSeconds())}`;
    document.title = `Demo Lottery — ${dateStr} ${timeStr}`;
  }, [now]);

  const dateStr = now.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
  const timeStr = now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  const doLogout = async () => { await logout(); navigate('/'); };

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-40 bg-gradient-to-r from-navy-950 via-navy-900 to-navy-950 backdrop-blur-md border-b border-gold-500/30 shadow-lg shadow-black/20">
        <div className="max-w-7xl mx-auto px-4 flex items-center justify-between h-16">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-gold-400 to-gold-600 flex items-center justify-center text-navy-950 font-bold text-lg">฿</div>
            <div>
              <div className="font-bold text-gold-400 leading-tight">Demo Lottery</div>
              <div className="text-[10px] text-navy-300 -mt-0.5">ระบบจำลอง • ไม่ใชเงินจริง</div>
            </div>
          </Link>

          <nav className="hidden lg:flex items-center gap-1">
            <NavLink to="/" end
              className={({ isActive }) => `px-3 py-2 rounded-lg text-sm transition ${isActive ? 'bg-navy-700 text-gold-300' : 'text-navy-200 hover:bg-navy-800'}`}>
              หน้าแรก
            </NavLink>
            {types.map(t => {
              const ac = typeAccent(t.code);
              return (
                <Link key={t.id} to={`/lotteries?type=${t.id}`}
                  className={`px-3 py-2 rounded-lg text-sm transition inline-flex items-center gap-1.5 text-white ${selType === String(t.id) ? 'bg-navy-700 font-semibold' : 'hover:bg-navy-800 hover:text-gold-300'}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${ac.bar}`} />
                  <FlagIcon code={t.code} className="w-5 h-5 text-[9px]" /> {t.name_th}
                </Link>
              );
            })}
            {nav.filter(n => !n.auth || user).filter(n => !n.admin || isAdmin).filter(n => !n.memberOnly || !isAdmin).map(n => (
              <NavLink key={n.to} to={n.to} end={n.end}
                className={({ isActive }) => `px-3 py-2 rounded-lg text-sm transition ${isActive ? 'bg-navy-700 text-gold-300' : 'text-navy-200 hover:bg-navy-800'}`}>
                {n.label}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <div className="hidden sm:block text-right leading-tight" title="วันที่และเวลาปัจจุบัน">
              <div className="text-[10px] text-navy-300">{dateStr}</div>
              <div className="text-xs font-mono font-bold text-gold-300">{timeStr}</div>
            </div>
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
            <div className="sm:hidden text-xs font-mono font-bold text-gold-300">{timeStr}</div>
            <button className="lg:hidden text-navy-200 text-xl" onClick={() => setMenuOpen(!menuOpen)}>☰</button>
          </div>
        </div>
        {menuOpen && (
          <nav className="lg:hidden border-t border-navy-700 bg-navy-900 px-4 py-2 space-y-1">
            <NavLink to="/" end onClick={() => setMenuOpen(false)}
              className={({ isActive }) => `block px-3 py-2 rounded-lg text-sm ${isActive ? 'bg-navy-700 text-gold-300' : 'text-navy-200'}`}>
              หน้าแรก
            </NavLink>
            {types.map(t => {
              const ac = typeAccent(t.code);
              return (
                <Link key={t.id} to={`/lotteries?type=${t.id}`} onClick={() => setMenuOpen(false)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-white ${selType === String(t.id) ? 'bg-navy-700 font-semibold' : 'hover:bg-navy-800'}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${ac.bar}`} />
                  <FlagIcon code={t.code} className="w-5 h-5 text-[9px]" /> {t.name_th}
                </Link>
              );
            })}
            {nav.filter(n => !n.auth || user).filter(n => !n.admin || isAdmin).filter(n => !n.memberOnly || !isAdmin).map(n => (
              <NavLink key={n.to} to={n.to} end={n.end} onClick={() => setMenuOpen(false)}
                className={({ isActive }) => `block px-3 py-2 rounded-lg text-sm ${isActive ? 'bg-navy-700 text-gold-300' : 'text-navy-200'}`}>
                {n.label}
              </NavLink>
            ))}
            {user && <div className="px-3 py-2 text-gold-400 font-bold">เครดิต ฿{satang(balance)}</div>}
          </nav>
        )}
      </header>

      <AnnouncementBar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-6 pb-24 lg:pb-6">
        <Outlet />
      </main>

      {/* Bottom navigation — มือถือ/แท็บเล็ต (แสดงเฉพาะจอ < lg) */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-navy-900/95 backdrop-blur border-t border-gold-500/30"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="flex h-16">
          {[
            { to: '/', label: 'หน้าแรก', icon: '🏠', end: true, show: true },
            { to: '/lotteries', label: 'หวย', icon: '🎫', show: true },
            ...(user ? [
              { to: '/my-bets', label: 'โพยของฉัน', icon: '🧾', show: true },
              { to: '/performance', label: 'ผลงาน', icon: '📊', show: !isAdmin },
              { to: '/wallet', label: 'กระเป๋า', icon: '💰', show: !isAdmin },
            ] : [
              { to: '/login', label: 'เข้าสู่ระบบ', icon: '🔑', show: true },
            ]),
          ].filter(i => i.show).map(i => (
            <NavLink key={i.to} to={i.to} end={i.end}
              className={({ isActive }) => `flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] ${isActive ? 'text-gold-300' : 'text-navy-300'}`}>
              <span className="text-lg leading-none">{i.icon}</span>
              {i.label}
            </NavLink>
          ))}
        </div>
      </nav>

      <footer className="border-t border-navy-800 py-4 pb-20 lg:pb-4 text-center text-xs text-navy-300">
        Demo Lottery Platform — เพื่อการศึกษาเท่านั้น • ใช้เครดิตเสมือน ไม่เกี่ยวข้องกับการพนันเงินจริง
      </footer>

      <ToastHost />
      {mfaRequired && user && <MfaModal />}
    </div>
  );
}
