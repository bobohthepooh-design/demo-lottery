import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';

export default function Register() {
  const [form, setForm] = useState({ username: '', email: '', password: '', displayName: '' });
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr('');
    try {
      await api('/auth/register', { method: 'POST', body: form });
      setDone(true);
    } catch (e2) { setErr(e2.message); }
    finally { setBusy(false); }
  };

  if (done) return (
    <div className="max-w-md mx-auto bg-navy-800 border border-navy-700 rounded-2xl p-8 text-center">
      <div className="text-4xl mb-3">✅</div>
      <h1 className="text-xl font-bold text-gold-400">สมัครสมาชิกสำเร็จ</h1>
      <p className="text-navy-200 text-sm mt-2">คุณได้รับเครดิตเริ่มต้นสำหรับทดลองใช้แล้ว</p>
      <Link to="/login" className="inline-block mt-5 bg-gold-500 text-navy-950 font-bold px-6 py-3 rounded-lg">เข้าสู่ระบบ</Link>
    </div>
  );

  return (
    <div className="max-w-md mx-auto bg-navy-800 border border-navy-700 rounded-2xl p-8">
      <h1 className="text-2xl font-bold text-gold-400 mb-6">สมัครสมาชิก</h1>
      <form onSubmit={submit} className="space-y-4">
        <input required value={form.username} onChange={e => setForm({...form, username: e.target.value})}
          placeholder="ชื่อผู้ใช้ (a-z 0-9 _ 3-32 ตัว)" pattern="[a-zA-Z0-9_]{3,32}"
          className="w-full bg-navy-900 border border-navy-600 rounded-lg px-4 py-3 focus:outline-none focus:border-gold-500" />
        <input required type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})}
          placeholder="อีเมล" className="w-full bg-navy-900 border border-navy-600 rounded-lg px-4 py-3 focus:outline-none focus:border-gold-500" />
        <input required value={form.displayName} onChange={e => setForm({...form, displayName: e.target.value})}
          placeholder="ชื่อที่แสดง" className="w-full bg-navy-900 border border-navy-600 rounded-lg px-4 py-3 focus:outline-none focus:border-gold-500" />
        <input required type="password" minLength={8} value={form.password} onChange={e => setForm({...form, password: e.target.value})}
          placeholder="รหัสผ่าน (อย่างน้อย 8 ตัว)" className="w-full bg-navy-900 border border-navy-600 rounded-lg px-4 py-3 focus:outline-none focus:border-gold-500" />
        {err && <div className="text-red-400 text-sm">{err}</div>}
        <button disabled={busy} className="w-full bg-gold-500 text-navy-950 font-bold py-3 rounded-lg hover:bg-gold-400 disabled:opacity-50">
          {busy ? 'กำลังสมัคร...' : 'สมัครสมาชิก'}
        </button>
        <div className="text-center text-sm text-navy-300">มีบัญชีแล้ว? <Link to="/login" className="text-gold-400">เข้าสู่ระบบ</Link></div>
      </form>
    </div>
  );
}
