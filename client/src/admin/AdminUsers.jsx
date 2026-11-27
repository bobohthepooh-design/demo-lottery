import { useEffect, useState, useCallback } from 'react';
import { api, fmtDateTime } from '../api.js';
import { useAuth } from '../auth.jsx';
import { confirmAction } from './confirm.jsx';
import { toast } from '../components/toast.js';
import { Modal } from '../components/ui/index.js';
import '../styles/luxury-theme.css';

export default function AdminUsers() {
  const { user } = useAuth();
  const [admins, setAdmins] = useState([]);
  const [meta, setMeta] = useState({});
  const [form, setForm] = useState({ username: '', password: '', displayName: '', roleName: 'admin' });
  const [sessions, setSessions] = useState(null);
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
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold luxury-gradient-text">จัดการบัญชีผู้ดูแล</h1>
          <p className="text-sm text-[var(--muted-gray)] mt-1">สร้างและจัดการบัญชีผู้ดูแลระบบ</p>
        </div>
        <div className="text-xs text-[var(--muted-gray)] bg-[var(--bg-dark-surface)] border border-[var(--border-light)] rounded-lg px-4 py-2">
          Maker-checker: {meta.makerChecker === 'always' ? 'บังคับทุกครั้ง' : meta.makerChecker === 'off' ? 'ปิด' : `อัตโนมัติ (${meta.adminCount || 0} บัญชี)`}
        </div>
      </div>

      <div className="luxury-card p-5">
        <form onSubmit={create} className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
          <div>
            <label className="text-xs text-[var(--muted-gray)] mb-1 block">Username</label>
            <input 
              required 
              value={form.username} 
              onChange={e => setForm({ ...form, username: e.target.value })} 
              className="luxury-input w-full py-2.5 text-sm" 
              placeholder="admin2" 
            />
          </div>
          <div>
            <label className="text-xs text-[var(--muted-gray)] mb-1 block">Password</label>
            <input 
              required 
              type="password" 
              minLength={8} 
              value={form.password} 
              onChange={e => setForm({ ...form, password: e.target.value })} 
              className="luxury-input w-full py-2.5 text-sm" 
              placeholder="อย่างน้อย 8 ตัว" 
            />
          </div>
          <div>
            <label className="text-xs text-[var(--muted-gray)] mb-1 block">ชื่อแสดง</label>
            <input 
              value={form.displayName} 
              onChange={e => setForm({ ...form, displayName: e.target.value })} 
              className="luxury-input w-full py-2.5 text-sm" 
            />
          </div>
          <div>
            <label className="text-xs text-[var(--muted-gray)] mb-1 block">Role</label>
            <select 
              value={form.roleName} 
              onChange={e => setForm({ ...form, roleName: e.target.value })}
              className="luxury-input w-full py-2.5 text-sm"
            >
              <option value="admin">admin (สิทธิ์จำกัด)</option>
              <option value="super_admin">super_admin (ทุกสิทธิ์)</option>
            </select>
          </div>
          <button 
            type="submit" 
            disabled={busy === 'create'} 
            className="luxury-btn text-sm font-semibold"
          >
            + สร้างบัญชี
          </button>
        </form>
      </div>

      <div className="luxury-card overflow-hidden">
        {/* mobile cards (< lg) */}
        <div className="lg:hidden divide-y divide-[var(--border-light)]">
          {admins.map(a => (
            <div key={a.id} className="p-4 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="text-[var(--white)] font-semibold">{a.username}</span>
                  {isSelf(a) && <span className="ml-1 text-[9px] text-[var(--gold-primary)]">(คุณ)</span>}
                  <div className="text-xs text-[var(--muted-gray)]">{a.display_name || '—'} • ID {a.id}</div>
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                  a.status === 'active'
                    ? 'bg-[var(--success-green)]/15 text-[var(--success-green)] border-[var(--success-green)]/40'
                    : 'bg-[var(--danger-red)]/15 text-[var(--danger-red)] border-[var(--danger-red)]/40'
                }`}>
                  {a.status}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                <div className="text-[var(--muted-gray)]">Roles: <span className="text-[var(--white)]">{(a.roles || []).join(', ')}</span></div>
                <div className="text-[var(--muted-gray)]">MFA: {a.mfa_enabled ? <span className="text-[var(--success-green)]">✓ เปิด</span> : <span className="text-[var(--warning-amber)]">ยังไม่เปิด</span>}</div>
                <div className="text-[var(--muted-gray)]">Sessions: <span className="text-[var(--white)]">{a.activeSessions}</span></div>
                <div className="text-[var(--muted-gray)]">เข้าใช้ล่าสุด: <span className="text-[var(--white)]">{a.lastLoginAt ? fmtDateTime(a.lastLoginAt) : '—'}</span></div>
              </div>
              <div className="flex gap-3 pt-1">
                <button
                  onClick={() => loadSessions(a)}
                  className="text-[10px] text-[var(--info-blue)] hover:underline transition"
                >
                  sessions
                </button>
                {!isSelf(a) && a.mfa_enabled && (
                  <button
                    className="text-[10px] text-[var(--warning-amber)] hover:underline transition disabled:opacity-50"
                    disabled={busy === `mfa-${a.id}`}
                    onClick={() => resetMfa(a)}
                  >
                    reset MFA
                  </button>
                )}
                {!isSelf(a) && (
                  <button
                    className={`text-[10px] hover:underline transition disabled:opacity-50 ${
                      a.status === 'active' ? 'text-[var(--danger-red)]' : 'text-[var(--success-green)]'
                    }`}
                    disabled={busy === `st-${a.id}`}
                    onClick={() => setStatus(a, a.status === 'active' ? 'disabled' : 'active')}
                  >
                    {a.status === 'active' ? 'ปิดบัญชี' : 'เปิดบัญชี'}
                  </button>
                )}
              </div>
            </div>
          ))}
          {admins.length === 0 && (
            <div className="px-4 py-6 text-center text-xs text-[var(--muted-gray)]">ไม่มีข้อมูลผู้ดูแล</div>
          )}
        </div>
        <div className="hidden lg:block overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[var(--border-light)]">
                <th className="text-left text-xs font-semibold text-[var(--muted-gray)] px-4 py-3">ID</th>
                <th className="text-left text-xs font-semibold text-[var(--muted-gray)] px-4 py-3">Username</th>
                <th className="text-left text-xs font-semibold text-[var(--muted-gray)] px-4 py-3">ชื่อ</th>
                <th className="text-left text-xs font-semibold text-[var(--muted-gray)] px-4 py-3">Roles</th>
                <th className="text-left text-xs font-semibold text-[var(--muted-gray)] px-4 py-3">MFA</th>
                <th className="text-left text-xs font-semibold text-[var(--muted-gray)] px-4 py-3">สถานะ</th>
                <th className="text-left text-xs font-semibold text-[var(--muted-gray)] px-4 py-3">Sessions</th>
                <th className="text-left text-xs font-semibold text-[var(--muted-gray)] px-4 py-3">เข้าใช้ล่าสุด</th>
                <th className="text-right text-xs font-semibold text-[var(--muted-gray)] px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {admins.map(a => (
                <tr key={a.id} className="border-b border-[var(--border-light)] hover:bg-[var(--bg-card-hover)] transition">
                  <td className="text-[var(--muted-gray)] px-4 py-3 text-sm">{a.id}</td>
                  <td className="px-4 py-3">
                    <span className="text-[var(--white)] font-semibold">{a.username}</span>
                    {isSelf(a) && <span className="ml-1 text-[9px] text-[var(--gold-primary)]">(คุณ)</span>}
                  </td>
                  <td className="text-[var(--muted-gray)] px-4 py-3 text-xs">{a.display_name}</td>
                  <td className="text-xs text-[var(--white)] px-4 py-3">{(a.roles || []).join(', ')}</td>
                  <td className="px-4 py-3">
                    {a.mfa_enabled ? (
                      <span className="text-[10px] text-[var(--success-green)]">✓ เปิด</span>
                    ) : (
                      <span className="text-[10px] text-[var(--warning-amber)]">ยังไม่เปิด</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                      a.status === 'active' 
                        ? 'bg-[var(--success-green)]/15 text-[var(--success-green)] border-[var(--success-green)]/40' 
                        : 'bg-[var(--danger-red)]/15 text-[var(--danger-red)] border-[var(--danger-red)]/40'
                    }`}>
                      {a.status}
                    </span>
                  </td>
                  <td className="text-xs text-[var(--muted-gray)] px-4 py-3">{a.activeSessions}</td>
                  <td className="text-[10px] text-[var(--muted-gray)] whitespace-nowrap px-4 py-3">
                    {a.lastLoginAt ? fmtDateTime(a.lastLoginAt) : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2 justify-end">
                      <button 
                        onClick={() => loadSessions(a)} 
                        className="text-[10px] text-[var(--info-blue)] hover:underline transition"
                      >
                        sessions
                      </button>
                      {!isSelf(a) && a.mfa_enabled && (
                        <button 
                          className="text-[10px] text-[var(--warning-amber)] hover:underline transition disabled:opacity-50" 
                          disabled={busy === `mfa-${a.id}`} 
                          onClick={() => resetMfa(a)}
                        >
                          reset MFA
                        </button>
                      )}
                      {!isSelf(a) && (
                        <button 
                          className={`text-[10px] hover:underline transition disabled:opacity-50 ${
                            a.status === 'active' ? 'text-[var(--danger-red)]' : 'text-[var(--success-green)]'
                          }`} 
                          disabled={busy === `st-${a.id}`}
                          onClick={() => setStatus(a, a.status === 'active' ? 'disabled' : 'active')}
                        >
                          {a.status === 'active' ? 'ปิดบัญชี' : 'เปิดบัญชี'}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {sessions && (
        <div className="luxury-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-[var(--white)] text-lg">Sessions ของ {sessions.username}</h2>
            <button 
              onClick={() => setSessions(null)} 
              className="text-xs text-[var(--muted-gray)] hover:text-[var(--white)] transition"
            >
              ปิด
            </button>
          </div>
          {sessions.list.length === 0 && (
            <div className="text-[var(--muted-gray)] text-sm">ไม่มี session ที่ใช้งานอยู่</div>
          )}
          {sessions.list.map(s => (
            <div key={s.id} className="flex items-center justify-between text-xs bg-[var(--bg-dark-surface)] border border-[var(--border-light)] rounded-lg p-3 mb-2">
              <div>
                <div className="text-[var(--white)]">{s.ip || '—'} • MFA {s.mfa_verified ? '✓' : '✗'}</div>
                <div className="text-[10px] text-[var(--muted-gray)] truncate max-w-[420px]">
                  {s.user_agent || ''} • สร้าง {fmtDateTime(s.created_at)} • หมด {fmtDateTime(s.expires_at)}
                </div>
              </div>
              <button 
                onClick={() => revokeSession(s.id)} 
                className="text-[10px] text-[var(--danger-red)] hover:underline transition px-2 py-1"
              >
                เพิกถอน
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
