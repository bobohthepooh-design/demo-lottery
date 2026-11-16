import { useState } from 'react';
import { api } from '../api.js';
import { confirmAction } from './confirm.jsx';
import { toast } from '../components/toast.js';

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

      <form onSubmit={send} className="bg-navy-800 border border-navy-700 rounded-xl p-5 space-y-3">
        <div>
          <label className="text-sm text-navy-300">หัวข้อ *</label>
          <input required maxLength={200} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
            placeholder="เช่น ผลหวยงวดพิเศษออกแล้ว"
            className="w-full bg-navy-900 border border-navy-600 rounded-lg px-3 py-2.5 mt-1" />
        </div>
        <div>
          <label className="text-sm text-navy-300">รายละเอียด</label>
          <textarea rows={4} maxLength={500} value={form.body} onChange={e => setForm({ ...form, body: e.target.value })}
            placeholder="ข้อความที่อยากบอกสมาชิก…"
            className="w-full bg-navy-900 border border-navy-600 rounded-lg px-3 py-2.5 mt-1" />
        </div>
        <div>
          <label className="text-sm text-navy-300">ลิงก์ (ไม่บังคับ — path ภายใน เช่น /results)</label>
          <input maxLength={200} value={form.link} onChange={e => setForm({ ...form, link: e.target.value })}
            placeholder="/results"
            className="w-full bg-navy-900 border border-navy-600 rounded-lg px-3 py-2.5 mt-1 font-mono text-xs" />
        </div>
        <button disabled={busy}
          className="w-full bg-gold-500 text-navy-950 font-bold py-3 rounded-lg hover:bg-gold-400 disabled:opacity-40">
          {busy ? 'กำลังส่ง…' : '📣 ส่งประกาศถึงสมาชิกทั้งหมด'}
        </button>
        {msg && <div className={`text-sm rounded-lg p-3 ${msg.startsWith('ERROR') ? 'bg-red-500/10 text-red-400' : 'bg-green-500/10 text-green-300'}`}>{msg}</div>}
      </form>

      <div className="bg-navy-800/60 border border-navy-700/60 rounded-xl p-4 text-xs text-navy-400 space-y-1">
        <div>💡 เคล็ดลับ:</div>
        <div>• ใช้แจ้งผลรางวัลด่วน, โปรโมชัน, หรือประกาศปิดปรับปรุงระบบ</div>
        <div>• ลิงก์ใส่ path ภายในเว็บเท่านั้น (เช่น /results, /lotteries) — ลิงก์ภายนอกจะไม่ทำงาน</div>
        <div>• ทุกการส่งถูกบันทึกใน Audit Log</div>
      </div>
    </div>
  );
}
