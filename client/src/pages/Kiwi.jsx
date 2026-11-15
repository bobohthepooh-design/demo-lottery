import { useEffect, useRef, useState } from 'react';
import { api, satang, fmtDateTime } from '../api.js';
import { useAuth } from '../auth.jsx';
import FairnessNote from '../components/Fairness.jsx';
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
              ? 'bg-gradient-to-b from-emerald-400 to-emerald-600 text-navy-950 border-emerald-300 shadow'
              : 'bg-navy-900/70 text-navy-200 border-navy-700 hover:border-emerald-500/50 disabled:opacity-40'}`}>
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
              ? 'bg-gradient-to-b from-emerald-400 to-emerald-600 text-navy-950 border-emerald-300 shadow'
              : 'bg-navy-900/70 text-navy-200 border-navy-700 hover:border-emerald-500/50 disabled:opacity-40'}`}>
            <AnimalGlyph name={s} size="1.9rem" />
            <span className={`text-[10px] leading-none ${on ? 'text-navy-900' : 'text-navy-400'}`}>{s}</span>
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
              ? 'bg-gradient-to-b from-emerald-400 to-emerald-600 text-navy-950 border-emerald-300 shadow'
              : 'bg-navy-900/70 text-navy-200 border-navy-700 hover:border-emerald-500/50 disabled:opacity-40'}`}>
            <AnimalGlyph name={s} size="1.9rem" />
            <span className={`text-[10px] leading-none ${on ? 'text-navy-900' : 'text-navy-400'}`}>{s}</span>
          </button>
        );
      })}
    </div>
  );
}

// ลูกเต๋าหมุน — สุ่มสัญลักษณ์สัตว์เร็วๆ แล้วหยุดทีละลูกที่ผลจริง (เหมือนวงล้อ)
function DiceRoll({ drawn, symbols, onDone }) {
  const [vals, setVals] = useState(() => drawn.map((_, i) => (i * 2 + 1) % 6 + 1));
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  useEffect(() => {
    const stopAt = drawn.map((_, i) => 800 + i * 550); // ลูกที่ 1 หยุดก่อน ลูก 3 ทีหลัง
    const t0 = Date.now();
    const iv = setInterval(() => {
      const now = Date.now() - t0;
      const next = drawn.map((d, i) => now >= stopAt[i] ? d : 1 + Math.floor(Math.random() * 6));
      setVals(next);
      if (now >= stopAt[drawn.length - 1] + 80) { clearInterval(iv); doneRef.current?.(); }
    }, 70);
    return () => clearInterval(iv);
  }, [drawn]);
  return (
    <div className="flex items-center justify-center gap-2 flex-wrap">
      {vals.map((v, i) => (
        <span key={i} className="lotto-ball" style={{ fontSize: '1.4em', minWidth: '2.2em', height: '2.2em', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
          <AnimalGlyph name={symbols?.[v - 1]} size="1.4em" />
        </span>
      ))}
    </div>
  );
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

export default function Kiwi() {
  const { balance, setBalance } = useAuth();
  const [games, setGames] = useState([]);
  const [game, setGame] = useState('kiwi');
  const [picks, setPicks] = useState([]);
  const [betType, setBetType] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [last, setLast] = useState(null);
  const [spinDone, setSpinDone] = useState(true); // น้ำเต้าปูปลา: รอเต๋าหมดก่อนบอกผล
  const [spinningId, setSpinningId] = useState(null); // ticket id ที่กำลังหมุน — ซ่อนผลในประวัติ

  const g = games.find(x => x.game === game) || games[0] || null;
  const load = () => api('/kiwi/mine').then(r => setTickets(r.tickets)).catch(() => {});
  useEffect(() => {
    load();
    api('/kiwi/info').then(r => { setGames(r.games); if (r.games[0]) setGame(r.games[0].game); }).catch(() => {});
  }, []);

  const pickGame = (id) => { setGame(id); setPicks([]); setBetType(null); setErr(''); };
  const pickBetType = (bt) => { setBetType(bt); setPicks([]); setErr(''); };

  // น้ำเต้าปูปลา — ready: pair=เลือก 2 สัตว์, single/triple=เลือก 1 สัตว์
  const diceReady = !g?.dice ? false : (betType ? (betType === 'pair' ? picks.length === 2 : picks.length === 1) : false);
  const ready = g && (g.dice ? diceReady : picks.length === g.pickCount);

  const play = async () => {
    if (!ready || busy) return;
    setErr(''); setBusy(true);
    try {
      const r = await api('/kiwi/play', { method: 'POST', body: { game, picks, betType: g?.dice ? betType : undefined } });
      setBalance(r.balance);
      setLast(r); setPicks([]); setBetType(null);
      if (g?.dice) { setSpinDone(false); setSpinningId(r.id); } // รอเต๋าหมดค่อยบอกถูก/ไม่ถูก
      else { setSpinningId(null); if (r.outcome === 'win') sfx.win(); else sfx.lose(); }
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
    <div className="max-w-3xl mx-auto space-y-5 instant-page">
      {/* hero */}
      <div className="relative overflow-hidden rounded-3xl border-2 border-emerald-400/50 bg-gradient-to-br from-navy-800 via-navy-900 to-navy-950 p-6 text-center">
        <div className="hr-shine absolute top-0 inset-x-0 h-1.5" />
        <h1 className="font-display font-bold text-2xl sm:text-3xl text-emerald-300">หวยยี่กี</h1>
        <p className="text-sm text-navy-300 mt-1">{g?.dice ? 'ลูกเต๋า 3 ลูก → สุ่มผลทันที → แทงสัตว์เดี่ยว / คู่ / ตอง!' : g?.symbols ? 'เลือกสัตว์ 1 ตัว → สุ่มผลทันที → ถูกรับรางวัลทันที!' : `เลือกเลข ${g ? `${g.pickCount} ตัว` : ''} → สุ่มผลทันที → ถูกกี่ตัวจ่ายเท่านั้น!`}</p>
        <div className="flex items-center justify-center gap-4 mt-3 text-xs text-navy-300 flex-wrap">
          <span>💰 เริ่มต้น <b className="text-gold-300">{g ? satang(g.price) : '—'} บาท</b></span>
          <span>⚖️ จ่ายตามผล {tierText && <span className="text-emerald-300">{tierText}</span>}</span>
        </div>
      </div>

      {/* เลือกเกม */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {games.map(x => (
          <button key={x.game} onClick={() => pickGame(x.game)}
            className={`rounded-xl border px-2 py-2.5 text-center transition ${game === x.game
              ? 'border-emerald-400/70 bg-emerald-500/10' : 'border-navy-700 bg-navy-800/60 hover:border-navy-500'}`}>
            <div className="text-xs font-bold text-white leading-tight">{x.label}</div>
            <div className="text-[10px] text-navy-400 mt-0.5">{satang(x.price)} บาท</div>
            <div className="text-[9px] text-emerald-400/80 mt-0.5 leading-tight">
              {x.dice ? 'เดี่ยว/คู่/ตอง' : x.symbols ? 'ตรงสัตว์ x5' : Object.entries(x.tiers || {}).map(([h, m]) => 'ถูก' + h + ' = x' + m).join('  ')}
            </div>
          </button>
        ))}
      </div>

      {/* เลือกเลข + เล่น */}
      <div className="bg-navy-800 border border-navy-700 rounded-2xl p-4 sm:p-5 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="text-sm font-bold text-white">
            {g?.dice ? (betType ? g.diceBets?.[betType]?.label || 'เลือกรูปแบบ' : 'เลือกรูปแบบการแทง')
              : g?.symbols ? 'เลือกสัตว์ 1 ตัว' : `เลือก ${g?.pickCount ?? '—'} เลข จาก 1-${g?.poolSize ?? '—'}`}
            <span className="text-navy-400 font-normal text-xs ml-2">เลือกแล้ว {picks.length}/{g?.dice ? (betType === 'pair' ? 2 : 1) : (g?.pickCount ?? '—')}</span>
          </div>
          {picks.length > 0 && <button onClick={() => setPicks([])} className="text-[11px] text-navy-400 hover:text-white">ล้าง</button>}
        </div>
        {g?.dice ? (
          <>
            {/* เลือกรูปแบบการแทง */}
            <div>
              <div className="text-xs text-navy-400 mb-1.5">เลือกรูปแบบ</div>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(g.diceBets || {}).map(([bt, info]) => (
                  <button key={bt} onClick={() => pickBetType(bt)} disabled={busy}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition ${betType === bt
                      ? 'bg-emerald-500/20 border-emerald-400/70 text-emerald-300' : 'bg-navy-900 border-navy-700 text-navy-300 hover:border-navy-500'}`}>
                    {info.label}
                  </button>
                ))}
              </div>
              {betType && g.diceBets?.[betType] && (
                <div className="text-[11px] text-navy-400 mt-1 space-y-0.5">
                  <div>{g.diceBets[betType].desc}</div>
                  <div className="text-emerald-300 font-semibold">💰 อัตราจ่าย: {g.diceBets[betType].payout}</div>
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

      {/* ผลล่าสุด */}
      {last && (
        <div className={`rounded-2xl border-2 p-5 text-center ${last.dice && !spinDone ? 'border-navy-600 bg-navy-900/60' : last.outcome === 'win' ? 'border-emerald-500/60 bg-emerald-500/10' : 'border-navy-600 bg-navy-900/60'}`}>
          {last.dice && !spinDone ? (
            <div className="text-navy-200 font-semibold animate-pulse">🎲 กำลังออกรางวัล…</div>
          ) : last.outcome === 'win' ? (
            <>
              <div className="text-3xl font-black text-emerald-400">{last.dice ? '✓ ถูก! ชนะ!' : last.symbols ? '✓ ถูกสัตว์!' : `✓ ถูก ${last.hits} เลข!`}</div>
              <div className="text-2xl font-black text-gold-300 coin-gold-bright mt-1">+{satang(last.payout)} บาท</div>
            </>
          ) : (
            <div className="text-navy-200 font-semibold">{last.dice ? 'ไม่เข้าเงื่อนไข — ลองใหม่นะ!' : last.symbols ? 'สัตว์ไม่ตรง — ลองใหม่นะ!' : `ถูก ${last.hits} เลข — ไม่เข้าเงื่อนไขรางวัล ลองใหม่นะ!`}</div>
          )}
          {last.dice ? (
            <div className="mt-3 space-y-2">
              <DiceRoll key={last.drawn.join('-')} drawn={last.drawn} symbols={last.diceSymbols}
                onDone={() => {
                  setSpinDone(true); setSpinningId(null);
                  if (last.outcome === 'win') sfx.win(); else sfx.lose();
                }} />
              <div className="text-[11px] text-navy-400">
                {last.betType && DICE_BET_LABEL[last.betType]}
                {last.betType && ['single', 'pair', 'triple'].includes(last.betType) && last.picks.length > 0 &&
                  ` • ${last.picks.map(p => animalText(last.diceSymbols?.[p - 1])).join(' + ')}`}
                {last.betType && g?.diceBets?.[last.betType]?.payout && ` • จ่าย ${g.diceBets[last.betType].payout}`}
              </div>
            </div>
          ) : (
          <div className="flex justify-center gap-4 mt-3 flex-wrap">
            <div>
              <div className="text-[10px] text-navy-400 mb-1">{last.symbols ? 'สัตว์ที่เลือก' : 'เลขที่เลือก'}</div>
              <div className="flex gap-1 flex-wrap justify-center">
                {last.picks.map((p, i) => last.symbols
                  ? <span key={i} className="lotto-ball" style={{ fontSize: '0.85em' }}>{animalEmoji(last.symbols, p)}</span>
                  : <span key={i} className="lotto-ball" style={{ fontSize: '0.85em' }}>{p}</span>)}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-navy-400 mb-1">{last.symbols ? 'ผลที่ออก' : 'ผลที่ออก'}</div>
              <div className="flex gap-1 flex-wrap justify-center">
                {last.drawn.map((p, i) => {
                  const hit = last.picks.includes(p);
                  const label = last.symbols ? animalEmoji(last.symbols, p) : p;
                  return hit
                    ? <span key={i} className="lotto-ball" style={{ fontSize: '0.85em', outline: '2px solid #34d399' }}>{label}</span>
                    : <span key={i} className="lotto-ball" style={{ fontSize: '0.85em', opacity: 0.6 }}>{label}</span>;
                })}
              </div>
            </div>
          </div>
          )}
          <FairnessNote fairness={last.fairness} verify={(seed) => api('/kiwi/verify', { method: 'POST', body: { game, seed } })} />
        </div>
      )}

      {/* history */}
      {tickets.length > 0 && (
        <div className="bg-navy-800 border border-navy-700 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-navy-700 font-bold text-white">ประวัติยี่กี</div>
          <div className="divide-y divide-navy-700">
            {tickets.map(t => (
              <div key={t.id} className="flex items-center gap-3 px-5 py-3">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-white">{t.gameLabel} • {t.slipRef}</div>
                  <div className="text-[11px] text-navy-400">
                    {fmtDateTime(t.createdAt)}
                    {t.dice ? ` • ${t.betType ? (DICE_BET_LABEL[t.betType] || t.betType) : ''}${t.picks?.length ? ` ${t.picks.map(p => animalText(t.diceSymbols?.[p - 1])).join('+')}` : ''}`
                      : t.symbols ? ` • ${animalEmoji(t.symbols, t.picks[0])}` : ` • ถูก ${t.hits} เลข`}
                  </div>
                </div>
                {t.id === spinningId ? (
                  <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/40 animate-pulse">🎲 ออกรางวัล…</span>
                ) : t.payout > 0 ? (
                  <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-green-500/15 text-green-300 border border-green-500/40">+{satang(t.payout)} บาท</span>
                ) : (
                  <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-navy-700/50 text-navy-300 border border-navy-600">ไม่ถูก</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* แถบเล่นด่วน — ติดล่างจอตลอด ไม่ต้องเลื่อนกลับไปหาปุ่มเล่น */}
      <div className="instant-betbar px-4">
        <div className="max-w-3xl mx-auto">
          <button onClick={play} disabled={!ready || busy || balance < (g?.price || Infinity)}
            className="w-full rounded-xl bg-gradient-to-r from-emerald-500 to-green-600 text-white font-black py-3.5 text-sm tracking-wide shadow-lg shadow-emerald-500/30 hover:brightness-110 transition disabled:opacity-50 active:scale-[0.98]">
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
