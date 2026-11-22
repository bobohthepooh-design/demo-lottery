import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import LineLoginButton from '../components/LineLoginButton.jsx';
import PhoneOtpForm from '../components/PhoneOtpForm.jsx';
import AuthShell from '../components/AuthShell.jsx';
import Turnstile from '../components/Turnstile.jsx';
import { Input, Button } from '../components/ui/index.js';

export default function Register() {
  const { login, refresh } = useAuth();
  const [tab, setTab] = useState('otp'); // 'otp' | 'password'
  const [form, setForm] = useState({ username: '', email: '', password: '', displayName: '', ageConfirmed: false });
  const [showPw, setShowPw] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [tsToken, setTsToken] = useState('');
  const navigate = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr('');
    try {
      // สมัครแล้วเข้าสู่ระบบให้อัตโนมัติ — ไม่ต้องกรอกซ้ำ
      // checkbox เดียวครอบคลุมทั้งอายุ + ข้อตกลง → ส่ง termsAccepted ด้วย (server บันทึก terms_accepted_at)
      await api('/auth/register', { method: 'POST', body: { ...form, termsAccepted: form.ageConfirmed, turnstileToken: tsToken || undefined } });
      await login(form.username, form.password);
      navigate('/');
    } catch (e2) { setErr(e2.message); }
    finally { setBusy(false); }
  };

  const onOtpSuccess = async () => {
    await refresh();
    navigate('/');
  };

  const tabCls = (t) => `flex-1 py-2.5 text-sm font-bold rounded-lg transition ${tab === t ? 'bg-gold-500/15 text-gold-200 border border-gold-400/50' : 'text-navy-300 hover:text-white border border-transparent'}`;

  return (
    <AuthShell title="สมัครสมาชิก" sub="สมัครง่ายๆ รับเครดิตฟรี 50 บาท ทันที">
      {/* tabs: เบอร์+OTP (แนะนำ) / ชื่อผู้ใช้+รหัสผ่าน */}
      <div className="flex gap-2 bg-navy-900 border border-navy-700 rounded-xl p-1 mb-5">
        <button type="button" onClick={() => setTab('otp')} className={tabCls('otp')}>เบอร์โทร + OTP</button>
        <button type="button" onClick={() => setTab('password')} className={tabCls('password')}>ชื่อผู้ใช้</button>
      </div>

      {tab === 'otp' ? (
        <PhoneOtpForm purpose="register" onSuccess={onOtpSuccess} />
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <Input required value={form.username} onChange={e => setForm({...form, username: e.target.value})}
            placeholder="ชื่อผู้ใช้ (a-z 0-9 _ 3-32 ตัว)" pattern="[a-zA-Z0-9_]{3,32}" autoComplete="username" />
          <Input type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})}
            placeholder="อีเมล (ไม่บังคับ)" autoComplete="email" />
          <Input value={form.displayName} onChange={e => setForm({...form, displayName: e.target.value})}
            placeholder="ชื่อที่แสดง (ไม่บังคับ)" autoComplete="nickname" />
          <div className="relative">
            <Input required type={showPw ? 'text' : 'password'} minLength={10} value={form.password} onChange={e => setForm({...form, password: e.target.value})}
              placeholder="รหัสผ่าน (อย่างน้อย 10 ตัว)" autoComplete="new-password" inputClassName="pr-16" />
            <button type="button" onClick={() => setShowPw(!showPw)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-navy-300 hover:text-gold-300">
              {showPw ? 'ซ่อน' : 'แสดง'}
            </button>
          </div>
          <label className="flex items-start gap-2 text-xs text-navy-300 cursor-pointer">
            <input type="checkbox" required checked={form.ageConfirmed}
              onChange={e => setForm({...form, ageConfirmed: e.target.checked})}
              className="mt-0.5 accent-amber-500" />
            <span>ฉันยืนยันว่ามีอายุ <b className="text-amber-300">18 ปีขึ้นไป</b> ยอมรับ<a href="/legal" target="_blank" className="text-[#f5c518] underline">ข้อกำหนด</a> และ<a href="/legal" target="_blank" className="text-[#f5c518] underline">นโยบายความเป็นส่วนตัว (PDPA)</a> (เพื่อการศึกษา ใช้เครดิตเสมือน)</span>
          </label>
          <Turnstile onVerify={setTsToken} />
          {err && <div className="text-red-400 text-sm" role="alert">{err}</div>}
          <Button disabled={busy} className="w-full">{busy ? 'กำลังสมัคร...' : 'สมัครและเข้าใช้งานเลย'}</Button>
        </form>
      )}

      <div className="text-center text-sm text-navy-300 mt-5">มีบัญชีแล้ว? <Link to="/login" className="text-gold-300">เข้าสู่ระบบ</Link></div>
      <div className="mt-5">
        <div className="flex items-center gap-3 text-xs text-navy-400 mb-3">
          <div className="flex-1 h-px bg-navy-700" />หรือ<div className="flex-1 h-px bg-navy-700" />
        </div>
        <LineLoginButton label="สมัคร/เข้าสู่ระบบด้วย LINE" />
      </div>
    </AuthShell>
  );
}
