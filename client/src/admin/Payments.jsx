import { useEffect, useState } from 'react';
import { api, satang, fmtDateTime } from '../api.js';
import { Button, Input } from '../components/ui/index.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/shadcn/select.jsx';
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
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const PAGE_SIZE = 50;

  const viewSlip = async (p) => {
    setSlipView({ id: p.id, loading: true });
    try {
      const r = await api(`/admin/payments/${p.id}/slip`);
      setSlipView({ id: p.id, loading: false, imageBase64: r.imageBase64, meta: r });
    } catch (e) {
      setSlipView({ id: p.id, loading: false, error: e.message });
    }
  };

  const load = (p = page) => api(`/admin/payments?status=${status}${kind ? `&kind=${kind}` : ''}&limit=${PAGE_SIZE}&offset=${p * PAGE_SIZE}`)
    .then(r => { setRows(r.requests || []); setTotal(r.total || 0); })
    .catch(e => setMsg(e.message));
  useEffect(() => { setPage(0); load(0); }, [status, kind]);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const review = async (id, action) => {
    setBusy(id); setMsg('');
    try {
      const r = await api(`/admin/payments/${id}/review`, { method: 'POST', body: { action, note: note[id] || '' } });
      if (r.pendingApproval) {
        setMsg(`📨 ส่งคำขอ ${action === 'approve' ? 'อนุมัติ' : 'ปฏิเสธ'} การชำระเงิน ${r.approval?.reference || ''} เข้าศูนย์อนุมัติแล้ว`);
      } else {
        setMsg(action === 'approve' ? `✅ อนุมัติแล้ว${r.balance != null ? ` — ยอดใหม่ ${satang(r.balance)} บาท` : ''}` : 'ปฏิเสธแล้ว');
      }
      load(page);
    } catch (e) { setMsg('❌ ' + e.message); }
    finally { setBusy(null); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold" style={{ color: 'var(--white)' }}>ชำระเงิน</h1>
          <span className="px-3 py-1 rounded-full text-xs font-bold" style={{
            background: 'rgba(212, 175, 55, 0.15)',
            border: '1px solid var(--border-gold)',
            color: 'var(--gold-primary)'
          }}>เติม/ถอน</span>
        </div>
        <div className="flex gap-2">
          <Select value={kind || 'all'} onValueChange={v => setKind(v === 'all' ? '' : v)}>
            <SelectTrigger className="w-36 luxury-input text-xs">
              <SelectValue placeholder="ทุกประเภท" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">ทุกประเภท</SelectItem>
              <SelectItem value="deposit">เติมเงิน</SelectItem>
              <SelectItem value="withdraw">ถอนเงิน</SelectItem>
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-44 luxury-input text-xs">
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
      {msg && <div className="text-sm p-3 rounded-lg luxury-badge-info">{msg}</div>}
      <div className="luxury-card overflow-hidden">
        <div className="p-4 border-b" style={{ borderColor: 'var(--border-light)' }}>
          <h2 className="text-base font-semibold" style={{ color: 'var(--white)' }}>
            คำขอ <span style={{ color: 'var(--gold-primary)' }}>({total.toLocaleString()} รายการ — หน้า {page + 1}/{pageCount})</span>
          </h2>
        </div>
        {rows.length === 0 ? (
          <div className="py-12 text-center text-sm" style={{ color: 'var(--muted-gray)' }}>ไม่มีคำขอ</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: 'var(--bg-dark-surface)', borderBottom: '1px solid var(--border-light)' }}>
                  <th className="px-4 py-3 text-left text-xs font-semibold" style={{ color: 'var(--muted-gray)' }}>คำขอ</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold" style={{ color: 'var(--muted-gray)' }}>สมาชิก</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold" style={{ color: 'var(--muted-gray)' }}>รายละเอียด</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold" style={{ color: 'var(--muted-gray)' }}>สถานะ</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold" style={{ color: 'var(--muted-gray)' }}>จัดการ</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(p => (
                  <tr key={p.id} style={{ borderBottom: '1px solid var(--border-light)' }} className="hover:bg-[var(--bg-card-hover)] transition-colors">
                    <td className="px-4 py-3 align-top">
                      <div className="font-bold text-sm whitespace-nowrap" style={{ color: 'var(--white)' }}>
                        {p.kind === 'deposit' ? '💳 เติม' : '🏦 ถอน'} ฿{satang(p.amount)}
                      </div>
                      <div className="text-[11px] font-mono mt-1" style={{ color: 'var(--gold-primary)' }}>{p.reference}</div>
                      <div className="text-[11px] mt-1" style={{ color: 'var(--muted-gray)' }}>{fmtDateTime(p.created_at)}</div>
                    </td>
                    <td className="px-4 py-3 align-top text-xs" style={{ color: 'var(--white)' }}>
                      {p.username}<div className="text-[11px] mt-1" style={{ color: 'var(--muted-gray)' }}>{p.email}</div>
                    </td>
                    <td className="px-4 py-3 align-top text-xs max-w-[280px]" style={{ color: 'var(--muted-gray)' }}>
                      {p.slip_trans_ref && <div>สลิป: <span className="font-mono" style={{ color: 'var(--gold-primary)' }}>{p.slip_trans_ref}</span></div>}
                      {p.slip_amount != null && <div>ยอดสลิป ฿{satang(p.slip_amount)}</div>}
                      {p.slip_error && <div className="text-red-400">⚠️ {p.slip_error}</div>}
                      {p.kind === 'withdraw' && <div>ปลายทาง: {p.bank_name} {p.bank_account_no} — {p.bank_account_name}</div>}
                      {p.kind === 'withdraw' && p.promptpay_id && (() => {
                        const match = p.phone && String(p.promptpay_id).replace(/\D/g, '') === String(p.phone).replace(/\D/g, '');
                        return <div className={match ? 'text-green-400' : 'text-amber-300'}>
                          พร้อมเพย์: {p.promptpay_id} {match ? '✓ ตรงเบอร์ OTP' : p.phone ? '⚠️ ไม่ตรงเบอร์สมาชิก' : ''}
                        </div>;
                      })()}
                      {p.slip_payer && <div style={{ color: 'var(--muted-gray)' }}>ผู้โอน: {p.slip_payer}</div>}
                      {p.has_slip_image && (
                        <button onClick={() => viewSlip(p)} className="mt-2 text-[11px] underline transition-colors" style={{ color: 'var(--info-blue)' }}>
                          🧾 ดูรูปสลิป
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <span className={cn('text-[11px] font-bold px-2 py-1 rounded border', STATUS_BADGE[p.status])}>
                        {STATUS_TH[p.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 align-top">
                      {(p.status === 'pending_review' || p.status === 'pending_slip') && (
                        <div className="flex flex-col gap-2 items-end">
                          <Input value={note[p.id] || ''} onChange={e => setNote({ ...note, [p.id]: e.target.value })}
                            placeholder="หมายเหตุ (ไม่บังคับ)"
                            className="h-9 w-48 text-xs luxury-input"
                            inputClassName="!h-9 !px-3 !py-2 !text-xs" />
                          <div className="flex gap-2">
                            <button onClick={() => review(p.id, 'approve')} disabled={busy === p.id}
                              className="luxury-btn text-xs px-4 py-2">✅ อนุมัติ</button>
                            <button onClick={() => review(p.id, 'reject')} disabled={busy === p.id}
                              className="text-xs px-4 py-2 rounded-lg border font-semibold transition-all" style={{
                                background: 'rgba(239, 68, 68, 0.15)',
                                borderColor: 'rgba(239, 68, 68, 0.3)',
                                color: 'var(--danger-red)'
                              }}>❌ ปฏิเสธ</button>
                          </div>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {pageCount > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t" style={{ borderColor: 'var(--border-light)' }}>
            <span className="text-xs" style={{ color: 'var(--muted-gray)' }}>ทั้งหมด {total.toLocaleString()} รายการ</span>
            <div className="flex gap-2">
              <button disabled={page === 0} onClick={() => { const p = page - 1; setPage(p); load(p); }}
                className="luxury-btn-ghost text-xs px-4 py-2 rounded-lg disabled:opacity-50">← ก่อนหน้า</button>
              <button disabled={page + 1 >= pageCount} onClick={() => { const p = page + 1; setPage(p); load(p); }}
                className="luxury-btn-ghost text-xs px-4 py-2 rounded-lg disabled:opacity-50">ถัดไป →</button>
            </div>
          </div>
        )}
      </div>

      {/* Slip image viewer */}
      {slipView && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(16, 17, 20, 0.85)' }} onClick={() => setSlipView(null)}>
          <div className="luxury-card luxury-card-gold-border max-w-lg w-full p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div className="text-sm font-bold" style={{ color: 'var(--gold-primary)' }}>🧾 รูปสลิปการโอน</div>
              <button onClick={() => setSlipView(null)} className="text-lg transition-colors" style={{ color: 'var(--muted-gray)' }}>✕</button>
            </div>
            {slipView.loading && <div className="text-sm py-8 text-center" style={{ color: 'var(--muted-gray)' }}>กำลังโหลด...</div>}
            {slipView.error && <div className="text-sm py-8 text-center" style={{ color: 'var(--danger-red)' }}>{slipView.error}</div>}
            {!slipView.loading && !slipView.error && slipView.imageBase64 && (() => {
              const src = slipView.imageBase64.startsWith('data:')
                ? slipView.imageBase64
                : `data:image/jpeg;base64,${slipView.imageBase64}`;
              return <img src={src} alt="slip" className="w-full rounded-lg" style={{ background: 'var(--white)' }} />;
            })()}
            {!slipView.loading && !slipView.error && !slipView.imageBase64 && (
              <div className="text-sm py-8 text-center" style={{ color: 'var(--muted-gray)' }}>ไม่มีรูปสลิป (คำขอนี้ส่งก่อนมีระบบเก็บรูป)</div>
            )}
            {slipView.meta?.slipTransRef && <div className="text-[11px] mt-3 font-mono" style={{ color: 'var(--gold-primary)' }}>Ref: {slipView.meta.slipTransRef}</div>}
          </div>
        </div>
      )}
    </div>
  );
}
