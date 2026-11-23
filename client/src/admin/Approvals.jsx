import { useEffect, useState, useCallback } from 'react';
import { api, fmtDateTime } from '../api.js';
import { useAuth } from '../auth.jsx';
import { confirmAction } from './confirm.jsx';
import { toast } from '../components/toast.js';
import { Card, Button, Input } from '../components/ui/index.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/shadcn/select.jsx';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/shadcn/table.jsx';

const STATUS_TH = {
  pending: 'รออนุมัติ', approved: 'อนุมัติแล้ว', rejected: 'ปฏิเสธ',
  executed: 'ดำเนินการแล้ว', failed: 'ล้มเหลว', cancelled: 'ยกเลิก',
};
const CAT_TH = {
  'wallet.adjust': 'ปรับเครดิต', 'wallet.bulk_adjust': 'ปรับเครดิตกลุ่ม',
  'payment.review': 'ตรวจชำระเงิน', 'roles.update': 'แก้ไขสิทธิ์', 'result.manual': 'แก้ไขผลรางวัล',
  'member.delete': 'ลบบัญชีสมาชิก',
};
const STATUS_CLS = {
  pending: 'bg-amber-500/15 text-amber-300 border-amber-500/40',
  approved: 'bg-sky-500/15 text-sky-300 border-sky-500/40',
  rejected: 'bg-red-500/15 text-red-300 border-red-500/40',
  executed: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40',
  failed: 'bg-red-500/15 text-red-300 border-red-500/40',
  cancelled: 'bg-navy-600/40 text-navy-300 border-navy-600',
};

export default function Approvals() {
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState('pending');
  const [category, setCategory] = useState('');
  const [q, setQ] = useState('');
  const [detail, setDetail] = useState(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(null);
  const perms = user?.permissions || [];
  const canApprove = perms.includes('approvals.approve') || perms.includes('*');
  const myId = user?.id;

  const load = useCallback(() => {
    const qs = new URLSearchParams();
    if (status) qs.set('status', status);
    if (category) qs.set('category', category);
    if (q) qs.set('q', q);
    qs.set('limit', '100');
    api(`/admin/approvals?${qs}`).then(r => { setRows(r.requests || []); setTotal(r.total || 0); })
      .catch(e => toast(e.message, 'error'));
  }, [status, category, q]);
  useEffect(() => { load(); }, [load]);

  const openDetail = async (id) => {
    try { setDetail(await api(`/admin/approvals/${id}`).then(r => r.request)); setNote(''); }
    catch (e) { toast(e.message, 'error'); }
  };

  const act = async (id, action) => {
    if (action === 'reject' && note.trim().length < 3) { toast('กรุณาระบุเหตุผลการปฏิเสธ', 'error'); return; }
    if (!(await confirmAction({
      title: action === 'approve' ? 'ยืนยันอนุมัติ' : action === 'reject' ? 'ยืนยันปฏิเสธ' : 'ยืนยันยกเลิก',
      message: action === 'approve' ? 'อนุมัติคำขอนี้และดำเนินการทันที?' : action === 'reject' ? `ปฏิเสธคำขอนี้?\nเหตุผล: ${note}` : 'ยกเลิกคำขอที่รออยู่?',
      danger: action !== 'approve',
    }))) return;
    setBusy(id);
    try {
      await api(`/admin/approvals/${id}/${action}`, { method: 'POST', body: action === 'cancel' ? {} : { note: note.trim() || undefined } });
      toast(action === 'approve' ? 'อนุมัติและดำเนินการแล้ว' : action === 'reject' ? 'ปฏิเสธคำขอแล้ว' : 'ยกเลิกคำขอแล้ว', 'success');
      setDetail(null); load();
    } catch (e) { toast(e.message, 'error'); }
    finally { setBusy(null); }
  };

  const isMine = (r) => r.maker_id === myId || r.maker_id === Number(myId);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-bold text-white">ศูนย์อนุมัติ (Maker-Checker)</h1>
        <span className="text-xs text-navy-400">คำขอที่รออนุมัติ: {status === 'pending' ? total : '—'}</span>
      </div>
      <Card>
        <div className="flex flex-wrap gap-2 p-3 border-b border-navy-700/60">
          <Select value={status || 'all'} onValueChange={v => setStatus(v === 'all' ? '' : v)}>
            <SelectTrigger className="w-36 bg-navy-800 border-navy-600 text-white text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">ทุกสถานะ</SelectItem>
              {Object.entries(STATUS_TH).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={category || 'all'} onValueChange={v => setCategory(v === 'all' ? '' : v)}>
            <SelectTrigger className="w-44 bg-navy-800 border-navy-600 text-white text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">ทุกหมวด</SelectItem>
              {Object.entries(CAT_TH).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input value={q} onChange={e => setQ(e.target.value)} placeholder="ค้นหา reference/คำอธิบาย" className="w-56 bg-navy-800 border-navy-600 text-white text-xs" />
        </div>
        <Table>
          <TableHeader>
            <TableRow className="border-navy-700/60 hover:bg-transparent">
              <TableHead className="text-navy-400">Ref</TableHead>
              <TableHead className="text-navy-400">หมวด</TableHead>
              <TableHead className="text-navy-400">คำอธิบาย</TableHead>
              <TableHead className="text-navy-400">ผู้สร้าง</TableHead>
              <TableHead className="text-navy-400">ผู้อนุมัติ</TableHead>
              <TableHead className="text-navy-400">สถานะ</TableHead>
              <TableHead className="text-navy-400">เวลา</TableHead>
              <TableHead className="text-navy-400"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && <TableRow><TableCell colSpan={8} className="text-center text-navy-400 py-8">ไม่มีคำขอ</TableCell></TableRow>}
            {rows.map(r => (
              <TableRow key={r.id} className="border-navy-700/50 hover:bg-navy-700/30">
                <TableCell className="text-xs font-mono text-gold-300">{r.reference}</TableCell>
                <TableCell className="text-xs text-white">{CAT_TH[r.category] || r.category}</TableCell>
                <TableCell className="text-xs text-navy-200 max-w-[260px] truncate">{r.summary}</TableCell>
                <TableCell className="text-xs text-navy-300">{r.maker_name || `#${r.maker_id}`}</TableCell>
                <TableCell className="text-xs text-navy-300">{r.checker_name || '—'}</TableCell>
                <TableCell><span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${STATUS_CLS[r.status] || ''}`}>{STATUS_TH[r.status] || r.status}</span></TableCell>
                <TableCell className="text-[10px] text-navy-400 whitespace-nowrap">{fmtDateTime(r.created_at)}</TableCell>
                <TableCell><Button variant="ghost" className="text-xs px-2 py-1" onClick={() => openDetail(r.id)}>ดู</Button></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {detail && (
        <Card>
          <div className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-white">รายละเอียดคำขอ <span className="font-mono text-gold-300 text-sm">{detail.reference}</span></h2>
              <Button variant="ghost" className="text-xs" onClick={() => setDetail(null)}>ปิด</Button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
              <div><div className="text-navy-400">หมวด</div><div className="text-white">{CAT_TH[detail.category] || detail.category}</div></div>
              <div><div className="text-navy-400">ผู้สร้าง</div><div className="text-white">{detail.maker_name || `#${detail.maker_id}`}</div></div>
              <div><div className="text-navy-400">ผู้อนุมัติ</div><div className="text-white">{detail.checker_name || '—'}</div></div>
              <div><div className="text-navy-400">สถานะ</div><div className="text-white">{STATUS_TH[detail.status] || detail.status}</div></div>
              <div className="col-span-2"><div className="text-navy-400">คำอธิบาย</div><div className="text-white">{detail.summary}</div></div>
              {detail.checker_note && <div className="col-span-2"><div className="text-navy-400">หมายเหตุผู้อนุมัติ</div><div className="text-white">{detail.checker_note}</div></div>}
              {detail.execution_result && <div className="col-span-2"><div className="text-navy-400">ผลการดำเนินการ</div><pre className="text-[10px] text-navy-200 bg-navy-900/60 rounded p-2 overflow-x-auto">{detail.execution_result}</pre></div>}
            </div>
            <details className="text-xs">
              <summary className="text-navy-400 cursor-pointer">Payload (JSON)</summary>
              <pre className="mt-1 text-[10px] text-navy-200 bg-navy-900/60 rounded p-2 overflow-x-auto">{detail.payload}</pre>
            </details>
            {detail.status === 'pending' && (
              <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-navy-700/60">
                {canApprove && !isMine(detail) && (
                  <>
                    <Input value={note} onChange={e => setNote(e.target.value)} placeholder="หมายเหตุ (จำเป็นเมื่อต้องปฏิเสธ)" className="flex-1 min-w-[200px] bg-navy-800 border-navy-600 text-white text-xs" />
                    <Button onClick={() => act(detail.id, 'approve')} disabled={busy === detail.id} className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs">อนุมัติ</Button>
                    <Button onClick={() => act(detail.id, 'reject')} disabled={busy === detail.id} className="bg-red-600 hover:bg-red-500 text-white text-xs">ปฏิเสธ</Button>
                  </>
                )}
                {isMine(detail) && canApprove && (
                  <span className="text-[11px] text-amber-300">คุณเป็นผู้สร้างคำขอนี้ — ต้องให้ admin อีกคนอนุมัติ (maker ≠ checker)</span>
                )}
                {isMine(detail) && (
                  <Button onClick={() => act(detail.id, 'cancel')} disabled={busy === detail.id} className="bg-navy-700 hover:bg-navy-600 text-white text-xs">ยกเลิกคำขอ</Button>
                )}
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
