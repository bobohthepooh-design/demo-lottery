import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { confirmAction } from '../admin/confirm.jsx';
import { toast } from '../components/toast.js';

import { getTz, setTz } from '../time.js';
import { pushSupported, subscribePush, unsubscribePush, pushSubscriptionCount } from '../push.js';

// Responsible gambling — ตั้งวงเงินเดิมพันรายวัน/เดือน + self-exclusion (แก้กลับไม่ได้)
function RGCard({ user, onDone }) {
  const [daily, setDaily] = useState(user?.dailyLimitSatang != null ? String(user.dailyLimitSatang / 100) : '');
  const [monthly, setMonthly] = useState(user?.monthlyLimitSatang != null ? String(user.monthlyLimitSatang / 100) : '');
  const excluded = user?.selfExcludedUntil === 'permanent' || (user?.selfExcludedUntil && user.selfExcludedUntil > new Date().toISOString().slice(0, 19).replace('T', ' '));

  // sync ค่า limit จาก server หลัง refresh (เช่น admin/ระบบเปลี่ยน)
  useEffect(() => {
    setDaily(user?.dailyLimitSatang != null ? String(user.dailyLimitSatang / 100) : '');
    setMonthly(user?.monthlyLimitSatang != null ? String(user.monthlyLimitSatang / 100) : '');
  }, [user?.dailyLimitSatang, user?.monthlyLimitSatang]);

  const saveLimits = async () => {
    try {
      await api('/auth/me/responsible-gambling', { method: 'PATCH', body: {
        dailyLimitBaht: daily === '' ? null : Number(daily),
        monthlyLimitBaht: monthly === '' ? null : Number(monthly),
      }});
      toast('บันทึกวงเงินเดิมพันแล้ว'); onDone?.();
    } catch (e) { toast(e.message, 'error'); }
  };
  const exclude = async (days) => {
    const label = days === 36500 ? 'ถาวร' : `${days} วัน`;
    if (!(await confirmAction({ title: '⚠️ ยืนยันระงับบัญชี', message: `ระงับการแทง${label === 'ถาวร' ? 'ถาวร' : ` ${label}`}?\nไม่สามารถยกเลิกเองได้จนกว่าจะหมดเวลา`, danger: true, confirmLabel: 'ยืนยันระงับ' }))) return;
    try {
      await api('/auth/me/responsible-gambling', { method: 'PATCH', body: { selfExcludeDays: days } });
      toast(`ระงับบัญชีแล้ว ${label}`); onDone?.();
    } catch (e) { toast(e.message, 'error'); }
  };

  return (
    <div className="bg-navy-800 border border-navy-700 rounded-2xl p-6">
      <h2 className="text-lg font-bold text-white mb-1">เล่นอย่างรับผิดชอบ</h2>
      <p className="text-xs text-navy-400 mb-4">ตั้งวงเงินเดิมพันสูงสุดต่อวัน/เดือน และ/หรือระงับการแทงชั่วคราว — เพื่อป้องกันการเล่นเกินตัว</p>
      {excluded && (
        <div className="mb-4 bg-red-500/10 border border-red-500/40 rounded-lg px-3 py-2 text-sm text-red-300 font-semibold">
          ⛔ บัญชีถูกระงับการแทง{user.selfExcludedUntil === 'permanent' ? 'ถาวร' : `ถึง ${user.selfExcludedUntil}`}
        </div>
      )}
      <div className="grid sm:grid-cols-2 gap-3 mb-4">
        <div>
          <label className="text-xs text-navy-300">วงเงินสูงสุด/วัน (บาท — เว้นว่าง = ไม่จำกัด)</label>
          <input type="number" min="0" value={daily} onChange={e => setDaily(e.target.value)} placeholder="เช่น 500"
            className="w-full bg-navy-900 border border-navy-600 rounded-lg px-3 py-2 mt-1" />
        </div>
        <div>
          <label className="text-xs text-navy-300">วงเงินสูงสุด/เดือน (บาท)</label>
          <input type="number" min="0" value={monthly} onChange={e => setMonthly(e.target.value)} placeholder="เช่น 5000"
            className="w-full bg-navy-900 border border-navy-600 rounded-lg px-3 py-2 mt-1" />
        </div>
      </div>
      <button onClick={saveLimits} className="bg-gold-500 text-navy-950 font-bold px-5 py-2 rounded-lg text-sm mb-5">บันทึกวงเงิน</button>
      <div>
        <div className="text-xs text-navy-300 mb-2">ระงับการแทง (self-exclusion — ยกเลิกเองไม่ได้):</div>
        <div className="flex flex-wrap gap-2">
          {[1, 7, 30].map(d => (
            <button key={d} onClick={() => exclude(d)} disabled={excluded}
              className="border border-red-500/50 text-red-300 px-4 py-2 rounded-lg text-sm hover:bg-red-500/10 disabled:opacity-40">{d} วัน</button>
          ))}
          <button onClick={() => exclude(36500)} disabled={excluded || user?.selfExcludedUntil === 'permanent'}
            className="border border-red-500 text-red-300 font-bold px-4 py-2 rounded-lg text-sm hover:bg-red-500/10 disabled:opacity-40">ถาวร</button>
        </div>
      </div>
    </div>
  );
}

// การตั้งค่าบัญชี — timezone / push notification
const TZ_OPTIONS = [
  ['', 'อัตโนมัติ (ตามอุปกรณ์)'],
  ['Asia/Bangkok', 'ไทย — Bangkok (UTC+7)'],
  ['Asia/Vientiane', 'ลาว — Vientiane (UTC+7)'],
  ['Asia/Ho_Chi_Minh', 'เวียดนาม — Hanoi (UTC+7)'],
  ['Asia/Singapore', 'Singapore (UTC+8)'],
  ['Asia/Tokyo', 'ญี่ปุ่น — Tokyo (UTC+9)'],
  ['Australia/Sydney', 'ออสเตรเลีย — Sydney'],
  ['Europe/London', 'อังกฤษ — London'],
  ['America/New_York', 'อเมริกา — New York'],
];

function PrefsCard() {
  const [tz, setTzState] = useState(getTz() || '');
  const [pushOn, setPushOn] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);

  useEffect(() => {
    pushSubscriptionCount().then(c => setPushOn(c > 0)).catch(() => {});
  }, []);

  const savePrefs = async (patch) => {
    try { await api('/auth/me/prefs', { method: 'PATCH', body: patch }); }
    catch (e) { toast(e.message, 'error'); }
  };

  const changeTz = (z) => {
    setTz(z); setTzState(z);
    savePrefs({ timezone: z || Intl.DateTimeFormat().resolvedOptions().timeZone });
    toast('เปลี่ยนเขตเวลาแล้ว — เวลาในระบบจะอัปเดตตามที่เลือก');
  };

  const togglePush = async () => {
    setPushBusy(true);
    try {
      if (pushOn) { await unsubscribePush(); setPushOn(false); toast('ปิดการแจ้งเตือนแล้ว'); }
      else {
        const r = await subscribePush();
        if (r.ok) { setPushOn(true); toast('เปิดการแจ้งเตือนแล้ว — จะได้รับแจ้งเมื่อมีผล/เครดิตเข้า'); }
        else toast(r.reason === 'denied' ? 'ปฏิเสธสิทธิ์ notification — เปิดในการตั้งค่าเบราว์เซอร์' : 'อุปกรณ์นี้ไม่รองรับ push', 'error');
      }
    } catch (e) { toast(e.message, 'error'); }
    finally { setPushBusy(false); }
  };

  return (
    <div className="bg-navy-800 border border-navy-700 rounded-2xl p-6">
      <h2 className="text-lg font-bold text-white mb-1">การตั้งค่าบัญชี</h2>
      <p className="text-xs text-navy-400 mb-4">เขตเวลา • การแจ้งเตือน</p>
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-navy-300">เขตเวลา / Timezone</label>
          <select value={tz} onChange={e => changeTz(e.target.value)}
            className="w-full bg-navy-900 border border-navy-600 rounded-lg px-3 py-2 mt-1 text-sm">
            {TZ_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-navy-300">การแจ้งเตือน Push</label>
          <button onClick={togglePush} disabled={pushBusy || !pushSupported()}
            className={`w-full mt-1 font-bold px-3 py-2 rounded-lg text-sm transition disabled:opacity-50 ${pushOn ? 'bg-emerald-600 hover:bg-emerald-500 text-white' : 'bg-navy-700 hover:bg-navy-600 text-gold-300 border border-gold-500/40'}`}>
            {pushBusy ? '...' : pushOn ? '🔔 เปิดอยู่ — แตะเพื่อปิด' : '🔕 เปิดแจ้งเตือน'}
          </button>
          {!pushSupported() && <div className="text-[10px] text-navy-500 mt-1">เบราว์เซอร์นี้ไม่รองรับ push</div>}
        </div>
      </div>
    </div>
  );
}

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

      {/* การตั้งค่าบัญชี — timezone/push */}
      <PrefsCard />

      {/* Responsible gambling — วงเงินเดิมพัน + self-exclusion */}
      <RGCard user={user} onDone={refresh} />

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
