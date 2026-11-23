import { useEffect, useState, useCallback } from 'react';
import { api, fmtDateTime } from '../api.js';
import { useAuth } from '../auth.jsx';
import { confirmAction } from './confirm.jsx';
import { toast } from '../components/toast.js';
import { Card, Button, Input, Select } from '../components/ui/index.js';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/shadcn/table.jsx';

export default function AdminUsers() {
  const { user } = useAuth();
  const [admins, setAdmins] = useState([]);
  const [meta, setMeta] = useState({});
  const [form, setForm] = useState({ username: '', password: '', displayName: '', roleName: 'admin' });
  const [sessions, setSessions] = useState(null); // {userId, list}
  const [busy, setBusy] = useState(null);

  const load = useCallback(() => {
    api('/admin/admin-users').then(r => { setAdmins(r.admins || []); setMeta(r); })
      .catch(e => toast(e.message, 'error'));
  }, []);
  useEffect(() => { load(); }, [load]);

  const create = async (e) => {
    e.preventDefault();
    if (!(await confirmAction({
      title: 'สร้างบัญชีผู้ดูแล',
      message: `สร้างบัญชี "${form.username}" สิทธิ์ ${form.roleName}?\nบัญชีใหม่ต้อง setup MFA ก่อนเข้า admin portal`,
    }))) return;
    setBusy('create');
    try {
      await api('/admin/admin-users', { method: 'POST', body: form });
      toast('สร้างบัญชีผู้ดูแลแล้ว — แจ้งให้ผู้ใช้ setup MFA', 'success');
      setForm({ username: '', password: '', displayName: '', roleName: 'admin' });
      load();
    } catch (e2) { toast(e2.message, 'error'); }
    finally { setBusy(null); }
  };

  const resetMfa = async (a) => {
    if (!(await confirmAction({
      title: 'Reset MFA',
      message: `รีเซ็ต MFA ของ "${a.username}"? เซสชันทั้งหมดจะถูกออกจากระบบ`,
      danger: true,
    }))) return;
    setBusy(`mfa-${a.id}`);
    try { await api(`/admin/admin-users/${a.id}/reset-mfa`, { method: 'POST', body: {} }); toast('รีเซ็ต MFA แล้ว', 'success'); load(); }
    catch (e) { toast(e.message, 'error'); }
    finally { setBusy(null); }
  };

  const setStatus = async (a, status) => {
    if (!(await confirmAction({
      title: status === 'disabled' ? 'ปิดบัญชีผู้ดูแล' : 'เปิดบัญชีผู้ดูแล',
      message: `${status === 'disabled' ? 'ปิด' : 'เปิด'}บัญชี "${a.username}"?`,
      danger: status === 'disabled',
    }))) return;
    setBusy(`st-${a.id}`);
    try { await api(`/admin/admin-users/${a.id}/status`, { method: 'POST', body: { status } }); toast('อัปเดตสถานะแล้ว', 'success'); load(); }
    catch (e) { toast(e.message, 'error'); }
    finally { setBusy(null); }
  };

  const loadSessions = async (a) => {
    try {
      const r = await api(`/admin/admin-users/${a.id}/sessions`);
      setSessions({ userId: a.id, username: a.username, list: r.sessions || [] });
    } catch (e) { toast(e.message, 'error'); }
  };

  const revokeSession = async (sid) => {
    if (!(await confirmAction({ title: 'เพิกถอน session', message: 'ออกจากระบบ session นี้ทันที?', danger: true }))) return;
    try {
      await api(`/admin/admin-users/${sessions.userId}/sessions/${sid}`, { method: 'DELETE' });
      toast('เพิกถอน session แล้ว', 'success');
      loadSessions({ id: sessions.userId });
    } catch (e) { toast(e.message, 'error'); }
  };

  const isSelf = (a) => a.id === user?.id;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-bold text-white">จัดการบัญชีผู้ดูแล</h1>
        <span className="text-xs text-navy-400">
          Maker-checker: {meta.makerChecker === 'always' ? 'บังคับทุกครั้ง' : meta.makerChecker === 'off' ? 'ปิด' : `อัตโนมัติ (${meta.adminCount || 0} บัญชี)`}
        </span>
      </div>

      <Card>
        <form onSubmit={create} className="p-4 grid grid-cols-2 md:grid-cols-5 gap-2 items-end">
          <div><label className="text-[10px] text-navy-400">Username</label>
            <Input required value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} className="bg-navy-800 border-navy-600 text-white text-xs" placeholder="admin2" /></div>
          <div><label className="text-[10px] text-navy-400">Password</label>
            <Input required type="password" minLength={8} value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} className="bg-navy-800 border-navy-600 text-white text-xs" placeholder="อย่างน้อย 8 ตัว" /></div>
          <div><label className="text-[10px] text-navy-400">ชื่อแสดง</label>
            <Input value={form.displayName} onChange={e => setForm({ ...form, displayName: e.target.value })} className="bg-navy-800 border-navy-600 text-white text-xs" /></div>
          <div><label className="text-[10px] text-navy-400">Role</label>
            <Select value={form.roleName} onChange={e => setForm({ ...form, roleName: e.target.value })} inputClassName="text-xs">
              <option value="admin">admin (สิทธิ์จำกัด)</option>
              <option value="super_admin">super_admin (ทุกสิทธิ์)</option>
            </Select></div>
          <Button type="submit" disabled={busy === 'create'} className="bg-gold-500 hover:bg-gold-400 text-navy-950 text-xs font-bold">+ สร้างบัญชี</Button>
        </form>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow className="border-navy-700/60 hover:bg-transparent">
              <TableHead className="text-navy-400">ID</TableHead>
              <TableHead className="text-navy-400">Username</TableHead>
              <TableHead className="text-navy-400">ชื่อ</TableHead>
              <TableHead className="text-navy-400">Roles</TableHead>
              <TableHead className="text-navy-400">MFA</TableHead>
              <TableHead className="text-navy-400">สถานะ</TableHead>
              <TableHead className="text-navy-400">Sessions</TableHead>
              <TableHead className="text-navy-400">เข้าใช้ล่าสุด</TableHead>
              <TableHead className="text-navy-400"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {admins.map(a => (
              <TableRow key={a.id} className="border-navy-700/50 hover:bg-navy-700/30">
                <TableCell className="text-navy-300">{a.id}</TableCell>
                <TableCell className="text-white font-semibold">{a.username}{isSelf(a) && <span className="ml-1 text-[9px] text-gold-400">(คุณ)</span>}</TableCell>
                <TableCell className="text-navy-300 text-xs">{a.display_name}</TableCell>
                <TableCell className="text-xs text-navy-200">{(a.roles || []).join(', ')}</TableCell>
                <TableCell>{a.mfa_enabled ? <span className="text-[10px] text-emerald-300">✓ เปิด</span> : <span className="text-[10px] text-amber-300">ยังไม่เปิด</span>}</TableCell>
                <TableCell><span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${a.status === 'active' ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40' : 'bg-red-500/15 text-red-300 border-red-500/40'}`}>{a.status}</span></TableCell>
                <TableCell className="text-xs text-navy-300">{a.activeSessions}</TableCell>
                <TableCell className="text-[10px] text-navy-400 whitespace-nowrap">{a.lastLoginAt ? fmtDateTime(a.lastLoginAt) : '—'}</TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button variant="ghost" className="text-[10px] px-2 py-1" onClick={() => loadSessions(a)}>sessions</Button>
                    {!isSelf(a) && a.mfa_enabled && (
                      <Button variant="ghost" className="text-[10px] px-2 py-1 text-amber-300" disabled={busy === `mfa-${a.id}`} onClick={() => resetMfa(a)}>reset MFA</Button>
                    )}
                    {!isSelf(a) && (
                      <Button variant="ghost" className={`text-[10px] px-2 py-1 ${a.status === 'active' ? 'text-red-300' : 'text-emerald-300'}`} disabled={busy === `st-${a.id}`}
                        onClick={() => setStatus(a, a.status === 'active' ? 'disabled' : 'active')}>
                        {a.status === 'active' ? 'ปิดบัญชี' : 'เปิดบัญชี'}
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {sessions && (
        <Card>
          <div className="p-4 space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-white">Sessions ของ {sessions.username}</h2>
              <Button variant="ghost" className="text-xs" onClick={() => setSessions(null)}>ปิด</Button>
            </div>
            {sessions.list.length === 0 && <div className="text-navy-400 text-sm">ไม่มี session ที่ใช้งานอยู่</div>}
            {sessions.list.map(s => (
              <div key={s.id} className="flex items-center justify-between text-xs bg-navy-900/50 rounded p-2">
                <div>
                  <div className="text-navy-200">{s.ip || '—'} • MFA {s.mfa_verified ? '✓' : '✗'}</div>
                  <div className="text-[10px] text-navy-400 truncate max-w-[420px]">{s.user_agent || ''} • สร้าง {fmtDateTime(s.created_at)} • หมด {fmtDateTime(s.expires_at)}</div>
                </div>
                <Button variant="ghost" className="text-[10px] px-2 py-1 text-red-300" onClick={() => revokeSession(s.id)}>เพิกถอน</Button>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
