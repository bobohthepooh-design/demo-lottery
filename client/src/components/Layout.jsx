import { Outlet, Link, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { api, satang } from '../api.js';
import MfaModal from './MfaModal.jsx';
import AnnouncementBar from './AnnouncementBar.jsx';
import ResultsTicker from './ResultsTicker.jsx';
import WinTicker from './WinTicker.jsx';
import ResultPopup from './ResultPopup.jsx';
import ChatWidget from './ChatWidget.jsx';
import NotificationBell from './NotificationBell.jsx';
import ToastHost from './ToastHost.jsx';
import { isSoundOn, setSoundOn, initSound } from '../sound.js';
import { Icon } from './icons.jsx';
import { CasinoIcon } from './CasinoIcons.jsx';
import { useEffect, useState } from 'react';
import { t } from '../i18n.js';

const nav = [
  { to: '/winners', k: 'winners' },
  { to: '/results', k: 'results' },
  { to: '/my-bets', k: 'mybets', auth: true, memberOnly: true },
  { to: '/performance', k: 'perf', auth: true, memberOnly: true },
  { to: '/wallet', k: 'wallet', auth: true, memberOnly: true },
  { to: '/profile', k: 'profile', auth: true },
  { to: '/admin', k: 'admin', auth: true, admin: true },
];

export default function Layout() {
  const { user, balance, logout, isAdmin, mfaRequired, refresh } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [bettingMenu, setBettingMenu] = useState(true);
  const [now, setNow] = useState(() => new Date());
  const [soundOn, setSoundOnState] = useState(isSoundOn());
  const navigate = useNavigate();
  const location = useLocation();

  const loadMenuData = () => {
    api('/lottery/public-config').then(r => {
      setBettingMenu(r.bettingMenuEnabled !== false);
    }).catch(() => {});
  };

  useEffect(() => { loadMenuData(); initSound(); }, []);

  // SSE — server push เมื่อแอดมินแก้ไข/ผลรางวัลออก → refetch ทันทีไม่ต้อง reload หน้า
  useEffect(() => {
    const es = new EventSource('/api/events');
    const tell = (live) => window.dispatchEvent(new CustomEvent('sys:live', { detail: { live } }));
    es.addEventListener('open', () => tell(true));
    es.addEventListener('error', () => tell(false));
    es.addEventListener('update', (e) => {
      let kind = 'update';
      try { kind = JSON.parse(e.data).kind || 'update'; } catch {}
      window.dispatchEvent(new CustomEvent('sys:update', { detail: { kind } }));
      if (kind === 'settings') loadMenuData();
    });
    return () => es.close();
  }, []);

  // admin ปิดเมนูแทงหวย (blind mode) ได้ — admin เองยังเห็นเมนูปกติเสมอ
  const showBetMenu = bettingMenu || isAdmin;

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
      <header className="sticky top-0 z-40 bg-gradient-to-r from-[#040a14] via-[#0a1526] to-[#040a14] backdrop-blur-md border-b border-gold-500/30 shadow-lg shadow-black/30">
        <div className="h-[2px] bg-gradient-to-r from-transparent via-gold-400/70 to-transparent" />
        <div className="max-w-7xl mx-auto px-4 flex items-center justify-between h-16">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full border border-gold-500/60 bg-navy-950 flex items-center justify-center shadow-[0_0_14px_rgba(34,211,238,0.25)] overflow-hidden">
              <img src="/money-bag.svg" alt="กระเป๋าเงิน" className="w-7 h-7" />
            </div>
            <div>
              <div className="font-display font-bold text-gold-300 leading-tight tracking-[0.18em] text-sm">DEMO LOTTERY</div>
              <div className="text-[9px] text-navy-400 tracking-widest uppercase -mt-0.5">Premium Lottery Lounge</div>
            </div>
          </Link>

          <nav className="hidden lg:flex items-center gap-1">
            <NavLink to="/" end
              className={({ isActive }) => `px-3 py-2 text-[13px] tracking-wide transition border-b-2 ${isActive ? 'border-[#22d3ee] text-[#67e8f9] font-semibold' : 'border-transparent text-navy-300 hover:text-[#67e8f9]'}`}>
              {t('home')}
            </NavLink>
            {showBetMenu && (
              <NavLink to="/lotteries"
                className={({ isActive }) => `px-3 py-2 text-[13px] tracking-wide transition border-b-2 ${isActive ? 'border-[#22d3ee] text-[#67e8f9] font-semibold' : 'border-transparent text-navy-300 hover:text-[#67e8f9]'}`}>
                {t('betMenu')}
              </NavLink>
            )}
            {nav.filter(n => !n.auth || user).filter(n => !n.admin || isAdmin).filter(n => !n.memberOnly || !isAdmin).map(n => (
              <NavLink key={n.to} to={n.to} end={n.end}
                className={({ isActive }) => `px-3 py-2 text-[13px] tracking-wide transition border-b-2 ${isActive ? 'border-[#22d3ee] text-[#67e8f9] font-semibold' : 'border-transparent text-navy-300 hover:text-[#67e8f9]'}`}>
                {t(n.k)}
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
                <NotificationBell />
                <Link to="/wallet" className="hidden sm:flex items-center gap-2 rounded-full border border-gold-400/60 bg-gradient-to-r from-gold-500/25 to-gold-500/5 px-3.5 py-1.5 hover:shadow-[0_0_18px_rgba(34,211,238,0.35)] hover:border-gold-300 transition">
                  <span className="w-1.5 h-1.5 rounded-full bg-black animate-pulse" />
                  <span className="text-[11px] font-black text-black tracking-wider">{t('credit')}</span>
                  <span className="text-base font-black text-black font-mono">{satang(balance)} บาท</span>
                </Link>
                <button onClick={doLogout} className="hidden sm:block text-[13px] tracking-wide text-navy-300 hover:text-gold-200 border border-navy-700 rounded-md px-3 py-1.5 transition">
                  {t('logout')}
                </button>
              </>
            ) : (
              <div className="flex gap-2">
                <Link to="/login" className="text-[13px] tracking-wide px-3.5 py-1.5 rounded-md border border-gold-500/40 text-gold-300 hover:bg-gold-500/10 transition">{t('login')}</Link>
                <Link to="/register" className="text-[13px] tracking-wide px-3.5 py-1.5 rounded-md bg-gradient-to-b from-gold-400 to-gold-600 text-navy-950 font-bold hover:brightness-110 transition">{t('register')}</Link>
              </div>
            )}
            <div className="sm:hidden text-xs font-mono font-bold text-gold-300">{timeStr}</div>
            <button
              onClick={() => { const v = !soundOn; setSoundOn(v); setSoundOnState(v); }}
              title={soundOn ? 'ปิดเสียง' : 'เปิดเสียง'}
              className="text-sm px-2.5 py-1.5 rounded-lg border border-navy-600 text-navy-200 hover:text-gold-300 hover:border-gold-500/50 transition inline-flex items-center">
              <Icon name={soundOn ? 'volume' : 'volumeOff'} className="w-4 h-4" />
            </button>
            <button className="lg:hidden text-navy-200 hover:text-gold-300 text-xl px-2 transition" onClick={() => setMenuOpen(!menuOpen)} aria-label="เมนู">☰</button>
          </div>
        </div>
        {menuOpen && (
          <nav className="lg:hidden suit-pattern border-t border-[#22d3ee]/30 bg-[#0a1526]/95 backdrop-blur-md px-3 py-2 space-y-1">
            <div className="px-3 pt-1 pb-2 flex items-center justify-between">
              <span className="kicker">{t('menu')}</span>
              {user && <span className="text-xs font-black font-mono text-gold-300">{t('credit')} {satang(balance)} บาท</span>}
            </div>
            <NavLink to="/" end onClick={() => setMenuOpen(false)}
              className={({ isActive }) => `block px-3 py-2 text-sm tracking-wide ${isActive ? 'text-[#67e8f9] font-semibold border-l-2 border-[#22d3ee]' : 'text-navy-300'}`}>
              {t('home')}
            </NavLink>
            {showBetMenu && (
              <NavLink to="/lotteries" onClick={() => setMenuOpen(false)}
                className={({ isActive }) => `block px-3 py-2 text-sm tracking-wide ${isActive ? 'text-[#67e8f9] font-semibold border-l-2 border-[#22d3ee]' : 'text-navy-300'}`}>
                {t('betMenu')}
              </NavLink>
            )}
            {nav.filter(n => !n.auth || user).filter(n => !n.admin || isAdmin).filter(n => !n.memberOnly || !isAdmin).map(n => (
              <NavLink key={n.to} to={n.to} end={n.end} onClick={() => setMenuOpen(false)}
                className={({ isActive }) => `block px-3 py-2 text-sm tracking-wide ${isActive ? 'text-[#67e8f9] font-semibold border-l-2 border-[#22d3ee]' : 'text-navy-300'}`}>
                {t(n.k)}
              </NavLink>
            ))}
            {user && (
              <button onClick={() => { setMenuOpen(false); doLogout(); }}
                className="w-full text-left px-3 py-2 text-sm tracking-wide text-gold-300 border-t border-gold-500/20 mt-1">
                {t('logout')}
              </button>
            )}
          </nav>
        )}
      </header>

      <AnnouncementBar />
      <ResultsTicker />
      <WinTicker />
      {/* banner บังคับยืนยันอายุ 18+ สำหรับบัญชีที่ยังไม่ได้ยืนยัน (สมัครเก่า/LINE) */}
      {user && !user.ageConfirmed && (
        <div className="bg-amber-500/15 border-b border-amber-500/40">
          <div className="max-w-7xl mx-auto px-4 py-2 flex flex-wrap items-center gap-3 text-sm">
            <span className="text-amber-200">⚠️ กรุณายืนยันว่าคุณมีอายุ <b>18 ปีขึ้นไป</b> เพื่อใช้งานต่อ (เพื่อการศึกษา ใช้เครดิตเสมือน)</span>
            <button onClick={async () => { try { await api('/auth/me/confirm-age', { method: 'POST', body: {} }); await refresh(); } catch {} }}
              className="bg-amber-500 text-navy-950 font-bold px-4 py-1 rounded-lg text-xs hover:bg-amber-400">
              ยืนยันอายุ 18+
            </button>
          </div>
        </div>
      )}

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-6 pb-24 lg:pb-6">
        <Outlet />
      </main>

      {/* Bottom navigation — มือถือ/แท็บเล็ต (แสดงเฉพาะจอ < lg) แถบติดขอบล่าง */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="relative border-t border-[#22d3ee]/30 bg-gradient-to-b from-[#0f1e33]/95 to-[#0a1526]/95 backdrop-blur-md shadow-[0_-8px_30px_rgba(0,0,0,0.5)]">
          {/* เส้นเรืองทองด้านบน */}
          <div className="absolute top-0 inset-x-8 h-px"
            style={{ background: 'linear-gradient(90deg, transparent, rgba(34,211,238,0.8), transparent)' }} />
          <div className="flex h-16">
            {[
              { to: '/', k: 'home', icon: 'home', end: true, show: true },
              { to: '/lotteries', k: 'lottery', icon: 'lotteries', show: showBetMenu },
              ...(user ? [
                { to: '/my-bets', k: 'mybets', icon: 'bets', show: true },
                { to: '/performance', k: 'perf', icon: 'reports', show: !isAdmin },
                { to: '/wallet', k: 'walletShort', icon: 'wallet', show: !isAdmin },
              ] : [
                { to: '/login', k: 'login', icon: 'roles', show: true },
              ]),
            ].filter(i => i.show).map(i => (
              <NavLink key={i.to} to={i.to} end={i.end}
                className="relative flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] transition-colors text-white/60 hover:text-white">
                {({ isActive }) => (
                  <>
                    {/* active: วงทองเรืองนุ่ม + ไอคอนโตกว่า (inactive = เทา) */}
                    {isActive && (
                      <span className="absolute top-1.5 h-10 w-12 rounded-full border border-[#22d3ee]/40"
                        style={{ background: 'radial-gradient(ellipse at center, rgba(34,211,238,0.28), rgba(34,211,238,0.05) 70%)', boxShadow: '0 0 16px rgba(34,211,238,0.35)' }} />
                    )}
                    <span className={`relative transition-transform duration-200 ${isActive ? 'scale-110 -translate-y-0.5' : 'opacity-70'}`}
                      style={isActive ? { filter: 'drop-shadow(0 0 8px rgba(34,211,238,0.7))' } : undefined}>
                      <CasinoIcon name={i.icon} tone={isActive ? 'green' : 'gray'} className="w-6 h-6" />
                    </span>
                    <span className={`relative ${isActive ? 'text-white font-bold' : ''}`}>{t(i.k)}</span>
                  </>
                )}
              </NavLink>
            ))}
          </div>
        </div>
      </nav>

      <footer className="border-t border-navy-800 py-4 pb-20 lg:pb-4 text-center text-xs text-navy-300">
        {t('footer')}
      </footer>

      <ToastHost />
      <ResultPopup />
      {/* widget แชทสมาชิก↔แอดมิน — แสดงทุกหน้าที่ไม่ใช่หน้า admin (admin มีหน้าแชทของตัวเองที่ /admin/chat) */}
      {user && !location.pathname.startsWith('/admin') && <ChatWidget />}
      {mfaRequired && user && <MfaModal />}
    </div>
  );
}
