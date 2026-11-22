import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { confirmAction } from './confirm.jsx';
import { toast } from '../components/toast.js';
import { Card, Button } from '../components/ui/index.js';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/shadcn/table.jsx';

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
      <Card>
        <Table>
          <TableHeader>
            <TableRow className="border-navy-700/60 hover:bg-transparent">
              <TableHead className="text-navy-400 sticky left-0 bg-navy-900 z-10">Permission</TableHead>
              {data.roles.map(r => <TableHead key={r.id} className="text-center text-gold-300">{r.name}</TableHead>)}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.permissions.map(p => (
              <TableRow key={p.id} className="border-navy-700/50 hover:bg-navy-700/30">
                <TableCell className="sticky left-0 bg-navy-800 z-10">
                  <code className="text-xs text-white">{p.code}</code>
                  <div className="text-[10px] text-navy-400">{p.description}</div>
                </TableCell>
                {data.roles.map(r => (
                  <TableCell key={r.id} className="text-center">
                    <input type="checkbox" disabled={!isSuper} checked={sel[r.id]?.has(p.id)}
                      onChange={() => toggle(r.id, p.id)} className="w-4 h-4 accent-gold-500" />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
      {isSuper && data.roles.map(r => (
        <Button key={r.id} onClick={() => save(r.id)}>บันทึกสิทธิ์ของ {r.name}</Button>
      ))}
    </div>
  );
}
