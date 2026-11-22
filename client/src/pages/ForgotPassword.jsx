import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import AuthShell from '../components/AuthShell.jsx';
import { Input, Button } from '../components/ui/index.js';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState('');
  const [token, setToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setMsg('');
    try {
      const r = await api('/auth/forgot-password', { method: 'POST', body: { email } });
      setMsg(r.message);
      if (r.devResetToken) setToken(r.devResetToken);
    } catch (e2) { setMsg(e2.message); }
    finally { setBusy(false); }
  };

  const reset = async (e) => {
    e.preventDefault();
    setBusy(true); setMsg('');
    try {
      const r = await api('/auth/reset-password', { method: 'POST', body: { token, newPassword } });
      setMsg(r.message); setToken(''); setNewPassword('');
    } catch (e2) { setMsg(e2.message); }
    finally { setBusy(false); }
  };

  return (
    <AuthShell title="ลืมรหัสผ่าน" sub="ระบบจะส่งลิงก์รีเซ็ตไปยังอีเมลที่ลงทะเบียน (ถ้าตั้งค่า SMTP แล้ว)">
      <form onSubmit={submit} className="space-y-4">
        <Input required type="email" value={email} onChange={e => setEmail(e.target.value)}
          placeholder="อีเมลที่ลงทะเบียน" autoComplete="email" />
        {msg && <div className="text-sm text-sky-300 bg-navy-900 border border-navy-700 rounded-lg p-3" role="status">{msg}</div>}
        <Button disabled={busy} className="w-full">{busy ? 'กำลังดำเนินการ...' : 'ส่งคำขอรีเซ็ต'}</Button>
      </form>
      {token && (
        <form onSubmit={reset} className="space-y-4 mt-5 border-t border-navy-700 pt-5">
          <div className="text-xs text-amber-300 break-all">ลิงก์ Demo สำหรับเครื่องนี้: {token}</div>
          <Input required value={newPassword} onChange={e => setNewPassword(e.target.value)}
            type="password" minLength={10} maxLength={128} placeholder="รหัสผ่านใหม่ (อย่างน้อย 10 ตัว)" autoComplete="new-password" />
          <Button disabled={busy} className="w-full">{busy ? 'กำลังดำเนินการ...' : 'ตั้งรหัสผ่านใหม่'}</Button>
        </form>
      )}
      <div className="text-center text-sm mt-4"><Link to="/login" className="text-[#67e8c9]">← กลับไปเข้าสู่ระบบ</Link></div>
    </AuthShell>
  );
}
