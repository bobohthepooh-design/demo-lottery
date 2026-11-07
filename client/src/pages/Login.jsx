import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';

export default function Login() {
  const { login, verifyMfa } = useAuth();
  const [form, setForm] = useState({ username: '', password: '' });
  const [mfaCode, setMfaCode] = useState('');
  const [needsMfa, setNeedsMfa] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr('');
    try {
      const r = await login(form.username, form.password);
      if (r.requiresMfa) { setNeedsMfa(true); return; }
      navigate('/');
    } catch (e2) { setErr(e2.message); }
    finally { setBusy(false); }
  };

  const submitMfa = async (e) => {
    e.preventDefault();
    setBusy(true); setErr('');
    try { await verifyMfa(mfaCode); navigate('/'); }
    catch (e2) { setErr(e2.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="max-w-md mx-auto bg-navy-800 border border-navy-700 rounded-2xl p-8">
      <h1 className="text-2xl font-bold text-gold-400 mb-6">เข้าสู่ระบบ</h1>
      {needsMfa ? (
        <form onSubmit={submitMfa} className="space-y-4">
          <p className="text-sm text-navy-200">กรอกรหัส TOTP 6 หลักจากแอป Authenticator</p>
          <input value={mfaCode} onChange={e => setMfaCode(e.target.value.replace(/\D/g,'').slice(0,6))}
            className="w-full bg-navy-900 border border-navy-600 rounded-lg px-4 py-3 text-center text-2xl tracking-[0.4em] text-gold-300 focus:outline-none focus:border-gold-500" placeholder="000000" />
          {err && <div className="text-red-400 text-sm">{err}</div>}
          <button disabled={busy||mfaCode.length!==6} className="w-full bg-gold-500 text-navy-950 font-bold py-3 rounded-lg hover:bg-gold-400 disabled:opacity-50">ยืนยัน MFA</button>
        </form>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <input required value={form.username} onChange={e => setForm({...form, username: e.target.value})}
            placeholder="ชื่อผู้ใช้หรืออีเมล" className="w-full bg-navy-900 border border-navy-600 rounded-lg px-4 py-3 focus:outline-none focus:border-gold-500" />
          <input required type="password" value={form.password} onChange={e => setForm({...form, password: e.target.value})}
            placeholder="รหัสผ่าน" className="w-full bg-navy-900 border border-navy-600 rounded-lg px-4 py-3 focus:outline-none focus:border-gold-500" />
          {err && <div className="text-red-400 text-sm">{err}</div>}
          <button disabled={busy} className="w-full bg-gold-500 text-navy-950 font-bold py-3 rounded-lg hover:bg-gold-400 disabled:opacity-50">
            {busy ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
          </button>
          <div className="flex justify-between text-sm">
            <Link to="/forgot-password" className="text-navy-300 hover:text-gold-300">ลืมรหัสผ่าน?</Link>
            <Link to="/register" className="text-gold-400 hover:underline">สมัครสมาชิกใหม่</Link>
          </div>
        </form>
      )}
    </div>
  );
}
