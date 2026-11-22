import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { confirmAction } from '../admin/confirm.jsx';
import { toast } from '../components/toast.js';

import { getTz, setTz } from '../time.js';
import { pushSupported, subscribePush, unsubscribePush, pushSubscriptionCount } from '../push.js';
import { Card, CardHeader, CardBody, Input, Select, Button } from '../components/ui/index.js';

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
    <Card>
      <CardHeader title="เล่นอย่างรับผิดชอบ" sub="ตั้งวงเงินเดิมพันสูงสุดต่อวัน/เดือน และ/หรือระงับการแทงชั่วคราว — เพื่อป้องกันการเล่นเกินตัว" />
      <CardBody>
      {excluded && (
        <div className="mb-4 bg-red-500/10 border border-red-500/40 rounded-lg px-3 py-2 text-sm text-red-300 font-semibold">
          ⛔ บัญชีถูกระงับการแทง{user.selfExcludedUntil === 'permanent' ? 'ถาวร' : `ถึง ${user.selfExcludedUntil}`}
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
        <Input label="วงเงินสูงสุด/วัน (บาท — เว้นว่าง = ไม่จำกัด)" type="number" min="0" value={daily} onChange={e => setDaily(e.target.value)} placeholder="เช่น 500" inputClassName="py-2" />
        <Input label="วงเงินสูงสุด/เดือน (บาท)" type="number" min="0" value={monthly} onChange={e => setMonthly(e.target.value)} placeholder="เช่น 5000" inputClassName="py-2" />
      </div>
      <Button onClick={saveLimits} size="sm" className="mb-5">บันทึกวงเงิน</Button>
      <div>
        <div className="text-xs text-navy-300 mb-2">ระงับการแทง (self-exclusion — ยกเลิกเองไม่ได้):</div>
        <div className="flex flex-wrap gap-2">
          {[1, 7, 30].map(d => (
            <Button key={d} variant="danger" size="sm" onClick={() => exclude(d)} disabled={excluded}>{d} วัน</Button>
          ))}
          <Button variant="danger" size="sm" onClick={() => exclude(36500)} disabled={excluded || user?.selfExcludedUntil === 'permanent'}>ถาวร</Button>
        </div>
      </div>
      </CardBody>
    </Card>
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
    <Card>
      <CardHeader title="การตั้งค่าบัญชี" sub="เขตเวลา • การแจ้งเตือน" />
      <CardBody>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Select label="เขตเวลา / Timezone" value={tz} onChange={e => changeTz(e.target.value)} inputClassName="py-2 text-sm">
          {TZ_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </Select>
        <div>
          <label className="text-xs font-semibold text-navy-300 mb-1.5 block">การแจ้งเตือน Push</label>
          <Button onClick={togglePush} disabled={pushBusy || !pushSupported()}
            variant={pushOn ? 'accent' : 'ghost'} className="w-full">
            {pushBusy ? '...' : pushOn ? 'เปิดอยู่ — แตะเพื่อปิด' : 'เปิดแจ้งเตือน'}
          </Button>
          {!pushSupported() && <div className="text-[10px] text-navy-500 mt-1">เบราว์เซอร์นี้ไม่รองรับ push</div>}
        </div>
      </div>
      </CardBody>
    </Card>
  );
}

// PDPA — export ข้อมูลส่วนตัว + ลบบัญชี (anonymize)
function PrivacyCard({ onDeleted }) {
  const [busy, setBusy] = useState(false);

  const exportData = async () => {
    setBusy(true);
    try {
      const data = await api('/auth/me/export');
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `my-data-${new Date().toISOString().slice(0, 10)}.json`;
      a.click(); URL.revokeObjectURL(a.href);
      toast('ดาวน์โหลดข้อมูลของคุณแล้ว');
    } catch (e) { toast(e.message, 'error'); }
    finally { setBusy(false); }
  };

  const deleteAccount = async () => {
    if (!(await confirmAction({
      title: '⚠️ ยืนยันลบบัญชีถาวร',
      message: 'ลบบัญชีและข้อมูลส่วนตัวทั้งหมด (ชื่อ/อีเมล/เบอร์/รหัสผ่าน) — ไม่สามารถกู้คืนได้\nประวัติการเงินยังถูกเก็บตามกฎหมาย แต่ไม่ผูกกับตัวตนคุณอีกต่อไป',
      danger: true, confirmLabel: 'ลบบัญชีถาวร',
    }))) return;
    setBusy(true);
    try {
      await api('/auth/me', { method: 'DELETE', body: { confirm: true } });
      toast('ลบบัญชีสำเร็จ');
      onDeleted?.();
    } catch (e) { toast(e.message, 'error'); setBusy(false); }
  };

  return (
    <Card>
      <CardHeader title="ความเป็นส่วนตัว (PDPA)" sub="สิทธิ์ของเจ้าของข้อมูลตาม พ.ร.บ. คุ้มครองข้อมูลส่วนตัว" />
      <CardBody>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" size="sm" onClick={exportData} disabled={busy}>⤓ ดาวน์โหลดข้อมูลของฉัน</Button>
          <Button variant="danger" size="sm" onClick={deleteAccount} disabled={busy}>ลบบัญชีถาวร</Button>
        </div>
        <p className="text-[11px] text-navy-500 mt-2">การลบบัญชีจะลบข้อมูลส่วนตัวทั้งหมดและระงับการใช้งานทันที — เครดิตคงเหลือและประวัติธุรกรรมจะถูกเก็บไว้เพื่อตามกฎหมาย</p>
      </CardBody>
    </Card>
  );
}

export default function Profile() {
  const { user, refresh, logout } = useAuth();
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
      <Card>
        <CardHeader title="โปรไฟล์สมาชิก" />
        <CardBody>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div><dt className="text-navy-300">ชื่อผู้ใช้</dt><dd className="text-white font-semibold">{user?.username}</dd></div>
          <div><dt className="text-navy-300">ชื่อที่แสดง</dt><dd className="text-white">{user?.displayName}</dd></div>
          <div><dt className="text-navy-300">อีเมล</dt><dd className="text-white">{user?.email}</dd></div>
          <div><dt className="text-navy-300">บทบาท</dt><dd className="text-white">{(user?.roles || []).join(', ') || 'member'}</dd></div>
        </dl>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="เปลี่ยนรหัสผ่าน" />
        <CardBody>
        <form onSubmit={changePw} className="space-y-3">
          <Input type="password" required placeholder="รหัสผ่านเดิม" value={pw.oldPassword} onChange={e => setPw({...pw, oldPassword: e.target.value})} inputClassName="py-2.5" />
          <Input type="password" required minLength={8} placeholder="รหัสผ่านใหม่ (8+ ตัว)" value={pw.newPassword} onChange={e => setPw({...pw, newPassword: e.target.value})} inputClassName="py-2.5" />
          <Input type="password" required placeholder="ยืนยันรหัสผ่านใหม่" value={pw.confirm} onChange={e => setPw({...pw, confirm: e.target.value})} inputClassName="py-2.5" />
          {err && <div className="text-red-400 text-sm" role="alert">{err}</div>}
          {msg && <div className="text-green-400 text-sm" role="status">{msg}</div>}
          <Button disabled={busy}>{busy ? 'กำลังเปลี่ยน...' : 'เปลี่ยนรหัสผ่าน'}</Button>
        </form>
        </CardBody>
      </Card>

      {/* การตั้งค่าบัญชี — timezone/push */}
      <PrefsCard />

      {/* Responsible gambling — วงเงินเดิมพัน + self-exclusion */}
      <RGCard user={user} onDone={refresh} />

      {/* PDPA — export + delete account */}
      <PrivacyCard onDeleted={async () => { await logout(); window.location.href = '/'; }} />

      {isAdmin && (
      <Card>
        <CardHeader title="การยืนยันตัวตน 2 ชั้น (MFA/TOTP)" sub="สำหรับบัญชี Admin" />
        <CardBody>
        <p className="text-sm text-navy-300 mb-4">{user?.mfaEnabled ? 'เปิดใช้งานแล้ว — ปลอดภัยยิ่งขึ้น' : 'ยังไม่ได้เปิดใช้งาน (แนะนำสำหรับบัญชี Admin)'}</p>
        {!mfa ? (
          <Button variant="ghost" onClick={setupMfa}>
            {user?.mfaEnabled ? 'สร้าง Secret ใหม่' : 'ตั้งค่า MFA'}
          </Button>
        ) : (
          <div className="space-y-3">
            <div className="bg-navy-900 rounded-lg p-4 text-sm">
              <div className="text-navy-300 mb-1">Secret (ใส่ในแอป Authenticator):</div>
              <code className="text-gold-300 text-lg tracking-wider">{mfa.secret}</code>
              <div className="text-navy-300 mt-2 text-xs break-all">{mfa.uri}</div>
            </div>
            <div className="flex gap-2">
              <Input value={mfaCode} onChange={e => setMfaCode(e.target.value.replace(/\D/g,'').slice(0,6))}
                placeholder="รหัส 6 หลัก" className="flex-1" inputClassName="text-center tracking-widest py-2.5" aria-label="รหัส MFA" />
              <Button onClick={enableMfa}>เปิดใช้งาน</Button>
            </div>
          </div>
        )}
        </CardBody>
      </Card>
      )}
    </div>
  );
}
