import { useEffect, useState } from 'react';
import { api, satang, fmtDateTime } from '../api.js';
import { confirmAction } from './confirm.jsx';
import { Card, CardHeader, CardBody, Input, Select, Button } from '../components/ui/index.js';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/shadcn/table.jsx';
import { Badge } from '../components/shadcn/badge.jsx';
import { cn } from '../lib/utils.js';

const TYPE_TH = {
  initial_credit: 'เครดิตเริ่มต้น', admin_adjust: 'ปรับเครดิต(+)', admin_debit: 'ปรับเครดิต(-)',
  bet_debit: 'หักเครดิตแทง', bet_refund: 'คืนเครดิต', win_credit: 'เงินรางวัล',
  deposit: 'สมาชิกเติมเครดิต', withdraw: 'สมาชิกถอนเครดิต', promo_cashback: 'คืนยอดเสีย',
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
    const m = members.find(x => String(x.id) === String(form.userId));
    const dir = form.direction === 'credit' ? 'เพิ่ม' : 'หัก';
    if (!(await confirmAction({
      title: 'ยืนยันปรับเครดิต',
      message: `${dir}เครดิต ${form.amount} บาท ให้ "${m?.username || form.userId}"?\nเหตุผล: ${form.reason || '-'}`,
      danger: form.direction === 'debit',
    }))) return;
    try {
      const r = await api('/admin/wallet/adjust', { method: 'POST', body: {
        ...form, userId: Number(form.userId), amount: Math.round(parseFloat(form.amount) * 100),
      }});
      setMsg(`สำเร็จ — ref ${r.transaction.reference} • ยอดใหม่ ${satang(r.balance)} บาท`);
      setForm({ userId: '', amount: '', direction: 'credit', reason: '', idempotencyKey: newKey() });
      load();
    } catch (e2) { setMsg('ERROR: ' + e2.message); }
  };

  // ---------- bulk adjust + export ----------
  const [bulk, setBulk] = useState({ mode: 'selected', userIds: [], amount: '', direction: 'credit', reason: '' });
  const [bulkMsg, setBulkMsg] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);

  const toggleMember = (id) => setBulk(b => ({
    ...b, userIds: b.userIds.includes(id) ? b.userIds.filter(x => x !== id) : [...b.userIds, id],
  }));

  const submitBulk = async (e) => {
    e.preventDefault(); setBulkMsg('');
    const target = bulk.mode === 'all' ? 'สมาชิกที่ใช้งานทั้งหมด' : `${bulk.userIds.length} คนที่เลือก`;
    const dir = bulk.direction === 'credit' ? 'เพิ่ม' : 'หัก';
    if (!(await confirmAction({
      title: '⚠️ ยืนยันปรับเครดิตหลายบัญชี',
      message: `${dir}เครดิต ${bulk.amount} บาท ให้ ${target}?\nเหตุผล: ${bulk.reason || '-'}\nทุกบัญชีใช้เหตุผลเดียวกันและถูกบันทึก audit แยกต่อคน`,
      danger: bulk.direction === 'debit',
    }))) return;
    setBulkBusy(true);
    try {
      const body = { amount: Math.round(parseFloat(bulk.amount) * 100), direction: bulk.direction, reason: bulk.reason };
      if (bulk.mode === 'all') body.all = true; else body.userIds = bulk.userIds;
      const r = await api('/admin/wallet/bulk-adjust', { method: 'POST', body });
      const fails = (r.results || []).filter(x => !x.ok);
      setBulkMsg(`สำเร็จ ${r.succeeded} • ล้มเหลว ${r.failed}` + (fails.length ? ` — ${fails.slice(0, 3).map(f => `#${f.userId}: ${f.error}`).join(' | ')}` : ''));
      setBulk({ mode: 'selected', userIds: [], amount: '', direction: 'credit', reason: '' });
      load();
    } catch (e2) { setBulkMsg('ERROR: ' + e2.message); }
    finally { setBulkBusy(false); }
  };

  // export transactions เป็น CSV (ข้อมูลชุดเดียวกับตารางด้านล่าง)
  const exportCsv = () => {
    const head = 'ref,username,type,direction,amount_satang,balance_after_satang,description,created_at';
    const rows = txs.map(t => [t.reference, t.username, t.type, t.direction, t.amount, t.balance_after, `"${String(t.description || '').replace(/"/g, '""')}"`, t.created_at].join(','));
    const blob = new Blob(['﻿' + head + '\n' + rows.join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `wallet-tx-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-white">จัดการเครดิตเสมือน (Virtual Wallet)</h1>
      <Card>
      <CardBody>
      <form onSubmit={submit} className="grid sm:grid-cols-2 gap-3">
        <Select required value={form.userId} onChange={e => setForm({...form, userId: e.target.value})} inputClassName="py-2.5">
          <option value="">— เลือกสมาชิก —</option>
          {members.map(m => <option key={m.id} value={m.id}>{m.username} ({satang(m.balance)} บาท)</option>)}
        </Select>
        <Input required type="number" step="0.01" min="0.01" placeholder="จำนวนเงิน (บาท)" value={form.amount} onChange={e => setForm({...form, amount: e.target.value})} inputClassName="py-2.5" />
        <Select value={form.direction} onChange={e => setForm({...form, direction: e.target.value})} inputClassName="py-2.5">
          <option value="credit">เพิ่มเครดิต (+)</option><option value="debit">หักเครดิต (−)</option>
        </Select>
        <Input required placeholder="เหตุผล (บังคับ)" value={form.reason} onChange={e => setForm({...form, reason: e.target.value})} inputClassName="py-2.5" />
        <Input placeholder="Idempotency key" value={form.idempotencyKey} onChange={e => setForm({...form, idempotencyKey: e.target.value})} inputClassName="py-2.5 font-mono text-xs" />
        <Button className="sm:col-span-2">ปรับเครดิต</Button>
        {msg && <div className={`sm:col-span-2 text-sm rounded-lg p-3 ${msg.startsWith('ERROR') ? 'bg-red-500/10 text-red-400' : 'bg-green-500/10 text-green-300'}`} role="status">{msg}</div>}
      </form>
      </CardBody>
      </Card>

      {/* ปรับเครดิตหลายบัญชีพร้อมกัน */}
      <Card>
      <CardHeader title="ปรับเครดิตหลายบัญชี" sub="เลือกสมาชิกหลายคนหรือทั้งหมด — ใช้เหตุผลเดียวกัน ทุกบัญชีบันทึก audit แยก (สูงสุด 200 คน/ครั้ง)" />
      <CardBody>
        <form onSubmit={submitBulk} className="space-y-3">
          <div className="flex gap-2">
            <button type="button" onClick={() => setBulk(b => ({ ...b, mode: 'selected' }))}
              className={`text-xs font-bold px-3 py-1.5 rounded-lg border ${bulk.mode === 'selected' ? 'bg-gold-500/20 border-gold-500/60 text-gold-300' : 'border-navy-600 text-navy-300'}`}>
              เลือกสมาชิก
            </button>
            <button type="button" onClick={() => setBulk(b => ({ ...b, mode: 'all' }))}
              className={`text-xs font-bold px-3 py-1.5 rounded-lg border ${bulk.mode === 'all' ? 'bg-gold-500/20 border-gold-500/60 text-gold-300' : 'border-navy-600 text-navy-300'}`}>
              สมาชิกทั้งหมดที่ใช้งาน
            </button>
          </div>
          {bulk.mode === 'selected' && (
            <div className="max-h-40 overflow-y-auto bg-navy-900/60 border border-navy-700 rounded-lg p-2 grid sm:grid-cols-2 gap-1">
              {members.map(m => (
                <label key={m.id} className="flex items-center gap-2 text-xs text-navy-200 px-2 py-1 rounded hover:bg-navy-800 cursor-pointer">
                  <input type="checkbox" checked={bulk.userIds.includes(m.id)} onChange={() => toggleMember(m.id)} className="accent-gold-500" />
                  {m.username} <span className="text-navy-500">({satang(m.balance)} บาท)</span>
                </label>
              ))}
              {!members.length && <div className="text-navy-400 text-xs p-2">ไม่มีสมาชิก</div>}
            </div>
          )}
          <div className="grid sm:grid-cols-3 gap-3">
            <Input required type="number" step="0.01" min="0.01" placeholder="จำนวนเงิน (บาท)" value={bulk.amount} onChange={e => setBulk({ ...bulk, amount: e.target.value })} inputClassName="py-2.5" />
            <Select value={bulk.direction} onChange={e => setBulk({ ...bulk, direction: e.target.value })} inputClassName="py-2.5">
              <option value="credit">เพิ่มเครดิต (+)</option><option value="debit">หักเครดิต (−)</option>
            </Select>
            <Input required placeholder="เหตุผล (บังคับ)" value={bulk.reason} onChange={e => setBulk({ ...bulk, reason: e.target.value })} inputClassName="py-2.5" />
          </div>
          <Button disabled={bulkBusy || (bulk.mode === 'selected' && !bulk.userIds.length)}>
            {bulkBusy ? 'กำลังปรับ…' : `ปรับเครดิตให้ ${bulk.mode === 'all' ? 'สมาชิกทั้งหมด' : `${bulk.userIds.length} คน`}`}
          </Button>
          {bulkMsg && <div className={`text-sm rounded-lg p-3 ${bulkMsg.startsWith('ERROR') ? 'bg-red-500/10 text-red-400' : 'bg-green-500/10 text-green-300'}`} role="status">{bulkMsg}</div>}
        </form>
      </CardBody>
      </Card>

      <Card className="overflow-x-auto">
        <CardHeader title="ประวัติธุรกรรมทั้งหมด" actions={
          <Button variant="ghost" size="sm" onClick={exportCsv}>⬇️ Export CSV</Button>
        } />
        <Table>
          <TableHeader>
            <TableRow className="border-navy-700/60 hover:bg-transparent">
              <TableHead className="text-navy-400">Ref</TableHead>
              <TableHead className="text-navy-400">สมาชิก</TableHead>
              <TableHead className="text-navy-400">ประเภท</TableHead>
              <TableHead className="text-navy-400 text-right">จำนวน</TableHead>
              <TableHead className="text-navy-400 text-right">คงเหลือ</TableHead>
              <TableHead className="text-navy-400">เวลา</TableHead>
              <TableHead className="text-navy-400">รายละเอียด</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {txs.map(t => (
              <TableRow key={t.id} className="border-navy-700/50">
                <TableCell className="font-mono text-xs text-navy-300">{t.reference}</TableCell>
                <TableCell className="text-white">{t.username}</TableCell>
                <TableCell>
                  <Badge variant="outline" className={cn('text-[10px] font-semibold',
                    t.direction === 'credit' ? 'border-emerald-500/40 text-emerald-300' : 'border-red-500/40 text-red-300')}>
                    {TYPE_TH[t.type] || t.type}
                  </Badge>
                </TableCell>
                <TableCell className={cn('text-right font-bold', t.direction === 'credit' ? 'text-green-400' : 'text-red-400')}>
                  {t.direction === 'credit' ? '+' : '−'}{satang(t.amount)} บาท
                </TableCell>
                <TableCell className="text-right text-gold-300">{satang(t.balance_after)} บาท</TableCell>
                <TableCell className="text-xs text-navy-300 whitespace-nowrap">{fmtDateTime(t.created_at)}</TableCell>
                <TableCell className="text-xs text-navy-300 max-w-[200px] truncate">{t.description || '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
