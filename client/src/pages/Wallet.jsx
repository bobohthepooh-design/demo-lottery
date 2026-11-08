import { useEffect, useState } from 'react';
import { api, satang } from '../api.js';
import { useAuth } from '../auth.jsx';

const TYPE_TH = {
  initial_credit: 'เครดิตเริ่มต้น', admin_adjust: 'ปรับเครดิต(+)', admin_debit: 'ปรับเครดิต(-)',
  bet_debit: 'หักเครดิตแทง', bet_refund: 'คืนเครดิต', win_credit: 'เงินรางวัล',
};

export default function Wallet() {
  const { balance, setBalance } = useAuth();
  const [txs, setTxs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api('/bets/wallet?limit=100').then(r => { setTxs(r.transactions); setBalance(r.balance); })
      .catch(() => {}).finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="bg-gradient-to-br from-navy-800 to-navy-900 border border-gold-500/40 rounded-2xl p-8 text-center">
        <div className="text-sm text-navy-300">ยอดเครดิตจำลองคงเหลือ</div>
        <div className="text-5xl font-bold text-gold-400 mt-2">฿{satang(balance)}</div>
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
    </div>
  );
}
