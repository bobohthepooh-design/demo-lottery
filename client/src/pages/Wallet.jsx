import { useEffect, useState } from 'react';
import { api, satang, bahtToSatang } from '../api.js';
import { useAuth } from '../auth.jsx';

const TYPE_TH = {
  initial_credit: 'เครดิตเริ่มต้น', admin_adjust: 'ปรับเครดิต(+)', admin_debit: 'ปรับเครดิต(-)',
  bet_debit: 'หักเครดิตแทง', bet_refund: 'คืนเครดิต', win_credit: 'เงินรางวัล',
  deposit: 'เติมเครดิต', withdraw: 'ถอนเครดิต',
};

const PRESETS = [100, 500, 1000, 5000, 10000];

export default function Wallet() {
  const { balance, setBalance } = useAuth();
  const [txs, setTxs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // 'deposit' | 'withdraw' | null
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const load = () => api('/bets/wallet?limit=100').then(r => { setTxs(r.transactions); setBalance(r.balance); })
    .catch(() => {}).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const doAction = async () => {
    setErr('');
    const satangAmt = bahtToSatang(amount);
    if (!satangAmt || satangAmt < 100) return setErr('กรอกจำนวนเงินอย่างน้อย 1 บาท');
    if (satangAmt > 1000000) return setErr('สูงสุด 10,000 บาทต่อรายการ');
    if (modal === 'withdraw' && satangAmt > balance) return setErr('เครดิตไม่เพียงพอสำหรับการถอน');
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
        <div className="text-xs text-navy-400 mt-3">เครดิตเสมือนสำหรับ Demo เท่านั้น — ไม่สามารถแลกเป็นเงินจริงได้</div>
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
                  <td className="px-4 py-3 text-xs text-navy-300 whitespace-nowrap">{t.created_at}</td>
                  <td className="px-4 py-3 text-xs text-navy-300 max-w-[200px] truncate">{t.description || '—'}</td>
                </tr>
              ))}
              {!loading && !txs.length && <tr><td colSpan="6" className="px-4 py-8 text-center text-navy-400">ยังไม่มีธุรกรรม</td></tr>}
              {loading && <tr><td colSpan="6" className="px-4 py-8 text-center text-navy-400">กำลังโหลด...</td></tr>}
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
    </div>
  );
}
