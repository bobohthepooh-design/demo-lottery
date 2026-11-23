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
        <h1 className="text-xl font-bold text-white">ตั๋วสนับสนุน & ข้อพิพาท</h1>
        <Select value={status || 'all'} onValueChange={v => setStatus(v === 'all' ? '' : v)} className="w-40">
          <option value="all">ทุกสถานะ</option>
          {Object.entries(STATUS_TH).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
      </div>
      <Card>
        <Table>
          <TableHeader>
            <TableRow className="border-navy-700/60 hover:bg-transparent">
              <TableHead className="text-navy-400">#</TableHead>
              <TableHead className="text-navy-400">สมาชิก</TableHead>
              <TableHead className="text-navy-400">หมวด</TableHead>
              <TableHead className="text-navy-400">หัวข้อ</TableHead>
              <TableHead className="text-navy-400">สถานะ</TableHead>
              <TableHead className="text-navy-400">ตอบล่าสุดโดย</TableHead>
              <TableHead className="text-navy-400">เวลา</TableHead>
              <TableHead className="text-navy-400"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && <TableRow><TableCell colSpan={8} className="text-center text-navy-400 py-8">ไม่มี ticket</TableCell></TableRow>}
            {rows.map(t => (
              <TableRow key={t.id} className="border-navy-700/50 hover:bg-navy-700/30">
                <TableCell className="text-xs text-navy-400">{t.id}</TableCell>
                <TableCell className="text-xs text-white">{t.username}<div className="text-[10px] text-navy-400">{t.display_name}</div></TableCell>
                <TableCell className="text-xs text-navy-300">{CAT_TH[t.category] || t.category}</TableCell>
                <TableCell className="text-xs text-navy-200 max-w-[220px] truncate">{t.subject}</TableCell>
                <TableCell><Badge variant="outline" className={`text-[10px] ${STATUS_CLS[t.status]}`}>{STATUS_TH[t.status]}</Badge></TableCell>
                <TableCell className="text-xs text-navy-300">{t.admin_name || '—'}</TableCell>
                <TableCell className="text-[10px] text-navy-400 whitespace-nowrap">{fmtDateTime(t.created_at)}</TableCell>
                <TableCell><Button variant="ghost" className="text-xs px-2 py-1" onClick={() => open(t)}>ตอบ</Button></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {sel && (
        <Card>
          <div className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-white">Ticket #{sel.id} — {sel.username}</h2>
              <Button variant="ghost" className="text-xs" onClick={() => setSel(null)}>ปิด</Button>
            </div>
            <div className="text-[10px] text-navy-400">{CAT_TH[sel.category]} • {fmtDateTime(sel.created_at)} • สถานะ: {STATUS_TH[sel.status]}</div>
            <div className="bg-navy-900/60 rounded p-3">
              <div className="text-xs font-bold text-white mb-1">{sel.subject}</div>
              <div className="text-xs text-navy-300 whitespace-pre-wrap">{sel.message}</div>
            </div>
            {sel.admin_reply && (
              <div className="bg-emerald-500/5 border border-emerald-500/20 rounded p-3">
                <div className="text-[10px] font-bold text-emerald-300">คำตอบก่อนหน้า</div>
                <div className="text-xs text-navy-200 whitespace-pre-wrap">{sel.admin_reply}</div>
              </div>
            )}
            {sel.status !== 'closed' && (
              <div className="space-y-2 pt-2 border-t border-navy-700/60">
                <textarea rows={3} value={reply} onChange={e => setReply(e.target.value)} maxLength={3000}
                  className="w-full bg-navy-900 border border-navy-600 rounded-lg px-3 py-2 text-sm text-white"
                  placeholder="คำตอบถึงสมาชิก..." />
                <div className="flex gap-2 items-center flex-wrap">
                  <Select value={newStatus} onChange={e => setNewStatus(e.target.value)} className="w-44" inputClassName="py-1.5 text-xs">
                    <option value="in_progress">กำลังดำเนินการ</option>
                    <option value="resolved">แก้ไขแล้ว</option>
                    <option value="closed">ปิดเรื่อง</option>
                  </Select>
                  <Button onClick={send} disabled={busy} className="text-xs">ส่งคำตอบ</Button>
                </div>
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
