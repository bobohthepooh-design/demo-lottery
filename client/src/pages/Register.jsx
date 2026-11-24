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

  const tabCls = (t) => ({
    flex: 1,
    padding: '0.5rem',
    fontSize: '0.8rem',
    fontWeight: 'bold',
    borderRadius: 'var(--radius-lg)',
    transition: 'all var(--transition-base)',
    border: tab === t ? '1px solid var(--border-gold)' : '1px solid transparent',
    background: tab === t ? 'rgba(212, 175, 55, 0.15)' : 'transparent',
    color: tab === t ? 'var(--gold-bright)' : 'var(--muted-gray)',
    cursor: 'pointer'
  });

  return (
    <AuthShell title="สมัครสมาชิก" sub="สมัครง่ายๆ รับเครดิตฟรี 50 บาท ทันที">
      {/* tabs: เบอร์+OTP (แนะนำ) / ชื่อผู้ใช้+รหัสผ่าน */}
      <div className="flex gap-2 rounded-xl p-1 mb-5"
        style={{
          background: 'var(--bg-dark-surface)',
          border: '1px solid var(--border-light)'
        }}>
        <button type="button" onClick={() => setTab('otp')} style={tabCls('otp')}>เบอร์โทร + OTP</button>
        <button type="button" onClick={() => setTab('password')} style={tabCls('password')}>ชื่อผู้ใช้</button>
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
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs"
              style={{ color: 'var(--muted-gray)' }}
              onMouseEnter={(e) => e.target.style.color = 'var(--gold-primary)'}
              onMouseLeave={(e) => e.target.style.color = 'var(--muted-gray)'}>
              {showPw ? 'ซ่อน' : 'แสดง'}
            </button>
          </div>
          <label className="flex items-start gap-2 text-xs cursor-pointer" style={{ color: 'var(--muted-gray)' }}>
            <input type="checkbox" required checked={form.ageConfirmed}
              onChange={e => setForm({...form, ageConfirmed: e.target.checked})}
              className="mt-0.5"
              style={{ accentColor: 'var(--gold-primary)' }} />
            <span>ฉันยืนยันว่ามีอายุ <b style={{ color: 'var(--gold-primary)' }}>18 ปีขึ้นไป</b> ยอมรับ<a href="/legal" target="_blank" className="underline" style={{ color: 'var(--gold-primary)' }}>ข้อกำหนด</a> และ<a href="/legal" target="_blank" className="underline" style={{ color: 'var(--gold-primary)' }}>นโยบายความเป็นส่วนตัว (PDPA)</a> (เพื่อการศึกษา ใช้เครดิตเสมือน)</span>
          </label>
          <Turnstile onVerify={setTsToken} />
          {err && <div className="text-sm" style={{ color: 'var(--danger-red)' }} role="alert">{err}</div>}
          <Button disabled={busy} className="w-full">{busy ? 'กำลังสมัคร...' : 'สมัครและเข้าใช้งานเลย'}</Button>
        </form>
      )}

      <div className="text-center text-sm mt-5" style={{ color: 'var(--muted-gray)' }}>มีบัญชีแล้ว? <Link to="/login" style={{ color: 'var(--gold-primary)' }}>เข้าสู่ระบบ</Link></div>
      <div className="mt-5">
        <div className="flex items-center gap-3 text-xs mb-3" style={{ color: 'var(--dark-gray)' }}>
          <div className="flex-1 h-px" style={{ background: 'var(--border-light)' }} />หรือ<div className="flex-1 h-px" style={{ background: 'var(--border-light)' }} />
        </div>
        <LineLoginButton label="สมัคร/เข้าสู่ระบบด้วย LINE" />
      </div>
    </AuthShell>
  );
}
