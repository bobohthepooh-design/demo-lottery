import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, satang, bahtToSatang, fmtDateTime } from '../api.js';
import { useAuth } from '../auth.jsx';

const TYPE_TH = {
  initial_credit: 'เครดิตฟรี', admin_adjust: 'ปรับเครดิต(+)', admin_debit: 'ปรับเครดิต(-)',
  bet_debit: 'หักเครดิตแทง', bet_refund: 'คืนเครดิต', win_credit: 'เงินรางวัล',
  deposit: 'เติมเครดิต', withdraw: 'ถอนเครดิต',
};

const PRESETS = [100, 500, 1000, 5000, 10000];

export default function Wallet() {
  const { balance, setBalance } = useAuth();
  const [txs, setTxs] = useState([]);
  const [wd, setWd] = useState(null); // { deposited, won, withdrawn, withdrawable, unlocked }
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // 'deposit' | 'withdraw' | null
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [celebration, setCelebration] = useState(null); // { kind:'win'|'lose', slip }

  const [params, setParams] = useSearchParams();
  const load = () => api('/bets/wallet?limit=100').then(r => { setTxs(r.transactions); setBalance(r.balance); setWd(r.withdrawable || null); })
    .catch(() => {}).finally(() => setLoading(false));
  useEffect(() => {
    // ?action=deposit|withdraw — เปิด modal จากปุ่มลัดหน้าแรก
    const act = params.get('action');
    if (act === 'deposit' || act === 'withdraw') {
      setModal(act); setAmount(''); setErr('');
      setParams({}, { replace: true });
    }
    load();
    // ดึงโพยล่าสุดที่ออกผลแล้วมาแสดงอารมณ์ถูก/ไม่ถูก
    api('/bets/mine?limit=10').then(r => {
      const s = (r.slips || []).find(x => ['won', 'lost', 'partial'].includes(x.status));
      // แสดงครั้งเดียวต่อโพยต่อ session เพื่อไม่ให้รบกวนทุกครั้งที่เปิดหน้า
      if (s && sessionStorage.getItem(`celebrated-${s.slip_ref}`) !== '1') {
        sessionStorage.setItem(`celebrated-${s.slip_ref}`, '1');
        setCelebration({ kind: s.status === 'lost' ? 'lose' : 'win', slip: s });
      }
    }).catch(() => {});
  }, []);

  const doAction = async () => {
    setErr('');
    const satangAmt = bahtToSatang(amount);
    if (!satangAmt || satangAmt < 100) return setErr('กรอกจำนวนเงินอย่างน้อย 1 บาท');
    if (satangAmt > 1000000) return setErr('สูงสุด 10,000 บาทต่อรายการ');
    if (modal === 'withdraw') {
      if (wd && !wd.unlocked) return setErr('ต้องเติมเครดิตขั้นต่ำ ฿100 ก่อนจึงจะสามารถถอนเงินได้');
      if (wd && satangAmt > wd.withdrawable) return setErr(`ถอนได้สูงสุด ฿${satang(wd.withdrawable)} (เฉพาะเงินรางวัล)`);
    }
    setBusy(true);
    try {
      const r = await api('/bets/wallet/action', { method: 'POST', body: { direction: modal, amount: satangAmt } });
      setBalance(r.balance);
      setModal(null); setAmount('');
      load();
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="bg-gradient-to-br from-navy-800 to-navy-900 border border-gold-500/40 rounded-2xl p-8 text-center">
        <div className="text-sm text-navy-300">ยอดเครดิตจำลองคงเหลือ</div>
        <div className="text-5xl font-bold text-gold-400 mt-2">฿{satang(balance)}</div>
        <div className="flex items-center justify-center gap-3 mt-5 flex-wrap">
          <button onClick={() => { setModal('deposit'); setAmount(''); setErr(''); }}
            className="bg-gold-500 text-navy-950 font-bold px-6 py-2.5 rounded-xl hover:bg-gold-400 transition">
            ＋ เติมเครดิต
          </button>
          <button onClick={() => { setModal('withdraw'); setAmount(''); setErr(''); }}
            className="border border-navy-500 text-navy-200 font-semibold px-6 py-2.5 rounded-xl hover:bg-navy-700 transition">
            － ถอนเครดิต
          </button>
        </div>
        {wd && (
          <div className={`text-xs mt-3 ${wd.unlocked ? 'text-green-400' : 'text-amber-300'}`}>
            {wd.unlocked
              ? wd.override
                ? balance < 5000
                  ? `✅ ได้รับอนุญาตให้ถอนจากแอดมิน — แต่ยอดคงเหลือ ฿${satang(balance)} ต่ำกว่า ฿50 ถอนไม่ได้`
                  : `✅ ได้รับอนุญาตให้ถอนจากแอดมิน — ถอนได้เต็มยอด ฿${satang(wd.withdrawable)}`
                : `✅ ถอนได้ ฿${satang(wd.withdrawable)} (จากเงินรางวัล)`
              : `🔒 ถอนเงินได้หลังเติมเครดิตครบ ฿100 — เติมแล้ว ฿${satang(wd.deposited)}`}
          </div>
        )}
        <div className="text-xs text-navy-400 mt-2">เครดิตเสมือนสำหรับ Demo เท่านั้น — ไม่สามารถแลกเป็นเงินจริงได้</div>
      </div>

      <div className="bg-navy-800 border border-navy-700 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-navy-700 font-bold text-white">ประวัติธุรกรรมเครดิต</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[620px]">
            <thead className="bg-navy-900 text-navy-300 text-xs">
              <tr><th className="text-left px-4 py-3">อ้างอิง</th><th className="text-left px-4 py-3">ประเภท</th><th className="text-right px-4 py-3">จำนวน</th><th className="text-right px-4 py-3">คงเหลือหลังรายการ</th><th className="text-left px-4 py-3">เวลา</th><th className="text-left px-4 py-3">รายละเอียด</th></tr>
            </thead>
            <tbody className="divide-y divide-navy-700">
              {txs.map(t => (
                <tr key={t.id} className="hover:bg-navy-700/40">
                  <td className="px-4 py-3 font-mono text-xs text-navy-300">{t.reference}</td>
                  <td className="px-4 py-3 text-white">{TYPE_TH[t.type] || t.type}</td>
                  <td className={`px-4 py-3 text-right font-bold ${t.direction === 'credit' ? 'text-green-400' : 'text-red-400'}`}>
                    {t.direction === 'credit' ? '+' : '−'}฿{satang(t.amount)}
                  </td>
                  <td className="px-4 py-3 text-right text-gold-300">฿{satang(t.balance_after)}</td>
                  <td className="px-4 py-3 text-xs text-navy-300 whitespace-nowrap">{fmtDateTime(t.created_at)}</td>
                  <td className="px-4 py-3 text-xs text-navy-300 max-w-[200px] truncate">{t.description || '—'}</td>
                </tr>
              ))}
              {!loading && !txs.length && <tr><td colSpan="6" className="px-4 py-8 text-center"><span className="text-3xl">📭</span><div className="text-navy-300 mt-1">ยังไม่มีธุรกรรม — เติมเครดิตเพื่อเริ่มใช้งาน</div></td></tr>}
              {loading && <tr><td colSpan="6" className="px-4 py-4"><div className="space-y-2">{[0,1,2,3].map(i => <div key={i} className="skeleton h-8 w-full" />)}</div></td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* modal เติม/ถอนเครดิต */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => !busy && setModal(null)}>
          <div className="bg-navy-800 border border-gold-500/40 rounded-2xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-white mb-1">{modal === 'deposit' ? '💰 เติมเครดิตจำลอง' : '💸 ถอนเครดิตจำลอง'}</h2>
            <p className="text-xs text-navy-400 mb-4">ยอดคงเหลือปัจจุบัน ฿{satang(balance)} • สำหรับ Demo เท่านั้น</p>
            {modal === 'withdraw' && wd && (
              <div className={`text-xs rounded-lg px-3 py-2 mb-3 ${wd.unlocked ? 'bg-green-500/10 text-green-300' : 'bg-amber-500/10 text-amber-300'}`}>
                {wd.unlocked
                  ? wd.override
                    ? balance < 5000
                      ? `ได้รับอนุญาตจากแอดมินแล้ว แต่ยอดคงเหลือ ฿${satang(balance)} ต่ำกว่า ฿50 — ถอนไม่ได้`
                      : `ถอนได้เต็มยอด ฿${satang(wd.withdrawable)} — ได้รับอนุญาตจากแอดมิน`
                    : `ถอนได้สูงสุด ฿${satang(wd.withdrawable)} — เฉพาะเงินรางวัลจากการถูกหวย (เครดิตโปรโมชั่น/เงินฝากถอนไม่ได้)`
                  : `ยังถอนไม่ได้ — ต้องเติมเครดิตขั้นต่ำ ฿100 ก่อน (เติมแล้ว ฿${satang(wd.deposited)})`}
              </div>
            )}
            <div className="text-xs text-navy-400 mb-1.5">เลือกจำนวนเงินที่ต้องการ{modal === 'deposit' ? 'เติม' : 'ถอน'}:</div>
            <div className="grid grid-cols-3 gap-2 mb-3">
              {PRESETS.map(p => (
                <button key={p} type="button" onClick={() => setAmount(String(p))}
                  className={`py-2.5 rounded-lg text-sm font-bold border transition ${Number(amount) === p ? 'bg-gold-500 text-navy-950 border-gold-400' : 'bg-navy-700 border-navy-600 text-navy-200 hover:border-gold-500/60 hover:text-gold-300'}`}>
                  ฿{p.toLocaleString()}
                </button>
              ))}
            </div>
            <div className="text-xs text-navy-400 mb-1.5">หรือกรอกจำนวนเอง (ขั้นต่ำ ฿1 สูงสุด ฿10,000):</div>
            <input value={amount} onChange={e => setAmount(e.target.value.replace(/[^\d.]/g, ''))}
              inputMode="decimal" placeholder="0.00" autoFocus
              className="w-full bg-navy-900 border border-navy-600 rounded-lg px-4 py-3 text-xl text-center text-gold-300 focus:outline-none focus:border-gold-500" />
            {err && <div className="text-red-400 text-sm mt-2">{err}</div>}
            <div className="flex gap-3 mt-5">
              <button onClick={() => setModal(null)} disabled={busy}
                className="flex-1 border border-navy-600 text-navy-200 py-2.5 rounded-lg hover:bg-navy-700 disabled:opacity-40">
                ยกเลิก
              </button>
              <button onClick={doAction} disabled={busy}
                className={`flex-1 font-bold py-2.5 rounded-lg disabled:opacity-40 ${modal === 'deposit' ? 'bg-gold-500 text-navy-950 hover:bg-gold-400' : 'bg-red-500/80 text-white hover:bg-red-500'}`}>
                {busy ? 'กำลังดำเนินการ...' : modal === 'deposit' ? 'ยืนยันเติมเครดิต' : 'ยืนยันถอนเครดิต'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* overlay ฉลอง/เสียใจผลโพยล่าสุด */}
      {celebration && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 p-4 overflow-hidden">
          {celebration.kind === 'win' ? (
            <>
              {Array.from({ length: 40 }).map((_, i) => (
                <span key={i} className="confetti-piece"
                  style={{
                    left: `${(i * 37) % 100}%`,
                    background: ['#d4af37', '#22c55e', '#f472b6', '#60a5fa', '#fbbf24', '#a78bfa'][i % 6],
                    animationDuration: `${2.2 + (i % 5) * 0.5}s`,
                    animationDelay: `${(i % 10) * 0.18}s`,
                    borderRadius: i % 3 === 0 ? '50%' : '2px',
                  }} />
              ))}
            </>
          ) : (
            <>
              {Array.from({ length: 30 }).map((_, i) => (
                <span key={i} className="tear-drop"
                  style={{
                    left: `${(i * 41) % 100}%`,
                    animationDuration: `${1.8 + (i % 4) * 0.4}s`,
                    animationDelay: `${(i % 8) * 0.22}s`,
                  }} />
              ))}
            </>
          )}
          <div className={`relative bg-navy-800 border rounded-3xl p-8 max-w-sm w-full text-center animate-result-pop ${celebration.kind === 'win' ? 'border-gold-500/60 animate-win' : 'border-blue-500/40'}`}>
            {celebration.kind === 'win' ? (
              <>
                <div className="text-6xl animate-coin mb-2">🎉🏆</div>
                <h2 className="text-2xl font-bold text-gold-300 mb-1">ยินดีด้วย!</h2>
                <p className="text-sm text-navy-300 mb-3">โพย <span className="font-mono text-gold-300">{celebration.slip.slip_ref}</span> ถูกรางวัล</p>
                <div className="text-3xl font-bold text-green-400 animate-coin mb-1">+฿{satang(celebration.slip.total_payout)}</div>
                <p className="text-xs text-navy-400 mb-5">เงินรางวัลเข้ากระเป๋าเครดิตแล้ว — ถอนได้หลังปลดล็อก</p>
              </>
            ) : (
              <>
                <div className="text-6xl mb-2 animate-lose">😢💧</div>
                <h2 className="text-2xl font-bold text-blue-300 mb-1">เสียใจด้วย...</h2>
                <p className="text-sm text-navy-300 mb-3">โพย <span className="font-mono text-gold-300">{celebration.slip.slip_ref}</span> ไม่ถูกรางวัลรอบนี้</p>
                <div className="text-xl font-bold text-navy-300 mb-1">เสีย ฿{satang(celebration.slip.total_stake)}</div>
                <p className="text-xs text-navy-400 mb-5">เก็บเครดิตไว้ลองใหม่นะ — ห้องยังเปิดรับแทงทุกวัน</p>
              </>
            )}
            <button onClick={() => setCelebration(null)}
              className={`w-full font-bold py-3 rounded-xl ${celebration.kind === 'win' ? 'bg-gold-500 text-navy-950 hover:bg-gold-400' : 'bg-blue-600 text-white hover:bg-blue-500'}`}>
              {celebration.kind === 'win' ? 'รับทราบ ขอบคุณ! 🎊' : 'เป็นกำลังใจให้นะ 💙'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
