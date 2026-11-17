import { useState } from 'react';
import { api } from '../api.js';

// ฟอร์มเบอร์โทร + OTP 2 ขั้น — ใช้ทั้งสมัคร (purpose=register) และเข้าสู่ระบบ (purpose=login)
// DEMO: ระบบไม่ส่ง SMS จริง — รหัสแสดงในกรอบ "รหัส OTP (Demo)" ให้คัดลอกกรอกเอง
export default function PhoneOtpForm({ purpose, onSuccess, busy: outerBusy }) {
  const [phone, setPhone] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [code, setCode] = useState('');
  const [ageOk, setAgeOk] = useState(false);
  const [devCode, setDevCode] = useState('');
  const [expiresIn, setExpiresIn] = useState(0);
  const [step, setStep] = useState('phone'); // 'phone' | 'code'
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const digits = (v, max) => v.replace(/\D/g, '').slice(0, max);

  const request = async (e) => {
    e?.preventDefault();
    setBusy(true); setErr('');
    try {
      const r = await api('/auth/otp/request', { method: 'POST', body: { phone, purpose } });
      setDevCode(r.devCode || '');
      setExpiresIn(r.expiresInSec || 300);
      setStep('code');
    } catch (e2) { setErr(e2.message); }
    finally { setBusy(false); }
  };

  const verify = async (e) => {
    e?.preventDefault();
    setBusy(true); setErr('');
    try {
      const r = await api('/auth/otp/verify', {
        method: 'POST',
        body: { phone, code, purpose, displayName: displayName || undefined, ageConfirmed: purpose === 'register' ? ageOk : undefined },
      });
      await onSuccess?.(r);
    } catch (e2) { setErr(e2.message); }
    finally { setBusy(false); }
  };

  const inputCls = 'w-full bg-navy-900 border border-navy-600 rounded-lg px-4 py-3 focus:outline-none focus:border-gold-500';

  if (step === 'phone') {
    return (
      <form onSubmit={request} className="space-y-4">
        <div>
          <label className="text-xs text-navy-300 block mb-1">เบอร์โทรศัพท์ (ไทย 10 หลัก)</label>
          <div className="flex">
            <span className="bg-navy-700 border border-r-0 border-navy-600 rounded-l-lg px-3 py-3 text-navy-300 text-sm flex items-center">+66</span>
            <input required value={phone} onChange={e => setPhone(digits(e.target.value, 10))}
              inputMode="numeric" placeholder="812345678" maxLength={10}
              className={`${inputCls} rounded-l-none`} />
          </div>
          <div className="text-[10px] text-navy-500 mt-1">กรอกเฉพาะ 10 หลักหลัง +66 (เช่น 0812345678 → 812345678)</div>
        </div>
        {purpose === 'register' && (
          <>
            <input value={displayName} onChange={e => setDisplayName(e.target.value)}
              placeholder="ชื่อที่แสดง (ไม่บังคับ)" className={inputCls} />
            <label className="flex items-start gap-2 text-xs text-navy-300 cursor-pointer">
              <input type="checkbox" checked={ageOk} onChange={e => setAgeOk(e.target.checked)} className="mt-0.5 accent-amber-500" />
              <span>ฉันยืนยันว่ามีอายุ <b className="text-amber-300">18 ปีขึ้นไป</b> และยอมรับเงื่อนไขการใช้งาน (เพื่อการศึกษา ใช้เครดิตเสมือน)</span>
            </label>
          </>
        )}
        {err && <div className="text-red-400 text-sm">{err}</div>}
        <button disabled={busy || phone.length < 9 || (purpose === 'register' && !ageOk)}
          className="w-full bg-gold-500 text-navy-950 font-bold py-3 rounded-lg hover:bg-gold-400 disabled:opacity-50">
          {busy ? 'กำลังส่งรหัส...' : '📱 ขอรหัส OTP'}
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={verify} className="space-y-4">
      <div className="bg-green-500/10 border border-green-500/30 rounded-lg px-3 py-2 text-xs text-green-300">
        ขอรหัส OTP สำหรับ +66 {phone} แล้ว (ระบบ Demo — ไม่ได้ส่ง SMS จริง)
      </div>
      {devCode && (
        <div className="bg-gold-500/10 border border-gold-500/40 rounded-lg px-3 py-2.5 text-center">
          <div className="text-[10px] text-navy-400">รหัส OTP (Demo — ไม่ได้ส่ง SMS จริง)</div>
          <div className="font-mono text-2xl font-black text-gold-300 tracking-[0.4em]">{devCode}</div>
          <div className="text-[10px] text-navy-400 mt-0.5">หมดอายุใน {Math.floor(expiresIn / 60)} นาที</div>
        </div>
      )}
      <input required value={code} onChange={e => setCode(digits(e.target.value, 6))}
        inputMode="numeric" placeholder="กรอกรหัส 6 หลัก" maxLength={6}
        className={`${inputCls} text-center text-2xl tracking-[0.4em] text-gold-300 font-mono`} />
      {err && <div className="text-red-400 text-sm">{err}</div>}
      <button disabled={busy || code.length !== 6 || (purpose === 'register' && !ageOk)}
        className="w-full bg-gold-500 text-navy-950 font-bold py-3 rounded-lg hover:bg-gold-400 disabled:opacity-50">
        {busy ? 'กำลังตรวจสอบ...' : purpose === 'register' ? 'ยืนยันสมัครสมาชิก' : 'เข้าสู่ระบบ'}
      </button>
      <button type="button" onClick={() => { setStep('phone'); setCode(''); setErr(''); }}
        className="w-full text-sm text-navy-300 hover:text-gold-300">
        ← เปลี่ยนเบอร์โทร / ขอรหัสใหม่
      </button>
    </form>
  );
}
