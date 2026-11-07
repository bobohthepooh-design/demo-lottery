import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';

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
    <div className="max-w-md mx-auto bg-navy-800 border border-navy-700 rounded-2xl p-8">
      <h1 className="text-2xl font-bold text-gold-400 mb-2">ลืมรหัสผ่าน</h1>
      <p className="text-sm text-navy-300 mb-6">Demo mode: ระบบจะไม่ส่งอีเมลจริง — ใช้สำหรับทดสอบ flow เท่านั้น</p>
      <form onSubmit={submit} className="space-y-4">
        <input required type="email" value={email} onChange={e => setEmail(e.target.value)}
          placeholder="อีเมลที่ลงทะเบียน" className="w-full bg-navy-900 border border-navy-600 rounded-lg px-4 py-3 focus:outline-none focus:border-gold-500" />
        {msg && <div className="text-sm text-gold-300 bg-navy-900 border border-navy-700 rounded-lg p-3">{msg}</div>}
        <button disabled={busy} className="w-full bg-gold-500 text-navy-950 font-bold py-3 rounded-lg hover:bg-gold-400 disabled:opacity-50">
          {busy ? 'กำลังดำเนินการ...' : 'ส่งคำขอรีเซ็ต'}
        </button>
        <div className="text-center text-sm"><Link to="/login" className="text-gold-400">← กลับไปเข้าสู่ระบบ</Link></div>
      </form>
    </div>
  );
}
