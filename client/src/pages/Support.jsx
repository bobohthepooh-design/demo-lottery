import { useEffect, useState } from 'react';
import { api, fmtDateTime } from '../api.js';
import { toast } from '../components/toast.js';
import { Card, CardHeader, Button, Input, Select } from '../components/ui/index.js';
import { Badge } from '../components/shadcn/badge.jsx';

const CAT_TH = { payment: 'การชำระเงิน', bet: 'โพยเดิมพัน', account: 'บัญชี', result: 'ผลรางวัล', other: 'อื่นๆ', general: 'ทั่วไป' };
const STATUS_TH = { open: 'เปิดอยู่', in_progress: 'กำลังดำเนินการ', resolved: 'แก้ไขแล้ว', closed: 'ปิดแล้ว' };
const STATUS_CLS = {
  open: 'border-amber-500/40 text-amber-300',
  in_progress: 'border-sky-500/40 text-sky-300',
  resolved: 'border-emerald-500/40 text-emerald-300',
  closed: 'border-navy-600 text-navy-400',
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
    <div className="max-w-3xl mx-auto space-y-4">
      <h1 className="text-2xl font-bold text-white">ช่วยเหลือ & รายงานปัญหา</h1>

      <Card>
        <CardHeader title="เปิดเรื่องใหม่" sub="ปัญหาเกี่ยวกับการชำระเงิน / โพย / ผลรางวัล / บัญชี — แอดมินจะตอบกลับในรายการด้านล่าง" />
        <form onSubmit={submit} className="p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Select label="หมวด" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} inputClassName="py-2 text-sm">
              {Object.entries(CAT_TH).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
            <Input label="หัวข้อ" required minLength={3} maxLength={150} value={form.subject}
              onChange={e => setForm({ ...form, subject: e.target.value })} placeholder="เช่น เติมเงินแล้วเครดิตไม่เข้า" inputClassName="py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-navy-300 mb-1.5">รายละเอียด</label>
            <textarea required minLength={10} maxLength={3000} rows={4} value={form.message}
              onChange={e => setForm({ ...form, message: e.target.value })}
              className="w-full bg-navy-900 border border-navy-600 rounded-lg px-4 py-3 text-white placeholder:text-navy-500 focus:outline-none focus:border-gold-400/70 text-sm"
              placeholder="อธิบายปัญหาให้ละเอียดที่สุด เช่น เลขที่อ้างอิง PAY-xxx เวลาเกิดเหตุการณ์" />
          </div>
          <Button type="submit" disabled={busy} className="w-full sm:w-auto">{busy ? 'กำลังส่ง...' : 'ส่งเรื่อง'}</Button>
        </form>
      </Card>

      <Card>
        <CardHeader title={`เรื่องที่ส่งแล้ว (${tickets.length})`} />
        <div className="divide-y divide-navy-800">
          {tickets.length === 0 && <div className="p-6 text-center text-navy-400 text-sm">ยังไม่มีเรื่องที่ส่ง</div>}
          {tickets.map(t => (
            <div key={t.id} className="p-4">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-mono text-navy-400">#{t.id}</span>
                <Badge variant="outline" className={`text-[10px] ${STATUS_CLS[t.status]}`}>{STATUS_TH[t.status]}</Badge>
                <span className="text-[10px] text-navy-400">{CAT_TH[t.category] || t.category}</span>
                <span className="ml-auto text-[10px] text-navy-500">{fmtDateTime(t.created_at)}</span>
              </div>
              <div className="mt-1 font-semibold text-white text-sm">{t.subject}</div>
              <div className="mt-1 text-xs text-navy-300 whitespace-pre-wrap">{t.message}</div>
              {t.admin_reply && (
                <div className="mt-2 bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-3">
                  <div className="text-[10px] font-bold text-emerald-300 mb-1">คำตอบจากแอดมิน{t.resolved_at ? ` • ${fmtDateTime(t.resolved_at)}` : ''}</div>
                  <div className="text-xs text-navy-200 whitespace-pre-wrap">{t.admin_reply}</div>
                </div>
              )}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
