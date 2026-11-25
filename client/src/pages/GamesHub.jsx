import { Link } from 'react-router-dom';
import { api, fmtDateTime } from '../api.js';
import { useEffect, useState } from 'react';
import { useAuth } from '../auth.jsx';

// หน้า games — ศูนย์รวมเกมด่วน (สล็อต/ไฮโล/ยี่กี) + ทางลัดหวยราศี
export default function GamesHub() {
  const { user, isAdmin } = useAuth();
  const [cfg, setCfg] = useState(null);
  const [hiddenBetTypes, setHiddenBetTypes] = useState([]);
  const [betMenuOn, setBetMenuOn] = useState(true);
  const [zodiacDraw, setZodiacDraw] = useState(null);

  useEffect(() => {
    api('/lottery/public-config').then(r => {
      setCfg(r);
      setHiddenBetTypes(Array.isArray(r.hiddenBetTypes) ? r.hiddenBetTypes : []);
      setBetMenuOn(r.bettingMenuEnabled !== false);
    }).catch(() => {});
    api('/lottery/draws?upcoming=1').then(r => {
      const d = (r.draws || []).find(x => x.type_code === 'HR' && x.status !== 'settled' && x.status !== 'cancelled');
      setZodiacDraw(d || null);
    }).catch(() => {});
  }, []);

  const baht = (satang) => `${(Number(satang || 0) / 100).toLocaleString('th-TH')} บาท`;
  const sp = cfg?.instantGame?.scratchPrizes || [];
  const prizeMax = sp.length ? Math.max(...sp.map(p => p.prize)) : null;
  const hm = cfg?.instantGame?.hiloMult;

  // สถานะเปิด/ปิดจาก admin (type/rule is_active + blind mode + hidden types) — เกมที่ปิดไม่แสดงการ์ด
  const en = cfg?.games || {};
  const showBet = betMenuOn || isAdmin; // blind mode — admin ยังเห็นการ์ด (server block การเล่นจริงให้ทุกคน)
  const typeShown = code => showBet && !hiddenBetTypes.includes(code);
  const kiwiOn = typeShown('KI') && (en.kiwi !== false || en.kiwi_vip !== false || en.kiwi_dice !== false);
  const zodiacOn = typeShown('HR') && en.zodiac !== false;

  const games = [
    {
      key: 'scratch', on: typeShown('SC') && en.scratch !== false,
      to: '/scratch', icon: '🎰', name: 'สล็อต 5 รีล', tag: '20 เพย์ไลน์',
      desc: `สปิน 5 รีล 3 แถว 20 เพย์ไลน์ — รางวัลสูงสุด ${prizeMax != null ? baht(prizeMax) : '120,000 บาท'}`,
      price: cfg?.instantGame?.scratchPrice ? `แทง ${baht(cfg.instantGame.scratchPrice)}/สปิน` : '',
      auth: true,
    },
    {
      key: 'hilo', on: typeShown('HL') && en.hilo !== false,
      to: '/hilo', icon: '🎲', name: 'ไฮโล', tag: 'ทายเต๋า 3 ลูก',
      desc: `ทาย สูง/ต่ำ/11 — ${hm ? `ต่ำ ×${hm.low} • สูง ×${hm.high} • 11 ×${hm.eleven}` : 'อัตราจ่ายตามกติกา'}`,
      price: cfg?.instantGame?.hiloPrice ? `แทง ${baht(cfg.instantGame.hiloPrice)}/ครั้ง` : '',
      auth: true,
    },
    {
      key: 'kiwi', on: kiwiOn,
      to: '/kiwi', icon: '🐯', name: 'ยี่กี', tag: 'เลือกเลขทายผลไว',
      desc: 'เลือกเลข 3-5 ตัว → สุ่มผลทันที → ถูกกี่ตัวจ่ายเท่านั้น มี VIP',
      price: '', auth: true,
    },
    {
      key: 'zodiac', on: zodiacOn,
      to: zodiacDraw ? `/bet/${zodiacDraw.id}` : '/play', icon: '🔮', name: 'หวยยี่กี 12 ราศี', tag: 'ออกผลทุก 15 นาที',
      desc: zodiacDraw ? `รอบถัดไปออก ${fmtDateTime(zodiacDraw.draw_at)}` : 'เลือกได้ 4 รูปแบบการแทง',
      price: '', auth: false,
    },
  ].filter(g => g.on);

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="text-center">
        <h1 className="text-lg sm:text-xl font-black luxury-gradient-text">🎮 เกมด่วน</h1>
        <p className="text-[10px] sm:text-xs mt-1" style={{ color: 'var(--muted-gray)' }}>เล่นได้ทันทีไม่ต้องรอผลออกรางวัล — เปิดตลอด 24 ชม.</p>
      </div>

      {!user && (
        <div className="rounded-xl px-3 sm:px-4 py-2.5 sm:py-3 text-xs sm:text-sm text-center" style={{ background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.4)', color: 'var(--warning-amber)' }}>
          กรุณา <Link to="/login" className="font-bold underline">เข้าสู่ระบบ</Link> ก่อนเล่นเกม
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
        {games.length === 0 && (
          <div className="col-span-full rounded-xl px-4 py-6 text-center text-sm" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-light)', color: 'var(--muted-gray)' }}>
            เกมทั้งหมดปิดให้บริการชั่วคราว — กลับมาดูใหม่อีกครั้ง
          </div>
        )}
        {games.map(g => (
          <Link key={g.to} to={g.to}
            className="luxury-card luxury-card-gold-border group relative overflow-hidden p-4 sm:p-5 transition">
            <div className="text-3xl sm:text-4xl mb-1.5 sm:mb-2">{g.icon}</div>
            <div className="font-black text-base sm:text-lg" style={{ color: 'var(--white)' }}>{g.name}</div>
            <div className="text-[10px] sm:text-[11px] font-bold" style={{ color: 'var(--muted-gray)' }}>{g.tag}</div>
            <p className="text-[10px] sm:text-xs mt-1.5 sm:mt-2 leading-relaxed" style={{ color: 'var(--light-gray)' }}>{g.desc}</p>
            {g.price && <div className="text-[10px] sm:text-[11px] font-bold mt-0.5 sm:mt-1" style={{ color: 'var(--gold-bright)' }}>{g.price}</div>}
            <div className="mt-2 sm:mt-3 inline-block text-[10px] sm:text-xs font-black px-3 sm:px-4 py-1 sm:py-1.5 rounded-lg luxury-btn">
              เล่นเลย →
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
