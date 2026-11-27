import { useEffect, useState } from 'react';
import { api, satang, fmtDateTime } from '../api.js';
import { confirmAction } from './confirm.jsx';
import { toast } from '../components/toast.js';
import { Input, Select, Button } from '../components/ui/index.js';
import { cn } from '../lib/utils.js';
import { exportCsv as downloadCsv } from '../lib/exportCsv.js';

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
  const [ledgerAccts, setLedgerAccts] = useState([]);
  const [ledgerVerify, setLedgerVerify] = useState(null);
  const [txPage, setTxPage] = useState(0);
  const [txTotal, setTxTotal] = useState(0);
  const TX_PAGE = 50;

  const loadTxs = (page = txPage) => {
    api(`/admin/wallet/transactions?limit=${TX_PAGE}&offset=${page * TX_PAGE}`)
      .then(r => { setTxs(r.transactions); setTxTotal(r.total || 0); })
      .catch(() => {});
  };
  const load = () => {
    api('/admin/members').then(r => setMembers(r.members)).catch(() => {});
    loadTxs();
    api('/admin/ledger/accounts').then(r => setLedgerAccts(r.accounts || [])).catch(() => {});
  };
  useEffect(load, []);

  const verifyLedger = async () => {
    try {
      const r = await api('/admin/ledger/verify');
      setLedgerVerify(r);
    } catch (e) { setLedgerVerify({ ok: false, error: e.message }); }
  };
  const rebuildLedger = async () => {
    if (!(await confirmAction({ title: 'Backfill journal entries', message: 'สร้าง journal entries ย้อนหลังให้ transactions ที่ยังไม่มี? (ทำครั้งเดียวสำหรับข้อมูลเก่า)' }))) return;
    try {
      const r = await api('/admin/ledger/rebuild', { method: 'POST', body: {} });
      toast(`Backfill journal entries แล้ว ${r.posted} รายการ`, 'success');
      load();
    } catch (e) { toast(e.message, 'error'); }
  };

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
      if (r.pendingApproval) {
        setMsg(`📨 ส่งคำขอปรับเครดิต ${r.approval?.reference || ''} เข้าศูนย์อนุมัติแล้ว — รอ admin อีกคนอนุมัติ`);
        toast('ส่งคำขอปรับเครดิตเข้าศูนย์อนุมัติแล้ว', 'info');
      } else {
        setMsg(`สำเร็จ — ref ${r.transaction.reference} • ยอดใหม่ ${satang(r.balance)} บาท`);
        toast('ปรับเครดิตแล้ว', 'success');
      }
      setForm({ userId: '', amount: '', direction: 'credit', reason: '', idempotencyKey: newKey() });
      load();
    } catch (e2) { setMsg('ERROR: ' + e2.message); toast(e2.message, 'error'); }
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
      if (r.pendingApproval) {
        setBulkMsg(`📨 ส่งคำขอปรับเครดิตกลุ่ม ${r.approval?.reference || ''} เข้าศูนย์อนุมัติแล้ว`);
        toast('ส่งคำขอปรับเครดิตกลุ่มเข้าศูนย์อนุมัติแล้ว', 'info');
      } else {
        const fails = (r.results || []).filter(x => !x.ok);
        setBulkMsg(`สำเร็จ ${r.succeeded} • ล้มเหลว ${r.failed}` + (fails.length ? ` — ${fails.slice(0, 3).map(f => `#${f.userId}: ${f.error}`).join(' | ')}` : ''));
        toast(`ปรับเครดิตสำเร็จ ${r.succeeded} • ล้มเหลว ${r.failed}`, r.failed ? 'error' : 'success');
      }
      setBulk({ mode: 'selected', userIds: [], amount: '', direction: 'credit', reason: '' });
      load();
    } catch (e2) { setBulkMsg('ERROR: ' + e2.message); toast(e2.message, 'error'); }
    finally { setBulkBusy(false); }
  };

  // export transactions เป็น CSV (เฉพาะหน้าที่กำลังดู) — ใช้ shared exporter (BOM + escape + กัน formula injection)
  const exportCsv = () => {
    downloadCsv(`wallet-tx-p${txPage + 1}-${new Date().toISOString().slice(0, 10)}.csv`,
      txs.map(t => ({ ...t, type: TYPE_TH[t.type] || t.type })), [
      { key: 'reference', label: 'เลขอ้างอิง' },
      { key: 'username', label: 'ชื่อผู้ใช้' },
      { key: 'type', label: 'ประเภท' },
      { key: 'direction', label: 'ทิศทาง' },
      { key: 'amount', label: 'จำนวนเงิน(สตางค์)' },
      { key: 'balance_after', label: 'ยอดหลัง(สตางค์)' },
      { key: 'description', label: 'รายละเอียด' },
      { key: 'created_at', label: 'เวลาที่สร้าง' },
    ]);
  };

  const txPageCount = Math.max(1, Math.ceil(txTotal / TX_PAGE));

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold [color:var(--white)]">จัดการเครดิตเสมือน</h1>
        <span className="px-3 py-1 rounded-full text-xs font-bold [background:color-mix(in_srgb,var(--gold-primary)_15%,transparent)] [border:1px_solid_var(--border-gold)] [color:var(--gold-primary)]">Virtual Wallet</span>
      </div>

      {/* Single Adjust Form */}
      <div className="luxury-card luxury-card-gold-border p-5">
        <h2 className="text-lg font-semibold mb-4 [color:var(--gold-primary)]">ปรับเครดิตรายบุคคล</h2>
        <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs mb-1.5 [color:var(--muted-gray)]">สมาชิก</label>
            <Select required value={form.userId} onChange={e => setForm({...form, userId: e.target.value})} inputClassName="py-2.5 luxury-input">
              <option value="">— เลือกสมาชิก —</option>
              {members.map(m => <option key={m.id} value={m.id}>{m.username} ({satang(m.balance)} บาท)</option>)}
            </Select>
          </div>
          <div>
            <label className="block text-xs mb-1.5 [color:var(--muted-gray)]">จำนวนเงิน (บาท)</label>
            <Input required type="number" step="0.01" min="0.01" placeholder="0.00" value={form.amount} onChange={e => setForm({...form, amount: e.target.value})} inputClassName="py-2.5 luxury-input" />
          </div>
          <div>
            <label className="block text-xs mb-1.5 [color:var(--muted-gray)]">ประเภท</label>
            <Select value={form.direction} onChange={e => setForm({...form, direction: e.target.value})} inputClassName="py-2.5 luxury-input">
              <option value="credit">เพิ่มเครดิต (+)</option><option value="debit">หักเครดิต (−)</option>
            </Select>
          </div>
          <div>
            <label className="block text-xs mb-1.5 [color:var(--muted-gray)]">เหตุผล (บังคับ)</label>
            <Input required placeholder="ระบุเหตุผล" value={form.reason} onChange={e => setForm({...form, reason: e.target.value})} inputClassName="py-2.5 luxury-input" />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs mb-1.5 [color:var(--muted-gray)]">Idempotency Key</label>
            <Input placeholder="Auto-generated" value={form.idempotencyKey} onChange={e => setForm({...form, idempotencyKey: e.target.value})} inputClassName="py-2.5 font-mono text-xs luxury-input" />
          </div>
          <div className="sm:col-span-2">
            <button type="submit" className="luxury-btn w-full sm:w-auto px-8">ปรับเครดิต</button>
          </div>
          {msg && <div className={`sm:col-span-2 text-sm rounded-lg p-3 ${msg.startsWith('ERROR') ? 'bg-red-500/10 text-red-400' : 'bg-green-500/10 text-green-300'}`} role="status">{msg}</div>}
        </form>
      </div>

      {/* Bulk Adjust */}
      <div className="luxury-card p-5">
        <h2 className="text-lg font-semibold mb-2 [color:var(--gold-primary)]">ปรับเครดิตหลายบัญชี</h2>
        <p className="text-xs mb-4 [color:var(--muted-gray)]">เลือกสมาชิกหลายคนหรือทั้งหมด — ใช้เหตุผลเดียวกัน ทุกบัญชีบันทึก audit แยก (สูงสุด 200 คน/ครั้ง)</p>
        <form onSubmit={submitBulk} className="space-y-4">
          <div className="flex gap-2">
            <button type="button" onClick={() => setBulk(b => ({ ...b, mode: 'selected' }))}
              className={`text-xs font-bold px-4 py-2 rounded-lg border transition-all ${bulk.mode === 'selected' ? 'luxury-btn' : 'luxury-btn-ghost'}`}>
              เลือกสมาชิก
            </button>
            <button type="button" onClick={() => setBulk(b => ({ ...b, mode: 'all' }))}
              className={`text-xs font-bold px-4 py-2 rounded-lg border transition-all ${bulk.mode === 'all' ? 'luxury-btn' : 'luxury-btn-ghost'}`}>
              สมาชิกทั้งหมดที่ใช้งาน
            </button>
          </div>
          {bulk.mode === 'selected' && (
            <div className="max-h-48 overflow-y-auto p-3 rounded-lg grid grid-cols-1 sm:grid-cols-2 gap-2 [background:var(--bg-dark-surface)] [border:1px_solid_var(--border-light)]">
              {members.map(m => (
                <label key={m.id} className="flex items-center gap-2 text-xs px-3 py-2 rounded cursor-pointer transition-colors" style={{
                  color: 'var(--white)',
                  background: bulk.userIds.includes(m.id) ? 'color-mix(in srgb, var(--gold-primary) 10%, transparent)' : 'transparent',
                  border: bulk.userIds.includes(m.id) ? '1px solid var(--border-gold)' : '1px solid transparent'
                }}>
                  <input type="checkbox" checked={bulk.userIds.includes(m.id)} onChange={() => toggleMember(m.id)} className="[accent-color:var(--gold-primary)]" />
                  {m.username} <span className="[color:var(--muted-gray)]">({satang(m.balance)} บาท)</span>
                </label>
              ))}
              {!members.length && <div className="text-center py-4 text-xs [color:var(--muted-gray)]">ไม่มีสมาชิก</div>}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs mb-1.5 [color:var(--muted-gray)]">จำนวนเงิน (บาท)</label>
              <Input required type="number" step="0.01" min="0.01" placeholder="0.00" value={bulk.amount} onChange={e => setBulk({ ...bulk, amount: e.target.value })} inputClassName="py-2.5 luxury-input" />
            </div>
            <div>
              <label className="block text-xs mb-1.5 [color:var(--muted-gray)]">ประเภท</label>
              <Select value={bulk.direction} onChange={e => setBulk({ ...bulk, direction: e.target.value })} inputClassName="py-2.5 luxury-input">
                <option value="credit">เพิ่มเครดิต (+)</option><option value="debit">หักเครดิต (−)</option>
              </Select>
            </div>
            <div>
              <label className="block text-xs mb-1.5 [color:var(--muted-gray)]">เหตุผล (บังคับ)</label>
              <Input required placeholder="ระบุเหตุผล" value={bulk.reason} onChange={e => setBulk({ ...bulk, reason: e.target.value })} inputClassName="py-2.5 luxury-input" />
            </div>
          </div>
          <button type="submit" disabled={bulkBusy || (bulk.mode === 'selected' && !bulk.userIds.length)} className="luxury-btn w-full sm:w-auto px-8">
            {bulkBusy ? 'กำลังปรับ…' : `ปรับเครดิตให้ ${bulk.mode === 'all' ? 'สมาชิกทั้งหมด' : `${bulk.userIds.length} คน`}`}
          </button>
          {bulkMsg && <div className={`text-sm rounded-lg p-3 ${bulkMsg.startsWith('ERROR') ? 'bg-red-500/10 text-red-400' : 'bg-green-500/10 text-green-300'}`} role="status">{bulkMsg}</div>}
        </form>
      </div>

      {/* Transactions Table */}
      <div className="luxury-card overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b [border-color:var(--border-light)]">
          <h2 className="text-lg font-semibold [color:var(--white)]">
            ประวัติธุรกรรมทั้งหมด <span className="[color:var(--gold-primary)]">({txTotal.toLocaleString()} รายการ)</span>
          </h2>
          <button onClick={exportCsv} className="luxury-btn-outline text-xs px-4 py-2 rounded-lg">⬇️ Export CSV (หน้านี้)</button>
        </div>
        {/* Desktop: ตาราง — ซ่อนบนจอ < lg */}
        <div className="overflow-x-auto hidden lg:block table-vscroll">
          <table className="w-full text-sm">
            <thead>
              <tr className="[background:var(--bg-dark-surface)] [border-bottom:1px_solid_var(--border-light)]">
                <th className="px-4 py-3 text-left text-xs font-semibold [color:var(--muted-gray)]">Ref</th>
                <th className="px-4 py-3 text-left text-xs font-semibold [color:var(--muted-gray)]">สมาชิก</th>
                <th className="px-4 py-3 text-left text-xs font-semibold [color:var(--muted-gray)]">ประเภท</th>
                <th className="px-4 py-3 text-right text-xs font-semibold [color:var(--muted-gray)]">จำนวน</th>
                <th className="px-4 py-3 text-right text-xs font-semibold [color:var(--muted-gray)]">คงเหลือ</th>
                <th className="px-4 py-3 text-left text-xs font-semibold [color:var(--muted-gray)]">เวลา</th>
                <th className="px-4 py-3 text-left text-xs font-semibold [color:var(--muted-gray)]">รายละเอียด</th>
              </tr>
            </thead>
            <tbody>
              {txs.map(t => (
                <tr key={t.id} className="hover:bg-[var(--bg-card-hover)] transition-colors [border-bottom:1px_solid_var(--border-light)]">
                  <td className="px-4 py-3 font-mono text-xs [color:var(--gold-primary)]">{t.reference}</td>
                  <td className="px-4 py-3 [color:var(--white)]">{t.username}</td>
                  <td className="px-4 py-3">
                    <span className={cn('text-[10px] font-semibold px-2 py-1 rounded border', t.direction === 'credit' ? 'luxury-badge-success' : 'luxury-badge-danger')}>
                      {TYPE_TH[t.type] || t.type}
                    </span>
                  </td>
                  <td className={cn('px-4 py-3 text-right font-bold', t.direction === 'credit' ? 'text-green-400' : 'text-red-400')}>
                    {t.direction === 'credit' ? '+' : '−'}{satang(t.amount)} บาท
                  </td>
                  <td className="px-4 py-3 text-right font-semibold [color:var(--gold-primary)]">{satang(t.balance_after)} บาท</td>
                  <td className="px-4 py-3 text-xs whitespace-nowrap [color:var(--muted-gray)]">{fmtDateTime(t.created_at)}</td>
                  <td className="px-4 py-3 text-xs max-w-[200px] truncate [color:var(--muted-gray)]">{t.description || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile/Tablet (< lg): การ์ดแนวตั้ง — ข้อมูลเดียวกับตาราง */}
        <div className="lg:hidden p-4 space-y-3">
          {txs.map(t => (
            <div key={t.id} className="rounded-xl p-4 space-y-2 [background:var(--bg-dark-surface)] [border:1px_solid_var(--border-light)]">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-mono font-bold text-sm [color:var(--gold-primary)]">{t.reference}</div>
                  <div className="text-xs [color:var(--white)]">{t.username}</div>
                  <div className="text-[11px] [color:var(--muted-gray)]">{fmtDateTime(t.created_at)}</div>
                </div>
                <div className={cn('text-right font-bold text-sm shrink-0', t.direction === 'credit' ? 'text-green-400' : 'text-red-400')}>
                  {t.direction === 'credit' ? '+' : '−'}{satang(t.amount)} บาท
                </div>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className={cn('text-[10px] font-semibold px-2 py-1 rounded border', t.direction === 'credit' ? 'luxury-badge-success' : 'luxury-badge-danger')}>
                  {TYPE_TH[t.type] || t.type}
                </span>
                <div className="text-xs font-semibold [color:var(--gold-primary)]">คงเหลือ {satang(t.balance_after)} บาท</div>
              </div>
              {t.description && <div className="text-xs [color:var(--muted-gray)]">{t.description}</div>}
            </div>
          ))}
        </div>
        {txPageCount > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t [border-color:var(--border-light)]">
            <span className="text-xs [color:var(--muted-gray)]">หน้า {txPage + 1}/{txPageCount} — {txTotal.toLocaleString()} รายการ</span>
            <div className="flex gap-2">
              <button disabled={txPage === 0} onClick={() => { const p = txPage - 1; setTxPage(p); loadTxs(p); }}
                className="luxury-btn-ghost text-xs px-4 py-2 rounded-lg disabled:opacity-50">← ก่อนหน้า</button>
              <button disabled={txPage + 1 >= txPageCount} onClick={() => { const p = txPage + 1; setTxPage(p); loadTxs(p); }}
                className="luxury-btn-ghost text-xs px-4 py-2 rounded-lg disabled:opacity-50">ถัดไป →</button>
            </div>
          </div>
        )}
      </div>

      {/* Double-entry Ledger */}
      <div className="luxury-card p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold [color:var(--gold-primary)]">บัญชีแยก (Double-Entry Ledger)</h2>
            <p className="text-xs mt-1 [color:var(--muted-gray)]">ทุกธุรกรรมมี journal 2 ขา (Dr/Cr เท่ากัน) — house accounts เป็นบัญชีคู่ของเครดิตเสมือน</p>
          </div>
          <div className="flex gap-2">
            <button onClick={verifyLedger} className="luxury-btn-outline text-xs px-4 py-2 rounded-lg">ตรวจยอด</button>
            <button onClick={rebuildLedger} className="luxury-btn-outline text-xs px-4 py-2 rounded-lg">Backfill เก่า</button>
          </div>
        </div>
        {ledgerVerify && (
          <div className={`text-xs rounded-lg p-3 mb-4 ${ledgerVerify.ok ? 'luxury-badge-success' : 'luxury-badge-danger'}`}>
            {ledgerVerify.ok
              ? `✓ Ledger ถูกต้อง — Dr ${satang(ledgerVerify.globalDebit)} = Cr ${satang(ledgerVerify.globalCredit)} บาท • ทุก tx มี journal ครบ`
              : `✗ พบปัญหา: ${ledgerVerify.transactionsMissingJournal} tx ขาด journal • unbalanced ${ledgerVerify.unbalancedTransactions?.length || 0} รายการ`}
          </div>
        )}
        {/* Desktop: ตาราง — ซ่อนบนจอ < lg */}
        <div className="overflow-x-auto hidden lg:block table-vscroll">
          <table className="w-full text-sm">
            <thead>
              <tr className="[background:var(--bg-dark-surface)] [border-bottom:1px_solid_var(--border-light)]">
                <th className="px-4 py-3 text-left text-xs font-semibold [color:var(--muted-gray)]">บัญชี</th>
                <th className="px-4 py-3 text-right text-xs font-semibold [color:var(--muted-gray)]">Dr รวม</th>
                <th className="px-4 py-3 text-right text-xs font-semibold [color:var(--muted-gray)]">Cr รวม</th>
                <th className="px-4 py-3 text-right text-xs font-semibold [color:var(--muted-gray)]">ยอดคงเหลือ</th>
              </tr>
            </thead>
            <tbody>
              {ledgerAccts.map(a => (
                <tr key={a.account} className="hover:bg-[var(--bg-card-hover)] transition-colors [border-bottom:1px_solid_var(--border-light)]">
                  <td className="px-4 py-3 font-mono text-xs [color:var(--white)]">{a.account}</td>
                  <td className="px-4 py-3 text-right text-xs [color:var(--muted-gray)]">{satang(a.debit_total)} บาท</td>
                  <td className="px-4 py-3 text-right text-xs [color:var(--muted-gray)]">{satang(a.credit_total)} บาท</td>
                  <td className={cn('px-4 py-3 text-right text-xs font-bold', a.balance >= 0 ? 'text-green-400' : 'text-red-400')}>
                    {a.balance >= 0 ? '+' : ''}{satang(a.balance)} บาท
                  </td>
                </tr>
              ))}
              {!ledgerAccts.length && <tr><td colSpan={4} className="text-center py-6 text-xs [color:var(--muted-gray)]">ยังไม่มี journal entries — รอธุรกรรมใหม่ หรือกด Backfill</td></tr>}
            </tbody>
          </table>
        </div>
        {!ledgerAccts.length && <div className="lg:hidden p-4 text-center text-xs [color:var(--muted-gray)]">ยังไม่มี journal entries — รอธุรกรรมใหม่ หรือกด Backfill</div>}

        {/* Mobile/Tablet (< lg): การ์ดแนวตั้ง — ข้อมูลเดียวกับตาราง */}
        <div className="lg:hidden p-4 pt-0 space-y-3">
          {ledgerAccts.map(a => (
            <div key={a.account} className="rounded-xl p-4 space-y-2 [background:var(--bg-dark-surface)] [border:1px_solid_var(--border-light)]">
              <div className="font-mono font-bold text-sm [color:var(--white)]">{a.account}</div>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div>
                  <div className="text-[10px] [color:var(--muted-gray)]">Dr รวม</div>
                  <div className="[color:var(--muted-gray)]">{satang(a.debit_total)} บาท</div>
                </div>
                <div>
                  <div className="text-[10px] [color:var(--muted-gray)]">Cr รวม</div>
                  <div className="[color:var(--muted-gray)]">{satang(a.credit_total)} บาท</div>
                </div>
                <div>
                  <div className="text-[10px] [color:var(--muted-gray)]">ยอดคงเหลือ</div>
                  <div className={cn('font-bold', a.balance >= 0 ? 'text-green-400' : 'text-red-400')}>
                    {a.balance >= 0 ? '+' : ''}{satang(a.balance)} บาท
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
