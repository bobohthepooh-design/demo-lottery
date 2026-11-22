import { useEffect, useState } from 'react';
import { api, satang } from '../api.js';
import { confirmAction } from './confirm.jsx';
import { toast } from '../components/toast.js';
import { Card, Input, Button, Modal, Select } from '../components/ui/index.js';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/shadcn/table.jsx';
import { Badge } from '../components/shadcn/badge.jsx';
import { cn } from '../lib/utils.js';

export default function AdminMembers() {
  const [members, setMembers] = useState([]);
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState(null);
  const [del, setDel] = useState(null);

  const load = () => api(`/admin/members?q=${encodeURIComponent(q)}`).then(r => setMembers(r.members)).catch(e => toast(e.message, 'error'));
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!(await confirmAction({ title: 'ยืนยันการแก้ไขสมาชิก', message: `บันทึกการเปลี่ยนแปลงของ ${edit.username} ใช่หรือไม่?` }))) return;
    // ส่งเฉพาะ field ที่แก้ได้ — password ว่าง = ไม่เปลี่ยน (ส่ง '' จะโดน validate min 8 ปฏิเสธ)
    const body = { status: edit.status, displayName: edit.displayName, withdrawUnlocked: !!edit.withdrawUnlocked };
    if (edit.password) body.password = edit.password;
    try {
      await api(`/admin/members/${edit.id}`, { method: 'PATCH', body });
      setEdit(null); load();
    } catch (e) { toast(e.message, 'error'); }
  };

  const remove = async () => {
    try {
      await api(`/admin/members/${del.id}`, { method: 'DELETE' });
      setDel(null); load();
    } catch (e) { toast(e.message, 'error'); setDel(null); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold text-white">จัดการสมาชิก</h1>
        <Input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && load()}
          placeholder="ค้นหา username/email..." inputClassName="w-64 py-2 text-sm" />
      </div>
      <Card>
        <Table>
          <TableHeader>
            <TableRow className="border-navy-700/60 hover:bg-transparent">
              <TableHead className="text-navy-400">ID</TableHead>
              <TableHead className="text-navy-400">ผู้ใช้</TableHead>
              <TableHead className="text-navy-400">อีเมล</TableHead>
              <TableHead className="text-navy-400">บทบาท</TableHead>
              <TableHead className="text-navy-400 text-right">เครดิต</TableHead>
              <TableHead className="text-navy-400">สถานะ</TableHead>
              <TableHead className="text-navy-400">MFA</TableHead>
              <TableHead className="text-navy-400">18+/RG</TableHead>
              <TableHead className="text-navy-400 sticky right-0 bg-navy-900 z-10"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map(m => (
              <TableRow key={m.id} className="group border-navy-700/50 hover:bg-navy-700/40">
                <TableCell className="text-navy-300">{m.id}</TableCell>
                <TableCell><div className="text-white font-semibold">{m.username}</div><div className="text-xs text-navy-300">{m.displayName}</div></TableCell>
                <TableCell className="text-navy-300">{m.email}</TableCell>
                <TableCell className="text-xs text-gold-300">{m.roles.join(', ')}</TableCell>
                <TableCell className="text-right text-gold-300 font-bold">{satang(m.balance)} บาท</TableCell>
                <TableCell>
                  <Badge variant="outline" className={cn('text-[10px] font-semibold',
                    m.status === 'active' ? 'border-emerald-500/40 text-emerald-300' : 'border-red-500/40 text-red-300')}>
                    {m.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs">{m.mfaEnabled ? '✅' : '—'}{m.withdrawUnlocked ? ' 💸' : ''}</TableCell>
                <TableCell className="text-xs whitespace-nowrap">
                  {m.selfExcludedUntil ? <span className="text-red-400 font-bold" title={m.selfExcludedUntil === 'permanent' ? 'ระงับถาวร' : `ระงับถึง ${m.selfExcludedUntil}`}>⛔{m.selfExcludedUntil === 'permanent' ? 'ถาวร' : ''}</span>
                    : m.dailyLimitSatang || m.monthlyLimitSatang
                      ? <span className="text-amber-300" title={`วัน ${satang(m.dailyLimitSatang || 0)} บาท / เดือน ${satang(m.monthlyLimitSatang || 0)} บาท`}>⚠️จำกัด</span>
                      : <span className="text-navy-400">—</span>}
                  {!m.ageConfirmed && <span className="text-red-400 ml-1" title="ยังไม่ยืนยันอายุ 18+">❗</span>}
                </TableCell>
                <TableCell className="whitespace-nowrap sticky right-0 bg-navy-800 group-hover:bg-navy-700/40 z-10">
                  <button onClick={() => setEdit({ ...m })} className="text-[#67e8f9] text-xs hover:underline mr-3">แก้ไข</button>
                  <button onClick={() => setDel(m)} className="text-red-400 text-xs hover:underline">ลบ</button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {/* modal แก้ไขสมาชิก — Modal กลาง (ESC + backdrop ปิด) */}
      <Modal open={!!edit} onClose={() => setEdit(null)} title={`แก้ไขสมาชิก: ${edit?.username || ''}`}>
        <div className="space-y-3">
          <Input label="ชื่อที่แสดง" value={edit?.displayName || ''} onChange={e => setEdit({ ...edit, displayName: e.target.value })}
            inputClassName="py-2" />
          <Select label="สถานะ" value={edit?.status} onChange={e => setEdit({ ...edit, status: e.target.value })} inputClassName="py-2">
            <option value="active">active</option><option value="locked">locked</option><option value="disabled">disabled</option>
          </Select>
          <div className="flex items-start gap-2 bg-navy-900/60 border border-navy-700 rounded-lg p-3">
            <input type="checkbox" id="wd-unlock" checked={!!edit?.withdrawUnlocked}
              onChange={e => setEdit({ ...edit, withdrawUnlocked: e.target.checked })}
              className="mt-0.5 accent-gold-500" />
            <label htmlFor="wd-unlock" className="text-xs text-navy-200 leading-relaxed">
              💸 <b>อนุญาตให้ถอนเครดิต</b> — ถอนได้เต็มยอดคงเหลือ แต่ระบบจะ<b>หักเครดิตแถม 50 บาท ออก</b> และต้องเหลืออย่างน้อย 50 บาท จึงจะถอนได้
            </label>
          </div>
          {edit && (edit.selfExcludedUntil || edit.dailyLimitSatang || edit.monthlyLimitSatang || !edit.ageConfirmed) && (
            <div className="bg-navy-900/60 border border-navy-700 rounded-lg p-3 text-xs space-y-1">
              <div className="text-navy-300 font-semibold mb-1">สถานะ Responsible Gambling</div>
              {!edit.ageConfirmed && <div className="text-red-300">❗ ยังไม่ยืนยันอายุ 18+</div>}
              {edit.selfExcludedUntil && <div className="text-red-300">⛔ ระงับการแทง{edit.selfExcludedUntil === 'permanent' ? 'ถาวร' : `ถึง ${edit.selfExcludedUntil}`}</div>}
              {(edit.dailyLimitSatang || edit.monthlyLimitSatang) && (
                <div className="text-amber-300">⚠️ วงเงิน: วัน {satang(edit.dailyLimitSatang || 0)} บาท • เดือน {satang(edit.monthlyLimitSatang || 0)} บาท</div>
              )}
            </div>
          )}
          <Input label="รีเซ็ตรหัสผ่านใหม่ (เว้นว่างถ้าไม่เปลี่ยน)" type="password" value={edit?.password || ''}
            onChange={e => setEdit({ ...edit, password: e.target.value })} placeholder="อย่างน้อย 8 ตัว" inputClassName="py-2" />
          <div className="flex gap-2 pt-2">
            <Button onClick={save} className="flex-1">บันทึก</Button>
            <Button variant="ghost" onClick={() => setEdit(null)}>ยกเลิก</Button>
          </div>
        </div>
      </Modal>

      {/* modal ยืนยันลบสมาชิก */}
      <Modal open={!!del} onClose={() => setDel(null)} title="ลบสมาชิก?">
        <p className="text-sm text-navy-300 mb-1">ต้องการลบบัญชี <span className="text-white font-semibold">{del?.username}</span> ใช่หรือไม่</p>
        <p className="text-xs text-navy-400 mb-4">กระเป๋า เครดิต และเซสชันทั้งหมดจะถูกลบถาวร (ลบไม่ได้ถ้ามีประวัติโพย)</p>
        <div className="flex gap-2">
          <Button variant="danger" onClick={remove} className="flex-1">ลบสมาชิก</Button>
          <Button variant="ghost" onClick={() => setDel(null)}>ยกเลิก</Button>
        </div>
      </Modal>
    </div>
  );
}
