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
        <h1 className="text-2xl font-bold text-white">แจ้งเตือนสมาชิกทั้งหมด</h1>
        <p className="text-sm text-navy-300">ส่งประกาศไปยัง notification center ของสมาชิกทุกคนที่ใช้งานอยู่ + web push (ถ้าเปิดไว้)</p>
      </div>

      <Card>
        <CardBody>
          <form onSubmit={send} className="space-y-3">
            <Input label="หัวข้อ *" required maxLength={200} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
              placeholder="เช่น ผลหวยงวดพิเศษออกแล้ว" inputClassName="py-2.5" />
            <div>
              <label className="text-sm text-navy-300">รายละเอียด</label>
              <textarea rows={4} maxLength={500} value={form.body} onChange={e => setForm({ ...form, body: e.target.value })}
                placeholder="ข้อความที่อยากบอกสมาชิก…"
                className="w-full mt-1 bg-navy-900 border border-navy-600 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:border-cyan-400/70" />
            </div>
            <Input label="ลิงก์ (ไม่บังคับ — path ภายใน เช่น /results)" maxLength={200} value={form.link} onChange={e => setForm({ ...form, link: e.target.value })}
              placeholder="/results" inputClassName="py-2.5 font-mono text-xs" />
            <Button disabled={busy} className="w-full">{busy ? 'กำลังส่ง…' : 'ส่งประกาศถึงสมาชิกทั้งหมด'}</Button>
            {msg && <div className={`text-sm rounded-lg p-3 ${msg.startsWith('ERROR') ? 'bg-red-500/10 text-red-400' : 'bg-green-500/10 text-green-300'}`} role="status">{msg}</div>}
          </form>
        </CardBody>
      </Card>

      <Card variant="subtle">
        <CardBody className="text-xs text-navy-400 space-y-1">
          <div>💡 เคล็ดลับ:</div>
          <div>• ใช้แจ้งผลรางวัลด่วน, โปรโมชัน, หรือประกาศปิดปรับปรุงระบบ</div>
          <div>• ลิงก์ใส่ path ภายในเว็บเท่านั้น (เช่น /results, /lotteries) — ลิงก์ภายนอกจะไม่ทำงาน</div>
          <div>• ทุกการส่งถูกบันทึกใน Audit Log</div>
        </CardBody>
      </Card>
    </div>
  );
}
