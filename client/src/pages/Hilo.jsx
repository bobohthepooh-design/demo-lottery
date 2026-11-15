import { useEffect, useState } from 'react';
import { api, satang, fmtDateTime } from '../api.js';
import { useAuth } from '../auth.jsx';
import FairnessNote from '../components/Fairness.jsx';
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

// เปิดผลจริง — ทอยสุ่ม ~0.6 วิ แล้วค่อย ๆ ลงบนหน้าผลจริงทีละลูก (ต่อเนื่องจากเฟสทอย ไม่ขัดกัน)
function RevealDice({ values, onDone }) {
  const [landed, setLanded] = useState(false);
  const [faces, setFaces] = useState(values || [1, 2, 3]);
  useEffect(() => {
    const iv = setInterval(() => {
      setFaces(f => f.map(() => 1 + Math.floor(Math.random() * 6)));
    }, 75);
    const t1 = setTimeout(() => {
      clearInterval(iv);
      setFaces(values || [1, 2, 3]);
      setLanded(true);
    }, 620);
    const t2 = setTimeout(() => onDone?.(), 1150);
    return () => { clearInterval(iv); clearTimeout(t1); clearTimeout(t2); };
  }, []);
  return (
    <>
      {faces.map((v, i) => (
        <div key={i}
          className={landed ? 'animate-dice-land' : 'animate-dice-tumble'}
          style={{ animationDelay: landed ? `${i * 0.13}s` : `${i * 0.07}s` }}>
          <DieFace value={v} />
        </div>
      ))}
    </>
  );
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
  const [active, setActive] = useState(null);
  const [busy, setBusy] = useState(false);
  const [revealing, setRevealing] = useState(false); // กำลังทอยรอบสุดท้ายก่อนเปิดผล
  const [pending, setPending] = useState(null);      // ผลที่ server ส่งกลับ รอ animation ลงเต๋า
  const [diceSettled, setDiceSettled] = useState(false); // animation ลงเต๋าครบแล้ว — ไม่ต้องเด้งซ้ำตอน render ผล
  const [err, setErr] = useState('');
  const [price, setPrice] = useState(5000); // สตางค์ — sync จาก server (admin ตั้งได้)
  const [mult, setMult] = useState(null);   // อัตราจ่าย ต่ำ/สูง/11 จาก server settings

  const load = () => api('/hilo/mine').then(r => setTickets(r.tickets)).catch(() => {});
  useEffect(() => {
    load();
    api('/lottery/public-config').then(r => {
      const p = r.instantGame?.hiloPrice;
      if (p) setPrice(p);
      if (r.instantGame?.hiloMult) setMult(r.instantGame.hiloMult);
    }).catch(() => {});
  }, []);

  // ไม่มีตั๋วรอเดิมพัน → เล่นจบในคำขอเดียว (ซื้อ+ทาย+เปิดเต๋าทันที)
  const playNew = async (pick) => {
    setErr(''); setBusy(true);
    try {
      const r = await api('/hilo/play', { method: 'POST', body: { pick } });
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
    if (r.outcome === 'win') sfx.win(); else if (r.outcome === 'lose') sfx.lose();
    const tid = r.id; // id ของตั๋วที่เพิ่งเล่น — กัน user สลับไปดูตั๋วอื่นระหว่าง animation
    const updated = { ...r, id: tid, status: 'revealed' };
    setTickets(ts => ts.some(t => t.id === tid) ? ts.map(t => t.id === tid ? updated : t) : [updated, ...ts]);
    // ถ้าผู้ใช้ไปเปิดตั๋ว awaiting ใบอื่นระหว่างทอย อย่าเด้งกลับมา
    setActive(a => (a && a.id !== tid && a.status === 'awaiting') ? a : updated);
    setDiceSettled(true); // เต๋าลงหน้าจริงไปแล้วใน RevealDice — render เฉยๆ ไม่ต้อง animate ซ้ำ
  };

  const openTicket = (t) => { setDiceSettled(false); setActive(t); };
  const awaiting = tickets.filter(t => t.status === 'awaiting');

  // ตัวเลือกเดิมพัน — ใช้ของตั๋วที่เปิดอยู่ หรือสร้างจาก settings เมื่อยังไม่มีตั๋ว
  const mkBets = (getMult) => [
    { pick: 'low', mult: getMult('low') },
    { pick: 'high', mult: getMult('high') },
    { pick: 'eleven', mult: getMult('eleven') },
  ].map(b => ({ ...b, label: PICK_TH[b.pick], maxPayout: Math.floor(price * b.mult) }));
  const bets = active?.bets || mkBets(p => mult?.[p] ?? { low: 1.8, high: 2.4, eleven: 7 }[p]);

  return (
    <div className="max-w-3xl mx-auto space-y-6 instant-page">
      {/* hero */}
      <div className="relative overflow-hidden rounded-3xl border-2 border-orange-400/50 bg-gradient-to-br from-navy-800 via-navy-900 to-navy-950 p-6 sm:p-8 text-center">
        <div className="hr-shine absolute top-0 inset-x-0 h-1.5" />
        <span className="casino-sparkle text-xl" style={{ top: '18%', left: '8%', animationDelay: '0.5s' }}>✦</span>
        <span className="casino-sparkle text-sm" style={{ top: '28%', right: '10%', animationDelay: '1.7s' }}>✧</span>
        <span className="casino-sparkle text-lg" style={{ bottom: '30%', left: '12%', animationDelay: '2.4s' }}>✦</span>
        <span className="casino-sparkle text-sm" style={{ bottom: '36%', right: '9%', animationDelay: '1.1s' }}>✦</span>
        <div className="casino-chip w-10 h-10 sm:w-14 sm:h-14" style={{ bottom: '-4%', left: '6%', background: 'radial-gradient(circle at 35% 30%, #fde68a, #d9a520 60%, #8a6405)', animationDelay: '0.6s' }} />
        <div className="casino-chip w-8 h-8 sm:w-11 sm:h-11" style={{ top: '-4%', right: '8%', background: 'radial-gradient(circle at 35% 30%, #1f2937, #111827 65%, #030712)', animationDelay: '2s' }} />
        <div className="flex justify-center gap-3 mb-4">
          <DieFace value={3} /><DieFace value={4} /><DieFace value={5} />
        </div>
        <h1 className="font-display font-bold text-2xl sm:text-3xl text-orange-300">ไฮโลเต๋า</h1>
        <p className="text-sm text-navy-300 mt-1">ทอยเต๋า <b className="text-orange-300">3 ลูก</b> → ทายผลรวม <b className="text-blue-300">ต่ำ (3-10)</b> / <b className="text-green-300">สูง (12-18)</b> / <b className="text-purple-300">11 ไฮโล</b> → รู้ผลทันที!</p>
        <div className="flex items-center justify-center gap-4 mt-4 text-xs text-navy-300 flex-wrap">
          <span>💰 ราคา <b className="text-gold-300">{satang(price)} บาท</b>/ครั้ง</span>
          <span>🕐 <b className="text-green-300">แทงได้ตลอด 24 ชม.</b> ไม่มีกำหนดรอบ</span>
          <span>⚖️ อัตราจ่าย{mult ? ` ต่ำ ×${mult.low} • สูง ×${mult.high} • 11 ×${mult.eleven}` : 'ตามโอกาสจริง'}</span>
        </div>
      </div>

      {/* ข้อมูลรอบ — ปุ่มเดิมพันอยู่ในโซนเลือก สูง/ต่ำ/11 ด้านล่างการ์ดนี้ */}
      <div className="bg-navy-800 border border-navy-700 rounded-2xl p-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="font-bold text-white">วางเดิมพัน</div>
            <div className="text-xs text-navy-400">เครดิตคงเหลือ {satang(balance)} บาท • ไม่จำกัดรอบ เล่นต่อได้เรื่อยๆ</div>
            {awaiting.length > 0 && (
              <div className="text-[11px] text-amber-300 mt-1">มีตั๋วรอเดิมพัน {awaiting.length} ใบ — เปิดจากประวัติด้านล่างเพื่อทาย</div>
            )}
          </div>
        </div>
        {err && <div className="text-red-400 text-sm mt-3">{err}</div>}
        {balance < price && (
          <div className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2 mt-3">
            เครดิตไม่พอ — <a href="/wallet?action=deposit" className="underline font-semibold">เติมเครดิต</a> ก่อนนะ
          </div>
        )}
      </div>

      {/* game card — เต๋า + โซนเลือกเดิมพัน (ปุ่มเดียว) + ผลล่าสุด */}
      <div className="bg-navy-800 border border-navy-700 rounded-2xl p-4 sm:p-5 space-y-4 sm:space-y-5 select-none">
        {active && (
          <>
            <div className="flex items-center justify-between">
              <div className="text-xs text-navy-400 font-mono">โพย {active.slipRef} • {fmtDateTime(active.createdAt)}</div>
              <button onClick={() => setActive(null)} className="text-xs text-navy-400 hover:text-navy-200">ปิด</button>
            </div>
            <FairnessNote fairness={active.fairness}
              verify={(seed) => api('/hilo/verify', { method: 'POST', body: { seed } })} />
          </>
        )}

        {/* เต๋า 3 ลูก — คว่ำตอนรอ, ลงบนผลจริงทีละลูกตอน reveal */}
        <div className="flex items-center justify-center gap-3 sm:gap-5">
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

        {active?.status === 'revealed' && active.sum != null && (
          <div className="text-center">
            <span className="inline-block px-4 py-1.5 rounded-full bg-amber-500/15 border border-amber-500/40 text-amber-200 font-bold">
              ผลรวม = {active.sum} → {active.side === 'eleven' ? '11 ไฮโล' : active.side === 'high' ? 'สูง ▲' : 'ต่ำ ▼'}
            </span>
          </div>
        )}

        {revealing && (
          <p className="text-center text-xs text-amber-300 animate-pulse">กำลังเขย่าเต๋า...</p>
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
      {tickets.length > 0 && (
        <div className="bg-navy-800 border border-navy-700 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-navy-700 font-bold text-white flex items-center gap-2">
            ประวัติไฮโล
            {awaiting.length > 0 && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40">รอเดิมพัน {awaiting.length}</span>}
          </div>
          <div className="divide-y divide-navy-700">
            {tickets.map(t => {
              const won = t.status === 'revealed' && t.side === t.pick;
              return (
                <button key={t.id} onClick={() => openTicket(t)}
                  className="w-full flex items-center gap-3 px-5 py-3 hover:bg-navy-700/40 text-left">
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
                    <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/40">รอเดิมพัน</span>
                  ) : won ? (
                    <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-green-500/15 text-green-300 border border-green-500/40">ถูก</span>
                  ) : (
                    <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-navy-700/50 text-navy-300 border border-navy-600">ไม่ถูก</span>
                  )}
                </button>
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

function ResultPanel({ ticket }) {
  const won = ticket.side === ticket.pick;
  const pickTh = PICK_TH[ticket.pick] || ticket.pick;
  const outcomeTh = ticket.side === 'eleven' ? '11 ไฮโล' : ticket.side === 'high' ? 'สูง' : 'ต่ำ';
  return (
    <div className={`rounded-2xl border-2 p-5 text-center ${
      won ? 'border-green-500/60 bg-green-500/10' : 'border-navy-600 bg-navy-900/60'}`}>
      {won ? (
        <>
          <div className="text-4xl mb-1 animate-coin text-green-400 font-black">✓</div>
          <div className="text-lg font-bold text-green-400">ถูกต้อง! {ticket.dice.join(' + ')} = {ticket.sum} → {outcomeTh}</div>
          <div className="text-2xl font-black text-gold-300 coin-gold-bright">+{satang(ticket.payout)} บาท</div>
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
