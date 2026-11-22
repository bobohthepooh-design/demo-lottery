import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import LineLoginButton from '../components/LineLoginButton.jsx';
import PhoneOtpForm from '../components/PhoneOtpForm.jsx';
import AuthShell from '../components/AuthShell.jsx';
import { Input, Button } from '../components/ui/index.js';

export default function Login() {
  const { login, verifyMfa, refresh } = useAuth();
  const [tab, setTab] = useState('password'); // 'password' | 'otp'
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

  const onOtpSuccess = async (r) => {
    if (r?.requiresMfa) { setNeedsMfa(true); return; }
    await refresh();
    navigate('/');
  };

  const tabCls = (t) => `flex-1 py-2.5 text-sm font-bold rounded-lg transition ${tab === t ? 'bg-gold-500/15 text-gold-200 border border-gold-400/50' : 'text-navy-300 hover:text-white border border-transparent'}`;

  return (
    <AuthShell title={needsMfa ? 'ยืนยันตัวตนสองชั้น' : 'เข้าสู่ระบบ'}>
      {needsMfa ? (
        <form onSubmit={submitMfa} className="space-y-4">
          <p className="text-sm text-navy-200">กรอกรหัส TOTP 6 หลักจากแอป Authenticator</p>
          <Input value={mfaCode} onChange={e => setMfaCode(e.target.value.replace(/\D/g,'').slice(0,6))}
            inputClassName="text-center text-2xl tracking-[0.4em] font-mono"
            placeholder="000000" inputMode="numeric" autoComplete="one-time-code" aria-label="รหัส MFA" />
          {err && <div className="text-red-400 text-sm" role="alert">{err}</div>}
          <Button disabled={busy||mfaCode.length!==6} className="w-full">{busy ? 'กำลังตรวจสอบ...' : 'ยืนยัน MFA'}</Button>
        </form>
      ) : (
        <>
          {/* tabs: ชื่อผู้ใช้+รหัสผ่าน / เบอร์+OTP */}
          <div className="flex gap-2 bg-navy-900 border border-navy-700 rounded-xl p-1 mb-5">
            <button type="button" onClick={() => setTab('password')} className={tabCls('password')}>ชื่อผู้ใช้</button>
            <button type="button" onClick={() => setTab('otp')} className={tabCls('otp')}>เบอร์ + OTP</button>
          </div>

          {tab === 'password' ? (
            <form onSubmit={submit} className="space-y-4">
              <Input required value={form.username} onChange={e => setForm({...form, username: e.target.value})}
                placeholder="ชื่อผู้ใช้หรืออีเมล" autoComplete="username" />
              <Input required type="password" value={form.password} onChange={e => setForm({...form, password: e.target.value})}
                placeholder="รหัสผ่าน" autoComplete="current-password" />
              {err && <div className="text-red-400 text-sm" role="alert">{err}</div>}
              <Button disabled={busy} className="w-full">{busy ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}</Button>
              <div className="flex justify-between text-sm">
                <Link to="/forgot-password" className="text-navy-300 hover:text-gold-300">ลืมรหัสผ่าน?</Link>
                <Link to="/register" className="text-gold-300 hover:underline">สมัครสมาชิกใหม่</Link>
              </div>
            </form>
          ) : (
            <PhoneOtpForm purpose="login" onSuccess={onOtpSuccess} />
          )}
        </>
      )}

      {!needsMfa && (
        <div className="mt-5">
          <div className="flex items-center gap-3 text-xs text-navy-400 mb-3">
            <div className="flex-1 h-px bg-navy-700" />หรือ<div className="flex-1 h-px bg-navy-700" />
          </div>
          <LineLoginButton />
        </div>
      )}
    </AuthShell>
  );
}
