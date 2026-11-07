import { useState } from 'react';
import { useAuth } from '../auth.jsx';

export default function MfaModal() {
  const { verifyMfa, logout } = useAuth();
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr('');
    try { await verifyMfa(code); }
    catch (e2) { setErr(e2.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-navy-800 border border-gold-500/40 rounded-2xl p-6 w-full max-w-sm">
        <h2 className="text-xl font-bold text-gold-400 mb-1">ยืนยันตัวตน MFA</h2>
        <p className="text-sm text-navy-200 mb-4">บัญชีผู้ดูแลต้องยืนยันรหัส TOTP จากแอป Authenticator</p>
        <form onSubmit={submit} className="space-y-3">
          <input value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            inputMode="numeric" placeholder="รหัส 6 หลัก" autoFocus
            className="w-full bg-navy-900 border border-navy-600 rounded-lg px-4 py-3 text-center text-2xl tracking-[0.5em] text-gold-300 focus:outline-none focus:border-gold-500" />
          {err && <div className="text-red-400 text-sm">{err}</div>}
          <button disabled={busy || code.length !== 6}
            className="w-full bg-gold-500 text-navy-950 font-bold py-3 rounded-lg hover:bg-gold-400 disabled:opacity-50">
            {busy ? 'กำลังตรวจสอบ...' : 'ยืนยัน'}
          </button>
          <button type="button" onClick={logout} className="w-full text-sm text-navy-300 hover:text-red-400">ออกจากระบบ</button>
        </form>
      </div>
    </div>
  );
}
