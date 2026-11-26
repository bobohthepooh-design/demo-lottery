import { useEffect, useRef, useState } from 'react';
import { SkeletonCard } from '../components/Skeleton.jsx';
import EmptyState from '../components/EmptyState.jsx';
import { api, satang, fmtDateTime, newIdemKey } from '../api.js';
import { useAuth } from '../auth.jsx';
import { SymbolGrid } from '../components/ScratchCard.jsx';
import SlotMachine from '../components/SlotMachine.jsx';
import WinBurst from '../components/WinBurst.jsx';
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
// รูปย่อบัตรในลิสต์ — แสดง mini grid 3 แถว × 5 รีล ทั้งหมด (ไม่ใช่แค่แถวแรก)
const MiniGrid = ({ grid }) => !grid ? null : (
  <div className="grid grid-cols-5 gap-[2px]">
    {[...Array(15)].map((_, i) => (
      <span key={i} className="w-4 h-4 rounded-[3px] bg-navy-900 border border-navy-600 flex items-center justify-center text-[10px] leading-none">{grid[i] || '❓'}</span>
    ))}
  </div>
);

export default function Scratch() {
  const { user, balance, setBalance } = useAuth();
  const [cards, setCards] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [active, setActive] = useState(null);   // card กำลังเล่น
  const [result, setResult] = useState(null);   // outcome หลัง reveal
  const [busy, setBusy] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [reelsDone, setReelsDone] = useState(false);
  const [spinKey, setSpinKey] = useState(0);     // เพิ่ม = เริ่มหมุนรีล
  const [err, setErr] = useState('');
  const [showAllCards, setShowAllCards] = useState(false); // ประวัติแสดงแค่ 10 ล่าสุด — กดเพื่อดูทั้งหมด
  const [price, setPrice] = useState(5000); // สตางค์ — sync จาก server (admin ตั้งได้)
  const [prizes, setPrizes] = useState(DEFAULT_PRIZES); // ตารางรางวัลจาก server
  const [betClosed, setBetClosed] = useState(false); // admin ปิด blind mode/ซ่อนประเภท SC/ปิด rule — ปิดปุ่มซื้อใหม่
  const reelIcons = prizes.map(p => p.icon);

  const load = () => api('/scratch/mine').then(r => { setCards(r.cards); setLoaded(true); }).catch(() => setLoaded(true));
  const loadCfg = () => api('/lottery/public-config').then(r => {
    const p = r.instantGame?.scratchPrice;
    if (p) setPrice(p);
    if (Array.isArray(r.instantGame?.scratchPrizes) && r.instantGame.scratchPrizes.length) {
      setPrizes(r.instantGame.scratchPrizes);
    }
    const hidden = Array.isArray(r.hiddenBetTypes) ? r.hiddenBetTypes : [];
    setBetClosed(r.bettingMenuEnabled === false || hidden.includes('SC') || r.games?.scratch === false);
  }).catch(() => {});
  useEffect(() => {
    load(); loadCfg();
    // admin แก้ราคา/ตารางรางวัล → SSE ดันมา refetch ทันที
    const h = () => loadCfg();
    window.addEventListener('sys:update', h);
    return () => window.removeEventListener('sys:update', h);
  }, []);

  const buyIdem = useRef(null); // คง key เดิมจนกว่าจะสำเร็จ — retry/ดับเน็ตจะไม่ซื้อซ้ำ
  const buy = async () => {
    setErr(''); setBusy(true);
    if (!buyIdem.current) buyIdem.current = newIdemKey();
    try {
      const r = await api('/scratch/buy', { method: 'POST', body: { idempotencyKey: buyIdem.current } });
      buyIdem.current = null;
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

  // ยกเลิกบัตร hidden — คืนเครดิตเต็มจำนวน
  const cancelCard = async (e, c) => {
    e.stopPropagation();
    if (!confirm(`ยกเลิกบัตร ${c.slipRef}? เครดิตจะถูกคืนเต็มจำนวน`)) return;
    setErr('');
    try {
      const r = await api(`/scratch/${c.id}/cancel`, { method: 'POST' });
      setBalance(r.balance);
      setCards(cs => cs.map(x => x.id === c.id ? { ...x, status: 'cancelled' } : x));
      if (active?.id === c.id) { setActive(null); setResult(null); }
      load();
    } catch (e2) { setErr(e2.message); }
  };

  const hidden = cards.filter(c => c.status === 'hidden');
  const revealed = cards.filter(c => c.status === 'revealed');
  // ปุ่มหลัก — ตามสถานะบัตรที่เปิดอยู่
  const canSpin = active?.status === 'hidden' && !result && !spinning;
  const nextHidden = hidden.find(c => c.id !== active?.id) || hidden[0];

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* hero */}
      <div className="relative overflow-hidden rounded-3xl p-6 sm:p-8 text-center luxury-card luxury-card-gold-border">
        <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-[var(--gold-gradient-start)] to-[var(--gold-gradient-end)]" />
        <div className="casino-chip w-10 h-10 sm:w-14 sm:h-14 absolute animate-[spin_8s_linear_infinite]" style={{ bottom: '-4%', right: '6%', background: 'radial-gradient(circle at 35% 30%, #fff3c4, #e2a812 60%, #92600a)', animationDelay: '1s' }} />
        <div className="text-5xl mb-2 animate-float">🎰</div>
        <h1 className="font-display font-bold text-2xl sm:text-3xl luxury-gradient-text">สล็อต</h1>
        <p className="text-sm mt-1 text-[var(--muted-gray)]">เล่นเกม → กดสปิน → 5 รีลหมุนหยุดทีละตัว → รู้ผลทันที!</p>
        <div className="flex flex-col items-center gap-3 mt-4">
          <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl border bg-gradient-to-r from-[rgba(212,175,55,0.15)] via-[rgba(212,175,55,0.05)] to-[rgba(212,175,55,0.15)] border-[var(--border-gold)] shadow-[var(--shadow-gold)]">
            <span className="text-sm">💰</span>
            <span className="text-xs font-semibold text-[var(--gold-primary)]">ราคาต่อใบ</span>
            <span className="font-display font-bold text-2xl text-[var(--gold-bright)]">{satang(price)} <span className="text-sm">บาท</span></span>
          </div>
          <div className="flex items-center justify-center gap-3 text-[11px] flex-wrap text-[var(--muted-gray)]">
            {prizes.map(p => <span key={p.icon} className="inline-flex items-center gap-0.5">{p.icon} <b>{p.name}</b> {p.max && p.max !== p.prize ? `${satang(p.prize)}–${satang(p.max)}` : satang(p.prize)} บาท</span>)}
          </div>
        </div>
        <p className="text-[11px] mt-2 text-[var(--dark-gray)]">ถูกเมื่อสัญลักษณ์เดิมซ้ำกันติดกันตั้งแต่รีลซ้ายอย่างน้อย 3 รีล บน 20 เพย์ไลน์ใดก็ได้ • จ่ายรวมทุกเส้นที่ถูก • เครดิตเสมือนสำหรับ Demo</p>
      </div>

      {/* buy + active card */}
      <div className="luxury-card p-5">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <div>
            <div className="font-bold text-[var(--white)]">บัตรของคุณ</div>
            <div className="text-xs text-[var(--muted-gray)]">เครดิตคงเหลือ {satang(balance)} บาท • ปุ่มซื้อ/เล่นอยู่ด้านล่าง</div>
          </div>
        </div>
        {err && <div className="text-sm mb-3 text-[var(--danger-red)]">{err}</div>}
        {balance < price && (
          <div className="text-xs rounded-lg px-3 py-2 mb-3 bg-[rgba(245,158,11,0.1)] border border-[rgba(245,158,11,0.3)] text-[var(--warning-amber)]">
            เครดิตไม่พอ — <a href="/wallet?action=deposit" className="underline font-semibold">เติมเครดิต</a> ก่อนนะ
          </div>
        )}

        {active && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-xs font-mono text-[var(--muted-gray)]">โพย {active.slipRef} • {fmtDateTime(active.createdAt)}</div>
              <button onClick={() => { setActive(null); setResult(null); }} className="text-xs transition text-[var(--muted-gray)]">ปิด</button>
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
                <p className="text-center text-[11px] text-[var(--muted-gray)]">กด SPIN บนตู้ 1 ครั้งต่อบัตร — ผลถูกกำหนดฝั่ง server แล้ว เครดิตตัดตอนซื้อ</p>
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

        {!loaded && <><SkeletonCard /><SkeletonCard /></>}
        {!active && loaded && !cards.length && !busy && (
          <div className="text-center py-8 text-[var(--muted-gray)]">
            <div className="text-4xl mb-2">🎰</div>
            ยังไม่มีเกม — กดปุ่ม "เล่นเกม" ด้านล่างเพื่อเริ่มสปินเลย!
          </div>
        )}
      </div>

      {/* ปุ่มเดิมพัน — วางก่อนประวัติบัตรให้เห็นก่อนเสมอ */}
      <div className="luxury-card p-3">
        {betClosed && !nextHidden ? (
          <div className="text-center text-xs font-bold py-2 text-[var(--muted-gray)]">🎰 สล็อตปิดให้บริการชั่วคราวโดยผู้ดูแล</div>
        ) : canSpin ? (
          <button onClick={buy} disabled={busy || balance < price || betClosed}
            className="w-full luxury-btn font-black py-3 text-sm tracking-wide disabled:opacity-50 active:scale-[0.98]">
            {busy ? 'กำลังซื้อ...' : `＋ ซื้อบัตรเพิ่ม ${satang(price)} บาท`}
          </button>
        ) : nextHidden ? (
          <button onClick={() => openCard(nextHidden)}
            className="w-full luxury-btn font-black py-3 text-sm tracking-wide active:scale-[0.98]">
            ▶ เล่นบัตรที่รอสปิน ({hidden.length} ใบ)
          </button>
        ) : (
          <button onClick={buy} disabled={busy || balance < price || betClosed}
            className="w-full luxury-btn font-black py-3 text-sm tracking-wide disabled:opacity-50 active:scale-[0.98]">
            {busy ? 'กำลังเล่น...' : betClosed ? 'ปิดให้บริการชั่วคราว' : `🎰 เล่นเกม ${satang(price)} บาท`}
          </button>
        )}
      </div>

      {/* my cards — แสดงแค่ 10 รายการล่าสุด ที่เหลือซ่อนไว้ */}
      {cards.length > 0 && (
        <div className="luxury-card overflow-hidden">
          <div className="px-5 py-4 border-b font-bold flex items-center gap-2 border-[var(--border-light)] text-[var(--white)]">
            📋 บัตรสล็อตของฉัน
            {hidden.length > 0 && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full luxury-badge-gold">รอสปิน {hidden.length}</span>}
          </div>
          <div className="divide-y divide-[var(--border-light)]">
            {(showAllCards ? cards : cards.slice(0, 10)).map(c => {
              const o = c.outcome;
              const isWin = o?.win;
              return (
                <div key={c.id} role="button" tabIndex={0}
                  onClick={() => openCard(c)} onKeyDown={e => e.key === 'Enter' && openCard(c)}
                  className="w-full flex items-center gap-3 px-5 py-3 text-left cursor-pointer transition hover:bg-navy-700/40">
                  <MiniGrid grid={c.grid} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-mono text-[var(--light-gray)]">{c.slipRef}</div>
                    <div className="text-[11px] text-[var(--muted-gray)]">{fmtDateTime(c.createdAt)}</div>
                  </div>
                  {c.status === 'hidden' ? (
                    <span className="flex items-center gap-2">
                      <span className="text-[11px] font-bold px-2.5 py-1 rounded-full luxury-badge-gold">รอสปิน</span>
                      <span role="button" tabIndex={0}
                        onClick={e => cancelCard(e, c)}
                        onKeyDown={e => { if (e.key === 'Enter') { e.stopPropagation(); cancelCard(e, c); } }}
                        className="text-[10px] font-bold px-2 py-1 rounded-full luxury-badge-danger transition cursor-pointer">ยกเลิก</span>
                    </span>
                  ) : c.status === 'cancelled' ? (
                    <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-[var(--bg-dark-surface)] text-[var(--muted-gray)] border border-[var(--border-light)]">ยกเลิก</span>
                  ) : isWin ? (
                    <span className="text-[11px] font-bold px-2.5 py-1 rounded-full luxury-badge-success">ถูก {o.symbol} +{satang(o.prize)} บาท</span>
                  ) : (
                    <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-[var(--bg-dark-surface)] text-[var(--muted-gray)] border border-[var(--border-light)]">ไม่ถูก</span>
                  )}
                </div>
              );
            })}
          </div>
          {cards.length > 10 && (
            <button onClick={() => setShowAllCards(v => !v)}
              className="w-full py-2.5 text-xs font-bold transition hover:bg-navy-700/40 border-t border-[var(--border-light)] text-[var(--gold-primary)]">
              {showAllCards ? '▴ ย่อแสดง 10 รายการล่าสุด' : `▾ แสดงทั้งหมด (${cards.length} รายการ)`}
            </button>
          )}
        </div>
      )}

    </div>
  );
}

function RevealResult({ outcome, balance, slipRef }) {
  if (!outcome) return null;
  const win = outcome.win;
  return (
    <div className={`relative rounded-2xl border-2 p-5 text-center overflow-visible ${win ? 'luxury-card-gold-border' : 'luxury-card'}`}>
      {win && <WinBurst />}
      {win ? (
        <>
          <div className="text-5xl mb-2 animate-coin">🎉🏆</div>
          <div className="text-xl font-bold text-[var(--success-green)]">ถูกรางวัล!</div>
          <div className="text-3xl font-black mt-1 text-[var(--gold-bright)]">+{satang(outcome.prize)} บาท</div>
          <div className="text-sm mt-1 text-[var(--muted-gray)]">
            {outcome.lines?.length > 0 && (
              <div className="text-[11px] mb-0.5 text-[var(--gold-primary)]">
                เพย์ไลน์ที่ถูก: {outcome.lines.map(l => `#${l.line}`).join(', ')}
              </div>
            )}
            {outcome.lines?.length > 1
              ? `ถูก ${outcome.lines.length} เพย์ไลน์ — สูงสุด ${outcome.symbol} ${outcome.name || SYMBOL_INFO[outcome.symbol] || ''}`
              : `${outcome.symbol} ${outcome.name || SYMBOL_INFO[outcome.symbol] || ''} ซ้ำ ${outcome.lines?.[0]?.count || 3} รีล`}
          </div>
          {balance !== undefined && <div className="text-xs mt-2 text-[var(--muted-gray)]">เครดิตคงเหลือ {satang(balance)} บาท</div>}
        </>
      ) : (
        <>
          <div className="text-4xl mb-2">😢</div>
          <div className="text-lg font-bold text-[var(--muted-gray)]">ไม่ถูกรางวัลรอบนี้</div>
          <div className="text-xs mt-1 text-[var(--dark-gray)]">ลองเล่นเกมใหม่ — ดวงมาแล้วถูกใหญ่!</div>
        </>
      )}
    </div>
  );
}
