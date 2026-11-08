import { Outlet, Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { api, satang } from '../api.js';
import MfaModal from './MfaModal.jsx';
import { useEffect, useState } from 'react';

const TYPE_EMOJI = { TH: '🇹🇭', LA: '🇱🇦', HN: '🇻🇳' };

const nav = [
  { to: '/', label: 'หน้าแรก', end: true },
  { to: '/my-bets', label: 'โพยของฉัน', auth: true },
  { to: '/wallet', label: 'กระเป๋าเครดิต', auth: true },
  { to: '/profile', label: 'โปรไฟล์', auth: true },
  { to: '/admin', label: 'ผู้ดูแลระบบ', auth: true, admin: true },
];

export default function Layout() {
  const { user, balance, logout, isAdmin, mfaRequired } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [lotOpen, setLotOpen] = useState(false);
  const [types, setTypes] = useState([]);
  const [now, setNow] = useState(() => new Date());
  const navigate = useNavigate();

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
            <div className="relative" onMouseEnter={() => setLotOpen(true)} onMouseLeave={() => setLotOpen(false)}>
              <NavLink to="/lotteries"
                className={({ isActive }) => `px-3 py-2 rounded-lg text-sm transition inline-block ${isActive ? 'bg-navy-700 text-gold-300' : 'text-navy-200 hover:bg-navy-800'}`}>
                หวยทั้งหมด ▾
              </NavLink>
              {lotOpen && (
                <div className="absolute top-full left-0 mt-1 w-60 bg-navy-800 border border-navy-600 rounded-xl shadow-2xl py-2 z-50">
                  <div className="px-3 py-1 text-[10px] text-navy-400">เลือกตลาดหวย</div>
                  <Link to="/lotteries" onClick={() => setLotOpen(false)}
                    className="block px-3 py-2 text-sm text-navy-200 hover:bg-navy-700 hover:text-gold-300">ดูหวยทั้งหมด</Link>
                  {types.map(t => (
                    <Link key={t.id} to={`/lotteries?type=${t.id}`} onClick={() => setLotOpen(false)}
                      className="block px-3 py-2 text-sm text-navy-200 hover:bg-navy-700 hover:text-gold-300">
                      {TYPE_EMOJI[t.code] ? `${TYPE_EMOJI[t.code]} ` : ''}{t.name_th}
                    </Link>
                  ))}
                </div>
              )}
            </div>
            {nav.filter(n => !n.auth || user).filter(n => !n.admin || isAdmin).map(n => (
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
            <button className="md:hidden text-navy-200 text-xl" onClick={() => setMenuOpen(!menuOpen)}>☰</button>
          </div>
        </div>
        {menuOpen && (
          <nav className="md:hidden border-t border-navy-700 bg-navy-900 px-4 py-2 space-y-1">
            <NavLink to="/lotteries" end onClick={() => setMenuOpen(false)}
              className={({ isActive }) => `block px-3 py-2 rounded-lg text-sm ${isActive ? 'bg-navy-700 text-gold-300' : 'text-navy-200'}`}>
              หวยทั้งหมด
            </NavLink>
            {types.map(t => (
              <Link key={t.id} to={`/lotteries?type=${t.id}`} onClick={() => setMenuOpen(false)}
                className="block px-3 py-2 pl-6 rounded-lg text-sm text-navy-300 hover:bg-navy-800">
                {TYPE_EMOJI[t.code] ? `${TYPE_EMOJI[t.code]} ` : ''}{t.name_th}
              </Link>
            ))}
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
