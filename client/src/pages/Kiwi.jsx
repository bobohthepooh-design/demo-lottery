import { useEffect, useRef, useState } from 'react';
import { SkeletonCard } from '../components/Skeleton.jsx';
import EmptyState from '../components/EmptyState.jsx';
import { api, satang, fmtDateTime, newIdemKey } from '../api.js';
import { useAuth } from '../auth.jsx';
import FairnessNote from '../components/Fairness.jsx';
import WinBurst from '../components/WinBurst.jsx';
import { sfx } from '../sound.js';

// หวยยี่กี — เลือกเลข K ตัว → server สุ่มผล → จ่ายตามจำนวนที่ตรง รู้ผลทันที

function NumPicker({ poolSize, pickCount, picks, setPicks, disabled }) {
  const toggle = (n) => {
    if (disabled) return;
    setPicks(p => p.includes(n) ? p.filter(x => x !== n) : p.length < pickCount ? [...p, n] : p);
  };
  return (
    <div className="grid grid-cols-5 sm:grid-cols-7 gap-1.5">
      {Array.from({ length: poolSize }, (_, i) => i + 1).map(n => {
        const on = picks.includes(n);
    const full = !on && picks.length >= pickCount;
        return (
          <button key={n} onClick={() => toggle(n)} disabled={disabled || full}
            className={`aspect-square rounded-lg text-sm font-bold transition border ${on
              ? 'luxury-btn' : 'luxury-btn-ghost disabled:opacity-40'}`}>
            {n}
          </button>
        );
      })}
    </div>
  );
}

// เกมสัตว์ (น้ำเต้า ปู ปลา เสือ ไก่ กุ้ง) — เลือก 1 ตัวจาก 6
// น้ำเต้าไม่มี emoji ที่ตรง → วาดเป็น SVG เปลือกมะพร้าวครึ่งลูก
const ANIMAL_EMOJI = { 'ปู': '🦀', 'ปลา': '🐟', 'เสือ': '🐯', 'ไก่': '🐔', 'กุ้ง': '🦐' };
const animalEmoji = (symbols, n) => ANIMAL_EMOJI[symbols?.[n - 1]] || symbols?.[n - 1] || n;
const animalText = (name) => ANIMAL_EMOJI[name] || name;
const DICE_BET_LABEL = { single: 'สัตว์เดี่ยว', pair: 'สัตว์คู่', triple: 'สัตว์ตอง' };

function AnimalGlyph({ name, size = '1.6em' }) {
  if (name === 'น้ำเต้า') {
    return (
      <svg viewBox="0 0 64 64" width={size} height={size} className="inline-block align-middle" aria-label="น้ำเต้า">
        <circle cx="32" cy="32" r="30" fill="#8d5a2b" />
        <circle cx="32" cy="32" r="30" fill="none" stroke="#5f3a17" strokeWidth="3" />
        <circle cx="32" cy="32" r="21" fill="#fff3d6" />
        <circle cx="32" cy="32" r="21" fill="none" stroke="#e8d9b8" strokeWidth="2" />
        <circle cx="26" cy="28" r="3" fill="#3b2414" />
        <circle cx="38" cy="28" r="3" fill="#3b2414" />
        <circle cx="32" cy="39" r="3" fill="#3b2414" />
      </svg>
    );
  }
  return <span style={{ fontSize: size, lineHeight: 1 }}>{ANIMAL_EMOJI[name] || '🐾'}</span>;
}

function AnimalPicker({ symbols, picks, setPicks, disabled }) {
  const toggle = (n) => {
    if (disabled) return;
    setPicks(p => p.includes(n) ? [] : [n]);
  };
  return (
    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
      {symbols.map((s, i) => {
        const n = i + 1;
        const on = picks.includes(n);
        return (
          <button key={n} onClick={() => toggle(n)} disabled={disabled}
            className={`rounded-xl px-2 py-3 flex flex-col items-center gap-1 transition border ${on
              ? 'luxury-btn' : 'luxury-btn-ghost disabled:opacity-40'}`}>
            <AnimalGlyph name={s} size="1.9rem" />
            <span className={`text-[10px] leading-none ${on ? 'text-navy-900' : ''}`} style={{ color: on ? 'var(--bg-deep-black)' : 'var(--muted-gray)' }}>{s}</span>
          </button>
        );
      })}
    </div>
  );
}

// เกมสัตว์เดี่ยว/คู่/ตอง (น้ำเต้าปูปลา) — เลือกแต้ม 1-6 map กับ diceSymbols
function DiceAnimalPicker({ symbols, picks, setPicks, count, disabled }) {
  const toggle = (n) => {
    if (disabled) return;
    setPicks(p => p.includes(n)
      ? p.filter(x => x !== n)
      : p.length < count ? [...p, n] : p);
  };
  return (
    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
      {symbols.map((s, i) => {
        const n = i + 1;
        const on = picks.includes(n);
        const full = !on && picks.length >= count;
        return (
          <button key={n} onClick={() => toggle(n)} disabled={disabled || full}
            className={`rounded-xl px-2 py-3 flex flex-col items-center gap-1 transition border ${on
              ? 'luxury-btn' : 'luxury-btn-ghost disabled:opacity-40'}`}>
            <AnimalGlyph name={s} size="1.9rem" />
            <span className={`text-[10px] leading-none ${on ? 'text-navy-900' : ''}`} style={{ color: on ? 'var(--bg-deep-black)' : 'var(--muted-gray)' }}>{s}</span>
          </button>
        );
      })}
    </div>
  );
}

// ลูกเต๋าน้ำเต้าปูปลา — สัญลักษณ์สัตว์กระพริบสลับเร็วๆ แล้วหยุดทีละลูกที่ผลจริง (ไม่หมุน)
function DiceRoll({ drawn, symbols, onDone }) {
  const [vals, setVals] = useState(() => drawn.map((_, i) => (i * 2 + 1) % 6 + 1));
  const [stopped, setStopped] = useState([false, false, false]);
  const stoppedRef = useRef([false, false, false]); // กัน interval เขียนทับหน้าที่หยุดแล้ว
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  useEffect(() => {
    const stopAt = drawn.map((_, i) => 750 + i * 520); // ลูกที่ 1 หยุดก่อน ลูก 3 ทีหลัง
    const t0 = Date.now();
    const iv = setInterval(() => {
      const now = Date.now() - t0;
      drawn.forEach((_, i) => {
        if (now >= stopAt[i] && !stoppedRef.current[i]) {
          stoppedRef.current[i] = true;
          setStopped(s => { const n = [...s]; n[i] = true; return n; });
        }
      });
      setVals(drawn.map((d, i) => (now >= stopAt[i] ? d : 1 + Math.floor(Math.random() * 6))));
      if (now >= stopAt[drawn.length - 1] + 130) { clearInterval(iv); doneRef.current?.(); }
    }, 60);
    return () => clearInterval(iv);
  }, [drawn]);
  return vals.map((v, i) => (
    <span key={i}
      className={stopped[i] ? 'animate-dice-settle' : 'animate-animal-roll'}
      style={{ animationDelay: stopped[i] ? `${i * 0.05}s` : undefined }}>
      <span className="lotto-ball" style={{ fontSize: '1.4em', minWidth: '2.2em', height: '2.2em', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
        <AnimalGlyph name={symbols?.[v - 1]} size="1.4em" />
      </span>
    </span>
  ));
}

// ลูกเต๋า 3 ลูก — แสดงผลเป็นสัญลักษณ์สัตว์
function DiceResult({ drawn, symbols }) {
  return (
    <div className="flex items-center justify-center gap-2 flex-wrap">
      {drawn.map((d, i) => (
        <span key={i} className="lotto-ball" style={{ fontSize: '1.4em', minWidth: '2.2em', height: '2.2em', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
          <AnimalGlyph name={symbols?.[d - 1]} size="1.4em" />
        </span>
      ))}
    </div>
  );
}

// จอ LCD ดิจิทัลของตู้ — ตัวอักษรเรืองแสงบนจอดำ (สไตล์เดียวกับสล็อต/ไฮโล)
function LcdDisplay({ label, value, accent = 'text-amber-300' }) {
  return (
    <div className="flex-1 min-w-0">
      <div className="text-[8px] sm:text-[9px] font-black tracking-[0.2em] text-red-400/90 mb-0.5">{label}</div>
      <div className={`bg-black/80 border border-white/10 rounded-md px-2 py-1 font-mono font-bold text-xs sm:text-sm ${accent} truncate shadow-[inset_0_0_12px_rgba(0,0,0,0.9)]`}>
        {value}
      </div>
    </div>
  );
}

// ตู้เต๋าน้ำเต้าปูปลา — casino dice machine สไตล์สล็อต: marquee หลอดไฟ + ช่องเต๋า + จอ LCD
function DiceMachineResult({ last, spinDone, g, game, onSpinDone }) {
  const won = last.outcome === 'win' || (last.payout || 0) > 0; // ticket เก่าไม่มี outcome — ใช้ payout แทน
  const betTh = last.betType ? (DICE_BET_LABEL[last.betType] || last.betType) : '—';
  const pickTh = last.picks?.length
    ? last.picks.map(p => animalText(last.diceSymbols?.[p - 1])).join(' + ')
    : '—';
  const resVal = !spinDone ? 'ทอยเต๋า...' : won ? 'ถูกต้อง ✓' : 'ไม่ถูก ✕';
  const resCls = !spinDone ? 'text-amber-300' : won ? 'text-emerald-300' : 'text-red-400';
  return (
    <div className="relative select-none">
      <div className="rounded-2xl border-2 border-amber-500/60 bg-gradient-to-b from-[#16304f] via-[#0f1e33] to-[#0a1526] p-2 sm:p-2.5 shadow-[0_10px_40px_rgba(0,0,0,0.7),inset_0_2px_0_rgba(255,255,255,0.08)]">
        <div className="rounded-xl border border-gold-400/30 bg-black/30 p-1.5 sm:p-2">

          {/* ===== Marquee ===== */}
          <div className="relative rounded-lg bg-gradient-to-b from-[#0f1e33] to-[#040a14] border border-gold-400/40 px-3 pt-2 pb-1.5 mb-2 overflow-hidden">
            <div className="flex justify-between px-1 mb-1">
              {Array.from({ length: 16 }).map((_, i) => (
                <span key={i} className="slot-bulb w-1.5 h-1.5 rounded-full"
                  style={{ animationDelay: `${(i % 2) * 0.6 + (i * 0.09)}s` }} />
              ))}
            </div>
            <div className="text-center">
              <div className="font-black tracking-[0.18em] text-sm sm:text-base text-transparent bg-clip-text bg-gradient-to-b from-amber-200 via-gold-300 to-amber-500 drop-shadow-[0_0_8px_rgba(244,201,78,0.6)]">
                ★ น้ำเต้าปูปลา ★
              </div>
              <div className="text-[8px] sm:text-[9px] font-bold tracking-[0.3em] text-gold-300/80 mt-0.5">3 DICE • SINGLE • PAIR • TRIPLE</div>
            </div>
            <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-transparent pointer-events-none" />
          </div>

          {/* ===== ช่องเต๋า — เขย่าตอนทอย ===== */}
          <div className={`relative rounded-lg bg-[#041008] border-2 border-black shadow-[inset_0_4px_18px_rgba(0,0,0,0.9)] px-2 sm:px-3 py-5 ${!spinDone ? 'animate-dice-shake' : ''}`}>
            <div className="flex items-center justify-center gap-3 sm:gap-6 flex-wrap">
              {!spinDone ? (
                <DiceRoll key={last.drawn.join('-')} drawn={last.drawn} symbols={last.diceSymbols} onDone={onSpinDone} />
              ) : (
                <DiceResult drawn={last.drawn} symbols={last.diceSymbols} />
              )}
            </div>
            <div className="absolute inset-0 rounded-lg pointer-events-none bg-gradient-to-br from-white/15 via-white/[0.03] to-transparent" />
            <div className="absolute inset-x-0 top-0 h-4 rounded-t-lg bg-gradient-to-b from-black/60 to-transparent pointer-events-none" />
            <div className="absolute inset-x-0 bottom-0 h-4 rounded-b-lg bg-gradient-to-t from-black/60 to-transparent pointer-events-none" />
          </div>

          {/* ===== จอ LCD ===== */}
          <div className="mt-2 rounded-lg bg-gradient-to-b from-[#16304f] to-[#081120] border border-white/10 px-2 sm:px-3 py-2 flex items-center gap-2 sm:gap-3">
            <LcdDisplay label="TYPE" value={betTh} accent="text-sky-300" />
            <LcdDisplay label="PICK" value={pickTh} accent="text-violet-300" />
            <LcdDisplay label="RESULT" value={resVal} accent={resCls} />
          </div>

          {/* รางวัล + fairness */}
          <div className="mt-2 px-1">
            {!spinDone ? (
              <div className="text-center text-xs text-gold-300/80 font-semibold animate-pulse">🎲 กำลังออกรางวัล…</div>
            ) : won ? (
              <div className="relative text-center overflow-visible">
                <WinBurst />
                <div className="text-2xl font-black text-green-300 animate-coin">+{satang(last.payout)} บาท</div>
                {g?.diceBets?.[last.betType]?.payout && (
                  <div className="text-[10px] text-navy-400">จ่าย {g.diceBets[last.betType].payout}</div>
                )}
              </div>
            ) : (
              <div className="text-center text-xs text-navy-300">ไม่เข้าเงื่อนไข — ลองใหม่นะ!</div>
            )}
            <div className="mt-2"><FairnessNote fairness={last.fairness}
              verify={(seed) => api('/kiwi/verify', { method: 'POST', body: { game: last.game || game, seed } })} /></div>
          </div>
        </div>
      </div>

    </div>
  );
}

// ตู้สุ่มเลขยี่กี/VIP — casino draw machine: ผลเด้งทีละลูกลงในช่องเหมือนรีลสล็อต + จอ LCD
function KiwiDrawMachine({ last, g, game, onDone }) {
  const drawn = last.drawn || [];
  const [shown, setShown] = useState(0);
  const [finished, setFinished] = useState(false);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  useEffect(() => {
    if (!drawn.length) { setFinished(true); doneRef.current?.(); return; }
    let n = 0;
    const iv = setInterval(() => {
      n += 1;
      setShown(n);
      if (n >= drawn.length) {
        clearInterval(iv);
        setFinished(true);
        setTimeout(() => doneRef.current?.(), 350);
      }
    }, 420);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [last.id]);

  const isAnimal = !!last.symbols;
  const won = last.outcome === 'win' || (last.payout || 0) > 0; // ชนะจริง = มีเงินรางวัล (hits ต่ำกว่าเกณฑ์ก็ไม่ถูก)
  const hits = last.hits ?? last.picks?.filter(p => drawn.includes(p)).length ?? 0;
  const ball = (p, i, hidden) => {
    const hit = !hidden && last.picks?.includes(p);
    const label = isAnimal ? animalEmoji(last.symbols, p) : p;
    return (
      <span key={i}
        className={`${hidden ? '' : hit ? 'animate-dice-land' : 'animate-digit'} inline-flex`}
        style={hidden ? {} : { animationDelay: `${i * 0.05}s` }}>
        <span className="lotto-ball" style={{
          fontSize: '1.5em', minWidth: '2.4em', height: '2.4em',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          outline: hit ? '3px solid #34d399' : undefined,
          boxShadow: hit ? '0 0 14px rgba(52,211,153,0.8)' : undefined,
          opacity: hidden ? 0.35 : 1,
        }}>{hidden ? '?' : label}</span>
      </span>
    );
  };

  const typeTh = isAnimal ? 'ตรงสัตว์' : `เลือก ${last.picks?.length ?? ''} เลข`;
  const pickTh = isAnimal
    ? (last.picks || []).map(p => animalEmoji(last.symbols, p)).join(' ')
    : (last.picks || []).join(' • ');
  const resVal = !finished ? 'ออกรางวัล...' : won ? `ถูก ${hits} ✓` : hits > 0 ? `ถูก ${hits} — ไม่เข้าเงื่อนไข` : 'ไม่ถูก ✕';
  const resCls = !finished ? 'text-amber-300' : won ? 'text-emerald-300' : hits > 0 ? 'text-sky-300' : 'text-red-400';
  const title = last.gameLabel || g?.label || 'ยี่กี';

  return (
    <div className="relative select-none">
      <div className="rounded-2xl border-2 border-amber-500/60 bg-gradient-to-b from-[#16304f] via-[#0f1e33] to-[#0a1526] p-2 sm:p-2.5 shadow-[0_10px_40px_rgba(0,0,0,0.7),inset_0_2px_0_rgba(255,255,255,0.08)]">
        <div className="rounded-xl border border-gold-400/30 bg-black/30 p-1.5 sm:p-2">

          {/* ===== Marquee ===== */}
          <div className="relative rounded-lg bg-gradient-to-b from-[#0f1e33] to-[#040a14] border border-gold-400/40 px-3 pt-2 pb-1.5 mb-2 overflow-hidden">
            <div className="flex justify-between px-1 mb-1">
              {Array.from({ length: 16 }).map((_, i) => (
                <span key={i} className="slot-bulb w-1.5 h-1.5 rounded-full"
                  style={{ animationDelay: `${(i % 2) * 0.6 + (i * 0.09)}s` }} />
              ))}
            </div>
            <div className="text-center">
              <div className="font-black tracking-[0.18em] text-sm sm:text-base text-transparent bg-clip-text bg-gradient-to-b from-amber-200 via-gold-300 to-amber-500 drop-shadow-[0_0_8px_rgba(244,201,78,0.6)]">
                ★ {title} ★
              </div>
              <div className="text-[8px] sm:text-[9px] font-bold tracking-[0.3em] text-gold-300/80 mt-0.5">INSTANT DRAW • PROVABLY FAIR</div>
            </div>
            <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-transparent pointer-events-none" />
          </div>

          {/* ===== ช่องลูกบอล — ผลเด้งทีละลูก ===== */}
          <div className="relative rounded-lg bg-[#041008] border-2 border-black shadow-[inset_0_4px_18px_rgba(0,0,0,0.9)] px-2 sm:px-3 py-5">
            <div className="flex items-center justify-center gap-2 sm:gap-3 flex-wrap min-h-[3.5rem]">
              {drawn.map((d, i) => ball(d, i, i >= shown))}
            </div>
            <div className="absolute inset-0 rounded-lg pointer-events-none bg-gradient-to-br from-white/15 via-white/[0.03] to-transparent" />
            <div className="absolute inset-x-0 top-0 h-4 rounded-t-lg bg-gradient-to-b from-black/60 to-transparent pointer-events-none" />
            <div className="absolute inset-x-0 bottom-0 h-4 rounded-b-lg bg-gradient-to-t from-black/60 to-transparent pointer-events-none" />
          </div>

          {/* ===== จอ LCD ===== */}
          <div className="mt-2 rounded-lg bg-gradient-to-b from-[#16304f] to-[#081120] border border-white/10 px-2 sm:px-3 py-2 flex items-center gap-2 sm:gap-3">
            <LcdDisplay label="TYPE" value={typeTh} accent="text-sky-300" />
            <LcdDisplay label="PICK" value={pickTh || '—'} accent="text-violet-300" />
            <LcdDisplay label="RESULT" value={resVal} accent={resCls} />
          </div>

          {/* รางวัล + fairness */}
          <div className="mt-2 px-1">
            {!finished ? (
              <div className="text-center text-xs text-gold-300/80 font-semibold animate-pulse">🎲 กำลังออกรางวัล…</div>
            ) : won ? (
              <div className="relative text-center overflow-visible">
                <WinBurst />
                <div className="text-2xl font-black text-green-300 animate-coin">+{satang(last.payout)} บาท</div>
              </div>
            ) : hits > 0 ? (
              <div className="text-center text-xs text-sky-300">ถูก {hits} เลข — ต่ำกว่าเงื่อนไขรางวัล (ต้องถูก 2+)</div>
            ) : (
              <div className="text-center text-xs text-navy-300">ไม่เข้าเงื่อนไข — ลองใหม่นะ!</div>
            )}
            <div className="mt-2"><FairnessNote fairness={last.fairness}
              verify={(seed) => api('/kiwi/verify', { method: 'POST', body: { game: last.game || game, seed } })} /></div>
          </div>
        </div>
      </div>

    </div>
  );
}

export default function Kiwi() {
  const { balance, setBalance } = useAuth();
  const [games, setGames] = useState([]);
  const [game, setGame] = useState('kiwi');
  const [picks, setPicks] = useState([]);
  const [betType, setBetType] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [last, setLast] = useState(null);
  const [spinDone, setSpinDone] = useState(true); // น้ำเต้าปูปลา: รอเต๋าหมดก่อนบอกผล
  const [spinningId, setSpinningId] = useState(null); // ticket id ที่กำลังหมุน — ซ่อนผลในประวัติ
  const playIdem = useRef(null); // {sig, key} — คง key เดิมจนกว่าจะสำเร็จ กัน retry เล่นซ้ำ

  const g = games.find(x => x.game === game) || games[0] || null;
  const load = () => api('/kiwi/mine').then(r => { setTickets(r.tickets); setLoaded(true); }).catch(() => setLoaded(true));
  const loadInfo = () => api('/kiwi/info').then(r => setGames(r.games)).catch(() => {});
  useEffect(() => {
    load();
    api('/kiwi/info').then(r => { setGames(r.games); if (r.games[0]) setGame(r.games[0].game); }).catch(() => {});
    // admin แก้ราคาเกม → SSE ดันมา refetch ราคาใหม่ทันที (คงเกมที่เลือกไว้)
    const h = () => { load(); loadInfo(); };
    window.addEventListener('sys:update', h);
    return () => window.removeEventListener('sys:update', h);
  }, []);

  const pickGame = (id) => { setGame(id); setPicks([]); setBetType(null); setErr(''); };
  const pickBetType = (bt) => { setBetType(bt); setPicks([]); setErr(''); };

  // เปิดโพยเก่าจากประวัติ — แสดงผลในตู้เครื่องเหมือนเพิ่งเล่น (เต๋าโชว์ผลนิ่ง ไม่หมุนซ้ำ)
  const openTicket = (t) => { if (t.dice) setSpinDone(true); setLast(t); };

  // น้ำเต้าปูปลา — ready: pair=เลือก 2 สัตว์, single/triple=เลือก 1 สัตว์
  const diceReady = !g?.dice ? false : (betType ? (betType === 'pair' ? picks.length === 2 : picks.length === 1) : false);
  const ready = g && (g.dice ? diceReady : picks.length === g.pickCount);

  const play = async () => {
    if (!ready || busy) return;
    setErr(''); setBusy(true);
    const sig = JSON.stringify([game, picks, betType]);
    if (!playIdem.current || playIdem.current.sig !== sig)
      playIdem.current = { sig, key: newIdemKey() };
    try {
      const r = await api('/kiwi/play', { method: 'POST', body: { game, picks, betType: g?.dice ? betType : undefined, idempotencyKey: playIdem.current.key } });
      playIdem.current = null;
      setBalance(r.balance);
      setLast(r); setPicks([]); setBetType(null);
      if (g?.dice) { setSpinDone(false); setSpinningId(r.id); } // รอเต๋าหมดค่อยบอกถูก/ไม่ถูก
      else { setSpinningId(r.id); } // เกมเลข/สัตว์ — รอผลเด้งหมดในตู้ก่อนเล่นเสียง
      load();
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  const tierText = g ? (g.dice
    ? 'เดี่ยว≥1ตัว=×2 • คู่=×6 • ตอง=×150'
    : g.symbols
      ? `ตรงสัตว์ = ×${Object.values(g.tiers)[0]}`
      : Object.entries(g.tiers).map(([h, m]) => `ถูก ${h} = ×${m}`).join(' • ')) : '';

  return (
    <div className="max-w-3xl mx-auto space-y-6 instant-page">
      {/* hero */}
      <div className="relative overflow-hidden rounded-3xl p-6 text-center luxury-card luxury-card-gold-border">
        <div className="absolute top-0 inset-x-0 h-1.5" style={{ background: 'linear-gradient(90deg, var(--gold-gradient-start), var(--gold-gradient-end))' }} />
        <div className="casino-chip w-10 h-10 sm:w-14 sm:h-14" style={{ bottom: '-4%', left: '6%', background: 'radial-gradient(circle at 35% 30%, #fff3c4, #e2a812 60%, #92600a)', animationDelay: '0.6s' }} />
        <div className="casino-chip w-8 h-8 sm:w-11 sm:h-11" style={{ top: '-4%', right: '8%', background: 'radial-gradient(circle at 35% 30%, #1f2937, #111827 65%, #030712)', animationDelay: '2s' }} />
        <h1 className="font-display font-bold text-2xl sm:text-3xl luxury-gradient-text">หวยยี่กี</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--muted-gray)' }}>{g?.dice ? 'ลูกเต๋า 3 ลูก → สุ่มผลทันที → แทงสัตว์เดี่ยว / คู่ / ตอง!' : g?.symbols ? 'เลือกสัตว์ 1 ตัว → สุ่มผลทันที → ถูกรับรางวัลทันที!' : `เลือกเลข ${g ? `${g.pickCount} ตัว` : ''} → สุ่มผลทันที → ถูกกี่ตัวจ่ายเท่านั้น!`}</p>
        <div className="flex flex-col items-center gap-2.5 mt-3">
          <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl" style={{ background: 'linear-gradient(90deg, rgba(212, 175, 55, 0.15), rgba(212, 175, 55, 0.05), rgba(212, 175, 55, 0.15))', border: '1px solid var(--border-gold)', boxShadow: 'var(--shadow-gold)' }}>
            <span className="text-sm">💰</span>
            <span className="text-xs font-semibold" style={{ color: 'var(--gold-primary)' }}>{g?.label ? `${g.label} — ราคาต่อครั้ง` : 'ราคาต่อครั้ง'}</span>
            <span className="font-display font-bold text-2xl" style={{ color: 'var(--gold-bright)' }}>{g ? satang(g.price) : '—'} <span className="text-sm">บาท</span></span>
          </div>
          <div className="flex items-center justify-center gap-4 text-[11px] flex-wrap" style={{ color: 'var(--muted-gray)' }}>
            <span>⚖️ จ่ายตามผล {tierText && <span style={{ color: 'var(--gold-bright)' }}>{tierText}</span>}</span>
          </div>
        </div>
      </div>

      {/* เลือกเกม */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {games.map(x => (
          <button key={x.game} onClick={() => pickGame(x.game)}
            className={`rounded-xl border px-2 py-2.5 text-center transition ${game === x.game
              ? 'luxury-card-gold-border'
              : 'luxury-card'}`}>
            <div className="text-xs font-bold leading-tight" style={{ color: 'var(--white)' }}>{x.label}</div>
            <div className="text-[10px] mt-0.5" style={{ color: 'var(--muted-gray)' }}>{satang(x.price)} บาท</div>
            <div className="text-[9px] mt-0.5 leading-tight" style={{ color: 'var(--gold-primary)' }}>
              {x.dice ? 'เดี่ยว/คู่/ตอง' : x.symbols ? 'ตรงสัตว์ x5' : Object.entries(x.tiers || {}).map(([h, m]) => 'ถูก' + h + ' = x' + m).join('  ')}
            </div>
          </button>
        ))}
      </div>

      {/* เลือกเลข + เล่น */}
      <div className="luxury-card p-4 sm:p-5 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="text-sm font-bold" style={{ color: 'var(--white)' }}>
            {g?.dice ? (betType ? g.diceBets?.[betType]?.label || 'เลือกรูปแบบ' : 'เลือกรูปแบบการแทง')
              : g?.symbols ? 'เลือกสัตว์ 1 ตัว' : `เลือก ${g?.pickCount ?? '—'} เลข จาก 1-${g?.poolSize ?? '—'}`}
            <span className="font-normal text-xs ml-2" style={{ color: 'var(--muted-gray)' }}>เลือกแล้ว {picks.length}/{g?.dice ? (betType === 'pair' ? 2 : 1) : (g?.pickCount ?? '—')}</span>
          </div>
          {picks.length > 0 && <button onClick={() => setPicks([])} className="text-[11px] transition" style={{ color: 'var(--muted-gray)' }}>ล้าง</button>}
        </div>
        {g?.dice ? (
          <>
            {/* เลือกรูปแบบการแทง */}
            <div>
              <div className="text-xs mb-1.5" style={{ color: 'var(--muted-gray)' }}>เลือกรูปแบบ</div>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(g.diceBets || {}).map(([bt, info]) => (
                  <button key={bt} onClick={() => pickBetType(bt)} disabled={busy}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition ${betType === bt
                      ? 'luxury-badge-gold' : 'luxury-btn-ghost'}`}>
                    {info.label}
                  </button>
                ))}
              </div>
              {betType && g.diceBets?.[betType] && (
                <div className="text-[11px] mt-1 space-y-0.5" style={{ color: 'var(--muted-gray)' }}>
                  <div>{g.diceBets[betType].desc}</div>
                  <div className="font-semibold" style={{ color: 'var(--gold-bright)' }}>💰 อัตราจ่าย: {g.diceBets[betType].payout}</div>
                </div>
              )}
            </div>
            {/* เลือกสัตว์ */}
            {betType && ['single', 'pair', 'triple'].includes(betType) && (
              <DiceAnimalPicker symbols={g.diceSymbols} picks={picks} setPicks={setPicks}
                count={betType === 'pair' ? 2 : 1} disabled={busy} />
            )}
          </>
        ) : g?.symbols ? (
          <AnimalPicker symbols={g.symbols} picks={picks} setPicks={setPicks} disabled={busy} />
        ) : (
          <NumPicker poolSize={g?.poolSize || 20} pickCount={g?.pickCount || 5} picks={picks} setPicks={setPicks} disabled={busy} />
        )}
        {err && <div className="text-red-400 text-sm">{err}</div>}
        {balance < (g?.price || Infinity) && (
          <div className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">
            เครดิตไม่พอ — <a href="/wallet?action=deposit" className="underline font-semibold">เติมเครดิต</a>
          </div>
        )}
        {/* ปุ่มเล่นอยู่บนแถบล่าง (instant-betbar) — ที่นี่แสดงแค่ตัวเลือกเลข/สัตว์ */}
      </div>

      {/* ผลล่าสุด — น้ำเต้าปูปลาใช้ตู้เต๋า casino, เกมเลข/สัตว์เดี่ยวใช้เฟรมรางวัล */}
      {last?.dice ? (
        <DiceMachineResult key={last.id} last={last} spinDone={spinDone} g={g} game={game}
          onSpinDone={() => {
            setSpinDone(true); setSpinningId(null);
            if (last.outcome === 'win' || (last.payout || 0) > 0) sfx.win(); navigator.vibrate?.([80,40,80]); // haptic ฉลองถูกรางวัล else sfx.lose();
          }} />
      ) : last && (
        <KiwiDrawMachine key={last.id} last={last} g={g} game={game}
          onDone={() => {
            setSpinningId(null);
            if (last.outcome === 'win' || (last.payout || 0) > 0) sfx.win(); navigator.vibrate?.([80,40,80]); // haptic ฉลองถูกรางวัล else sfx.lose();
          }} />
      )}

      {/* history */}
      {!loaded && <SkeletonCard />}
      {loaded && !tickets.length && (
        <EmptyState emoji="🎲" title="ยังไม่มีตั๋วยี่กี" hint="กดปุ่มเล่นเพื่อเริ่มเสี่ยงโชค" />
      )}
      {tickets.length > 0 && (
        <div className="luxury-card overflow-hidden">
          <div className="px-5 py-4 border-b font-bold" style={{ borderColor: 'var(--border-light)', color: 'var(--white)' }}>ประวัติยี่กี</div>
          <div className="divide-y" style={{ borderColor: 'var(--border-light)' }}>
            {tickets.map(t => (
              <button key={t.id} onClick={() => openTicket(t)}
                className="w-full flex items-center gap-3 px-5 py-3 text-left transition hover:bg-navy-700/40">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold" style={{ color: 'var(--white)' }}>{t.gameLabel} • {t.slipRef}</div>
                  <div className="text-[11px]" style={{ color: 'var(--muted-gray)' }}>
                    {fmtDateTime(t.createdAt)}
                    {t.dice ? ` • ${t.betType ? (DICE_BET_LABEL[t.betType] || t.betType) : ''}${t.picks?.length ? ` ${t.picks.map(p => animalText(t.diceSymbols?.[p - 1])).join('+')}` : ''}`
                      : t.symbols ? ` • ${animalEmoji(t.symbols, t.picks[0])}` : ` • ถูก ${t.hits} เลข`}
                  </div>
                </div>
                {t.id === spinningId ? (
                  <span className="text-[11px] font-bold px-2.5 py-1 rounded-full luxury-badge-gold animate-pulse">🎲 ออกรางวัล…</span>
                ) : t.payout > 0 ? (
                  <span className="text-[11px] font-bold px-2.5 py-1 rounded-full luxury-badge-success">+{satang(t.payout)} บาท</span>
                ) : (
                  <span className="text-[11px] font-bold px-2.5 py-1 rounded-full" style={{ background: 'var(--bg-dark-surface)', color: 'var(--muted-gray)', border: '1px solid var(--border-light)' }}>ไม่ถูก</span>
                )}
                <span className="text-[10px] shrink-0" style={{ color: 'var(--dark-gray)' }}>👁</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* แถบเล่นด่วน — ติดล่างจอตลอด ไม่ต้องเลื่อนกลับไปหาปุ่มเล่น */}
      <div className="instant-betbar px-4">
        <div className="max-w-3xl mx-auto">
          <button onClick={play} disabled={!ready || busy || balance < (g?.price || Infinity)}
            className="w-full luxury-btn font-black py-3.5 text-sm tracking-wide disabled:opacity-50 active:scale-[0.98]">
            {busy ? '🎲 กำลังสุ่มผล...' : ready
              ? `🎲 เล่นเลย — ${satang(g.price)} บาท${picks.length ? ` (${picks.length} เลือก)` : ''}`
              : g?.dice ? `เลือกรูปแบบ + ค่าที่ถูกต้องก่อน (${picks.length}/${betType === 'pair' ? 2 : 1})`
              : g?.symbols ? `เลือกสัตว์ 1 ตัวก่อน (${picks.length}/1)`
              : `เลือกเลขให้ครบ ${g?.pickCount ?? ''} ตัวก่อน (${picks.length}/${g?.pickCount ?? '—'})`}
          </button>
        </div>
      </div>
    </div>
  );
}
