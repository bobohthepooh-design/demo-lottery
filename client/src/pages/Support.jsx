import { useEffect, useState } from 'react';
import { api, fmtDateTime } from '../api.js';
import { toast } from '../components/toast.js';
import LuxuryCard from '../components/luxury/LuxuryCard.jsx';
import LuxuryButton from '../components/luxury/LuxuryButton.jsx';
import LuxuryInput from '../components/luxury/LuxuryInput.jsx';

const CAT_TH = { payment: 'การชำระเงิน', bet: 'โพยเดิมพัน', account: 'บัญชี', result: 'ผลรางวัล', other: 'อื่นๆ', general: 'ทั่วไป' };
const STATUS_TH = { open: 'เปิดอยู่', in_progress: 'กำลังดำเนินการ', resolved: 'แก้ไขแล้ว', closed: 'ปิดแล้ว' };
const STATUS_CLS = {
  open: 'luxury-badge-info',
  in_progress: 'luxury-badge-gold',
  resolved: 'luxury-badge-success',
  closed: 'text-[var(--muted-gray)] border border-[var(--border-light)]',
};

export default function Support() {
  const [tickets, setTickets] = useState([]);
  const [form, setForm] = useState({ category: 'general', subject: '', message: '' });
  const [busy, setBusy] = useState(false);

  const load = () => api('/compliance/tickets').then(r => setTickets(r.tickets || [])).catch(e => toast(e.message, 'error'));
  useEffect(() => { load(); }, []);

  const submit = async (e) => {
    e.preventDefault(); setBusy(true);
    try {
      await api('/compliance/tickets', { method: 'POST', body: form });
      toast('ส่งเรื่องเรียบร้อย — แอดมินจะตอบกลับที่นี่', 'success');
      setForm({ category: 'general', subject: '', message: '' });
      load();
    } catch (e2) { toast(e2.message, 'error'); }
    finally { setBusy(false); }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-[var(--white)] mb-2">ช่วยเหลือ & รายงานปัญหา</h1>
        <p className="text-[var(--muted-gray)] text-sm">ทีมงานพร้อมให้บริการคุณตลอด 24 ชั่วโมง</p>
      </div>

      <LuxuryCard goldBorder>
        <div className="mb-6">
          <h2 className="text-xl font-semibold text-[var(--white)] mb-2">เปิดเรื่องใหม่</h2>
          <p className="text-[var(--muted-gray)] text-sm">ปัญหาเกี่ยวกับการชำระเงิน / โพย / ผลรางวัล / บัญชี — แอดมินจะตอบกลับในรายการด้านล่าง</p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-[var(--white)] mb-2">หมวด</label>
              <select
                value={form.category}
                onChange={e => setForm({ ...form, category: e.target.value })}
                className="luxury-input w-full"
              >
                {Object.entries(CAT_TH).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-[var(--white)] mb-2">หัวข้อ</label>
              <LuxuryInput
                required
                minLength={3}
                maxLength={150}
                value={form.subject}
                onChange={e => setForm({ ...form, subject: e.target.value })}
                placeholder="เช่น เติมเงินแล้วเครดิตไม่เข้า"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-[var(--white)] mb-2">รายละเอียด</label>
            <textarea
              required
              minLength={10}
              maxLength={3000}
              rows={4}
              value={form.message}
              onChange={e => setForm({ ...form, message: e.target.value })}
              className="luxury-input w-full resize-none"
              placeholder="อธิบายปัญหาให้ละเอียดที่สุด เช่น เลขที่อ้างอิง PAY-xxx เวลาเกิดเหตุการณ์"
            />
          </div>
          <LuxuryButton type="submit" disabled={busy} className="w-full sm:w-auto">
            {busy ? 'กำลังส่ง...' : 'ส่งเรื่อง'}
          </LuxuryButton>
        </form>
      </LuxuryCard>

      <LuxuryCard>
        <div className="mb-4">
          <h2 className="text-xl font-semibold text-[var(--white)]">เรื่องที่ส่งแล้ว ({tickets.length})</h2>
        </div>
        <div className="space-y-3">
          {tickets.length === 0 && (
            <div className="text-center py-8 text-[var(--muted-gray)] text-sm">
              ยังไม่มีเรื่องที่ส่ง
            </div>
          )}
          {tickets.map(t => (
            <div key={t.id} className="p-4 rounded-lg border border-[var(--border-light)] bg-[var(--bg-dark-surface)] hover:border-[var(--border-gold)] transition-all">
              <div className="flex items-center gap-2 flex-wrap mb-2">
                <span className="text-xs font-mono text-[var(--muted-gray)]">#{t.id}</span>
                <span className={`text-xs px-2 py-1 rounded ${STATUS_CLS[t.status]}`}>{STATUS_TH[t.status]}</span>
                <span className="text-xs text-[var(--muted-gray)]">{CAT_TH[t.category] || t.category}</span>
                <span className="ml-auto text-xs text-[var(--dark-gray)]">{fmtDateTime(t.created_at)}</span>
              </div>
              <div className="font-semibold text-[var(--white)] text-sm mb-1">{t.subject}</div>
              <div className="text-sm text-[var(--muted-gray)] whitespace-pre-wrap">{t.message}</div>
              {t.admin_reply && (
                <div className="mt-3 p-3 rounded-lg bg-[rgba(34,197,94,0.1)] border border-[rgba(34,197,94,0.3)]">
                  <div className="text-xs font-bold text-[var(--success-green)] mb-1">
                    คำตอบจากแอดมิน{t.resolved_at ? ` • ${fmtDateTime(t.resolved_at)}` : ''}
                  </div>
                  <div className="text-sm text-[var(--light-gray)] whitespace-pre-wrap">{t.admin_reply}</div>
                </div>
              )}
            </div>
          ))}
        </div>
      </LuxuryCard>
    </div>
  );
}
