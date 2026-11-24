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
import { adminGroups } from '../admin/AdminLayout.jsx';
import { Fragment, useEffect, useState, useMemo } from 'react';
import { t } from '../i18n.js';

// เมนูจัดกลุ่ม: เล่นหวย | ผลรางวัล&ข้อมูล | บัญชีของฉัน | ผู้ดูแลระบบ
const navGroups = [
  { label: 'navBet', items: [
    { to: '/play', k: 'betMenu', icon: 'lotteries', betGate: true },
    { to: '/games', k: 'gamesHub', icon: 'chart' },
  ] },
  { label: 'navInfo', items: [
    { to: '/results', k: 'results', icon: 'trophy' },
    { to: '/winners', k: 'winners', icon: 'trophy' },
  ]},
  { label: 'navAccount', items: [
    { to: '/my-bets', k: 'mybets', icon: 'ticket', auth: true, memberOnly: true },
    { to: '/wallet', k: 'wallet', icon: 'wallet', auth: true, memberOnly: true },
    { to: '/performance', k: 'perf', icon: 'chart', auth: true, memberOnly: true },
    { to: '/profile', k: 'profile', icon: 'user', auth: true },
    { to: '/support', k: 'support', icon: 'chat', auth: true, memberOnly: true },
  ]},
  { label: 'navAdmin', items: [{ to: '/admin', k: 'admin', icon: 'dashboard', auth: true, admin: true }] },
];

export default function Layout() {
  const { user, balance, logout, isAdmin, mfaRequired, refresh } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [adminMenuOpen, setAdminMenuOpen] = useState(false);
  const [bettingMenu, setBettingMenu] = useState(true);
  const [banner, setBanner] = useState(null);
  const [now, setNow] = useState(() => new Date());
  const [soundOn, setSoundOnState] = useState(isSoundOn());
  const navigate = useNavigate();
  const location = useLocation();

  // สีปุ่ม active ใน bottom nav ตาม route
  const activeBtnColor = useMemo(() => {
    const path = location.pathname;
    if (path.startsWith('/play')) return { bg: 'rgba(56, 189, 248, 0.30)', border: 'rgba(56, 189, 248, 0.40)', shadow: 'rgba(56, 189, 248, 0.8)' }; // sky
    if (path.startsWith('/games')) return { bg: 'rgba(192, 132, 252, 0.30)', border: 'rgba(192, 132, 252, 0.40)', shadow: 'rgba(192, 132, 252, 0.8)' }; // purple
    if (path.startsWith('/results')) return { bg: 'rgba(251, 191, 36, 0.30)', border: 'rgba(251, 191, 36, 0.40)', shadow: 'rgba(251, 191, 36, 0.8)' }; // amber
    if (path.startsWith('/wallet')) return { bg: 'rgba(52, 211, 153, 0.30)', border: 'rgba(52, 211, 153, 0.40)', shadow: 'rgba(52, 211, 153, 0.8)' }; // emerald
    // default gold
    return { bg: 'rgba(244, 201, 78, 0.30)', border: 'rgba(244, 201, 78, 0.40)', shadow: 'rgba(244, 201, 78, 0.8)' };
  }, [location.pathname]);

  const loadMenuData = () => {
    api('/lottery/public-config').then(r => {
      setBettingMenu(r.bettingMenuEnabled !== false);
      setBanner(r.banner && typeof r.banner === 'object' ? r.banner : null);
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

  // แสดงวันที่+เวลาบน title tab — อัปเดตครั้งเดียวต่อนาที (ไม่ให้ title กะพริบทุกวินาที)
  const minuteKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}-${now.getMinutes()}`;
  useEffect(() => {
    const p = n => String(n).padStart(2, '0');
    const d = new Date();
    const dateStr = `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
    const timeStr = `${p(d.getHours())}:${p(d.getMinutes())}`;
    document.title = `Devin Lottery — ${dateStr} ${timeStr}`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minuteKey]);

  const dateStr = now.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
  const timeStr = now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  const doLogout = async () => { await logout(); navigate('/'); };

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: 'var(--bg-deep-black)' }}>
      <header className="sticky top-0 z-40 backdrop-blur-md border-b" style={{
        background: 'linear-gradient(90deg, var(--bg-deep-black), var(--bg-dark-surface), var(--bg-deep-black))',
        borderColor: 'var(--border-gold)',
        boxShadow: 'var(--shadow-lg)'
      }}>
        <div className="h-[2px]" style={{ background: 'linear-gradient(90deg, transparent, var(--gold-primary), transparent)' }} />
        <div className="max-w-7xl mx-auto px-3 sm:px-4 flex items-center justify-between h-14 sm:h-16 gap-2 sm:gap-3">
          <Link to="/" className="flex items-center gap-2 sm:gap-2.5 shrink-0">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center overflow-hidden" style={{
              border: '1px solid var(--border-gold)',
              background: 'var(--bg-deep-black)',
              boxShadow: 'var(--shadow-gold)'
            }}>
              <img src="/devin.svg" alt="Devin" className="w-8 h-8 sm:w-9 sm:h-9 object-contain" />
            </div>
            <div className="font-display font-bold leading-none tracking-[0.22em] text-sm sm:text-base hidden sm:block luxury-gradient-text">DEVIN</div>
          </Link>

          {/* เมนูหลัก — luxury glass pill bar */}
          <div className="hidden sm:flex items-stretch min-w-0 flex-1 rounded-xl pl-1.5 py-1 max-lg:order-3 max-lg:basis-full max-lg:mx-2 sm:max-lg:mx-3 max-lg:mt-1 max-lg:mb-1.5" style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-light)',
            backdropFilter: 'blur(10px)'
          }}>
            <nav className="flex items-center gap-0.5 overflow-x-auto min-w-0 flex-1 justify-start [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <NavLink to="/" end
                className={({ isActive }) => `topnav-link shrink-0 px-2 sm:px-2.5 py-1.5 text-xs sm:text-sm transition rounded-lg inline-flex items-center whitespace-nowrap ${isActive ? 'font-semibold' : ''}`}
                style={({ isActive }) => isActive ? {
                  background: 'linear-gradient(135deg, var(--gold-gradient-start), var(--gold-gradient-end))',
                  color: 'var(--bg-deep-black)',
                  boxShadow: 'var(--shadow-gold)'
                } : {
                  color: 'var(--muted-gray)'
                }}>
                {t('home')}
              </NavLink>
              {visibleGroups.filter(g => g.label !== 'navAdmin').map((g, gi) => (
                <Fragment key={g.label}>
                  {gi > 0 && <span className="w-px h-4 mx-1 shrink-0 max-xl:hidden" style={{ background: 'var(--border-light)' }} />}
                  {g.items.map(n => (
                    <NavLink key={n.to} to={n.to} end={n.end}
                      className={({ isActive }) => `topnav-link shrink-0 px-2 sm:px-2.5 py-1.5 text-xs sm:text-sm transition rounded-lg inline-flex items-center whitespace-nowrap ${isActive ? 'font-semibold' : ''}`}
                      style={({ isActive }) => isActive ? {
                        background: 'linear-gradient(135deg, var(--gold-gradient-start), var(--gold-gradient-end))',
                        color: 'var(--bg-deep-black)',
                        boxShadow: 'var(--shadow-gold)'
                      } : {
                        color: 'var(--muted-gray)'
                      }}>
                      {t(n.k)}
                    </NavLink>
                  ))}
                </Fragment>
              ))}
            </nav>
            {/* controls */}
            <div className="flex items-center gap-1 shrink-0 pl-2 ml-1" style={{ borderLeft: '1px solid var(--border-light)' }}>
              {isAdmin && (
                <div className="relative" onClick={e => e.stopPropagation()}>
                  <button onClick={() => setAdminMenuOpen(v => !v)}
                    className="px-2.5 py-1.5 text-sm font-bold transition rounded-lg border inline-flex items-center gap-1"
                    style={adminMenuOpen ? {
                      borderColor: 'var(--gold-primary)',
                      background: 'rgba(212, 175, 55, 0.2)',
                      color: 'var(--gold-bright)'
                    } : {
                      borderColor: 'var(--border-gold)',
                      color: 'var(--gold-primary)'
                    }}>
                    <Icon name="dashboard" className="w-4.5 h-4.5" /><span className="hidden xl:inline">{t('admin')}</span>
                    <svg viewBox="0 0 24 24" className={`w-3 h-3 transition-transform ${adminMenuOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m6 9 6 6 6-6"/></svg>
                  </button>
                  {adminMenuOpen && (
                    <div className="absolute right-0 top-full mt-2 w-64 max-h-[70vh] overflow-y-auto rounded-xl py-1.5 z-50" style={{
                      background: 'var(--bg-card)',
                      border: '1px solid var(--border-gold)',
                      boxShadow: 'var(--shadow-pop)'
                    }}>
                      <div className="px-3.5 py-2 text-[11px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--gold-primary)', borderBottom: '1px solid var(--border-light)' }}>Admin Panel</div>
                      {adminNavGroups.map(g => (
                        <div key={g.label}>
                          <div className="px-3.5 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--muted-gray)' }}>{g.label}</div>
                          {g.items.map(i => (
                            <NavLink key={i.to} to={i.to} end={i.end} onClick={() => setAdminMenuOpen(false)}
                              className={({ isActive }) => `flex items-center gap-2.5 px-3.5 py-2 text-[13px] transition ${isActive ? 'font-semibold' : ''}`}
                              style={({ isActive }) => isActive ? {
                                color: 'var(--gold-bright)',
                                background: 'rgba(212, 175, 55, 0.1)',
                                border: '1px solid var(--border-gold)'
                              } : {
                                color: 'var(--light-gray)'
                              }}>
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
              <div className="hidden xl:flex items-center gap-1.5 rounded-lg px-2 py-1" style={{ border: '1px solid var(--border-light)', background: 'var(--bg-dark-surface)' }} title="วันที่และเวลาปัจจุบัน">
                <Icon name="clock" className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--gold-primary)' }} />
                <div className="leading-tight text-right">
                  <div className="text-xs" style={{ color: 'var(--muted-gray)' }}>{dateStr}</div>
                  <div className="text-sm font-mono font-bold" style={{ color: 'var(--gold-bright)' }}>{timeStr}</div>
                </div>
              </div>
              {user ? (
                <>
                  <NotificationBell />
                  <Link to="/wallet" className="hidden lg:flex items-center gap-1.5 rounded-full px-2.5 py-1 transition" style={{
                    border: '1px solid var(--border-gold)',
                    background: 'linear-gradient(135deg, rgba(212, 175, 55, 0.25), rgba(212, 175, 55, 0.05))'
                  }}>
                    <Icon name="wallet" className="w-3.5 h-3.5" style={{ color: 'var(--bg-deep-black)' }} />
                    <span className="text-xs font-black tracking-wider hidden xl:inline" style={{ color: 'var(--bg-deep-black)' }}>{t('credit')}</span>
                    <span className="text-sm font-black font-mono" style={{ color: 'var(--bg-deep-black)' }}>{satang(balance)}</span>
                  </Link>
                  <button onClick={doLogout} title="ออกจากระบบ" aria-label="ออกจากระบบ"
                    className="flex items-center justify-center w-8 h-8 rounded-lg transition"
                    style={{ border: '1px solid var(--border-light)', background: 'var(--bg-dark-surface)', color: 'var(--muted-gray)' }}>
                    <Icon name="logout" className="w-4 h-4" />
                  </button>
                </>
              ) : (
                <div className="flex gap-1.5">
                  <Link to="/login" className="text-sm tracking-wide px-3.5 py-2 rounded-md border transition" style={{
                    borderColor: 'var(--border-gold)',
                    color: 'var(--gold-primary)'
                  }}>{t('login')}</Link>
                  <Link to="/register" className="text-sm tracking-wide px-3.5 py-2 rounded-md font-bold transition" style={{
                    background: 'linear-gradient(135deg, var(--gold-gradient-start), var(--gold-gradient-end))',
                    color: 'var(--bg-deep-black)'
                  }}>{t('register')}</Link>
                </div>
              )}
              <button
                onClick={() => { const v = !soundOn; setSoundOn(v); setSoundOnState(v); }}
                title={soundOn ? 'ปิดเสียง' : 'เปิดเสียง'}
                aria-label={soundOn ? 'ปิดเสียง' : 'เปิดเสียง'}
                className="flex items-center justify-center w-8 h-8 rounded-lg transition"
                style={{ border: '1px solid var(--border-light)', background: 'var(--bg-dark-surface)', color: 'var(--muted-gray)' }}>
                <Icon name={soundOn ? 'volume' : 'volumeOff'} className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* มือถือ (<640px) — เวลา + กระดิ่ง + เสียง + hamburger */}
          <div className="flex items-center gap-1.5 sm:hidden">
            <div className="text-[10px] sm:text-xs font-mono font-bold" style={{ color: 'var(--gold-bright)' }}>{timeStr}</div>
            {user && <NotificationBell />}
            <button
              onClick={() => { const v = !soundOn; setSoundOn(v); setSoundOnState(v); }}
              title={soundOn ? 'ปิดเสียง' : 'เปิดเสียง'}
              aria-label={soundOn ? 'ปิดเสียง' : 'เปิดเสียง'}
              className="flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-lg transition"
              style={{ border: '1px solid var(--border-light)', background: 'var(--bg-dark-surface)', color: 'var(--muted-gray)' }}>
              <Icon name={soundOn ? 'volume' : 'volumeOff'} className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
            </button>
            <button className="p-1.5 sm:p-2 transition" onClick={() => setMenuOpen(!menuOpen)} aria-label="เมนู" style={{ color: 'var(--muted-gray)' }}><Icon name="menu" className="w-5 h-5 sm:w-6 sm:h-6" /></button>
          </div>
        </div>
      </header>

      {/* เมนูมือถือ/แท็บเล็ต — luxury overlay */}
      {menuOpen && (
        <div className="sm:hidden fixed inset-0 z-50 overflow-y-auto" style={{ background: 'rgba(16, 17, 20, 0.97)', backdropFilter: 'blur(10px)' }} onClick={() => setMenuOpen(false)}>
          <div className="min-h-full px-3 sm:px-4 py-3 sm:py-4 space-y-1" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-3 pt-1 pb-2 sm:pb-3 sticky top-0" style={{ background: 'rgba(16, 17, 20, 0.95)', backdropFilter: 'blur(10px)' }}>
              <span className="kicker">{t('menu')}</span>
              <div className="flex items-center gap-2 sm:gap-3">
                {user && <span className="text-[10px] sm:text-xs font-black font-mono" style={{ color: 'var(--gold-bright)' }}>{t('credit')} {satang(balance)} บาท</span>}
                <button onClick={() => setMenuOpen(false)} aria-label={t('close')}
                  className="w-8 h-8 sm:w-9 sm:h-9 rounded-full transition text-base sm:text-lg leading-none"
                  style={{ border: '1px solid var(--border-light)', color: 'var(--muted-gray)' }}>✕</button>
              </div>
            </div>
            <NavLink to="/" end onClick={() => setMenuOpen(false)}
              className={({ isActive }) => `flex items-center gap-2.5 sm:gap-3 px-3 sm:px-4 py-3 sm:py-3.5 text-sm sm:text-base tracking-wide rounded-xl ${isActive ? 'font-semibold' : ''}`}
              style={({ isActive }) => isActive ? {
                color: 'var(--gold-bright)',
                background: 'rgba(212, 175, 55, 0.1)',
                border: '1px solid var(--border-gold)'
              } : {
                color: 'var(--light-gray)'
              }}>
              <Icon name="home" className="w-6 h-6 sm:w-7 sm:h-7" />{t('home')}
            </NavLink>
            {visibleGroups.map(g => (
              g.label === 'navAdmin' ? (
                <div key={g.label}>
                  <div className="px-3 sm:px-4 pt-3 sm:pt-4 pb-1 sm:pb-1.5 text-xs sm:text-sm font-bold uppercase tracking-widest" style={{ color: 'var(--gold-primary)' }}>{t(g.label)}</div>
                  {adminNavGroups.map(ag => (
                    <div key={ag.label}>
                      <div className="px-3 sm:px-4 pt-2 sm:pt-2.5 pb-0.5 sm:pb-1 text-[10px] sm:text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--muted-gray)' }}>{ag.label}</div>
                      {ag.items.map(i => (
                        <NavLink key={i.to} to={i.to} end={i.end} onClick={() => setMenuOpen(false)}
                          className={({ isActive }) => `flex items-center gap-2.5 sm:gap-3 px-3 sm:px-4 py-2.5 sm:py-3 text-sm sm:text-base tracking-wide rounded-xl ${isActive ? 'font-semibold' : ''}`}
                          style={({ isActive }) => isActive ? {
                            color: 'var(--gold-bright)',
                            background: 'rgba(212, 175, 55, 0.1)',
                            border: '1px solid var(--border-gold)'
                          } : {
                            color: 'var(--light-gray)'
                          }}>
                          {i.icon && <Icon name={i.icon} className="w-5 h-5 sm:w-6 sm:h-6" />}
                          {i.label}
                        </NavLink>
                      ))}
                    </div>
                  ))}
                </div>
              ) : (
                <div key={g.label}>
                  <div className="px-3 sm:px-4 pt-3 sm:pt-4 pb-1 sm:pb-1.5 text-xs sm:text-sm font-bold uppercase tracking-widest" style={{ color: 'var(--muted-gray)' }}>{t(g.label)}</div>
                  {g.items.map(n => (
                    <NavLink key={n.to} to={n.to} end={n.end} onClick={() => setMenuOpen(false)}
                      className={({ isActive }) => `flex items-center gap-2.5 sm:gap-3 px-3 sm:px-4 py-3 sm:py-3.5 text-sm sm:text-base tracking-wide rounded-xl ${isActive ? 'font-semibold' : ''}`}
                      style={({ isActive }) => isActive ? {
                        color: 'var(--gold-bright)',
                        background: 'rgba(212, 175, 55, 0.1)',
                        border: '1px solid var(--border-gold)'
                      } : {
                        color: 'var(--light-gray)'
                      }}>
                      {n.icon && <Icon name={n.icon} className="w-6 h-6 sm:w-7 sm:h-7" />}
                      {t(n.k)}
                    </NavLink>
                  ))}
                </div>
              )
            ))}
            {user && (
              <button onClick={() => { setMenuOpen(false); doLogout(); }}
                className="w-full text-left px-3 sm:px-4 py-3 sm:py-3.5 text-sm sm:text-base tracking-wide rounded-xl mt-2"
                style={{ color: 'var(--gold-primary)', borderTop: '1px solid var(--border-gold)' }}>
                {t('logout')}
              </button>
            )}
          </div>
        </div>
      )}

      <AnnouncementBar />
      {/* Demo mode banner - luxury style */}
      <div className="max-w-7xl w-full mx-auto px-4 pt-2">
        <div className="rounded-lg px-4 py-2 text-center" style={{
          background: 'linear-gradient(90deg, rgba(212, 175, 55, 0.2), rgba(245, 215, 110, 0.15), rgba(212, 175, 55, 0.2))',
          border: '1px solid var(--border-gold)'
        }}>
          <span className="text-xs font-bold tracking-wider" style={{ color: 'var(--gold-bright)' }}>🎮 DEMO MODE — สำหรับการศึกษา • เครดิตเสมือนเท่านั้น</span>
        </div>
      </div>
      {/* ผลรางวัล + ผู้ชนะ ล่าสุด — แถบ LED ทองสไตล์ตารางประกาศผล (admin ปิด/เปิดได้ที่ แบนเนอร์หน้าแรก) */}
      {banner?.show_results_ticker !== false && <ResultsTicker />}
      {banner?.show_winners_ticker !== false && <WinTicker />}
      {/* banner บังคับยืนยันอายุ 18+ */}
      {user && !user.ageConfirmed && (
        <div style={{ background: 'rgba(245, 158, 11, 0.15)', borderBottom: '1px solid var(--border-gold)' }}>
          <div className="max-w-7xl mx-auto px-4 py-2 flex flex-wrap items-center gap-3 text-sm">
            <span style={{ color: 'var(--warning-amber)' }}>⚠️ กรุณายืนยันว่าคุณมีอายุ <b>18 ปีขึ้นไป</b> เพื่อใช้งานต่อ (เพื่อการศึกษา ใช้เครดิตเสมือน)</span>
            <button onClick={async () => { try { await api('/auth/me/confirm-age', { method: 'POST', body: {} }); await refresh(); } catch {} }}
              className="font-bold px-4 py-1 rounded-lg text-xs"
              style={{ background: 'var(--warning-amber)', color: 'var(--bg-deep-black)' }}>
              ยืนยันอายุ 18+
            </button>
          </div>
        </div>
      )}

      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-4 py-6 pb-24 lg:pb-6">
        <Outlet />
      </main>

      {/* Bottom navigation — luxury style */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="relative sm:mx-auto sm:mb-3 sm:max-w-md sm:border sm:rounded-2xl sm:overflow-hidden"
          style={{
            borderTop: '1px solid var(--border-gold)',
            background: 'linear-gradient(180deg, var(--bg-dark-surface), var(--bg-deep-black))',
            backdropFilter: 'blur(10px)',
            boxShadow: '0 -8px 30px rgba(0,0,0,0.5)'
          }}>
          <div className="absolute top-0 inset-x-8 h-px"
            style={{ background: 'linear-gradient(90deg, transparent, var(--gold-primary), transparent)' }} />
          <div className="flex h-16">
            {[
              { to: '/', k: 'home', icon: 'home', end: true, show: true },
              { to: '/play', k: 'betMenu', icon: 'lotteries', show: showBetMenu },
              { to: '/games', k: 'gamesHub', icon: 'bets', show: true },
              { to: '/results', k: 'results', icon: 'trophy', show: true },
              ...(user ? [
                { to: '/wallet', k: 'walletShort', icon: 'wallet', show: !isAdmin },
                { to: '/profile', k: 'profile', icon: 'user', show: true },
              ] : [
                { to: '/login', k: 'login', icon: 'roles', show: true },
              ]),
            ].filter(i => i.show).map(i => (
              <NavLink key={i.to} to={i.to} end={i.end}
                className="relative flex-1 flex flex-col items-center justify-center gap-1 text-xs sm:text-sm transition-colors"
                style={{ color: 'var(--muted-gray)' }}>
                {({ isActive }) => (
                  <>
                    {isActive && (
                      <span className="absolute top-1.5 h-10 w-12 rounded-full border"
                        style={{
                          background: `radial-gradient(ellipse at center, ${activeBtnColor.bg}, ${activeBtnColor.bg.replace('0.30', '0.06')} 70%)`,
                          borderColor: activeBtnColor.border,
                          boxShadow: `0 0 18px ${activeBtnColor.shadow}`
                        }} />
                    )}
                    <span className={`relative transition-transform duration-200 ${isActive ? 'scale-110 -translate-y-0.5' : 'opacity-70'}`}
                      style={isActive ? { filter: `drop-shadow(0 0 8px ${activeBtnColor.shadow})` } : undefined}>
                      <CasinoIcon name={i.icon} tone={isActive ? 'green' : 'gray'} className="w-6 h-6" />
                    </span>
                    <span className={`relative ${isActive ? 'font-bold' : ''}`} style={isActive ? { color: 'var(--white)' } : undefined}>{t(i.k)}</span>
                  </>
                )}
              </NavLink>
            ))}
          </div>
        </div>
      </nav>

      <footer className="py-4 pb-20 lg:pb-4 text-center text-xs" style={{ borderTop: '1px solid var(--border-light)', color: 'var(--muted-gray)' }}>
        <span>{t('footer')}</span><div className="mt-1"><Link to="/legal" style={{ color: 'var(--gold-primary)' }}>ข้อกำหนด • ความเป็นส่วนตัว • เล่นอย่างรับผิดชอบ</Link></div>
      </footer>

      <ToastHost />
      <ResultPopup />
      {/* widget แชทสมาชิก↔แอดมิน — แสดงทุกหน้าที่ไม่ใช่หน้า admin (admin มีหน้าแชทของตัวเองที่ /admin/chat) */}
      {user && !location.pathname.startsWith('/admin') && <ChatWidget />}
      {mfaRequired && user && <MfaModal />}
    </div>
  );
}
