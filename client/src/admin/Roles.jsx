import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { confirmAction } from './confirm.jsx';
import { toast } from '../components/toast.js';
import { AdminLoading, AdminError } from '../components/AdminStates.jsx';
import '../styles/luxury-theme.css';

export default function AdminRoles() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [sel, setSel] = useState({});
  const [err, setErr] = useState('');

  const load = () => {
    setErr('');
    return api('/admin/roles').then(r => {
      setData(r);
      const m = {};
      r.roles.forEach(role => { m[role.id] = new Set(role.permissions); });
      setSel(m);
    }).catch(e => setErr(e.message));
  };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (err) return <AdminError message={err} onRetry={load} />;
  if (!data) return <AdminLoading label="กำลังโหลดสิทธิ์การใช้งาน..." />;

  const isSuper = (user?.roles || []).includes('super_admin');

  const toggle = (roleId, permId) => {
    const next = { ...sel, [roleId]: new Set(sel[roleId]) };
    next[roleId].has(permId) ? next[roleId].delete(permId) : next[roleId].add(permId);
    setSel(next);
  };

  const save = async (roleId) => {
    const role = data.roles.find(r => r.id === roleId);
    if (!(await confirmAction({ title: 'ยืนยันบันทึกสิทธิ์', message: `บันทึกสิทธิ์การใช้งานของ role "${role?.name}" ใช่หรือไม่?` }))) return;
    try {
      const r = await api('/admin/roles/permissions', { method: 'PUT', body: { roleId, permissionIds: [...sel[roleId]] } });
      if (r.pendingApproval) toast(`📨 ส่งคำขอแก้ไขสิทธิ์ ${r.approval?.reference || ''} เข้าศูนย์อนุมัติแล้ว`, 'info');
      else toast('บันทึกสิทธิ์แล้ว', 'success');
    } catch (e) { toast(e.message, 'error'); }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold luxury-gradient-text">จัดการ Role & Permissions (RBAC)</h1>
        <p className="text-sm text-[var(--muted-gray)] mt-1">กำหนดสิทธิ์การเข้าถึงสำหรับแต่ละบทบาทผู้ดูแล</p>
      </div>
      
      {!isSuper && (
        <div className="luxury-card p-4 border-[var(--warning-amber)]/50 bg-[var(--warning-amber)]/10">
          <span className="text-sm text-[var(--warning-amber)]">⚠️ เฉพาะ Super Admin เท่านั้นที่แก้ไขสิทธิ์ได้</span>
        </div>
      )}
      
      <div className="luxury-card overflow-hidden">
        {/* mobile cards (< lg) — card ต่อ permission, checkbox ต่อ role */}
        <div className="lg:hidden divide-y divide-[var(--border-light)]">
          {data.permissions.map(p => (
            <div key={p.id} className="p-4 space-y-2">
              <div>
                <code className="text-xs text-[var(--white)]">{p.code}</code>
                <div className="text-[10px] text-[var(--muted-gray)] mt-1">{p.description}</div>
              </div>
              <div className="flex flex-wrap gap-x-5 gap-y-2">
                {data.roles.map(r => (
                  <label key={r.id} className="flex items-center gap-1.5 text-xs text-[var(--white)] cursor-pointer">
                    <input
                      type="checkbox"
                      disabled={!isSuper}
                      checked={sel[r.id]?.has(p.id)}
                      onChange={() => toggle(r.id, p.id)}
                      className="w-4 h-4 accent-[var(--gold-primary)] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                    {r.name}
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="hidden lg:block overflow-x-auto table-vscroll">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[var(--border-light)]">
                <th className="text-left text-xs font-semibold text-[var(--muted-gray)] px-4 py-3 sticky left-0 bg-[var(--bg-card)] z-10">Permission</th>
                {data.roles.map(r => (
                  <th key={r.id} className="text-center text-xs font-semibold text-[var(--gold-primary)] px-4 py-3 min-w-[100px]">{r.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.permissions.map(p => (
                <tr key={p.id} className="border-b border-[var(--border-light)] hover:bg-[var(--bg-card-hover)] transition">
                  <td className="sticky left-0 bg-[var(--bg-card)] hover:bg-[var(--bg-card-hover)] z-10 px-4 py-3">
                    <code className="text-xs text-[var(--white)]">{p.code}</code>
                    <div className="text-[10px] text-[var(--muted-gray)] mt-1">{p.description}</div>
                  </td>
                  {data.roles.map(r => (
                    <td key={r.id} className="text-center px-4 py-3">
                      <input 
                        type="checkbox" 
                        disabled={!isSuper} 
                        checked={sel[r.id]?.has(p.id)}
                        onChange={() => toggle(r.id, p.id)} 
                        className="w-5 h-5 accent-[var(--gold-primary)] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed" 
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      
      {isSuper && (
        <div className="flex flex-wrap gap-3">
          {data.roles.map(r => (
            <button 
              key={r.id} 
              onClick={() => save(r.id)}
              className="luxury-btn text-sm"
            >
              บันทึกสิทธิ์ของ {r.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
