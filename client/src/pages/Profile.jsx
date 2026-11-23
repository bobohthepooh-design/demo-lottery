import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { confirmAction } from '../admin/confirm.jsx';
import { toast } from '../components/toast.js';

import { getTz, setTz } from '../time.js';
import { pushSupported, subscribePush, unsubscribePush, pushSubscriptionCount } from '../push.js';
import { Card, CardHeader, CardBody, Input, Select, Button } from '../components/ui/index.js';

// KYC — member ขอ verify ตัวตน (manual review โดยแอดมิน)
function KycCard({ user }) {
  const [kyc, setKyc] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = () => api('/compliance/kyc/status').then(r => setKyc(r.kyc)).catch(() => {});
  useEffect(() => { load(); }, []);
  if (!kyc) return null;
  const st = kyc.kyc_status || 'none';
  const TH = { none: 'ยังไม่ได้ยืนยัน', pending: 'รอแอดมินตรวจสอบ', verified: 'ยืนยันแล้ว ✓', rejected: 'ถูกปฏิเสธ' };
  const request = async () => {
    if (!(await confirmAction({ title: 'ขอ verify ตัวตน (KYC)', message: 'ส่งคำขอยืนยันตัวตนให้แอดมินตรวจสอบ? ระยะเวลาแล้วแต่แอดมิน' }))) return;
    setBusy(true);
    try { await api('/compliance/kyc/request', { method: 'POST', body: {} }); toast('ส่งคำขอ KYC แล้ว', 'success'); load(); }
    catch (e) { toast(e.message, 'error'); }
    finally { setBusy(false); }
  };
  return (
    <Card>
      <CardHeader title="ยืนยันตัวตน (KYC)" sub="ยืนยันตัวตนเพื่อปลดล็อกฟีเจอร์ที่ต้องการ identity — แอดมินตรวจสอบแบบ manual" />
      <CardBody>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="text-sm">
            <span className={`font-semibold ${st === 'verified' ? 'text-emerald-300' : st === 'rejected' ? 'text-red-300' : st === 'pending' ? 'text-amber-300' : 'text-navy-300'}`}>{TH[st]}</span>
            {kyc.kyc_requested_at && <span className="text-navy-400 text-xs ml-2">ส่งคำขอ {kyc.kyc_requested_at}</span>}
            {st === 'rejected' && kyc.kyc_note && <div className="text-xs text-red-300/80 mt-1">เหตุผล: {kyc.kyc_note}</div>}
          </div>
          {(st === 'none' || st === 'rejected') && (
            <Button size="sm" onClick={request} disabled={busy || !user?.emailVerified}>
              {busy ? 'กำลังส่ง...' : st === 'rejected' ? 'ส่งคำขอใหม่' : 'ขอ verify ตัวตน'}
            </Button>
          )}
        </div>
        {!user?.emailVerified && (st === 'none' || st === 'rejected') && (
          <div className="text-xs text-amber-300 mt-2">กรุณายืนยันอีเมลก่อนสมัคร KYC</div>
        )}
      </CardBody>
    </Card>
  );
}

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

// Sessions — ดู/เพิกถอนอุปกรณ์ที่ล็อกอินอยู่
function SessionsCard() {
  const [sessions, setSessions] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = async () => {
    try { setSessions((await api('/auth/sessions')).sessions); } catch (e) { toast(e.message, 'error'); }
  };
  useEffect(() => { load(); }, []);
  const revoke = async (id) => {
    setBusy(true);
    try { await api(`/auth/sessions/${id}`, { method: 'DELETE' }); await load(); toast('เพิกถอน session แล้ว'); }
    catch (e) { toast(e.message, 'error'); }
    finally { setBusy(false); }
  };
  const revokeOthers = async () => {
    setBusy(true);
    try { const r = await api('/auth/sessions/revoke-others', { method: 'POST' }); await load(); toast(`เพิกถอนอีก ${r.revoked} session แล้ว`); }
    catch (e) { toast(e.message, 'error'); }
    finally { setBusy(false); }
  };
  if (!sessions) return null;
  return (
    <Card>
      <CardHeader title="อุปกรณ์ที่ล็อกอิน" sub="จัดการ session ที่ใช้งานอยู่ — เพิกถอนเครื่องที่ไม่รู้จัก" />
      <CardBody>
        <div className="space-y-2 mb-3">
          {sessions.map(s => (
            <div key={s.id} className="flex items-center justify-between bg-navy-900/60 border border-navy-700 rounded-lg px-3 py-2 text-sm">
              <div className="min-w-0">
                <div className="text-white truncate">{s.user_agent || 'unknown device'} {s.current && <span className="text-[10px] bg-gold-500/20 text-gold-300 px-1.5 py-0.5 rounded ml-1">อุปกรณ์นี้</span>}</div>
                <div className="text-[11px] text-navy-400">IP {s.ip || '-'} • {String(s.created_at || '').slice(0, 16).replace('T', ' ')}</div>
              </div>
              {!s.current && <Button variant="ghost" size="sm" disabled={busy} onClick={() => revoke(s.id)}>เพิกถอน</Button>}
            </div>
          ))}
          {sessions.length === 0 && <div className="text-sm text-navy-400">ไม่มี session ที่ใช้งานอยู่</div>}
        </div>
        {sessions.length > 1 && <Button variant="ghost" size="sm" disabled={busy} onClick={revokeOthers}>ออกจากอุปกรณ์อื่นทั้งหมด</Button>}
      </CardBody>
    </Card>
  );
}

// Email verification — ส่งลิงก์ยืนยันไปยังอีเมล (ต้องตั้งค่า SMTP)
function EmailVerifyCard({ user, onDone }) {
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState('');
  if (user?.emailVerified) return null;
  const isTemp = /@(member\.local|phone\.local|line\.local|demo\.local)$/.test(user?.email || '');
  const request = async () => {
    setBusy(true); setInfo('');
    try {
      const r = await api('/auth/email/verify/request', { method: 'POST' });
      setInfo(r.mailed ? 'ส่งลิงก์ยืนยันไปยังอีเมลแล้ว — ตรวจสอบกล่องจดหมาย' : (r.devToken ? `Dev mode — เปิด /verify-email?token=${r.devToken}` : 'ระบบยังไม่ได้ตั้งค่า SMTP — ไม่สามารถส่งอีเมลได้'));
    } catch (e) { setInfo(e.message); }
    finally { setBusy(false); }
  };
  return (
    <Card>
      <CardHeader title="ยืนยันอีเมล" sub="ยืนยันว่าอีเมลเป็นของคุณจริง เพื่อความปลอดภัยบัญชี" />
      <CardBody>
        {isTemp ? (
          <p className="text-sm text-navy-300">บัญชีนี้ใช้อีเมลชั่วคราว ({user?.email}) — สมัครด้วยอีเมลจริง (แท็บ OTP → อีเมล) เพื่อรับการยืนยัน</p>
        ) : (
          <>
            <p className="text-sm text-navy-300 mb-3">อีเมลปัจจุบัน: <span className="text-white">{user?.email}</span> — ยังไม่ได้ยืนยัน</p>
            <Button variant="ghost" size="sm" onClick={request} disabled={busy}>{busy ? 'กำลังส่ง...' : 'ส่งลิงก์ยืนยันอีเมล'}</Button>
            {info && <div className="text-xs text-gold-300 mt-2 break-all">{info}</div>}
          </>
        )}
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
  const [disableCode, setDisableCode] = useState('');
  const [showDisable, setShowDisable] = useState(false);

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
  const disableMfa = async () => {
    try { await api('/auth/mfa/disable', { method: 'POST', body: { code: disableCode } }); setShowDisable(false); setDisableCode(''); await refresh(); setMsg('ปิด MFA แล้ว'); }
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
          <Input type="password" required minLength={10} placeholder="รหัสผ่านใหม่ (10+ ตัว)" value={pw.newPassword} onChange={e => setPw({...pw, newPassword: e.target.value})} inputClassName="py-2.5" />
          <Input type="password" required placeholder="ยืนยันรหัสผ่านใหม่" value={pw.confirm} onChange={e => setPw({...pw, confirm: e.target.value})} inputClassName="py-2.5" />
          {err && <div className="text-red-400 text-sm" role="alert">{err}</div>}
          {msg && <div className="text-green-400 text-sm" role="status">{msg}</div>}
          <Button disabled={busy}>{busy ? 'กำลังเปลี่ยน...' : 'เปลี่ยนรหัสผ่าน'}</Button>
        </form>
        </CardBody>
      </Card>

      {/* การตั้งค่าบัญชี — timezone/push */}
      <PrefsCard />

      {/* Email verification */}
      <EmailVerifyCard user={user} onDone={refresh} />

      {/* KYC — verify ตัวตน */}
      <KycCard user={user} />

      {/* Sessions — อุปกรณ์ที่ล็อกอินอยู่ */}
      <SessionsCard />

      {/* Responsible gambling — วงเงินเดิมพัน + self-exclusion */}
      <RGCard user={user} onDone={refresh} />

      {/* PDPA — export + delete account */}
      <PrivacyCard onDeleted={async () => { await logout(); window.location.href = '/'; }} />

      <Card>
        <CardHeader title="การยืนยันตัวตน 2 ชั้น (MFA/TOTP)" sub={isAdmin ? 'จำเป็นสำหรับบัญชี Admin — แนะนำสำหรับทุกคน' : 'เพิ่มความปลอดภัยบัญชีของคุณ'} />
        <CardBody>
        <p className="text-sm text-navy-300 mb-4">{user?.mfaEnabled ? 'เปิดใช้งานแล้ว — ปลอดภัยยิ่งขึ้น' : 'ยังไม่ได้เปิดใช้งาน — แนะนำให้เปิดใช้'}</p>
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
        {user?.mfaEnabled && !mfa && (
          <div className="mt-4 pt-4 border-t border-navy-700">
            {!showDisable ? (
              <Button variant="ghost" size="sm" onClick={() => setShowDisable(true)}>ปิดใช้งาน MFA</Button>
            ) : (
              <div className="flex gap-2 items-center">
                <Input value={disableCode} onChange={e => setDisableCode(e.target.value.replace(/\D/g,'').slice(0,6))}
                  placeholder="รหัส MFA 6 หลักเพื่อยืนยัน" className="flex-1" inputClassName="text-center tracking-widest py-2" />
                <Button variant="danger" size="sm" onClick={disableMfa} disabled={disableCode.length !== 6}>ยืนยันปิด</Button>
                <Button variant="ghost" size="sm" onClick={() => { setShowDisable(false); setDisableCode(''); }}>ยกเลิก</Button>
              </div>
            )}
          </div>
        )}
        </CardBody>
      </Card>
    </div>
  );
}
