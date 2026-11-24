import { useEffect, useRef, useState } from 'react';
import { SkeletonCard } from '../components/Skeleton.jsx';
import EmptyState from '../components/EmptyState.jsx';
import { api, satang, fmtDateTime, newIdemKey } from '../api.js';
import { useAuth } from '../auth.jsx';
import FairnessNote from '../components/Fairness.jsx';
import WinBurst from '../components/WinBurst.jsx';
import { sfx } from '../sound.js';

// ไฮโล (ไฮโลไทย / Sic Bo) — ซื้อ → เต๋า 3 ลูกคว่ำ → เลือก สูง/ต่ำ/11 ไฮโล → เปิดเต๋ารู้ผลทันที
// อัตราจ่าย dynamic ตามโอกาสจริงของแต่ละฝั่ง (server ส่ง bets[] มาใน ticket)

// ตำแหน่งจุด (pip) บนตาราง 3x3 — มาตรฐานลูกเต๋าจริง
const PIPS = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

// ลูกเต๋าหน้าจริง — pip ดำบนพื้นขาว
function DieFace({ value, size = 'lg' }) {
  const dim = size === 'lg' ? 'w-20 h-20 sm:w-24 sm:h-24' : 'w-8 h-8';
  const pips = PIPS[value] || [];
  return (
    <div className={`${dim} rounded-2xl border-2 border-amber-400/70 bg-gradient-to-br from-amber-50 to-amber-100 flex items-center justify-center shadow-lg shadow-amber-500/20`}>
      <div className="grid grid-cols-3 grid-rows-3 gap-0.5 sm:gap-1 w-[72%] h-[72%]">
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="flex items-center justify-center">
            {pips.includes(i) && <div className={`rounded-full bg-navy-900 ${size === 'lg' ? 'w-3.5 h-3.5 sm:w-4 sm:h-4' : 'w-1.5 h-1.5'}`} />}
          </div>
        ))}
      </div>
    </div>
  );
}

// ลูกเต๋า placeholder ตอนคว่ำ
function DieHidden({ size = 'lg' }) {
  const dim = size === 'lg' ? 'w-20 h-20 sm:w-24 sm:h-24' : 'w-8 h-8';
  return (
    <div className={`${dim} rounded-2xl border-2 border-dashed border-navy-500 bg-navy-900/60 flex items-center justify-center text-3xl text-navy-400`}>
      ?
    </div>
  );
}

function Die({ value, hidden, revealDelay = 0 }) {
  const anim = revealDelay >= 0 ? 'animate-dice-reveal' : '';
  const style = revealDelay > 0 ? { animationDelay: `${revealDelay}s` } : undefined;
  if (hidden) {
    return <div style={style}><DieHidden /></div>;
  }
  return <div className={anim} style={style}><DieFace value={value} /></div>;
}

// เวลาแต่ละเต๋าหยุด — ไล่จากซ้ายไปขวาเหมือนรีลสล็อต
const DIE_STOP_MS = [720, 940, 1160];

// เปิดผลจริง — เต๋า 3 ลูกทอยสุ่มพร้อมกัน แล้วหยุดทีละลูกลงบนหน้าผลจริง (staggered เหมือนสล็อต)
function RevealDice({ values, onDone }) {
  const [faces, setFaces] = useState(() => (values || [1, 2, 3]).map(() => 1 + Math.floor(Math.random() * 6)));
  const [stopped, setStopped] = useState([false, false, false]);
  const stoppedRef = useRef([false, false, false]); // กัน interval เขียนทับหน้าที่หยุดแล้ว
  const doneRef = useRef(false);
  useEffect(() => {
    const iv = setInterval(() => {
      setFaces(f => f.map((v, i) => (stoppedRef.current[i] ? v : 1 + Math.floor(Math.random() * 6))));
    }, 70);
    const timers = DIE_STOP_MS.map((ms, i) => setTimeout(() => {
      stoppedRef.current[i] = true;
      setFaces(f => { const n = [...f]; n[i] = (values || [1, 2, 3])[i]; return n; });
      setStopped(s => { const n = [...s]; n[i] = true; return n; });
    }, ms));
    const fin = setTimeout(() => {
      clearInterval(iv); timers.forEach(clearTimeout);
      if (!doneRef.current) { doneRef.current = true; onDone?.(); }
    }, DIE_STOP_MS[2] + 550);
    return () => { clearInterval(iv); timers.forEach(clearTimeout); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return faces.map((v, i) => (
    <div key={i}
      className={stopped[i] ? 'animate-dice-land' : 'animate-dice-tumble'}
      style={stopped[i]
        ? { animationDelay: `${i * 0.07}s` }
        : { animationDelay: `${i * 0.05}s`, animationDuration: `${0.38 + i * 0.09 + (i % 2) * 0.06}s` }}>
      <DieFace value={v} />
    </div>
  ));
}

const PICK_STYLE = {
  low:    { icon: '▼', name: 'ต่ำ',       cls: 'border-blue-400/60 bg-blue-500/10 hover:bg-blue-500/20', nameCls: 'text-blue-300' },
  high:   { icon: '▲', name: 'สูง',       cls: 'border-green-400/60 bg-green-500/10 hover:bg-green-500/20', nameCls: 'text-green-300' },
  eleven: { icon: '◆', name: '11 ไฮโล', cls: 'border-purple-400/60 bg-purple-500/10 hover:bg-purple-500/20', nameCls: 'text-purple-300' },
};

const PICK_TH = { low: 'ต่ำ', high: 'สูง', eleven: '11 ไฮโล' };

export default function Hilo() {
  const { balance, setBalance } = useAuth();
  const [tickets, setTickets] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [active, setActive] = useState(null);
  const [busy, setBusy] = useState(false);
  const [revealing, setRevealing] = useState(false); // กำลังทอยรอบสุดท้ายก่อนเปิดผล
  const [pending, setPending] = useState(null);      // ผลที่ server ส่งกลับ รอ animation ลงเต๋า
  const [diceSettled, setDiceSettled] = useState(false); // animation ลงเต๋าครบแล้ว — ไม่ต้องเด้งซ้ำตอน render ผล
  const [err, setErr] = useState('');
  const [price, setPrice] = useState(5000); // สตางค์ — sync จาก server (admin ตั้งได้)
  const [mult, setMult] = useState(null);   // อัตราจ่าย ต่ำ/สูง/11 จาก server settings
  const playIdem = useRef(null); // {pick, key} — คง key เดิมจนกว่าจะสำเร็จ กัน retry ซื้อซ้ำ

  const load = () => api('/hilo/mine').then(r => { setTickets(r.tickets); setLoaded(true); }).catch(() => setLoaded(true));
  const loadCfg = () => api('/lottery/public-config').then(r => {
    const p = r.instantGame?.hiloPrice;
    if (p) setPrice(p);
    if (r.instantGame?.hiloMult) setMult(r.instantGame.hiloMult);
  }).catch(() => {});
  useEffect(() => {
    load(); loadCfg();
    // admin แก้ราคา/อัตราจ่าย → SSE ดันมา refetch ทันที
    const h = () => loadCfg();
    window.addEventListener('sys:update', h);
    return () => window.removeEventListener('sys:update', h);
  }, []);

  // ไม่มีตั๋วรอเดิมพัน → เล่นจบในคำขอเดียว (ซื้อ+ทาย+เปิดเต๋าทันที)
  const playNew = async (pick) => {
    setErr(''); setBusy(true);
    if (!playIdem.current || playIdem.current.pick !== pick)
      playIdem.current = { pick, key: newIdemKey() };
    try {
      const r = await api('/hilo/play', { method: 'POST', body: { pick, idempotencyKey: playIdem.current.key } });
      playIdem.current = null;
      setBalance(r.balance);
      setPending(r);
      setRevealing(true);
      sfx.dice();
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  // ปุ่มเดียวในโซนเลือกเดิมพัน — มีตั๋ว awaiting = ทายใบเดิม, ไม่มี = ซื้อเล่นใหม่เลย
  const pickBet = (pick) => (active?.status === 'awaiting' ? play(pick) : playNew(pick));

  const play = async (pick) => {
    if (!active || active.status !== 'awaiting' || revealing) return;
    setErr(''); setBusy(true);
    try {
      const r = await api(`/hilo/${active.id}/guess`, { method: 'POST', body: { pick } });
      setBalance(r.balance);
      // เก็บผลไว้ให้เต๋าทอยแล้วลงบนหน้าจริง — animation เดียวต่อเนื่องจนผลขึ้นจอ
      setPending(r);
      setRevealing(true);
      sfx.dice();
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  // เรียกเมื่อ animation ลงเต๋าจบ — ค่อยอัปเดต state + เล่นเสียงผล
  const finishReveal = () => {
    const r = pending;
    setPending(null);
    setRevealing(false);
    if (!r) return;
    if (r.outcome === 'win') sfx.win(); navigator.vibrate?.([80,40,80]); // haptic ฉลองถูกรางวัล else if (r.outcome === 'lose') sfx.lose();
    const tid = r.id; // id ของตั๋วที่เพิ่งเล่น — กัน user สลับไปดูตั๋วอื่นระหว่าง animation
    const updated = { ...r, id: tid, status: 'revealed' };
    setTickets(ts => ts.some(t => t.id === tid) ? ts.map(t => t.id === tid ? updated : t) : [updated, ...ts]);
    // ถ้าผู้ใช้ไปเปิดตั๋ว awaiting ใบอื่นระหว่างทอย อย่าเด้งกลับมา
    setActive(a => (a && a.id !== tid && a.status === 'awaiting') ? a : updated);
    setDiceSettled(true); // เต๋าลงหน้าจริงไปแล้วใน RevealDice — render เฉยๆ ไม่ต้อง animate ซ้ำ
  };

  const openTicket = (t) => { setDiceSettled(false); setActive(t); };
  // ยกเลิกตั๋ว awaiting — คืนเครดิตเต็มจำนวน
  const cancelTicket = async (e, t) => {
    e.stopPropagation();
    if (!confirm(`ยกเลิกตั๋ว ${t.slipRef}? เครดิตจะถูกคืนเต็มจำนวน`)) return;
    setErr('');
    try {
      const r = await api(`/hilo/${t.id}/cancel`, { method: 'POST' });
      setBalance(r.balance);
      setTickets(ts => ts.map(x => x.id === t.id ? { ...x, status: 'cancelled' } : x));
      if (active?.id === t.id) setActive(null);
      load();
    } catch (e2) { setErr(e2.message); }
  };

  const awaiting = tickets.filter(t => t.status === 'awaiting');

  // ตัวเลือกเดิมพัน — ใช้ของตั๋วที่เปิดอยู่ หรือสร้างจาก settings เมื่อยังไม่มีตั๋ว
  const mkBets = (getMult) => [
    { pick: 'low', mult: getMult('low') },
    { pick: 'high', mult: getMult('high') },
    { pick: 'eleven', mult: getMult('eleven') },
  ].map(b => ({ ...b, label: PICK_TH[b.pick], maxPayout: Math.floor(price * b.mult) }));
  const bets = active?.bets || mkBets(p => mult?.[p] ?? { low: 1.8, high: 2.4, eleven: 7 }[p]);

  // จอ LCD ของตู้เต๋า — sum/ผลข้าง/สถานะ
  const sideTh = (side) => side === 'eleven' ? '11 ไฮโล' : side === 'high' ? 'สูง ▲' : side === 'low' ? 'ต่ำ ▼' : '—';
  const sumVal = revealing ? '···' : active?.sum != null ? `${active.sum}` : '—';
  const sideVal = revealing ? '···' : active?.status === 'revealed' ? sideTh(active.side) : '—';
  const statVal = revealing ? 'ทอยเต๋า...' : !active ? '—'
    : active.status === 'awaiting' ? 'รอเดิมพัน'
    : active.status === 'revealed' ? (active.side === active.pick ? 'ถูกต้อง ✓' : 'ไม่ถูก ✕') : '—';
  const statCls = active?.status === 'revealed' ? (active.side === active.pick ? 'text-emerald-300' : 'text-red-400') : 'text-amber-300';

  return (
    <div className="max-w-3xl mx-auto space-y-6 instant-page">
      {/* hero */}
      <div className="relative overflow-hidden rounded-3xl p-6 sm:p-8 text-center luxury-card luxury-card-gold-border">
        <div className="absolute top-0 inset-x-0 h-1.5" style={{ background: 'linear-gradient(90deg, var(--gold-gradient-start), var(--gold-gradient-end))' }} />
        <div className="casino-chip w-10 h-10 sm:w-14 sm:h-14" style={{ bottom: '-4%', left: '6%', background: 'radial-gradient(circle at 35% 30%, #fde68a, #d9a520 60%, #8a6405)', animationDelay: '0.6s' }} />
        <div className="casino-chip w-8 h-8 sm:w-11 sm:h-11" style={{ top: '-4%', right: '8%', background: 'radial-gradient(circle at 35% 30%, #1f2937, #111827 65%, #030712)', animationDelay: '2s' }} />
        <div className="flex justify-center gap-3 mb-4">
          <DieFace value={3} /><DieFace value={4} /><DieFace value={5} />
        </div>
        <h1 className="font-display font-bold text-2xl sm:text-3xl luxury-gradient-text">ไฮโลเต๋า</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--muted-gray)' }}>ทอยเต๋า <b style={{ color: 'var(--gold-bright)' }}>3 ลูก</b> → ทายผลรวม <b style={{ color: 'var(--info-blue)' }}>ต่ำ (3-10)</b> / <b style={{ color: 'var(--success-green)' }}>สูง (12-18)</b> / <b style={{ color: 'var(--gold-bright)' }}>11 ไฮโล</b> → รู้ผลทันที!</p>
        <div className="flex flex-col items-center gap-3 mt-4">
          <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl" style={{ background: 'linear-gradient(90deg, rgba(212, 175, 55, 0.15), rgba(212, 175, 55, 0.05), rgba(212, 175, 55, 0.15))', border: '1px solid var(--border-gold)', boxShadow: 'var(--shadow-gold)' }}>
            <span className="text-sm">💰</span>
            <span className="text-xs font-semibold" style={{ color: 'var(--gold-primary)' }}>ราคาต่อครั้ง</span>
            <span className="font-display font-bold text-2xl" style={{ color: 'var(--gold-bright)' }}>{satang(price)} <span className="text-sm">บาท</span></span>
          </div>
          <div className="flex items-center justify-center gap-4 text-[11px] flex-wrap" style={{ color: 'var(--muted-gray)' }}>
            <span>🕐 <b style={{ color: 'var(--success-green)' }}>แทงได้ตลอด 24 ชม.</b> ไม่มีกำหนดรอบ</span>
            <span>⚖️ อัตราจ่าย{mult ? ` ต่ำ ×${mult.low} • สูง ×${mult.high} • 11 ×${mult.eleven}` : 'ตามโอกาสจริง'}</span>
          </div>
        </div>
      </div>

      {/* ข้อมูลรอบ — ปุ่มเดิมพันอยู่ในโซนเลือก สูง/ต่ำ/11 ด้านล่างการ์ดนี้ */}
      <div className="luxury-card p-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="font-bold" style={{ color: 'var(--white)' }}>วางเดิมพัน</div>
            <div className="text-xs" style={{ color: 'var(--muted-gray)' }}>เครดิตคงเหลือ {satang(balance)} บาท • ไม่จำกัดรอบ เล่นต่อได้เรื่อยๆ</div>
            {awaiting.length > 0 && (
              <div className="text-[11px] mt-1" style={{ color: 'var(--warning-amber)' }}>มีตั๋วรอเดิมพัน {awaiting.length} ใบ — เปิดจากประวัติด้านล่างเพื่อทาย</div>
            )}
          </div>
        </div>
        {err && <div className="text-sm mt-3" style={{ color: 'var(--danger-red)' }}>{err}</div>}
        {balance < price && (
          <div className="text-xs rounded-lg px-3 py-2 mt-3" style={{ background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.3)', color: 'var(--warning-amber)' }}>
            เครดิตไม่พอ — <a href="/wallet?action=deposit" className="underline font-semibold">เติมเครดิต</a> ก่อนนะ
          </div>
        )}
      </div>

      {/* game card — เต๋า + โซนเลือกเดิมพัน (ปุ่มเดียว) + ผลล่าสุด */}
      <div className="luxury-card p-4 sm:p-5 space-y-4 sm:space-y-5 select-none">
        {active && (
          <FairnessNote fairness={active.fairness}
            verify={(seed) => api('/hilo/verify', { method: 'POST', body: { seed } })} />
        )}

        {/* ===== ตู้เต๋า HILO — casino dice machine สไตล์สล็อต ===== */}
        <div className="relative select-none">
          <div className="rounded-2xl border-2 border-amber-500/60 bg-gradient-to-b from-[#3d1220] via-[#2a0d18] to-[#1a0810] p-2 sm:p-2.5 shadow-[0_10px_40px_rgba(0,0,0,0.7),inset_0_2px_0_rgba(255,255,255,0.08)]">
            <div className="rounded-xl border border-amber-400/30 bg-black/30 p-1.5 sm:p-2">

              {/* ===== Marquee — ป้ายไฟด้านบน ===== */}
              <div className="relative rounded-lg bg-gradient-to-b from-[#101726] to-[#0a0f1c] border border-amber-400/40 px-3 pt-2 pb-1.5 mb-2 overflow-hidden">
                <div className="flex justify-between px-1 mb-1">
                  {Array.from({ length: 16 }).map((_, i) => (
                    <span key={i} className="slot-bulb w-1.5 h-1.5 rounded-full"
                      style={{ animationDelay: `${(i % 2) * 0.6 + (i * 0.09)}s` }} />
                  ))}
                </div>
                <div className="text-center">
                  <div className="font-black tracking-[0.18em] text-sm sm:text-base text-transparent bg-clip-text bg-gradient-to-b from-amber-200 via-yellow-300 to-amber-500 drop-shadow-[0_0_8px_rgba(251,191,36,0.7)]">
                    ★ HILO DICE ★
                  </div>
                  <div className="text-[8px] sm:text-[9px] font-bold tracking-[0.3em] text-red-400/80 mt-0.5">3 DICE • HIGH • LOW • 11</div>
                </div>
                <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-transparent pointer-events-none" />
              </div>

              {/* ===== ช่องเต๋า (reel window) — เขย่าตอนทอย ===== */}
              <div className={`relative rounded-lg bg-[#041008] border-2 border-black shadow-[inset_0_4px_18px_rgba(0,0,0,0.9)] px-2 sm:px-3 py-4 ${revealing ? 'animate-dice-shake' : ''}`}>
                <div className="flex items-center justify-center gap-3 sm:gap-6">
                  {revealing ? (
                    <RevealDice values={pending?.dice} onDone={finishReveal} />
                  ) : active ? (
                    (active.dice || [null, null, null]).map((v, i) => (
                      <div key={i} className="text-center">
                        <Die value={v} hidden={!v} revealDelay={v != null && !diceSettled ? i * 0.15 : -1} />
                        {active.status === 'revealed' && v != null && (
                          <div className="text-[10px] text-navy-400 mt-1">ลูกที่ {i + 1}</div>
                        )}
                      </div>
                    ))
                  ) : (
                    <>
                      <DieHidden /><DieHidden /><DieHidden />
                    </>
                  )}
                </div>
                {/* กระจก + ขอบบนล่างเข้ม */}
                <div className="absolute inset-0 rounded-lg pointer-events-none bg-gradient-to-br from-white/15 via-white/[0.03] to-transparent" />
                <div className="absolute inset-x-0 top-0 h-4 rounded-t-lg bg-gradient-to-b from-black/60 to-transparent pointer-events-none" />
                <div className="absolute inset-x-0 bottom-0 h-4 rounded-b-lg bg-gradient-to-t from-black/60 to-transparent pointer-events-none" />
              </div>

              {/* ===== จอ LCD — ผลรวม/ข้าง/สถานะ ===== */}
              <div className="mt-2 rounded-lg bg-gradient-to-b from-[#16304f] to-[#081120] border border-white/10 px-2 sm:px-3 py-2 flex items-center gap-2 sm:gap-3">
                <DiceDisplay label="SUM" value={sumVal} accent="text-amber-300" />
                <DiceDisplay label="SIDE" value={sideVal} accent="text-sky-300" />
                <DiceDisplay label="RESULT" value={statVal} accent={statCls} />
              </div>

              {active && (
                <div className="mt-1.5 flex items-center justify-between px-1">
                  <span className="text-[10px] font-mono text-slate-500">{active.slipRef || ''}</span>
                  <button onClick={() => setActive(null)} className="text-[10px] text-slate-500 hover:text-slate-300">ปิด ✕</button>
                </div>
              )}
            </div>
          </div>

          {/* ประกายไฟมุมตู้ */}

        </div>

        {active?.status === 'revealed' && active.sum != null && (
          <div className="text-center">
            <span className={`inline-block px-4 py-1.5 rounded-full border font-bold animate-result-pop ${
              active.side === active.pick
                ? 'bg-green-500/15 border-green-500/50 text-green-300'
                : 'bg-navy-700/60 border-navy-600 text-navy-200'}`}>
              ผลรวม = {active.sum} → {active.side === 'eleven' ? '11 ไฮโล' : active.side === 'high' ? 'สูง ▲' : 'ต่ำ ▼'}
            </span>
          </div>
        )}

        {/* ปุ่มเดิมพันอยู่บนแถบล่าง (instant-betbar) — ที่นี่แสดงแค่เต๋า+ผล */}
        {!revealing && active?.status === 'awaiting' && (
          <p className="text-center text-[11px] text-navy-400">👇 เลือกเดิมพันจากแถบด้านล่าง — เต๋าจะเปิดเผยทันทีหลังเลือก</p>
        )}

        {active?.status === 'revealed' && (
          <ResultPanel ticket={active} />
        )}
      </div>

      {/* history */}
      {!loaded && <SkeletonCard />}
      {loaded && !tickets.length && (
        <EmptyState emoji="🎲" title="ยังไม่มีตั๋วไฮโล" hint="กดปุ่มเล่นเพื่อเริ่มเสี่ยงโชค" />
      )}
      {tickets.length > 0 && (
        <div className="luxury-card overflow-hidden">
          <div className="px-5 py-4 border-b font-bold flex items-center gap-2" style={{ borderColor: 'var(--border-light)', color: 'var(--white)' }}>
            ประวัติไฮโล
            {awaiting.length > 0 && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full luxury-badge-gold">รอเดิมพัน {awaiting.length}</span>}
          </div>
          <div className="divide-y" style={{ borderColor: 'var(--border-light)' }}>
            {tickets.map(t => {
              const won = t.status === 'revealed' && t.side === t.pick;
              return (
                <div key={t.id} role="button" tabIndex={0}
                  onClick={() => openTicket(t)} onKeyDown={e => e.key === 'Enter' && openTicket(t)}
                  className="w-full flex items-center gap-3 px-5 py-3 hover:bg-navy-700/40 text-left cursor-pointer">
                  <div className="flex items-center gap-1">
                    {(t.dice || [null, null, null]).map((v, i) => (
                      v != null
                        ? <DieFace key={i} value={v} size="sm" />
                        : <DieHidden key={i} size="sm" />
                    ))}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-mono text-navy-300">{t.slipRef}</div>
                    <div className="text-[11px] text-navy-400">
                      {fmtDateTime(t.createdAt)}{t.pick ? ` • ทาย${PICK_TH[t.pick] || t.pick}` : ''}{t.sum != null ? ` • ผลรวม ${t.sum}` : ''}
                    </div>
                  </div>
                  {t.status === 'awaiting' ? (
                    <span className="flex items-center gap-2">
                      <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/40">รอเดิมพัน</span>
                      <span role="button" tabIndex={0}
                        onClick={e => cancelTicket(e, t)}
                        onKeyDown={e => { if (e.key === 'Enter') { e.stopPropagation(); cancelTicket(e, t); } }}
                        className="text-[10px] font-bold px-2 py-1 rounded-full bg-navy-700/60 text-navy-300 border border-navy-600 hover:bg-red-500/20 hover:text-red-300 hover:border-red-500/40 transition cursor-pointer">ยกเลิก</span>
                    </span>
                  ) : t.status === 'cancelled' ? (
                    <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-navy-700/50 text-navy-400 border border-navy-600">ยกเลิก</span>
                  ) : won ? (
                    <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-green-500/15 text-green-300 border border-green-500/40">ถูก</span>
                  ) : (
                    <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-navy-700/50 text-navy-300 border border-navy-600">ไม่ถูก</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* แถบแทงด่วน — ติดล่างจอตลอด เล่นต่อได้ทันทีไม่ต้องเลื่อนกลับ */}
      <div className="instant-betbar px-4">
        <div className="max-w-3xl mx-auto flex gap-2">
          {bets.map(b => {
            const st = PICK_STYLE[b.pick] || PICK_STYLE.low;
            return (
              <button key={b.pick} onClick={() => pickBet(b.pick)} disabled={busy || revealing || balance < price}
                className={`flex-1 rounded-xl border-2 ${st.cls} py-2.5 text-center transition disabled:opacity-50 active:scale-95`}>
                <div className={`text-sm font-black ${st.nameCls}`}>{st.icon} {st.name}</div>
                <div className="text-[10px] text-navy-300">×{b.mult} • สูงสุด {satang(b.maxPayout)} บ.</div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// จอ LCD ดิจิทัลของตู้เต๋า — ตัวอักษรเรืองแสงบนจอดำ
function DiceDisplay({ label, value, accent = 'text-amber-300' }) {
  return (
    <div className="flex-1 min-w-0">
      <div className="text-[8px] sm:text-[9px] font-black tracking-[0.2em] text-red-400/90 mb-0.5">{label}</div>
      <div className={`bg-black/80 border border-white/10 rounded-md px-2 py-1 font-mono font-bold text-sm sm:text-base ${accent} truncate shadow-[inset_0_0_12px_rgba(0,0,0,0.9)]`}>
        {value}
      </div>
    </div>
  );
}

function ResultPanel({ ticket }) {
  const won = ticket.side === ticket.pick;
  const pickTh = PICK_TH[ticket.pick] || ticket.pick;
  const outcomeTh = ticket.side === 'eleven' ? '11 ไฮโล' : ticket.side === 'high' ? 'สูง' : 'ต่ำ';
  return (
    <div className={`relative rounded-2xl border-2 p-5 text-center overflow-visible ${
      won ? 'border-green-500/60 bg-green-500/10' : 'border-navy-600 bg-navy-900/60'}`}>
      {won && <WinBurst />}
      {won ? (
        <>
          <div className="text-4xl mb-1 animate-coin text-green-400 font-black">✓</div>
          <div className="text-lg font-bold text-green-400">ถูกต้อง! {ticket.dice.join(' + ')} = {ticket.sum} → {outcomeTh}</div>
          <div className="text-2xl font-black text-green-300 animate-coin">+{satang(ticket.payout)} บาท</div>
          {ticket.balance !== undefined && <div className="text-xs text-navy-400 mt-1">เครดิตคงเหลือ {satang(ticket.balance)} บาท</div>}
        </>
      ) : (
        <>
          <div className="text-3xl mb-1 text-navy-500 font-black">✕</div>
          <div className="text-navy-200 font-semibold">{ticket.dice.join(' + ')} = {ticket.sum} → {outcomeTh}</div>
          <div className="text-xs text-navy-400 mt-1">ทาย{pickTh} ไม่ถูก — ลองใหม่นะ!</div>
        </>
      )}
    </div>
  );
}
