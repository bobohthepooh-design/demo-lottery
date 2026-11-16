import { Outlet, Link, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { api, satang } from '../api.js';
import MfaModal from './MfaModal.jsx';
import AnnouncementBar from './AnnouncementBar.jsx';
import ResultPopup from './ResultPopup.jsx';
import ChatWidget from './ChatWidget.jsx';
import NotificationBell from './NotificationBell.jsx';
import ToastHost from './ToastHost.jsx';
import { isSoundOn, setSoundOn, initSound } from '../sound.js';
import { Icon } from './icons.jsx';
import { CasinoIcon } from './CasinoIcons.jsx';
import { adminGroups } from '../admin/AdminLayout.jsx';
import { Fragment, useEffect, useState } from 'react';
import { t } from '../i18n.js';

// เมนูจัดกลุ่ม: เล่นหวย | ผลรางวัล&ข้อมูล | บัญชีของฉัน | ผู้ดูแลระบบ
const navGroups = [
  { label: 'navBet', items: [{ to: '/lotteries', k: 'betMenu', icon: 'lotteries', betGate: true }] },
  { label: 'navInfo', items: [
    { to: '/results', k: 'results', icon: 'trophy' },
    { to: '/check', k: 'check', icon: 'search' },
    { to: '/winners', k: 'winners', icon: 'trophy' },
  ]},
  { label: 'navAccount', items: [
    { to: '/my-bets', k: 'mybets', icon: 'ticket', auth: true, memberOnly: true },
    { to: '/wallet', k: 'wallet', icon: 'wallet', auth: true, memberOnly: true },
    { to: '/performance', k: 'perf', icon: 'chart', auth: true, memberOnly: true },
    { to: '/profile', k: 'profile', icon: 'user', auth: true },
  ]},
  { label: 'navAdmin', items: [{ to: '/admin', k: 'admin', icon: 'dashboard', auth: true, admin: true }] },
];

export default function Layout() {
  const { user, balance, logout, isAdmin, mfaRequired, refresh } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [adminMenuOpen, setAdminMenuOpen] = useState(false);
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
  const navVisible = n => (!n.auth || user) && (!n.admin || isAdmin) && (!n.memberOnly || !isAdmin) && (!n.betGate || showBetMenu);
  const visibleGroups = navGroups.map(g => ({ ...g, items: g.items.filter(navVisible) })).filter(g => g.items.length);

  // เมนู admin แยกเป็นกลุ่มย่อย (ใช้ groups เดียวกับ AdminLayout — filter super_admin ตาม role)
  const isSuper = (user?.roles || []).includes('super_admin');
  const adminNavGroups = adminGroups
    .map(g => ({ ...g, items: g.items.filter(i => !i.superOnly || isSuper) }))
    .filter(g => g.items.length > 0);

  // ปิด dropdown admin เมื่อคลิกข้างนอก / เปลี่ยนหน้า
  useEffect(() => {
    if (!adminMenuOpen) return;
    const close = () => setAdminMenuOpen(false);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [adminMenuOpen]);
  useEffect(() => { setAdminMenuOpen(false); }, [location.pathname]);

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
        <div className="max-w-7xl mx-auto px-4 flex items-center justify-between h-16 gap-3">
          <Link to="/" className="flex items-center gap-2.5 shrink-0">
            <div className="w-9 h-9 rounded-xl border border-gold-500/60 bg-navy-950 flex items-center justify-center shadow-[0_0_14px_rgba(34,211,238,0.25)] overflow-hidden">
              <img src="/icon.svg" alt="โลโก้" className="w-8 h-8" />
            </div>
            <div className="font-display font-bold text-gold-300 leading-none tracking-[0.22em] text-base hidden min-[420px]:block">DEMO LOTTERY</div>
          </Link>

          {/* เมนูหลัก — glass pill bar เดียวจบ: ลิงก์เลื่อนในตัว + เวลา/กระดิ่ง/เครดิต/ปุ่มทั้งหมดปักขวาสุด
              ≥640px (tablet/desktop): แถวเดียวกับ logo • tablet = แถบเต็มแถวล่างของ header */}
          <div className="hidden sm:flex items-stretch min-w-0 flex-1 rounded-xl border border-navy-700/60 bg-navy-900/50 backdrop-blur pl-1.5 py-1 max-md:order-3 max-md:basis-full max-md:mx-3 max-md:mt-1 max-md:mb-1.5">
            <nav className="flex items-center gap-0.5 overflow-x-auto min-w-0 flex-1 justify-start [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <NavLink to="/" end
                className={({ isActive }) => `shrink-0 px-3 max-md:px-2.5 py-1.5 text-[13px] tracking-wide transition rounded-lg inline-flex items-center gap-1.5 max-md:gap-1 ${isActive ? 'bg-gradient-to-b from-[#22d3ee]/20 to-[#22d3ee]/10 text-[#a5f3fc] font-semibold shadow-[inset_0_0_0_1px_rgba(34,211,238,0.35),0_0_12px_rgba(34,211,238,0.15)]' : 'text-navy-300 hover:text-[#67e8f9] hover:bg-white/5'}`}>
                <Icon name="home" className="w-5 h-5 max-md:w-4 max-md:h-4" />{t('home')}
              </NavLink>
              {visibleGroups.filter(g => g.label !== 'navAdmin').map((g, gi) => (
                <Fragment key={g.label}>
                  {gi > 0 && <span className="w-px h-4 bg-navy-700/70 mx-1 shrink-0 max-md:hidden" />}
                  {g.items.map(n => (
                    <NavLink key={n.to} to={n.to} end={n.end}
                      className={({ isActive }) => `shrink-0 px-3 max-md:px-2.5 py-1.5 text-[13px] tracking-wide transition rounded-lg inline-flex items-center gap-1.5 max-md:gap-1 ${isActive ? 'bg-gradient-to-b from-[#22d3ee]/20 to-[#22d3ee]/10 text-[#a5f3fc] font-semibold shadow-[inset_0_0_0_1px_rgba(34,211,238,0.35),0_0_12px_rgba(34,211,238,0.15)]' : 'text-navy-300 hover:text-[#67e8f9] hover:bg-white/5'}`}>
                      {n.icon && <Icon name={n.icon} className="w-5 h-5 max-md:w-4 max-md:h-4" />}
                      {t(n.k)}
                    </NavLink>
                  ))}
                </Fragment>
              ))}
            </nav>
            {/* controls — ปักขวาสุดของ pill bar เสมอ ไม่เลื่อนตามลิงก์ */}
            <div className="flex items-center gap-1 shrink-0 pl-2 ml-1 border-l border-navy-700/60">
              {isAdmin && (
                <div className="relative" onClick={e => e.stopPropagation()}>
                  <button onClick={() => setAdminMenuOpen(v => !v)}
                    className={`px-2.5 py-1.5 text-[13px] font-bold tracking-wide rounded-lg border transition inline-flex items-center gap-1.5 ${adminMenuOpen ? 'border-gold-300 bg-gold-500/20 text-gold-200' : 'border-gold-500/50 text-gold-300 hover:bg-gold-500/10 hover:border-gold-300'}`}>
                    <Icon name="dashboard" className="w-4.5 h-4.5" />{t('admin')}
                    <svg viewBox="0 0 24 24" className={`w-3 h-3 transition-transform ${adminMenuOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m6 9 6 6 6-6"/></svg>
                  </button>
                  {adminMenuOpen && (
                    <div className="absolute right-0 top-full mt-2 w-64 max-h-[70vh] overflow-y-auto rounded-xl border border-gold-500/30 bg-[#0a1526]/98 backdrop-blur-md shadow-2xl shadow-black/60 py-1.5 z-50">
                      <div className="px-3.5 py-2 text-[11px] font-bold uppercase tracking-widest text-gold-400/80 border-b border-navy-700/60 mb-1">Admin Panel</div>
                      {adminNavGroups.map(g => (
                        <div key={g.label}>
                          <div className="px-3.5 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-navy-400">{g.label}</div>
                          {g.items.map(i => (
                            <NavLink key={i.to} to={i.to} end={i.end} onClick={() => setAdminMenuOpen(false)}
                              className={({ isActive }) => `flex items-center gap-2.5 px-3.5 py-2 text-[13px] transition ${isActive ? 'text-[#67e8f9] font-semibold bg-[#22d3ee]/10' : 'text-navy-200 hover:bg-white/5 hover:text-white'}`}>
                              {i.icon && <Icon name={i.icon} className="w-5 h-5 shrink-0" />}
                              {i.label}
                            </NavLink>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <div className="flex items-center gap-1.5 rounded-lg border border-navy-600/80 bg-navy-900/60 px-2 py-1" title="วันที่และเวลาปัจจุบัน">
                <Icon name="clock" className="w-3.5 h-3.5 text-gold-400/80 shrink-0" />
                <div className="leading-tight text-right">
                  <div className="text-[9px] text-navy-300">{dateStr}</div>
                  <div className="text-[11px] font-mono font-bold text-gold-300">{timeStr}</div>
                </div>
              </div>
              {user ? (
                <>
                  <NotificationBell />
                  <Link to="/wallet" className="flex items-center gap-1.5 rounded-full border border-gold-400/60 bg-gradient-to-r from-gold-500/25 to-gold-500/5 px-2.5 py-1 hover:border-gold-300 transition">
                    <Icon name="wallet" className="w-3.5 h-3.5 text-black" />
                    <span className="text-[10px] font-black text-black tracking-wider">{t('credit')}</span>
                    <span className="text-sm font-black text-black font-mono">{satang(balance)}</span>
                  </Link>
                  <button onClick={doLogout} title="ออกจากระบบ"
                    className="flex items-center justify-center w-8 h-8 rounded-lg border border-navy-600/80 bg-navy-900/60 text-navy-200 hover:text-red-300 hover:border-red-500/50 transition">
                    <Icon name="logout" className="w-4 h-4" />
                  </button>
                </>
              ) : (
                <div className="flex gap-1.5">
                  <Link to="/login" className="text-[13px] tracking-wide px-3 py-1.5 rounded-md border border-gold-500/40 text-gold-300 hover:bg-gold-500/10 transition">{t('login')}</Link>
                  <Link to="/register" className="text-[13px] tracking-wide px-3 py-1.5 rounded-md bg-gradient-to-b from-gold-400 to-gold-600 text-navy-950 font-bold hover:brightness-110 transition">{t('register')}</Link>
                </div>
              )}
              <button
                onClick={() => { const v = !soundOn; setSoundOn(v); setSoundOnState(v); }}
                title={soundOn ? 'ปิดเสียง' : 'เปิดเสียง'}
                className="flex items-center justify-center w-8 h-8 rounded-lg border border-navy-600/80 bg-navy-900/60 text-navy-200 hover:text-gold-300 hover:border-gold-500/50 transition">
                <Icon name={soundOn ? 'volume' : 'volumeOff'} className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* มือถือ (<640px) — เวลา + เสียง + hamburger (เมนูอยู่ใน bottom nav + overlay) */}
          <div className="flex items-center gap-2 sm:hidden">
            <div className="text-xs font-mono font-bold text-gold-300">{timeStr}</div>
            <button
              onClick={() => { const v = !soundOn; setSoundOn(v); setSoundOnState(v); }}
              title={soundOn ? 'ปิดเสียง' : 'เปิดเสียง'}
              className="flex items-center justify-center w-9 h-9 rounded-lg border border-navy-600/80 bg-navy-900/60 text-navy-200 hover:text-gold-300 hover:border-gold-500/50 transition">
              <Icon name={soundOn ? 'volume' : 'volumeOff'} className="w-4.5 h-4.5" />
            </button>
            <button className="text-navy-200 hover:text-gold-300 text-xl px-2 transition" onClick={() => setMenuOpen(!menuOpen)} aria-label="เมนู">☰</button>
          </div>
        </div>
      </header>

      {/* เมนูมือถือ/แท็บเล็ต — overlay เต็มจอ เปิดได้จากปุ่ม ☰ หรือ "เพิ่มเติม" ใน bottom nav */}
      {menuOpen && (
        <div className="sm:hidden fixed inset-0 z-50 bg-[#040a14]/97 backdrop-blur-md overflow-y-auto" onClick={() => setMenuOpen(false)}>
          <div className="suit-pattern min-h-full px-4 py-4 space-y-1" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-3 pt-1 pb-3 sticky top-0 bg-[#040a14]/95 backdrop-blur-md">
              <span className="kicker">{t('menu')}</span>
              <div className="flex items-center gap-3">
                {user && <span className="text-xs font-black font-mono text-gold-300">{t('credit')} {satang(balance)} บาท</span>}
                <button onClick={() => setMenuOpen(false)} aria-label={t('close')}
                  className="w-9 h-9 rounded-full border border-navy-600 text-navy-200 hover:text-gold-300 hover:border-gold-500/50 transition text-lg leading-none">✕</button>
              </div>
            </div>
            <NavLink to="/" end onClick={() => setMenuOpen(false)}
              className={({ isActive }) => `flex items-center gap-3 px-4 py-3.5 text-[16px] tracking-wide rounded-xl ${isActive ? 'text-[#67e8f9] font-semibold bg-[#22d3ee]/10 border border-[#22d3ee]/30' : 'text-navy-100 hover:bg-white/5'}`}>
              <Icon name="home" className="w-7 h-7" />{t('home')}
            </NavLink>
            {visibleGroups.map(g => (
              g.label === 'navAdmin' ? (
                <div key={g.label}>
                  <div className="px-4 pt-4 pb-1.5 text-[12px] font-bold uppercase tracking-widest text-gold-400">{t(g.label)}</div>
                  {adminNavGroups.map(ag => (
                    <div key={ag.label}>
                      <div className="px-4 pt-2.5 pb-1 text-[10px] font-bold uppercase tracking-wider text-navy-500">{ag.label}</div>
                      {ag.items.map(i => (
                        <NavLink key={i.to} to={i.to} end={i.end} onClick={() => setMenuOpen(false)}
                          className={({ isActive }) => `flex items-center gap-3 px-4 py-3 text-[15px] tracking-wide rounded-xl ${isActive ? 'text-[#67e8f9] font-semibold bg-[#22d3ee]/10 border border-[#22d3ee]/30' : 'text-navy-200 hover:bg-white/5'}`}>
                          {i.icon && <Icon name={i.icon} className="w-6 h-6" />}
                          {i.label}
                        </NavLink>
                      ))}
                    </div>
                  ))}
                </div>
              ) : (
                <div key={g.label}>
                  <div className="px-4 pt-4 pb-1.5 text-[12px] font-bold uppercase tracking-widest text-navy-400">{t(g.label)}</div>
                  {g.items.map(n => (
                    <NavLink key={n.to} to={n.to} end={n.end} onClick={() => setMenuOpen(false)}
                      className={({ isActive }) => `flex items-center gap-3 px-4 py-3.5 text-[16px] tracking-wide rounded-xl ${isActive ? 'text-[#67e8f9] font-semibold bg-[#22d3ee]/10 border border-[#22d3ee]/30' : 'text-navy-100 hover:bg-white/5'}`}>
                      {n.icon && <Icon name={n.icon} className="w-7 h-7" />}
                      {t(n.k)}
                    </NavLink>
                  ))}
                </div>
              )
            ))}
            {user && (
              <button onClick={() => { setMenuOpen(false); doLogout(); }}
                className="w-full text-left px-4 py-3.5 text-[16px] tracking-wide text-gold-300 rounded-xl hover:bg-white/5 border-t border-gold-500/20 mt-2">
                {t('logout')}
              </button>
            )}
          </div>
        </div>
      )}

      <AnnouncementBar />
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

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-6 pb-24 sm:pb-6">
        <Outlet />
      </main>

      {/* Bottom navigation — มือถือ/แท็บเล็ต (< xl) แถบติดขอบล่าง + ปุ่มเพิ่มเติมเปิดเมนูเต็ม */}
      <nav className="sm:hidden fixed bottom-0 inset-x-0 z-40"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {/* มือถือ: เต็มความกว้าง / แท็บเล็ต: floating pill กลางจอ */}
        <div className="relative border-t border-[#22d3ee]/30 bg-gradient-to-b from-[#0f1e33]/95 to-[#0a1526]/95 backdrop-blur-md shadow-[0_-8px_30px_rgba(0,0,0,0.5)]
          sm:mx-auto sm:mb-3 sm:max-w-md sm:border sm:border-[#22d3ee]/40 sm:rounded-2xl sm:overflow-hidden sm:shadow-[0_8px_30px_rgba(0,0,0,0.6)]">
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
            <button onClick={() => setMenuOpen(true)}
              className="relative flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] transition-colors text-white/60 hover:text-white">
              <span className="relative opacity-70">
                <CasinoIcon name="menu" tone="gray" className="w-6 h-6" />
              </span>
              <span className="relative">{t('more')}</span>
            </button>
          </div>
        </div>
      </nav>

      <footer className="border-t border-navy-800 py-4 pb-20 sm:pb-4 text-center text-xs text-navy-300">
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
