import { useEffect, useState } from 'react';
import { api, satang, fmtDateTime } from '../api.js';
import { Card, CardHeader, Button } from '../components/ui/index.js';

const STATUS_TH = { pending_slip: 'รอสลิป', pending_review: 'รอตรวจสอบ', approved: 'อนุมัติแล้ว', rejected: 'ปฏิเสธ' };

export default function AdminPayments() {
  const [rows, setRows] = useState([]);
  const [status, setStatus] = useState('pending_review');
  const [busy, setBusy] = useState(null);
  const [note, setNote] = useState({});
  const [msg, setMsg] = useState('');

  const load = () => api(`/admin/payments?status=${status}`).then(r => setRows(r.requests || [])).catch(e => setMsg(e.message));
  useEffect(() => { load(); }, [status]);

  const review = async (id, action) => {
    setBusy(id); setMsg('');
    try {
      const r = await api(`/admin/payments/${id}/review`, { method: 'POST', body: { action, note: note[id] || '' } });
      setMsg(action === 'approve' ? `✅ อนุมัติแล้ว${r.balance != null ? ` — ยอดใหม่ ${satang(r.balance)} บาท` : ''}` : 'ปฏิเสธแล้ว');
      load();
    } catch (e) { setMsg('❌ ' + e.message); }
    finally { setBusy(null); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-bold text-white">ชำระเงิน (เติม/ถอน)</h1>
        <div className="flex gap-2">
          {['pending_review', 'pending_slip', 'approved', 'rejected', 'all'].map(s => (
            <button key={s} onClick={() => setStatus(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold ${status === s ? 'bg-gold-500 text-navy-950' : 'bg-navy-700 text-navy-300'}`}>
              {s === 'all' ? 'ทั้งหมด' : STATUS_TH[s]}
            </button>
          ))}
        </div>
      </div>
      {msg && <div className="text-sm text-gold-300">{msg}</div>}
      <Card>
        <CardHeader title={`คำขอ (${rows.length})`} />
        <div className="divide-y divide-navy-700/50">
          {rows.length === 0 && <div className="py-8 text-center text-navy-400 text-sm">ไม่มีคำขอ</div>}
          {rows.map(p => (
            <div key={p.id} className="py-3 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 text-sm">
                  <div className="font-bold text-white">
                    {p.kind === 'deposit' ? '💳 เติม' : '🏦 ถอน'} ฿{satang(p.amount)}
                    <span className="ml-2 text-[11px] font-mono text-navy-400">{p.reference}</span>
                  </div>
                  <div className="text-xs text-navy-300">สมาชิก: {p.username} ({p.email})</div>
                  <div className="text-[11px] text-navy-400">
                    {fmtDateTime(p.created_at)}
                    {p.slip_trans_ref && <> • สลิป: <span className="font-mono">{p.slip_trans_ref}</span></>}
                    {p.slip_amount != null && <> • ยอดสลิป ฿{satang(p.slip_amount)}</>}
                    {p.slip_error && <span className="text-red-400"> • ⚠️ {p.slip_error}</span>}
                  </div>
                  {p.kind === 'withdraw' && (
                    <div className="text-xs text-navy-300 mt-1">ปลายทาง: {p.bank_name} {p.bank_account_no} — {p.bank_account_name}</div>
                  )}
                  {p.slip_payer && <div className="text-[11px] text-navy-400">ผู้โอน: {p.slip_payer}</div>}
                </div>
                <span className={`shrink-0 text-[11px] font-bold px-2 py-1 rounded ${
                  p.status === 'approved' ? 'bg-green-500/15 text-green-300'
                  : p.status === 'rejected' ? 'bg-red-500/15 text-red-300'
                  : 'bg-amber-500/15 text-amber-300'}`}>{STATUS_TH[p.status]}</span>
              </div>
              {(p.status === 'pending_review' || p.status === 'pending_slip') && (
                <div className="flex gap-2 items-center">
                  <input value={note[p.id] || ''} onChange={e => setNote({ ...note, [p.id]: e.target.value })}
                    placeholder="หมายเหตุ (ไม่บังคับ)"
                    className="flex-1 bg-navy-900 border border-navy-600 rounded-lg px-3 py-1.5 text-xs text-white" />
                  <Button onClick={() => review(p.id, 'approve')} disabled={busy === p.id}
                    className="!py-1.5 !px-4 text-xs">✅ อนุมัติ</Button>
                  <Button variant="danger" onClick={() => review(p.id, 'reject')} disabled={busy === p.id}
                    className="!py-1.5 !px-4 text-xs">❌ ปฏิเสธ</Button>
                </div>
              )}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
