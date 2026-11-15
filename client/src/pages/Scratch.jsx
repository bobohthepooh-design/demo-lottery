import { useEffect, useState } from 'react';
import { api, satang, fmtDateTime } from '../api.js';
import { useAuth } from '../auth.jsx';
import { SymbolGrid } from '../components/ScratchCard.jsx';
import SlotMachine from '../components/SlotMachine.jsx';
import FairnessNote from '../components/Fairness.jsx';
import { sfx } from '../sound.js';

// ชื่อสัญลักษณ์ภาษาไทย — ใช้เมื่อ outcome เก่าใน DB ไม่มี field name (ตอนนี้ server ส่ง name มาใน outcome แล้ว)
const SYMBOL_INFO = {
  '🍒': 'เชอร์รี่', '🍋': 'เลมอน', '🍊': 'ส้ม', '🍇': 'องุ่น', '🔔': 'กระดิ่ง', '⭐': 'ดาว', '💎': 'เพชร', '7️⃣': 'เจ็ด',
};

// รางวัลเริ่มต้นก่อน config โหลด (ตรงกับ default ฝั่ง server — จะถูกแทนที่ด้วยข้อมูลจริงจาก /lottery/public-config)
// prize = จ่ายเมื่อซ้ำ 3 รีลบน 1 เพย์ไลน์ • max = จ่ายเมื่อซ้ำครบ 5 รีลบนเส้นเดียว
const DEFAULT_PRIZES = [
  { icon: '🍒', name: 'เชอร์รี่', prize: 150, max: 2250 },
  { icon: '🍋', name: 'เลมอน', prize: 300, max: 4500 },
  { icon: '🍊', name: 'ส้ม', prize: 500, max: 7500 },
  { icon: '🍇', name: 'องุ่น', prize: 900, max: 13500 },
  { icon: '🔔', name: 'กระดิ่ง', prize: 2000, max: 30000 },
  { icon: '⭐', name: 'ดาว', prize: 6000, max: 90000 },
  { icon: '💎', name: 'เพชร', prize: 18000, max: 270000 },
  { icon: '7️⃣', name: 'เจ็ด', prize: 80000, max: 1200000 },
];

// บัตรเก่า (grid 9 ช่อง กติกาเดิม) — แสดง SymbolGrid 3x3; สล็อตใหม่ grid 15 ช่อง
const isLegacyCard = (grid) => !!grid && grid.length !== 15;
const rowIcons = (grid) => !grid ? ['❓', '❓', '❓'] : grid.slice(0, 5); // แถวจ่ายแรกเป็นตัวแทนบัตรในลิสต์

export default function Scratch() {
  const { user, balance, setBalance } = useAuth();
  const [cards, setCards] = useState([]);
  const [active, setActive] = useState(null);   // card กำลังเล่น
  const [result, setResult] = useState(null);   // outcome หลัง reveal
  const [busy, setBusy] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [reelsDone, setReelsDone] = useState(false);
  const [spinKey, setSpinKey] = useState(0);     // เพิ่ม = เริ่มหมุนรีล
  const [err, setErr] = useState('');
  const [price, setPrice] = useState(5000); // สตางค์ — sync จาก server (admin ตั้งได้)
  const [prizes, setPrizes] = useState(DEFAULT_PRIZES); // ตารางรางวัลจาก server
  const reelIcons = prizes.map(p => p.icon);

  const load = () => api('/scratch/mine').then(r => setCards(r.cards)).catch(() => {});
  useEffect(() => {
    load();
    api('/lottery/public-config').then(r => {
      const p = r.instantGame?.scratchPrice;
      if (p) setPrice(p);
      if (Array.isArray(r.instantGame?.scratchPrizes) && r.instantGame.scratchPrizes.length) {
        setPrizes(r.instantGame.scratchPrizes);
      }
    }).catch(() => {});
  }, []);

  const buy = async () => {
    setErr(''); setBusy(true);
    try {
      const r = await api('/scratch/buy', { method: 'POST', body: {} });
      setBalance(r.balance);
      if (r.price) setPrice(r.price);
      setCards(cs => [r.card, ...cs]);
      setActive(r.card);
      setResult(null);
      setSpinKey(0); setReelsDone(false); setSpinning(false);
      sfx.chip();
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  // สปิน — เรียก reveal (settle ฝั่ง server ทันที) แล้วค่อยเล่น animation รีลลงผลจริง
  const spin = async () => {
    if (!active || active.status !== 'hidden' || spinning) return;
    setErr(''); setSpinning(true); setResult(null); setReelsDone(false);
    sfx.dice();
    try {
      const r = await api(`/scratch/${active.id}/reveal`, { method: 'POST' });
      setBalance(r.balance);
      setResult(r);
      setActive(a => a ? { ...a, status: 'revealed', outcome: r.outcome, grid: r.grid ?? a.grid, fairness: r.fairness ?? a.fairness } : a);
      setCards(cs => cs.map(c => c.id === active.id ? { ...c, status: 'revealed', outcome: r.outcome, grid: r.grid ?? c.grid, fairness: r.fairness ?? c.fairness } : c));
      setSpinKey(k => k + 1); // เริ่ม animation — ผลจริงในมือแล้ว
    } catch (e) { setErr(e.message); setSpinning(false); }
  };

  const onReelsDone = () => {
    setSpinning(false);
    setReelsDone(true);
    if (result?.outcome?.win) setTimeout(() => sfx.win(), 200); else setTimeout(() => sfx.lose(), 200);
  };

  const openCard = (c) => {
    setActive(c); setResult(c.status === 'revealed' ? c : null);
    setSpinKey(0); setSpinning(false); setReelsDone(true);
  };

  const hidden = cards.filter(c => c.status === 'hidden');
  const revealed = cards.filter(c => c.status === 'revealed');
  // ปุ่มหลักบนแถบล่าง — ตามสถานะบัตรที่เปิดอยู่
  const canSpin = active?.status === 'hidden' && !result && !spinning;
  const nextHidden = hidden.find(c => c.id !== active?.id) || hidden[0];

  return (
    <div className="max-w-3xl mx-auto space-y-6 instant-page">
      {/* hero */}
      <div className="relative overflow-hidden rounded-3xl border-2 border-gold-500/60 bg-gradient-to-br from-navy-800 via-navy-900 to-navy-950 p-6 sm:p-8 text-center">
        <div className="hr-shine absolute top-0 inset-x-0 h-1.5" />
        <span className="casino-sparkle text-xl" style={{ top: '18%', left: '8%', animationDelay: '0.3s' }}>✦</span>
        <span className="casino-sparkle text-sm" style={{ top: '30%', right: '10%', animationDelay: '1.4s' }}>✧</span>
        <span className="casino-sparkle text-lg" style={{ bottom: '26%', left: '14%', animationDelay: '2.2s' }}>✦</span>
        <span className="casino-sparkle text-sm" style={{ bottom: '34%', right: '8%', animationDelay: '0.9s' }}>✦</span>
        <div className="casino-chip w-10 h-10 sm:w-14 sm:h-14" style={{ bottom: '-4%', right: '6%', background: 'radial-gradient(circle at 35% 30%, #fca5a5, #dc2626 60%, #7f1d1d)', animationDelay: '1s' }} />
        <div className="text-5xl mb-2 animate-float">🎰</div>
        <h1 className="font-display font-bold text-2xl sm:text-3xl text-gold-300">สล็อต</h1>
        <p className="text-sm text-navy-300 mt-1">เล่นเกม → กดสปิน → 5 รีลหมุนหยุดทีละตัว → รู้ผลทันที!</p>
        <div className="flex items-center justify-center gap-4 mt-4 text-xs text-navy-300 flex-wrap">
          <span>💰 ราคา <b className="text-gold-300">{satang(price)} บาท</b>/ใบ</span>
          {prizes.map(p => <span key={p.icon} className="inline-flex items-center gap-0.5">{p.icon} <b>{p.name}</b> {p.max && p.max !== p.prize ? `${satang(p.prize)}–${satang(p.max)}` : satang(p.prize)} บาท</span>)}
        </div>
        <p className="text-[11px] text-navy-400 mt-2">ถูกเมื่อสัญลักษณ์เดิมซ้ำกันติดกันตั้งแต่รีลซ้ายอย่างน้อย 3 รีล บน 20 เพย์ไลน์ใดก็ได้ • จ่ายรวมทุกเส้นที่ถูก • เครดิตเสมือนสำหรับ Demo</p>
      </div>

      {/* buy + active card */}
      <div className="bg-navy-800 border border-navy-700 rounded-2xl p-5">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <div>
            <div className="font-bold text-white">บัตรของคุณ</div>
            <div className="text-xs text-navy-400">เครดิตคงเหลือ {satang(balance)} บาท • ปุ่มซื้อ/เล่นอยู่แถบด้านล่าง</div>
          </div>
        </div>
        {err && <div className="text-red-400 text-sm mb-3">{err}</div>}
        {balance < price && (
          <div className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2 mb-3">
            เครดิตไม่พอ — <a href="/wallet?action=deposit" className="underline font-semibold">เติมเครดิต</a> ก่อนนะ
          </div>
        )}

        {active && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-xs text-navy-400 font-mono">โพย {active.slipRef} • {fmtDateTime(active.createdAt)}</div>
              <button onClick={() => { setActive(null); setResult(null); }} className="text-xs text-navy-400 hover:text-navy-200">ปิด</button>
            </div>
            <FairnessNote fairness={result?.fairness || active.fairness}
              verify={(seed) => api('/scratch/verify', { method: 'POST', body: { seed } })} />

            {active.status === 'hidden' && !result && (
              <>
                <div className="max-w-[470px] mx-auto">
                  <SlotMachine icons={reelIcons} masked spinKey={0}
                    betLabel={`${satang(price)} บ.`} creditLabel={`${satang(balance)} บ.`}
                    onSpin={spin} spinning={spinning} spinDisabled={busy || balance < price} />
                </div>
                <p className="text-center text-[11px] text-navy-400">กด SPIN บนตู้ 1 ครั้งต่อบัตร — ผลถูกกำหนดฝั่ง server แล้ว เครดิตตัดตอนซื้อ</p>
              </>
            )}

            {(active.status === 'revealed' || result) && (() => {
              const grid = active.grid || result?.grid;
              const outcome = result?.outcome || active.outcome;
              const legacy = isLegacyCard(grid);
              const showResult = !!result && (spinKey === 0 || reelsDone); // ซ่อนผลจนรีลหยุดครบ
              return (
                <>
                  <div className="max-w-[470px] mx-auto">
                    {legacy ? <SymbolGrid grid={grid} /> : <SlotMachine icons={reelIcons} grid={grid} lines={outcome?.lines || []} spinKey={spinKey} onDone={onReelsDone}
                      betLabel={`${satang(price)} บ.`} creditLabel={`${satang(result?.balance ?? balance)} บ.`} />}
                  </div>
                  {showResult && <RevealResult outcome={outcome} balance={result?.balance} slipRef={active.slipRef} />}
                </>
              );
            })()}
          </div>
        )}

        {!active && !cards.length && !busy && (
          <div className="text-center py-8 text-navy-400">
            <div className="text-4xl mb-2">🎰</div>
            ยังไม่มีเกม — กดปุ่ม "เล่นเกม" บนแถบด้านล่างเพื่อเริ่มสปินเลย!
          </div>
        )}
      </div>

      {/* my cards */}
      {cards.length > 0 && (
        <div className="bg-navy-800 border border-navy-700 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-navy-700 font-bold text-white flex items-center gap-2">
            📋 บัตรสล็อตของฉัน
            {hidden.length > 0 && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40">รอสปิน {hidden.length}</span>}
          </div>
          <div className="divide-y divide-navy-700">
            {cards.map(c => {
              const o = c.outcome;
              const isWin = o?.win;
              return (
                <button key={c.id} onClick={() => openCard(c)}
                  className="w-full flex items-center gap-3 px-5 py-3 hover:bg-navy-700/40 text-left">
                  <div className="flex -space-x-1">
                    {rowIcons(c.grid).map((s, i) => (
                      <span key={i} className="w-8 h-8 rounded-lg bg-navy-900 border border-navy-600 flex items-center justify-center text-lg">{s}</span>
                    ))}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-mono text-navy-300">{c.slipRef}</div>
                    <div className="text-[11px] text-navy-400">{fmtDateTime(c.createdAt)}</div>
                  </div>
                  {c.status === 'hidden' ? (
                    <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/40">รอสปิน</span>
                  ) : isWin ? (
                    <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-green-500/15 text-green-300 border border-green-500/40">ถูก {o.symbol} +{satang(o.prize)} บาท</span>
                  ) : (
                    <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-navy-700/50 text-navy-300 border border-navy-600">ไม่ถูก</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* แถบปุ่มเดียว — action เดียวต่อสถานะ: ซื้อบัตรเพิ่ม / เล่นบัตรรอ / ซื้อใหม่ (ไม่ซ้ำกับ SPIN ในตู้) */}
      <div className="instant-betbar px-4">
        <div className="max-w-3xl mx-auto">
          {canSpin ? (
            <button onClick={buy} disabled={busy || balance < price}
              className="w-full rounded-xl bg-gradient-to-r from-gold-500 to-amber-500 text-navy-950 font-black py-3.5 text-sm tracking-wide shadow-lg shadow-gold-500/30 hover:brightness-105 transition disabled:opacity-50 active:scale-[0.98]">
              {busy ? 'กำลังซื้อ...' : `＋ ซื้อบัตรเพิ่ม ${satang(price)} บาท`}
            </button>
          ) : nextHidden ? (
            <button onClick={() => openCard(nextHidden)}
              className="w-full rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-navy-950 font-black py-3.5 text-sm tracking-wide shadow-lg shadow-amber-500/30 hover:brightness-105 transition active:scale-[0.98]">
              ▶ เล่นบัตรที่รอสปิน ({hidden.length} ใบ)
            </button>
          ) : (
            <button onClick={buy} disabled={busy || balance < price}
              className="w-full rounded-xl bg-gradient-to-r from-gold-500 to-amber-500 text-navy-950 font-black py-3.5 text-sm tracking-wide shadow-lg shadow-gold-500/30 hover:brightness-105 transition disabled:opacity-50 active:scale-[0.98]">
              {busy ? 'กำลังเล่น...' : `🎰 เล่นเกม ${satang(price)} บาท`}
            </button>
          )}
          <div className="text-center text-[10px] text-navy-400 mt-1.5">เครดิต {satang(balance)} บาท • 20 เพย์ไลน์ • ผลคำนวณฝั่ง server</div>
        </div>
      </div>
    </div>
  );
}

function RevealResult({ outcome, balance, slipRef }) {
  if (!outcome) return null;
  const win = outcome.win;
  return (
    <div className={`rounded-2xl border-2 p-5 text-center ${win ? 'border-green-500/60 bg-green-500/10' : 'border-navy-600 bg-navy-900/60'}`}>
      {win ? (
        <>
          <div className="text-5xl mb-2 animate-coin">🎉🏆</div>
          <div className="text-xl font-bold text-green-400">ถูกรางวัล!</div>
          <div className="text-3xl font-black text-gold-300 coin-gold-bright mt-1">+{satang(outcome.prize)} บาท</div>
          <div className="text-sm text-navy-300 mt-1">
            {outcome.lines?.length > 1
              ? `ถูก ${outcome.lines.length} เพย์ไลน์ — สูงสุด ${outcome.symbol} ${outcome.name || SYMBOL_INFO[outcome.symbol] || ''}`
              : `${outcome.symbol} ${outcome.name || SYMBOL_INFO[outcome.symbol] || ''} ซ้ำ ${outcome.lines?.[0]?.count || 3} รีล`}
          </div>
          {balance !== undefined && <div className="text-xs text-navy-400 mt-2">เครดิตคงเหลือ {satang(balance)} บาท</div>}
        </>
      ) : (
        <>
          <div className="text-4xl mb-2">😢</div>
          <div className="text-lg font-bold text-navy-300">ไม่ถูกรางวัลรอบนี้</div>
          <div className="text-xs text-navy-400 mt-1">ลองเล่นเกมใหม่ — ดวงมาแล้วถูกใหญ่!</div>
        </>
      )}
    </div>
  );
}
