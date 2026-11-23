import { useEffect, useState } from 'react';
import { api, satang, fmtDateTime } from '../api.js';
import { Card, CardHeader, Button, Input } from '../components/ui/index.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/shadcn/select.jsx';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/shadcn/table.jsx';
import { Badge } from '../components/shadcn/badge.jsx';
import { cn } from '../lib/utils.js';

const STATUS_TH = { pending_slip: 'รอสลิป', pending_review: 'รอตรวจสอบ', approved: 'อนุมัติแล้ว', rejected: 'ปฏิเสธ' };
const STATUS_BADGE = {
  approved: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40',
  rejected: 'bg-red-500/15 text-red-300 border-red-500/40',
  pending_slip: 'bg-sky-500/15 text-sky-300 border-sky-500/40',
  pending_review: 'bg-amber-500/15 text-amber-300 border-amber-500/40',
};

export default function AdminPayments() {
  const [rows, setRows] = useState([]);
  const [status, setStatus] = useState('pending');
  const [kind, setKind] = useState(''); // '' | deposit | withdraw
  const [busy, setBusy] = useState(null);
  const [note, setNote] = useState({});
  const [msg, setMsg] = useState('');
  const [slipView, setSlipView] = useState(null); // { id, loading, imageBase64, meta }

  const viewSlip = async (p) => {
    setSlipView({ id: p.id, loading: true });
    try {
      const r = await api(`/admin/payments/${p.id}/slip`);
      setSlipView({ id: p.id, loading: false, imageBase64: r.imageBase64, meta: r });
    } catch (e) {
      setSlipView({ id: p.id, loading: false, error: e.message });
    }
  };

  const load = () => api(`/admin/payments?status=${status}${kind ? `&kind=${kind}` : ''}`).then(r => setRows(r.requests || [])).catch(e => setMsg(e.message));
  useEffect(() => { load(); }, [status, kind]);

  const review = async (id, action) => {
    setBusy(id); setMsg('');
    try {
      const r = await api(`/admin/payments/${id}/review`, { method: 'POST', body: { action, note: note[id] || '' } });
      if (r.pendingApproval) {
        setMsg(`📨 ส่งคำขอ ${action === 'approve' ? 'อนุมัติ' : 'ปฏิเสธ'} การชำระเงิน ${r.approval?.reference || ''} เข้าศูนย์อนุมัติแล้ว`);
      } else {
        setMsg(action === 'approve' ? `✅ อนุมัติแล้ว${r.balance != null ? ` — ยอดใหม่ ${satang(r.balance)} บาท` : ''}` : 'ปฏิเสธแล้ว');
      }
      load();
    } catch (e) { setMsg('❌ ' + e.message); }
    finally { setBusy(null); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-bold text-white">ชำระเงิน (เติม/ถอน)</h1>
        <div className="flex gap-2">
          <Select value={kind || 'all'} onValueChange={v => setKind(v === 'all' ? '' : v)}>
            <SelectTrigger className="w-32 bg-navy-800 border-navy-600 text-white text-xs">
              <SelectValue placeholder="ทุกประเภท" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">ทุกประเภท</SelectItem>
              <SelectItem value="deposit">เติมเงิน</SelectItem>
              <SelectItem value="withdraw">ถอนเงิน</SelectItem>
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-44 bg-navy-800 border-navy-600 text-white text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="pending">รอจัดการทั้งหมด</SelectItem>
            <SelectItem value="pending_review">รอตรวจสอบ</SelectItem>
            <SelectItem value="pending_slip">รอสลิป</SelectItem>
            <SelectItem value="approved">อนุมัติแล้ว</SelectItem>
            <SelectItem value="rejected">ปฏิเสธ</SelectItem>
            <SelectItem value="all">ทั้งหมด</SelectItem>
          </SelectContent>
          </Select>
        </div>
      </div>
      {msg && <div className="text-sm text-gold-300">{msg}</div>}
      <Card>
        <CardHeader title={`คำขอ (${rows.length})`} />
        {rows.length === 0 ? (
          <div className="py-8 text-center text-navy-400 text-sm">ไม่มีคำขอ</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-navy-700/60 hover:bg-transparent">
                <TableHead className="text-navy-400">คำขอ</TableHead>
                <TableHead className="text-navy-400">สมาชิก</TableHead>
                <TableHead className="text-navy-400">รายละเอียด</TableHead>
                <TableHead className="text-navy-400">สถานะ</TableHead>
                <TableHead className="text-navy-400 text-right">จัดการ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(p => (
                <TableRow key={p.id} className="border-navy-700/50">
                  <TableCell className="align-top">
                    <div className="font-bold text-white text-sm whitespace-nowrap">
                      {p.kind === 'deposit' ? '💳 เติม' : '🏦 ถอน'} ฿{satang(p.amount)}
                    </div>
                    <div className="text-[11px] font-mono text-navy-400">{p.reference}</div>
                    <div className="text-[11px] text-navy-400">{fmtDateTime(p.created_at)}</div>
                  </TableCell>
                  <TableCell className="align-top text-xs text-navy-300">
                    {p.username}<div className="text-[11px] text-navy-400">{p.email}</div>
                  </TableCell>
                  <TableCell className="align-top text-xs text-navy-300 max-w-[280px]">
                    {p.slip_trans_ref && <div>สลิป: <span className="font-mono">{p.slip_trans_ref}</span></div>}
                    {p.slip_amount != null && <div>ยอดสลิป ฿{satang(p.slip_amount)}</div>}
                    {p.slip_error && <div className="text-red-400">⚠️ {p.slip_error}</div>}
                    {p.kind === 'withdraw' && <div>ปลายทาง: {p.bank_name} {p.bank_account_no} — {p.bank_account_name}</div>}
                    {p.kind === 'withdraw' && p.promptpay_id && (() => {
                      const match = p.phone && String(p.promptpay_id).replace(/\D/g, '') === String(p.phone).replace(/\D/g, '');
                      return <div className={match ? 'text-green-400' : 'text-amber-300'}>
                        พร้อมเพย์: {p.promptpay_id} {match ? '✓ ตรงเบอร์ OTP' : p.phone ? '⚠️ ไม่ตรงเบอร์สมาชิก' : ''}
                      </div>;
                    })()}
                    {p.slip_payer && <div className="text-navy-400">ผู้โอน: {p.slip_payer}</div>}
                    {p.has_slip_image && (
                      <button onClick={() => viewSlip(p)} className="mt-1 text-[11px] text-sky-300 hover:underline">
                        🧾 ดูรูปสลิป
                      </button>
                    )}
                  </TableCell>
                  <TableCell className="align-top">
                    <Badge variant="outline" className={cn('text-[11px] font-bold', STATUS_BADGE[p.status])}>
                      {STATUS_TH[p.status]}
                    </Badge>
                  </TableCell>
                  <TableCell className="align-top">
                    {(p.status === 'pending_review' || p.status === 'pending_slip') && (
                      <div className="flex flex-col gap-1.5 items-end">
                        <Input value={note[p.id] || ''} onChange={e => setNote({ ...note, [p.id]: e.target.value })}
                          placeholder="หมายเหตุ (ไม่บังคับ)"
                          className="h-8 w-44 text-xs bg-navy-900 border-navy-600"
                          inputClassName="!h-8 !px-2 !py-1 !text-xs" />
                        <div className="flex gap-1.5">
                          <Button onClick={() => review(p.id, 'approve')} disabled={busy === p.id}
                            className="!py-1 !px-3 text-xs">✅ อนุมัติ</Button>
                          <Button variant="danger" onClick={() => review(p.id, 'reject')} disabled={busy === p.id}
                            className="!py-1 !px-3 text-xs">❌ ปฏิเสธ</Button>
                        </div>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {/* Slip image viewer */}
      {slipView && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setSlipView(null)}>
          <div className="bg-navy-900 border border-navy-600 rounded-2xl max-w-lg w-full p-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-bold text-white">🧾 รูปสลิปการโอน</div>
              <button onClick={() => setSlipView(null)} className="text-navy-400 hover:text-white text-lg">✕</button>
            </div>
            {slipView.loading && <div className="text-navy-300 text-sm py-8 text-center">กำลังโหลด...</div>}
            {slipView.error && <div className="text-red-400 text-sm py-8 text-center">{slipView.error}</div>}
            {!slipView.loading && !slipView.error && slipView.imageBase64 && (() => {
              // client ส่ง data URI มาแล้ว (มี prefix) — อย่าเติมซ้ำ
              const src = slipView.imageBase64.startsWith('data:')
                ? slipView.imageBase64
                : `data:image/jpeg;base64,${slipView.imageBase64}`;
              return <img src={src} alt="slip" className="w-full rounded-lg bg-white" />;
            })()}
            {!slipView.loading && !slipView.error && !slipView.imageBase64 && (
              <div className="text-navy-400 text-sm py-8 text-center">ไม่มีรูปสลิป (คำขอนี้ส่งก่อนมีระบบเก็บรูป)</div>
            )}
            {slipView.meta?.slipTransRef && <div className="text-[11px] text-navy-400 mt-2 font-mono">Ref: {slipView.meta.slipTransRef}</div>}
          </div>
        </div>
      )}
    </div>
  );
}
