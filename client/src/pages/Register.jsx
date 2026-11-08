import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import LineLoginButton from '../components/LineLoginButton.jsx';

export default function Register() {
  const { login } = useAuth();
  const [form, setForm] = useState({ username: '', email: '', password: '', displayName: '' });
  const [showPw, setShowPw] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr('');
    try {
      // สมัครแล้วเข้าสู่ระบบให้อัตโนมัติ — ไม่ต้องกรอกซ้ำ
      await api('/auth/register', { method: 'POST', body: form });
      await login(form.username, form.password);
      navigate('/');
    } catch (e2) { setErr(e2.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="max-w-md mx-auto bg-navy-800 border border-navy-700 rounded-2xl p-8">
      <h1 className="text-2xl font-bold text-gold-400 mb-1">สมัครสมาชิก</h1>
      <p className="text-xs text-navy-300 mb-5">กรอกแค่ชื่อผู้ใช้กับรหัสผ่านก็สมัครได้ — รับเครดิตทดลองทันที</p>
      <form onSubmit={submit} className="space-y-4">
        <input required value={form.username} onChange={e => setForm({...form, username: e.target.value})}
          placeholder="ชื่อผู้ใช้ (a-z 0-9 _ 3-32 ตัว)" pattern="[a-zA-Z0-9_]{3,32}"
          className="w-full bg-navy-900 border border-navy-600 rounded-lg px-4 py-3 focus:outline-none focus:border-gold-500" />
        <input type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})}
          placeholder="อีเมล (ไม่บังคับ)" className="w-full bg-navy-900 border border-navy-600 rounded-lg px-4 py-3 focus:outline-none focus:border-gold-500" />
        <input value={form.displayName} onChange={e => setForm({...form, displayName: e.target.value})}
          placeholder="ชื่อที่แสดง (ไม่บังคับ)" className="w-full bg-navy-900 border border-navy-600 rounded-lg px-4 py-3 focus:outline-none focus:border-gold-500" />
        <div className="relative">
          <input required type={showPw ? 'text' : 'password'} minLength={8} value={form.password} onChange={e => setForm({...form, password: e.target.value})}
            placeholder="รหัสผ่าน (อย่างน้อย 8 ตัว)"
            className="w-full bg-navy-900 border border-navy-600 rounded-lg px-4 py-3 pr-16 focus:outline-none focus:border-gold-500" />
          <button type="button" onClick={() => setShowPw(!showPw)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-navy-300 hover:text-gold-300">
            {showPw ? 'ซ่อน' : 'แสดง'}
          </button>
        </div>
        {err && <div className="text-red-400 text-sm">{err}</div>}
        <button disabled={busy} className="w-full bg-gold-500 text-navy-950 font-bold py-3 rounded-lg hover:bg-gold-400 disabled:opacity-50">
          {busy ? 'กำลังสมัคร...' : 'สมัครและเข้าใช้งานเลย'}
        </button>
        <div className="text-center text-sm text-navy-300">มีบัญชีแล้ว? <Link to="/login" className="text-gold-400">เข้าสู่ระบบ</Link></div>
      </form>
      <div className="mt-5">
        <div className="flex items-center gap-3 text-xs text-navy-400 mb-3">
          <div className="flex-1 h-px bg-navy-700" />หรือ<div className="flex-1 h-px bg-navy-700" />
        </div>
        <LineLoginButton label="สมัคร/เข้าสู่ระบบด้วย LINE" />
      </div>
    </div>
  );
}
