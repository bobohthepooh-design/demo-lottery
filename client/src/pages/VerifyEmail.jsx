import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import AuthShell from '../components/AuthShell.jsx';

// /verify-email?token=... — เปิดจากลิงก์ในอีเมล (public — ไม่ต้อง login)
export default function VerifyEmail() {
  const [params] = useSearchParams();
  const [state, setState] = useState('loading'); // loading | ok | err
  const [msg, setMsg] = useState('');

  useEffect(() => {
    const token = params.get('token');
    if (!token) { setState('err'); setMsg('ไม่พบ token ในลิงก์'); return; }
    api('/auth/email/verify', { method: 'POST', body: { token } })
      .then(() => { setState('ok'); setMsg('ยืนยันอีเมลสำเร็จ — ขอบคุณที่ยืนยันตัวตน'); })
      .catch(e => { setState('err'); setMsg(e.message); });
  }, [params]);

  return (
    <AuthShell title="ยืนยันอีเมล">
      {state === 'loading' && <div className="text-center text-navy-300 py-8">กำลังยืนยัน...</div>}
      {state === 'ok' && (
        <div className="text-center space-y-4">
          <div className="text-4xl">✅</div>
          <div className="text-green-300">{msg}</div>
          <Link to="/profile" className="inline-block text-gold-300 hover:underline text-sm">ไปที่โปรไฟล์ →</Link>
        </div>
      )}
      {state === 'err' && (
        <div className="text-center space-y-4">
          <div className="text-4xl">⚠️</div>
          <div className="text-red-300">{msg}</div>
          <Link to="/login" className="inline-block text-gold-300 hover:underline text-sm">กลับไปเข้าสู่ระบบ</Link>
        </div>
      )}
    </AuthShell>
  );
}
