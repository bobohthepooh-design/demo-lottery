import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { confirmAction } from './confirm.jsx';
import { toast } from '../components/toast.js';
import { Card, Button } from '../components/ui/index.js';

export default function AdminRoles() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [sel, setSel] = useState({}); // roleId -> Set(permissionId)

  const load = () => api('/admin/roles').then(r => {
    setData(r);
    const m = {};
    r.roles.forEach(role => { m[role.id] = new Set(role.permissions); });
    setSel(m);
  }).catch(e => toast(e.message, 'error'));
  useEffect(() => { load(); }, []);
  if (!data) return <div className="text-navy-300">กำลังโหลด...</div>;

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
      await api('/admin/roles/permissions', { method: 'PUT', body: { roleId, permissionIds: [...sel[roleId]] } });
      toast('บันทึกสิทธิ์แล้ว', 'success');
    } catch (e) { toast(e.message, 'error'); }
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-white">จัดการ Role & Permissions (RBAC)</h1>
      {!isSuper && <div className="bg-yellow-500/10 border border-yellow-500/40 text-yellow-300 text-sm rounded-lg p-3">เฉพาะ Super Admin เท่านั้นที่แก้ไขสิทธิ์ได้</div>}
      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-navy-900 text-navy-300 text-xs">
            <tr>
              <th className="text-left px-4 py-3 sticky left-0 bg-navy-900">Permission</th>
              {data.roles.map(r => <th key={r.id} className="text-center px-3 py-3 text-gold-300">{r.name}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-navy-700">
            {data.permissions.map(p => (
              <tr key={p.id} className="hover:bg-navy-700/30">
                <td className="px-4 py-2 sticky left-0 bg-navy-800">
                  <code className="text-xs text-white">{p.code}</code>
                  <div className="text-[10px] text-navy-400">{p.description}</div>
                </td>
                {data.roles.map(r => (
                  <td key={r.id} className="text-center px-3 py-2">
                    <input type="checkbox" disabled={!isSuper} checked={sel[r.id]?.has(p.id)}
                      onChange={() => toggle(r.id, p.id)} className="w-4 h-4 accent-gold-500" />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      {isSuper && data.roles.map(r => (
        <Button key={r.id} onClick={() => save(r.id)}>บันทึกสิทธิ์ของ {r.name}</Button>
      ))}
    </div>
  );
}
