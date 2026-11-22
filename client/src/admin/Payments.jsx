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
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-44 bg-navy-800 border-navy-600 text-white text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="pending_review">รอตรวจสอบ</SelectItem>
            <SelectItem value="pending_slip">รอสลิป</SelectItem>
            <SelectItem value="approved">อนุมัติแล้ว</SelectItem>
            <SelectItem value="rejected">ปฏิเสธ</SelectItem>
            <SelectItem value="all">ทั้งหมด</SelectItem>
          </SelectContent>
        </Select>
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
                    {p.slip_payer && <div className="text-navy-400">ผู้โอน: {p.slip_payer}</div>}
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
                          className="h-8 w-44 text-xs bg-navy-900 border-navy-600" />
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
    </div>
  );
}
