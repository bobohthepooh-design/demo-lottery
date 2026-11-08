import { useEffect, useState } from 'react';
import { api, satang } from '../api.js';

const TYPE_TH = {
  initial_credit: 'เครดิตเริ่มต้น', admin_adjust: 'ปรับเครดิต(+)', admin_debit: 'ปรับเครดิต(-)',
  bet_debit: 'หักเครดิตแทง', bet_refund: 'คืนเครดิต', win_credit: 'เงินรางวัล',
  deposit: 'สมาชิกเติมเครดิต', withdraw: 'สมาชิกถอนเครดิต',
};

const newKey = () => `adj-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export default function AdminWallet() {
  const [members, setMembers] = useState([]);
  const [txs, setTxs] = useState([]);
  const [form, setForm] = useState({ userId: '', amount: '', direction: 'credit', reason: '', idempotencyKey: newKey() });
  const [msg, setMsg] = useState('');

  const load = () => {
    api('/admin/members').then(r => setMembers(r.members)).catch(() => {});
    api('/admin/wallet/transactions?limit=100').then(r => setTxs(r.transactions)).catch(() => {});
  };
  useEffect(load, []);

  const submit = async (e) => {
    e.preventDefault(); setMsg('');
    try {
      const r = await api('/admin/wallet/adjust', { method: 'POST', body: {
        ...form, userId: Number(form.userId), amount: Math.round(parseFloat(form.amount) * 100),
      }});
      setMsg(`สำเร็จ — ref ${r.transaction.reference} • ยอดใหม่ ฿${satang(r.balance)}`);
      setForm({ userId: '', amount: '', direction: 'credit', reason: '', idempotencyKey: newKey() });
      load();
    } catch (e2) { setMsg('ERROR: ' + e2.message); }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">จัดการเครดิตเสมือน (Virtual Wallet)</h1>
      <form onSubmit={submit} className="bg-navy-800 border border-navy-700 rounded-xl p-5 grid sm:grid-cols-2 gap-3">
        <select required value={form.userId} onChange={e => setForm({...form, userId: e.target.value})} className="bg-navy-900 border border-navy-600 rounded-lg px-3 py-2.5">
          <option value="">— เลือกสมาชิก —</option>
          {members.map(m => <option key={m.id} value={m.id}>{m.username} (฿{satang(m.balance)})</option>)}
        </select>
        <input required type="number" step="0.01" min="0.01" placeholder="จำนวนเงิน (บาท)" value={form.amount} onChange={e => setForm({...form, amount: e.target.value})} className="bg-navy-900 border border-navy-600 rounded-lg px-3 py-2.5" />
        <select value={form.direction} onChange={e => setForm({...form, direction: e.target.value})} className="bg-navy-900 border border-navy-600 rounded-lg px-3 py-2.5">
          <option value="credit">เพิ่มเครดิต (+)</option><option value="debit">หักเครดิต (−)</option>
        </select>
        <input required placeholder="เหตุผล (บังคับ)" value={form.reason} onChange={e => setForm({...form, reason: e.target.value})} className="bg-navy-900 border border-navy-600 rounded-lg px-3 py-2.5" />
        <input placeholder="Idempotency key" value={form.idempotencyKey} onChange={e => setForm({...form, idempotencyKey: e.target.value})} className="bg-navy-900 border border-navy-600 rounded-lg px-3 py-2.5 font-mono text-xs" />
        <button className="bg-gold-500 text-navy-950 font-bold py-2.5 rounded-lg">ปรับเครดิต</button>
        {msg && <div className={`sm:col-span-2 text-sm rounded-lg p-3 ${msg.startsWith('ERROR') ? 'bg-red-500/10 text-red-300' : 'bg-green-500/10 text-green-300'}`}>{msg}</div>}
      </form>

      <div className="bg-navy-800 border border-navy-700 rounded-xl overflow-x-auto">
        <div className="px-5 py-4 border-b border-navy-700 font-bold text-white">ประวัติธุรกรรมทั้งหมด</div>
        <table className="w-full text-sm">
          <thead className="bg-navy-900 text-navy-300 text-xs">
            <tr><th className="text-left px-4 py-3">Ref</th><th className="text-left px-4 py-3">สมาชิก</th><th className="text-left px-4 py-3">ประเภท</th><th className="text-right px-4 py-3">จำนวน</th><th className="text-right px-4 py-3">คงเหลือ</th><th className="text-left px-4 py-3">เวลา</th><th className="text-left px-4 py-3">รายละเอียด</th></tr>
          </thead>
          <tbody className="divide-y divide-navy-700">
            {txs.map(t => (
              <tr key={t.id} className="hover:bg-navy-700/40">
                <td className="px-4 py-2 font-mono text-xs text-navy-300">{t.reference}</td>
                <td className="px-4 py-2 text-white">{t.username}</td>
                <td className="px-4 py-2 text-xs text-navy-300">{TYPE_TH[t.type] || t.type}</td>
                <td className={`px-4 py-2 text-right font-bold ${t.direction === 'credit' ? 'text-green-400' : 'text-red-400'}`}>{t.direction === 'credit' ? '+' : '−'}฿{satang(t.amount)}</td>
                <td className="px-4 py-2 text-right text-gold-300">฿{satang(t.balance_after)}</td>
                <td className="px-4 py-2 text-xs text-navy-300 whitespace-nowrap">{t.created_at}</td>
                <td className="px-4 py-2 text-xs text-navy-300 max-w-[200px] truncate">{t.description || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
