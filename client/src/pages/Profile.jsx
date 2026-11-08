import { useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';

export default function Profile() {
  const { user, refresh } = useAuth();
  const isAdmin = (user?.roles || []).some(r => ['admin', 'super_admin'].includes(r));
  const [pw, setPw] = useState({ oldPassword: '', newPassword: '', confirm: '' });
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [mfa, setMfa] = useState(null); // {secret, uri}
  const [mfaCode, setMfaCode] = useState('');

  const changePw = async (e) => {
    e.preventDefault(); setErr(''); setMsg('');
    if (pw.newPassword !== pw.confirm) { setErr('รหัสผ่านใหม่ไม่ตรงกัน'); return; }
    setBusy(true);
    try {
      const r = await api('/auth/change-password', { method: 'POST', body: { oldPassword: pw.oldPassword, newPassword: pw.newPassword } });
      setMsg(r.message); setPw({ oldPassword: '', newPassword: '', confirm: '' });
    } catch (e2) { setErr(e2.message); }
    finally { setBusy(false); }
  };

  const setupMfa = async () => {
    try { setMfa(await api('/auth/mfa/setup', { method: 'POST' })); } catch (e) { setErr(e.message); }
  };
  const enableMfa = async () => {
    try { await api('/auth/mfa/enable', { method: 'POST', body: { code: mfaCode } }); setMfa(null); setMfaCode(''); await refresh(); setMsg('เปิดใช้งาน MFA สำเร็จ'); }
    catch (e) { setErr(e.message); }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="bg-navy-800 border border-navy-700 rounded-2xl p-6">
        <h1 className="text-xl font-bold text-gold-400 mb-4">โปรไฟล์สมาชิก</h1>
        <dl className="grid sm:grid-cols-2 gap-3 text-sm">
          <div><dt className="text-navy-300">ชื่อผู้ใช้</dt><dd className="text-white font-semibold">{user?.username}</dd></div>
          <div><dt className="text-navy-300">ชื่อที่แสดง</dt><dd className="text-white">{user?.displayName}</dd></div>
          <div><dt className="text-navy-300">อีเมล</dt><dd className="text-white">{user?.email}</dd></div>
          <div><dt className="text-navy-300">บทบาท</dt><dd className="text-white">{(user?.roles || []).join(', ') || 'member'}</dd></div>
        </dl>
      </div>

      <div className="bg-navy-800 border border-navy-700 rounded-2xl p-6">
        <h2 className="text-lg font-bold text-white mb-4">เปลี่ยนรหัสผ่าน</h2>
        <form onSubmit={changePw} className="space-y-3">
          <input type="password" required placeholder="รหัสผ่านเดิม" value={pw.oldPassword} onChange={e => setPw({...pw, oldPassword: e.target.value})}
            className="w-full bg-navy-900 border border-navy-600 rounded-lg px-4 py-2.5 focus:outline-none focus:border-gold-500" />
          <input type="password" required minLength={8} placeholder="รหัสผ่านใหม่ (8+ ตัว)" value={pw.newPassword} onChange={e => setPw({...pw, newPassword: e.target.value})}
            className="w-full bg-navy-900 border border-navy-600 rounded-lg px-4 py-2.5 focus:outline-none focus:border-gold-500" />
          <input type="password" required placeholder="ยืนยันรหัสผ่านใหม่" value={pw.confirm} onChange={e => setPw({...pw, confirm: e.target.value})}
            className="w-full bg-navy-900 border border-navy-600 rounded-lg px-4 py-2.5 focus:outline-none focus:border-gold-500" />
          {err && <div className="text-red-400 text-sm">{err}</div>}
          {msg && <div className="text-green-400 text-sm">{msg}</div>}
          <button disabled={busy} className="bg-gold-500 text-navy-950 font-bold px-6 py-2.5 rounded-lg hover:bg-gold-400 disabled:opacity-50">เปลี่ยนรหัสผ่าน</button>
        </form>
      </div>

      {isAdmin && (
      <div className="bg-navy-800 border border-navy-700 rounded-2xl p-6">
        <h2 className="text-lg font-bold text-white mb-2">การยืนยันตัวตน 2 ชั้น (MFA/TOTP) — สำหรับบัญชี Admin</h2>
        <p className="text-sm text-navy-300 mb-4">{user?.mfaEnabled ? 'เปิดใช้งานแล้ว — ปลอดภัยยิ่งขึ้น' : 'ยังไม่ได้เปิดใช้งาน (แนะนำสำหรับบัญชี Admin)'}</p>
        {!mfa ? (
          <button onClick={setupMfa} className="border border-gold-500/50 text-gold-300 px-5 py-2 rounded-lg hover:bg-navy-700">
            {user?.mfaEnabled ? 'สร้าง Secret ใหม่' : 'ตั้งค่า MFA'}
          </button>
        ) : (
          <div className="space-y-3">
            <div className="bg-navy-900 rounded-lg p-4 text-sm">
              <div className="text-navy-300 mb-1">Secret (ใส่ในแอป Authenticator):</div>
              <code className="text-gold-300 text-lg tracking-wider">{mfa.secret}</code>
              <div className="text-navy-300 mt-2 text-xs break-all">{mfa.uri}</div>
            </div>
            <div className="flex gap-2">
              <input value={mfaCode} onChange={e => setMfaCode(e.target.value.replace(/\D/g,'').slice(0,6))}
                placeholder="รหัส 6 หลัก" className="bg-navy-900 border border-navy-600 rounded-lg px-4 py-2.5 w-40 text-center tracking-widest" />
              <button onClick={enableMfa} className="bg-gold-500 text-navy-950 font-bold px-5 py-2.5 rounded-lg">เปิดใช้งาน</button>
            </div>
          </div>
        )}
      </div>
      )}
    </div>
  );
}
