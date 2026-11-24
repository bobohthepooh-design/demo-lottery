import { useEffect, useState, useCallback } from 'react';
import { api, fmtDateTime } from '../api.js';
import { confirmAction } from './confirm.jsx';
import { toast } from '../components/toast.js';
import { Card, Button, Input, Select } from '../components/ui/index.js';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/shadcn/table.jsx';
import { Badge } from '../components/shadcn/badge.jsx';

const CAT_TH = { payment: 'การชำระเงิน', bet: 'โพยเดิมพัน', account: 'บัญชี', result: 'ผลรางวัล', other: 'อื่นๆ', general: 'ทั่วไป' };
const STATUS_TH = { open: 'เปิดอยู่', in_progress: 'กำลังดำเนินการ', resolved: 'แก้ไขแล้ว', closed: 'ปิดแล้ว' };
const STATUS_CLS = {
  open: 'border-amber-500/40 text-amber-300',
  in_progress: 'border-sky-500/40 text-sky-300',
  resolved: 'border-emerald-500/40 text-emerald-300',
  closed: 'border-navy-600 text-navy-400',
};

export default function Tickets() {
  const [rows, setRows] = useState([]);
  const [status, setStatus] = useState('open');
  const [sel, setSel] = useState(null); // ticket ที่กำลังตอบ
  const [reply, setReply] = useState('');
  const [newStatus, setNewStatus] = useState('in_progress');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api(`/admin/tickets${status ? `?status=${status}` : ''}`).then(r => setRows(r.tickets || []))
      .catch(e => toast(e.message, 'error'));
  }, [status]);
  useEffect(() => { load(); }, [load]);

  const open = (t) => { setSel(t); setReply(t.admin_reply || ''); setNewStatus(t.status === 'open' ? 'in_progress' : t.status); };

  const send = async () => {
    if (!reply.trim()) { toast('กรุณาใส่คำตอบ', 'error'); return; }
    if (!(await confirmAction({
      title: 'ส่งคำตอบ ticket',
      message: `ตอบ ticket #${sel.id} ของ ${sel.username} — สถานะใหม่: ${STATUS_TH[newStatus]}`,
    }))) return;
    setBusy(true);
    try {
      await api(`/admin/tickets/${sel.id}/reply`, { method: 'POST', body: { reply: reply.trim(), status: newStatus } });
      toast('บันทึกคำตอบแล้ว', 'success');
      setSel(null); load();
    } catch (e) { toast(e.message, 'error'); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-bold" style={{ color: 'var(--white)' }}>ตั๋วสนับสนุน & ข้อพิพาท</h1>
        <Select value={status || 'all'} onValueChange={v => setStatus(v === 'all' ? '' : v)} className="w-40">
          <option value="all">ทุกสถานะ</option>
          {Object.entries(STATUS_TH).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
      </div>
      <Card style={{ background: 'var(--bg-card)', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-xl)' }}>
        <Table>
          <TableHeader>
            <TableRow style={{ borderColor: 'var(--border-light)' }} className="hover:bg-transparent">
              <TableHead style={{ color: 'var(--muted-gray)' }}>#</TableHead>
              <TableHead style={{ color: 'var(--muted-gray)' }}>สมาชิก</TableHead>
              <TableHead style={{ color: 'var(--muted-gray)' }}>หมวด</TableHead>
              <TableHead style={{ color: 'var(--muted-gray)' }}>หัวข้อ</TableHead>
              <TableHead style={{ color: 'var(--muted-gray)' }}>สถานะ</TableHead>
              <TableHead style={{ color: 'var(--muted-gray)' }}>ตอบล่าสุดโดย</TableHead>
              <TableHead style={{ color: 'var(--muted-gray)' }}>เวลา</TableHead>
              <TableHead style={{ color: 'var(--muted-gray)' }}></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && <TableRow><TableCell colSpan={8} className="text-center py-8" style={{ color: 'var(--muted-gray)' }}>ไม่มี ticket</TableCell></TableRow>}
            {rows.map(t => (
              <TableRow key={t.id} style={{ borderColor: 'var(--border-light)' }} className="hover:bg-[var(--bg-card-hover)]">
                <TableCell className="text-xs" style={{ color: 'var(--muted-gray)' }}>{t.id}</TableCell>
                <TableCell className="text-xs" style={{ color: 'var(--white)' }}>{t.username}<div className="text-[10px]" style={{ color: 'var(--dark-gray)' }}>{t.display_name}</div></TableCell>
                <TableCell className="text-xs" style={{ color: 'var(--light-gray)' }}>{CAT_TH[t.category] || t.category}</TableCell>
                <TableCell className="text-xs max-w-[220px] truncate" style={{ color: 'var(--light-gray)' }}>{t.subject}</TableCell>
                <TableCell><Badge variant="outline" className={`text-[10px] ${STATUS_CLS[t.status]}`}>{STATUS_TH[t.status]}</Badge></TableCell>
                <TableCell className="text-xs" style={{ color: 'var(--muted-gray)' }}>{t.admin_name || '—'}</TableCell>
                <TableCell className="text-[10px] whitespace-nowrap" style={{ color: 'var(--muted-gray)' }}>{fmtDateTime(t.created_at)}</TableCell>
                <TableCell><Button variant="ghost" className="text-xs px-2 py-1" onClick={() => open(t)} style={{ color: 'var(--gold-primary)', border: '1px solid var(--border-light)' }}>ตอบ</Button></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {sel && (
        <Card style={{ background: 'var(--bg-card)', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-xl)' }}>
          <div className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-bold" style={{ color: 'var(--white)' }}>Ticket #{sel.id} — {sel.username}</h2>
              <Button variant="ghost" className="text-xs" onClick={() => setSel(null)} style={{ color: 'var(--gold-primary)', border: '1px solid var(--border-light)' }}>ปิด</Button>
            </div>
            <div className="text-[10px]" style={{ color: 'var(--muted-gray)' }}>{CAT_TH[sel.category]} • {fmtDateTime(sel.created_at)} • สถานะ: {STATUS_TH[sel.status]}</div>
            <div className="rounded p-3" style={{ background: 'var(--bg-dark-surface)' }}>
              <div className="text-xs font-bold mb-1" style={{ color: 'var(--white)' }}>{sel.subject}</div>
              <div className="text-xs whitespace-pre-wrap" style={{ color: 'var(--light-gray)' }}>{sel.message}</div>
            </div>
            {sel.admin_reply && (
              <div className="rounded p-3" style={{ background: 'rgba(34, 197, 94, 0.05)', border: '1px solid rgba(34, 197, 94, 0.2)' }}>
                <div className="text-[10px] font-bold" style={{ color: 'var(--success-green)' }}>คำตอบก่อนหน้า</div>
                <div className="text-xs whitespace-pre-wrap" style={{ color: 'var(--light-gray)' }}>{sel.admin_reply}</div>
              </div>
            )}
            {sel.status !== 'closed' && (
              <div className="space-y-2 pt-2" style={{ borderTop: '1px solid var(--border-light)' }}>
                <textarea rows={3} value={reply} onChange={e => setReply(e.target.value)} maxLength={3000}
                  className="w-full rounded-lg px-3 py-2 text-sm" style={{ background: 'var(--bg-dark-surface)', border: '1px solid var(--border-light)', color: 'var(--white)' }}
                  placeholder="คำตอบถึงสมาชิก..." />
                <div className="flex gap-2 items-center flex-wrap">
                  <Select value={newStatus} onChange={e => setNewStatus(e.target.value)} className="w-44" inputClassName="py-1.5 text-xs" style={{ background: 'var(--bg-dark-surface)', border: '1px solid var(--border-light)', color: 'var(--white)' }}>
                    <option value="in_progress">กำลังดำเนินการ</option>
                    <option value="resolved">แก้ไขแล้ว</option>
                    <option value="closed">ปิดเรื่อง</option>
                  </Select>
                  <Button onClick={send} disabled={busy} className="text-xs" style={{ background: 'linear-gradient(135deg, var(--gold-gradient-start), var(--gold-gradient-end))', color: 'var(--bg-deep-black)' }}>ส่งคำตอบ</Button>
                </div>
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
