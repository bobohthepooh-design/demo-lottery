import { useEffect, useState, useCallback } from 'react';
import { api, fmtDateTime } from '../api.js';
import { useAuth } from '../auth.jsx';
import { confirmAction } from './confirm.jsx';
import { toast } from '../components/toast.js';
import { Button, Input } from '../components/ui/index.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/shadcn/select.jsx';

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
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold [color:var(--white)]">ศูนย์อนุมัติ</h1>
          <span className="px-3 py-1 rounded-full text-xs font-bold [background:rgba(212,_175,_55,_0.15)] [border:1px_solid_var(--border-gold)] [color:var(--gold-primary)]">Maker-Checker</span>
        </div>
        <span className="text-xs px-3 py-1 rounded-lg [background:rgba(34,_197,_94,_0.15)] [border:1px_solid_rgba(34,_197,_94,_0.3)] [color:var(--success-green)]">คำขอที่รออนุมัติ: {status === 'pending' ? total : '—'}</span>
      </div>
      <div className="luxury-card overflow-hidden">
        <div className="flex flex-wrap gap-2 p-4 border-b [border-color:var(--border-light)]">
          <Select value={status || 'all'} onValueChange={v => setStatus(v === 'all' ? '' : v)}>
            <SelectTrigger className="w-36 luxury-input text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">ทุกสถานะ</SelectItem>
              {Object.entries(STATUS_TH).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={category || 'all'} onValueChange={v => setCategory(v === 'all' ? '' : v)}>
            <SelectTrigger className="w-44 luxury-input text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">ทุกหมวด</SelectItem>
              {Object.entries(CAT_TH).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input value={q} onChange={e => setQ(e.target.value)} placeholder="ค้นหา reference/คำอธิบาย" className="w-56 luxury-input text-xs" />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="[background:var(--bg-dark-surface)] [border-bottom:1px_solid_var(--border-light)]">
                <th className="px-4 py-3 text-left text-xs font-semibold [color:var(--muted-gray)]">Ref</th>
                <th className="px-4 py-3 text-left text-xs font-semibold [color:var(--muted-gray)]">หมวด</th>
                <th className="px-4 py-3 text-left text-xs font-semibold [color:var(--muted-gray)]">คำอธิบาย</th>
                <th className="px-4 py-3 text-left text-xs font-semibold [color:var(--muted-gray)]">ผู้สร้าง</th>
                <th className="px-4 py-3 text-left text-xs font-semibold [color:var(--muted-gray)]">ผู้อนุมัติ</th>
                <th className="px-4 py-3 text-left text-xs font-semibold [color:var(--muted-gray)]">สถานะ</th>
                <th className="px-4 py-3 text-left text-xs font-semibold [color:var(--muted-gray)]">เวลา</th>
                <th className="px-4 py-3 text-left text-xs font-semibold [color:var(--muted-gray)]"></th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={8} className="text-center py-8 text-xs [color:var(--muted-gray)]">ไม่มีคำขอ</td></tr>}
              {rows.map(r => (
                <tr key={r.id} className="hover:bg-[var(--bg-card-hover)] transition-colors [border-bottom:1px_solid_var(--border-light)]">
                  <td className="px-4 py-3 text-xs font-mono [color:var(--gold-primary)]">{r.reference}</td>
                  <td className="px-4 py-3 text-xs [color:var(--white)]">{CAT_TH[r.category] || r.category}</td>
                  <td className="px-4 py-3 text-xs max-w-[260px] truncate [color:var(--muted-gray)]">{r.summary}</td>
                  <td className="px-4 py-3 text-xs [color:var(--muted-gray)]">{r.maker_name || `#${r.maker_id}`}</td>
                  <td className="px-4 py-3 text-xs [color:var(--muted-gray)]">{r.checker_name || '—'}</td>
                  <td className="px-4 py-3"><span className={`text-[10px] font-bold px-2 py-1 rounded border ${STATUS_CLS[r.status] || ''}`}>{STATUS_TH[r.status] || r.status}</span></td>
                  <td className="px-4 py-3 text-[10px] whitespace-nowrap [color:var(--muted-gray)]">{fmtDateTime(r.created_at)}</td>
                  <td className="px-4 py-3"><button className="luxury-btn-ghost text-xs px-3 py-1 rounded-lg" onClick={() => openDetail(r.id)}>ดู</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {detail && (
        <div className="luxury-card luxury-card-gold-border p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold [color:var(--white)]">
              รายละเอียดคำขอ <span className="font-mono text-sm [color:var(--gold-primary)]">{detail.reference}</span>
            </h2>
            <button className="luxury-btn-ghost text-xs px-4 py-2 rounded-lg" onClick={() => setDetail(null)}>ปิด</button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs mb-4">
            <div><div className="mb-1 [color:var(--muted-gray)]">หมวด</div><div className="[color:var(--white)]">{CAT_TH[detail.category] || detail.category}</div></div>
            <div><div className="mb-1 [color:var(--muted-gray)]">ผู้สร้าง</div><div className="[color:var(--white)]">{detail.maker_name || `#${detail.maker_id}`}</div></div>
            <div><div className="mb-1 [color:var(--muted-gray)]">ผู้อนุมัติ</div><div className="[color:var(--white)]">{detail.checker_name || '—'}</div></div>
            <div><div className="mb-1 [color:var(--muted-gray)]">สถานะ</div><div className="[color:var(--white)]">{STATUS_TH[detail.status] || detail.status}</div></div>
            <div className="col-span-2"><div className="mb-1 [color:var(--muted-gray)]">คำอธิบาย</div><div className="[color:var(--white)]">{detail.summary}</div></div>
            {detail.checker_note && <div className="col-span-2"><div className="mb-1 [color:var(--muted-gray)]">หมายเหตุผู้อนุมัติ</div><div className="[color:var(--white)]">{detail.checker_note}</div></div>}
            {detail.execution_result && <div className="col-span-2"><div className="mb-1 [color:var(--muted-gray)]">ผลการดำเนินการ</div><pre className="text-[10px] p-3 rounded-lg overflow-x-auto [color:var(--muted-gray)] [background:var(--bg-dark-surface)]">{detail.execution_result}</pre></div>}
          </div>
          <details className="text-xs mb-4">
            <summary className="cursor-pointer [color:var(--gold-primary)]">Payload (JSON)</summary>
            <pre className="mt-2 text-[10px] p-3 rounded-lg overflow-x-auto [color:var(--muted-gray)] [background:var(--bg-dark-surface)]">{detail.payload}</pre>
          </details>
          {detail.status === 'pending' && (
            <div className="flex flex-wrap items-center gap-3 pt-4 border-t [border-color:var(--border-light)]">
              {canApprove && !isMine(detail) && (
                <>
                  <Input value={note} onChange={e => setNote(e.target.value)} placeholder="หมายเหตุ (จำเป็นเมื่อต้องปฏิเสธ)" className="flex-1 min-w-[200px] luxury-input text-xs" />
                  <button onClick={() => act(detail.id, 'approve')} disabled={busy === detail.id} className="luxury-btn text-xs px-6 py-2">อนุมัติ</button>
                  <button onClick={() => act(detail.id, 'reject')} disabled={busy === detail.id} className="text-xs px-6 py-2 rounded-lg border font-semibold transition-all [background:rgba(239,_68,_68,_0.15)] [border-color:rgba(239,_68,_68,_0.3)] [color:var(--danger-red)]">ปฏิเสธ</button>
                </>
              )}
              {isMine(detail) && canApprove && (
                <span className="text-xs px-3 py-2 rounded-lg [background:rgba(245,_158,_11,_0.15)] [border:1px_solid_rgba(245,_158,_11,_0.3)] [color:var(--warning-amber)]">คุณเป็นผู้สร้างคำขอนี้ — ต้องให้ admin อีกคนอนุมัติ (maker ≠ checker)</span>
              )}
              {isMine(detail) && (
                <button onClick={() => act(detail.id, 'cancel')} disabled={busy === detail.id} className="luxury-btn-ghost text-xs px-6 py-2 rounded-lg">ยกเลิกคำขอ</button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
