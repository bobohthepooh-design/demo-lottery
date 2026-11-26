import { useState } from 'react';
import { api } from '../api.js';
import { confirmAction } from './confirm.jsx';
import { toast } from '../components/toast.js';
import { Card, CardBody, Input, Button } from '../components/ui/index.js';

// ส่งประกาศ/แจ้งเตือนไปหาสมาชิกทั้งหมด — เข้า notification center + web push
export default function AdminBroadcast() {
  const [form, setForm] = useState({ title: '', body: '', link: '' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const send = async (e) => {
    e.preventDefault(); setMsg('');
    if (!(await confirmAction({
      title: 'ยืนยันส่งประกาศ',
      message: `ส่ง "${form.title}" ไปยังสมาชิกที่ใช้งานทั้งหมด?`,
    }))) return;
    setBusy(true);
    try {
      const r = await api('/admin/broadcast', { method: 'POST', body: form });
      setMsg(`ส่งสำเร็จ ${r.sent} คน`);
      toast(`ส่งประกาศถึงสมาชิก ${r.sent} คนแล้ว`, 'success');
      setForm({ title: '', body: '', link: '' });
    } catch (e2) { setMsg('ERROR: ' + e2.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="max-w-xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold [color:var(--white)]">แจ้งเตือนสมาชิกทั้งหมด</h1>
        <p className="text-sm [color:var(--light-gray)]">ส่งประกาศไปยัง notification center ของสมาชิกทุกคนที่ใช้งานอยู่ + web push (ถ้าเปิดไว้)</p>
      </div>

      <Card className="[background:var(--bg-card)] [border:1px_solid_var(--border-light)] [border-radius:var(--radius-xl)]">
        <CardBody>
          <form onSubmit={send} className="space-y-3">
            <Input label="หัวข้อ *" required maxLength={200} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
              placeholder="เช่น ผลหวยงวดพิเศษออกแล้ว" inputClassName="py-2.5" className="[background:var(--bg-dark-surface)] [border:1px_solid_var(--border-light)] [color:var(--white)]" />
            <div>
              <label className="text-sm [color:var(--light-gray)]">รายละเอียด</label>
              <textarea rows={4} maxLength={500} value={form.body} onChange={e => setForm({ ...form, body: e.target.value })}
                placeholder="ข้อความที่อยากบอกสมาชิก…"
                className="w-full mt-1 rounded-lg px-3 py-2.5 focus:outline-none [background:var(--bg-dark-surface)] [border:1px_solid_var(--border-light)] [color:var(--white)]" />
            </div>
            <Input label="ลิงก์ (ไม่บังคับ — path ภายใน เช่น /results)" maxLength={200} value={form.link} onChange={e => setForm({ ...form, link: e.target.value })}
              placeholder="/results" inputClassName="py-2.5 font-mono text-xs" className="[background:var(--bg-dark-surface)] [border:1px_solid_var(--border-light)] [color:var(--white)]" />
            <Button disabled={busy} className="w-full [background:linear-gradient(135deg,_var(--gold-gradient-start),_var(--gold-gradient-end))] [color:var(--bg-deep-black)]">{busy ? 'กำลังส่ง…' : 'ส่งประกาศถึงสมาชิกทั้งหมด'}</Button>
            {msg && <div className={`text-sm rounded-lg p-3`} style={msg.startsWith('ERROR') ? { background: 'color-mix(in srgb, var(--danger-red) 10%, transparent)', color: 'var(--danger-red)' } : { background: 'color-mix(in srgb, var(--success-green) 10%, transparent)', color: 'var(--success-green)' }} role="status">{msg}</div>}
          </form>
        </CardBody>
      </Card>

      <Card className="[background:var(--bg-card)] [border:1px_solid_var(--border-light)] [border-radius:var(--radius-xl)]">
        <CardBody className="text-xs space-y-1 [color:var(--muted-gray)]">
          <div>💡 เคล็ดลับ:</div>
          <div>• ใช้แจ้งผลรางวัลด่วน, โปรโมชัน, หรือประกาศปิดปรับปรุงระบบ</div>
          <div>• ลิงก์ใส่ path ภายในเว็บเท่านั้น (เช่น /results, /lotteries) — ลิงก์ภายนอกจะไม่ทำงาน</div>
          <div>• ทุกการส่งถูกบันทึกใน Audit Log</div>
        </CardBody>
      </Card>
    </div>
  );
}
