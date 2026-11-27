import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { confirmAction } from '../admin/confirm.jsx';
import { toast } from '../components/toast.js';

import { getTz, setTz } from '../time.js';
import { pushSupported, subscribePush, unsubscribePush, pushSubscriptionCount } from '../push.js';
import { Card, CardHeader, CardBody, Input, Select, Button } from '../components/ui/index.js';
import QRCode from 'qrcode';
import '../styles/luxury-theme.css';

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
    <Card className="luxury-card">
      <CardHeader title="ยืนยันตัวตน (KYC)" sub="ยืนยันตัวตนเพื่อปลดล็อกฟีเจอร์ที่ต้องการ identity — แอดมินตรวจสอบแบบ manual" />
      <CardBody>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="text-sm">
            <span className={`font-semibold ${st === 'verified' ? 'text-[var(--success-green)]' : st === 'rejected' ? 'text-[var(--danger-red)]' : st === 'pending' ? 'text-[var(--warning-amber)]' : 'text-[var(--muted-gray)]'}`}>{TH[st]}</span>
            {kyc.kyc_requested_at && <span className="text-[var(--muted-gray)] text-xs ml-2">ส่งคำขอ {kyc.kyc_requested_at}</span>}
            {st === 'rejected' && kyc.kyc_note && <div className="text-xs text-[var(--danger-red)]/80 mt-1">เหตุผล: {kyc.kyc_note}</div>}
          </div>
          {(st === 'none' || st === 'rejected') && (
            <Button size="sm" onClick={request} disabled={busy || !user?.emailVerified} className="luxury-btn">
              {busy ? 'กำลังส่ง...' : st === 'rejected' ? 'ส่งคำขอใหม่' : 'ขอ verify ตัวตน'}
            </Button>
          )}
        </div>
        {!user?.emailVerified && (st === 'none' || st === 'rejected') && (
          <div className="text-xs text-[var(--warning-amber)] mt-2">กรุณายืนยันอีเมลก่อนสมัคร KYC</div>
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
    <Card className="luxury-card">
      <CardHeader title="เล่นอย่างรับผิดชอบ" sub="ตั้งวงเงินเดิมพันสูงสุดต่อวัน/เดือน และ/หรือระงับการแทงชั่วคราว — เพื่อป้องกันการเล่นเกินตัว" />
      <CardBody>
      {excluded && (
        <div className="mb-4 bg-[var(--danger-red)]/10 border border-[var(--danger-red)]/40 rounded-lg px-3 py-2 text-sm text-[var(--danger-red)] font-semibold">
          ⛔ บัญชีถูกระงับการแทง{user.selfExcludedUntil === 'permanent' ? 'ถาวร' : `ถึง ${user.selfExcludedUntil}`}
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
        <Input label="วงเงินสูงสุด/วัน (บาท — เว้นว่าง = ไม่จำกัด)" type="number" min="0" value={daily} onChange={e => setDaily(e.target.value)} placeholder="เช่น 500" inputClassName="py-2 luxury-input" />
        <Input label="วงเงินสูงสุด/เดือน (บาท)" type="number" min="0" value={monthly} onChange={e => setMonthly(e.target.value)} placeholder="เช่น 5000" inputClassName="py-2 luxury-input" />
      </div>
      <Button onClick={saveLimits} size="sm" className="mb-5 luxury-btn">บันทึกวงเงิน</Button>
      <div>
        <div className="text-xs text-[var(--muted-gray)] mb-2">ระงับการแทง (self-exclusion — ยกเลิกเองไม่ได้):</div>
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
    <Card className="luxury-card">
      <CardHeader title="การตั้งค่าบัญชี" sub="เขตเวลา • การแจ้งเตือน" />
      <CardBody>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Select label="เขตเวลา / Timezone" value={tz} onChange={e => changeTz(e.target.value)} inputClassName="py-2 text-sm luxury-input">
          {TZ_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </Select>
        <div>
          <label className="text-xs font-semibold text-[var(--muted-gray)] mb-1.5 block">การแจ้งเตือน Push</label>
          <Button onClick={togglePush} disabled={pushBusy || !pushSupported()}
            variant={pushOn ? 'accent' : 'ghost'} className={`w-full ${pushOn ? 'luxury-btn' : 'luxury-btn-ghost'}`}>
            {pushBusy ? '...' : pushOn ? 'เปิดอยู่ — แตะเพื่อปิด' : 'เปิดแจ้งเตือน'}
          </Button>
          {!pushSupported() && <div className="text-[10px] text-[var(--muted-gray)] mt-1">เบราว์เซอร์นี้ไม่รองรับ push</div>}
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
    <Card className="luxury-card">
      <CardHeader title="อุปกรณ์ที่ล็อกอิน" sub="จัดการ session ที่ใช้งานอยู่ — เพิกถอนเครื่องที่ไม่รู้จัก" />
      <CardBody>
        <div className="space-y-2 mb-3">
          {sessions.slice(0, 10).map(s => (
            <div key={s.id} className="flex items-center justify-between bg-[var(--bg-dark-surface)] border border-[var(--border-light)] rounded-lg px-3 py-2 text-sm hover:border-[var(--border-gold)] transition">
              <div className="min-w-0">
                <div className="text-[var(--white)] truncate">{s.user_agent || 'unknown device'} {s.current && <span className="text-[10px] bg-[var(--gold-primary)]/20 text-[var(--gold-primary)] px-1.5 py-0.5 rounded ml-1 luxury-badge-gold">อุปกรณ์นี้</span>}</div>
                <div className="text-[11px] text-[var(--muted-gray)]">IP {s.ip || '-'} • {String(s.created_at || '').slice(0, 16).replace('T', ' ')}</div>
              </div>
              {!s.current && <Button variant="ghost" size="sm" disabled={busy} onClick={() => revoke(s.id)} className="luxury-btn-ghost">เพิกถอน</Button>}
            </div>
          ))}
          {sessions.length > 10 && <div className="text-[11px] text-[var(--muted-gray)] pt-1">แสดง 10 รายการล่าสุด — เพิกถอนอุปกรณ์เก่าจากรายการนี้ได้</div>}
          {sessions.length === 0 && <div className="text-sm text-[var(--muted-gray)]">ไม่มี session ที่ใช้งานอยู่</div>}
        </div>
        {sessions.length > 1 && <Button variant="ghost" size="sm" disabled={busy} onClick={revokeOthers} className="luxury-btn-ghost">ออกจากอุปกรณ์อื่นทั้งหมด</Button>}
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
    <Card className="luxury-card">
      <CardHeader title="ยืนยันอีเมล" sub="ยืนยันว่าอีเมลเป็นของคุณจริง เพื่อความปลอดภัยบัญชี" />
      <CardBody>
        {isTemp ? (
          <p className="text-sm text-[var(--muted-gray)]">บัญชีนี้ใช้อีเมลชั่วคราว ({user?.email}) — สมัครด้วยอีเมลจริง (แท็บ OTP → อีเมล) เพื่อรับการยืนยัน</p>
        ) : (
          <>
            <p className="text-sm text-[var(--muted-gray)] mb-3">อีเมลปัจจุบัน: <span className="text-[var(--white)]">{user?.email}</span> — ยังไม่ได้ยืนยัน</p>
            <Button variant="ghost" size="sm" onClick={request} disabled={busy} className="luxury-btn-ghost">{busy ? 'กำลังส่ง...' : 'ส่งลิงก์ยืนยันอีเมล'}</Button>
            {info && <div className="text-xs text-[var(--gold-primary)] mt-2 break-all">{info}</div>}
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
    <Card className="luxury-card">
      <CardHeader title="ความเป็นส่วนตัว (PDPA)" sub="สิทธิ์ของเจ้าของข้อมูลตาม พ.ร.บ. คุ้มครองข้อมูลส่วนตัว" />
      <CardBody>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" size="sm" onClick={exportData} disabled={busy} className="luxury-btn-ghost">⤓ ดาวน์โหลดข้อมูลของฉัน</Button>
          <Button variant="danger" size="sm" onClick={deleteAccount} disabled={busy}>ลบบัญชีถาวร</Button>
        </div>
        <p className="text-[11px] text-[var(--muted-gray)] mt-2">การลบบัญชีจะลบข้อมูลส่วนตัวทั้งหมดและระงับการใช้งานทันที — เครดิตคงเหลือและประวัติธุรกรรมจะถูกเก็บไว้เพื่อตามกฎหมาย</p>
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
  const [mfaQr, setMfaQr] = useState(''); // data URL ของ QR จาก otpauth uri
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
    try {
      const r = await api('/auth/mfa/setup', { method: 'POST' });
      setMfa(r);
      setMfaQr(r?.uri ? await QRCode.toDataURL(r.uri, { margin: 1, width: 180 }) : '');
    } catch (e) { setErr(e.message); }
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
      <Card className="luxury-card luxury-card-gold-border">
        <CardHeader title="โปรไฟล์สมาชิก" />
        <CardBody>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div><dt className="text-[var(--muted-gray)]">ชื่อผู้ใช้</dt><dd className="text-[var(--white)] font-semibold">{user?.username}</dd></div>
          <div><dt className="text-[var(--muted-gray)]">ชื่อที่แสดง</dt><dd className="text-[var(--white)]">{user?.displayName}</dd></div>
          <div><dt className="text-[var(--muted-gray)]">อีเมล</dt><dd className="text-[var(--white)]">{user?.email}</dd></div>
          <div><dt className="text-[var(--muted-gray)]">บทบาท</dt><dd className="text-[var(--white)]">{(user?.roles || []).join(', ') || 'member'}</dd></div>
        </dl>
        </CardBody>
      </Card>

      <Card className="luxury-card">
        <CardHeader title="เปลี่ยนรหัสผ่าน" />
        <CardBody>
        <form onSubmit={changePw} className="space-y-3">
          <Input type="password" required placeholder="รหัสผ่านเดิม" value={pw.oldPassword} onChange={e => setPw({...pw, oldPassword: e.target.value})} inputClassName="py-2.5 luxury-input" />
          <Input type="password" required minLength={10} placeholder="รหัสผ่านใหม่ (10+ ตัว)" value={pw.newPassword} onChange={e => setPw({...pw, newPassword: e.target.value})} inputClassName="py-2.5 luxury-input" />
          <Input type="password" required placeholder="ยืนยันรหัสผ่านใหม่" value={pw.confirm} onChange={e => setPw({...pw, confirm: e.target.value})} inputClassName="py-2.5 luxury-input" />
          {err && <div className="text-[var(--danger-red)] text-sm" role="alert">{err}</div>}
          {msg && <div className="text-[var(--success-green)] text-sm" role="status">{msg}</div>}
          <Button disabled={busy} className="luxury-btn">{busy ? 'กำลังเปลี่ยน...' : 'เปลี่ยนรหัสผ่าน'}</Button>
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

      <Card className="luxury-card">
        <CardHeader title="การยืนยันตัวตน 2 ชั้น (MFA/TOTP)" sub={isAdmin ? 'จำเป็นสำหรับบัญชี Admin — แนะนำสำหรับทุกคน' : 'เพิ่มความปลอดภัยบัญชีของคุณ'} />
        <CardBody>
        <p className="text-sm text-[var(--muted-gray)] mb-4">{user?.mfaEnabled ? 'เปิดใช้งานแล้ว — ปลอดภัยยิ่งขึ้น' : 'ยังไม่ได้เปิดใช้งาน — แนะนำให้เปิดใช้'}</p>
        {!mfa ? (
          <Button variant="ghost" onClick={setupMfa} className="luxury-btn-ghost">
            {user?.mfaEnabled ? 'สร้าง Secret ใหม่' : 'ตั้งค่า MFA'}
          </Button>
        ) : (
          <div className="space-y-3">
            {mfaQr && (
              <div className="flex justify-center">
                <img src={mfaQr} alt="QR code สำหรับตั้งค่า MFA" className="rounded-lg bg-white p-2" width={180} height={180} />
              </div>
            )}
            <div className="bg-[var(--bg-dark-surface)] rounded-lg p-4 text-sm border border-[var(--border-light)]">
              <div className="text-[var(--muted-gray)] mb-1">สแกน QR ด้วยแอป Authenticator (หรือใส่ Secret เอง):</div>
              <code className="text-[var(--gold-primary)] text-lg tracking-wider break-all">{mfa.secret}</code>
            </div>
            <div className="flex gap-2">
              <Input value={mfaCode} onChange={e => setMfaCode(e.target.value.replace(/\D/g,'').slice(0,6))}
                placeholder="รหัส 6 หลัก" className="flex-1" inputClassName="text-center tracking-widest py-2.5 luxury-input" aria-label="รหัส MFA" />
              <Button onClick={enableMfa} className="luxury-btn">เปิดใช้งาน</Button>
            </div>
          </div>
        )}
        {user?.mfaEnabled && !mfa && (
          <div className="mt-4 pt-4 border-t border-[var(--border-light)]">
            {!showDisable ? (
              <Button variant="ghost" size="sm" onClick={() => setShowDisable(true)} className="luxury-btn-ghost">ปิดใช้งาน MFA</Button>
            ) : (
              <div className="flex gap-2 items-center">
                <Input value={disableCode} onChange={e => setDisableCode(e.target.value.replace(/\D/g,'').slice(0,6))}
                  placeholder="รหัส MFA 6 หลักเพื่อยืนยัน" className="flex-1" inputClassName="text-center tracking-widest py-2 luxury-input" />
                <Button variant="danger" size="sm" onClick={disableMfa} disabled={disableCode.length !== 6}>ยืนยันปิด</Button>
                <Button variant="ghost" size="sm" onClick={() => { setShowDisable(false); setDisableCode(''); }} className="luxury-btn-ghost">ยกเลิก</Button>
              </div>
            )}
          </div>
        )}
        </CardBody>
      </Card>
    </div>
  );
}
