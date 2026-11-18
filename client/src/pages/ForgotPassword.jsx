import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import AuthShell from '../components/AuthShell.jsx';
import { Input, Button } from '../components/ui/index.js';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setMsg('');
    try {
      const r = await api('/auth/forgot-password', { method: 'POST', body: { email } });
      setMsg(r.message);
    } catch (e2) { setMsg(e2.message); }
    finally { setBusy(false); }
  };

  return (
    <AuthShell title="ลืมรหัสผ่าน" sub="Demo mode: ระบบจะไม่ส่งอีเมลจริง — ใช้สำหรับทดสอบ flow เท่านั้น">
      <form onSubmit={submit} className="space-y-4">
        <Input required type="email" value={email} onChange={e => setEmail(e.target.value)}
          placeholder="อีเมลที่ลงทะเบียน" autoComplete="email" />
        {msg && <div className="text-sm text-[#0e7490] bg-navy-900 border border-navy-700 rounded-lg p-3" role="status">{msg}</div>}
        <Button disabled={busy} className="w-full">{busy ? 'กำลังดำเนินการ...' : 'ส่งคำขอรีเซ็ต'}</Button>
        <div className="text-center text-sm"><Link to="/login" className="text-[#0369a1]">← กลับไปเข้าสู่ระบบ</Link></div>
      </form>
    </AuthShell>
  );
}
