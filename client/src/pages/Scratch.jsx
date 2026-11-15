import { useEffect, useState } from 'react';
import { api, satang, fmtDateTime } from '../api.js';
import { useAuth } from '../auth.jsx';
import ScratchCard, { SymbolGrid } from '../components/ScratchCard.jsx';
import FairnessNote from '../components/Fairness.jsx';
import { sfx } from '../sound.js';

// ชื่อสัญลักษณ์ภาษาไทย — ใช้เมื่อ outcome เก่าใน DB ไม่มี field name (ตอนนี้ server ส่ง name มาใน outcome แล้ว)
const SYMBOL_INFO = {
  '🍒': 'เชอร์รี่', '🍋': 'เลมอน', '🔔': 'กระดิ่ง', '⭐': 'ดาว', '💎': 'เพชร',
};

// รางวัลเริ่มต้นก่อน config โหลด (ตรงกับ default ฝั่ง server — จะถูกแทนที่ด้วยข้อมูลจริงจาก /lottery/public-config)
const DEFAULT_PRIZES = [
  { icon: '🍒', name: 'เชอร์รี่', prize: 7500 },
  { icon: '🍋', name: 'เลมอน', prize: 12500 },
  { icon: '🔔', name: 'กระดิ่ง', prize: 25000 },
  { icon: '⭐', name: 'ดาว', prize: 75000 },
  { icon: '💎', name: 'เพชร', prize: 250000 },
];

export default function Scratch() {
  const { user, balance, setBalance } = useAuth();
  const [cards, setCards] = useState([]);
  const [active, setActive] = useState(null);   // card กำลังขูด
  const [result, setResult] = useState(null);   // outcome หลัง reveal
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [price, setPrice] = useState(5000); // สตางค์ — sync จาก server (admin ตั้งได้)
  const [prizes, setPrizes] = useState(DEFAULT_PRIZES); // ตารางรางวัลจาก server

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
      sfx.chip();
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  const onScratched = async () => {
    if (!active || active.status !== 'hidden') return;
    try {
      const r = await api(`/scratch/${active.id}/reveal`, { method: 'POST' });
      setBalance(r.balance);
      setResult(r);
      sfx.scratch();
      if (r.outcome?.win) setTimeout(() => sfx.win(), 500); else setTimeout(() => sfx.lose(), 500);
      setCards(cs => cs.map(c => c.id === active.id ? { ...c, status: 'revealed', outcome: r.outcome, fairness: r.fairness ?? c.fairness } : c));
    } catch (e) { setErr(e.message); }
  };

  const openCard = (c) => { setActive(c); setResult(c.status === 'revealed' ? c : null); };

  const hidden = cards.filter(c => c.status === 'hidden');
  const revealed = cards.filter(c => c.status === 'revealed');

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* hero */}
      <div className="relative overflow-hidden rounded-3xl border-2 border-gold-500/60 bg-gradient-to-br from-navy-800 via-navy-900 to-navy-950 p-6 sm:p-8 text-center">
        <div className="hr-shine absolute top-0 inset-x-0 h-1.5" />
        <span className="casino-sparkle text-xl" style={{ top: '18%', left: '8%', animationDelay: '0.3s' }}>✦</span>
        <span className="casino-sparkle text-sm" style={{ top: '30%', right: '10%', animationDelay: '1.4s' }}>✧</span>
        <span className="casino-sparkle text-lg" style={{ bottom: '26%', left: '14%', animationDelay: '2.2s' }}>✦</span>
        <span className="casino-sparkle text-sm" style={{ bottom: '34%', right: '8%', animationDelay: '0.9s' }}>✦</span>
        <div className="casino-chip w-10 h-10 sm:w-14 sm:h-14" style={{ bottom: '-4%', right: '6%', background: 'radial-gradient(circle at 35% 30%, #fca5a5, #dc2626 60%, #7f1d1d)', animationDelay: '1s' }} />
        <div className="text-5xl mb-2 animate-float">🎫</div>
        <h1 className="font-display font-bold text-2xl sm:text-3xl text-gold-300">หวยขูด Match-3</h1>
        <p className="text-sm text-navy-300 mt-1">ซื้อบัตร → ขูดด้วยนิ้ว → รู้ผลทันที!</p>
        <div className="flex items-center justify-center gap-4 mt-4 text-xs text-navy-300 flex-wrap">
          <span>💰 ราคา <b className="text-gold-300">฿{satang(price)}</b>/ใบ</span>
          {prizes.map(p => <span key={p.icon}>{p.icon} ฿{satang(p.prize)}</span>)}
        </div>
        <p className="text-[11px] text-navy-400 mt-2">ถูกเมื่อสัญลักษณ์ใดสัญลักษณ์หนึ่งปรากฏครบ 3 ช่อง • เครดิตเสมือนสำหรับ Demo</p>
      </div>

      {/* buy + active card */}
      <div className="bg-navy-800 border border-navy-700 rounded-2xl p-5">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <div>
            <div className="font-bold text-white">บัตรของคุณ</div>
            <div className="text-xs text-navy-400">เครดิตคงเหลือ ฿{satang(balance)}</div>
          </div>
          <button onClick={buy} disabled={busy || balance < price}
            className="bg-gold-500 text-navy-950 font-bold px-6 py-2.5 rounded-xl hover:brightness-105 disabled:opacity-50">
            {busy ? 'กำลังซื้อ...' : `ซื้อบัตร ฿${satang(price)}`}
          </button>
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
                <div className="max-w-[300px] mx-auto">
                  <ScratchCard grid={active.grid} onComplete={onScratched} />
                </div>
                <p className="text-center text-xs text-navy-400">👆 ลากนิ้วหรือเมาส์ขูดบริเวณสีเงิน — ขูดประมาณ 1/3 บัตรจะเปิดเผยผลอัตโนมัติ</p>
                <div className="text-center">
                  <button onClick={onScratched}
                    className="text-xs text-navy-300 underline underline-offset-2 hover:text-gold-300">
                    ขูดไม่สะดวก? กดเพื่อเปิดเผยเลย
                  </button>
                </div>
              </>
            )}

            {(active.status === 'revealed' || result) && (
              <>
                {/* บัตรที่ขูดเปิดแล้ว — สัญลักษณ์ยังอยู่ให้ดูย้อนไปได้ */}
                <div className="max-w-[300px] mx-auto">
                  <SymbolGrid grid={active.grid} />
                </div>
                <RevealResult outcome={result?.outcome || active.outcome} balance={result?.balance} slipRef={active.slipRef} />
              </>
            )}
          </div>
        )}

        {!active && !cards.length && !busy && (
          <div className="text-center py-8 text-navy-400">
            <div className="text-4xl mb-2">🎰</div>
            ยังไม่มีบัตร — กด "ซื้อบัตร ฿{satang(price)}" เพื่อเริ่มขูดเลย!
          </div>
        )}
      </div>

      {/* my cards */}
      {cards.length > 0 && (
        <div className="bg-navy-800 border border-navy-700 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-navy-700 font-bold text-white flex items-center gap-2">
            📋 บัตรขูดของฉัน
            {hidden.length > 0 && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40">รอขูด {hidden.length}</span>}
          </div>
          <div className="divide-y divide-navy-700">
            {cards.map(c => {
              const o = c.outcome;
              const isWin = o?.win;
              return (
                <button key={c.id} onClick={() => openCard(c)}
                  className="w-full flex items-center gap-3 px-5 py-3 hover:bg-navy-700/40 text-left">
                  <div className="flex -space-x-1">
                    {c.grid.slice(0, 3).map((s, i) => (
                      <span key={i} className="w-8 h-8 rounded-lg bg-navy-900 border border-navy-600 flex items-center justify-center text-lg">{s}</span>
                    ))}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-mono text-navy-300">{c.slipRef}</div>
                    <div className="text-[11px] text-navy-400">{fmtDateTime(c.createdAt)}</div>
                  </div>
                  {c.status === 'hidden' ? (
                    <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/40">รอขูด</span>
                  ) : isWin ? (
                    <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-green-500/15 text-green-300 border border-green-500/40">ถูก {o.symbol} +฿{satang(o.prize)}</span>
                  ) : (
                    <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-navy-700/50 text-navy-300 border border-navy-600">ไม่ถูก</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
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
          <div className="text-3xl font-black text-gold-300 coin-gold-bright mt-1">+฿{satang(outcome.prize)}</div>
          <div className="text-sm text-navy-300 mt-1">
            {outcome.symbol} {outcome.name || SYMBOL_INFO[outcome.symbol] || ''} ×{outcome.count}
          </div>
          {balance !== undefined && <div className="text-xs text-navy-400 mt-2">เครดิตคงเหลือ ฿{satang(balance)}</div>}
        </>
      ) : (
        <>
          <div className="text-4xl mb-2">😢</div>
          <div className="text-lg font-bold text-navy-300">ไม่ถูกรางวัลรอบนี้</div>
          <div className="text-xs text-navy-400 mt-1">ลองซื้อบัตรใหม่ — ดวงมาแล้วถูกใหญ่!</div>
        </>
      )}
    </div>
  );
}
