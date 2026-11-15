import { useEffect, useState } from 'react';
import { api, satang } from '../api.js';
import { confirmAction } from './confirm.jsx';
import { toast } from '../components/toast.js';

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
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">จัดการสมาชิก</h1>
        <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && load()}
          placeholder="ค้นหา username/email..." className="bg-navy-900 border border-navy-600 rounded-lg px-4 py-2 text-sm w-64" />
      </div>
      <div className="bg-navy-800 border border-navy-700 rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-navy-900 text-navy-300 text-xs">
            <tr><th className="text-left px-4 py-3">ID</th><th className="text-left px-4 py-3">ผู้ใช้</th><th className="text-left px-4 py-3">อีเมล</th><th className="text-left px-4 py-3">บทบาท</th><th className="text-right px-4 py-3">เครดิต</th><th className="text-left px-4 py-3">สถานะ</th><th className="text-left px-4 py-3">MFA</th><th className="text-left px-4 py-3">18+/RG</th><th className="px-4 py-3"></th></tr>
          </thead>
          <tbody className="divide-y divide-navy-700">
            {members.map(m => (
              <tr key={m.id} className="hover:bg-navy-700/40">
                <td className="px-4 py-3 text-navy-300">{m.id}</td>
                <td className="px-4 py-3"><div className="text-white font-semibold">{m.username}</div><div className="text-xs text-navy-300">{m.displayName}</div></td>
                <td className="px-4 py-3 text-navy-300">{m.email}</td>
                <td className="px-4 py-3 text-xs text-gold-300">{m.roles.join(', ')}</td>
                <td className="px-4 py-3 text-right text-gold-300 font-bold">{satang(m.balance)} บาท</td>
                <td className="px-4 py-3"><span className={m.status === 'active' ? 'text-green-400' : 'text-red-400'}>{m.status}</span></td>
                <td className="px-4 py-3 text-xs">{m.mfaEnabled ? '✅' : '—'}{m.withdrawUnlocked ? ' 💸' : ''}</td>
                <td className="px-4 py-3 text-xs whitespace-nowrap">
                  {m.selfExcludedUntil ? <span className="text-red-400 font-bold" title={m.selfExcludedUntil === 'permanent' ? 'ระงับถาวร' : `ระงับถึง ${m.selfExcludedUntil}`}>⛔{m.selfExcludedUntil === 'permanent' ? 'ถาวร' : ''}</span>
                    : m.dailyLimitSatang || m.monthlyLimitSatang
                      ? <span className="text-amber-300" title={`วัน ${satang(m.dailyLimitSatang || 0)} บาท / เดือน ${satang(m.monthlyLimitSatang || 0)} บาท`}>⚠️จำกัด</span>
                      : <span className="text-navy-400">—</span>}
                  {!m.ageConfirmed && <span className="text-red-400 ml-1" title="ยังไม่ยืนยันอายุ 18+">❗</span>}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <button onClick={() => setEdit({ ...m })} className="text-gold-400 text-xs hover:underline mr-3">แก้ไข</button>
                  <button onClick={() => setDel(m)} className="text-red-400 text-xs hover:underline">ลบ</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {edit && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={() => setEdit(null)}>
          <div className="bg-navy-800 border border-navy-600 rounded-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-white mb-4">แก้ไขสมาชิก: {edit.username}</h2>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-navy-300">ชื่อที่แสดง</label>
                <input value={edit.displayName || ''} onChange={e => setEdit({...edit, displayName: e.target.value})}
                  className="w-full bg-navy-900 border border-navy-600 rounded-lg px-3 py-2 mt-1" />
              </div>
              <div>
                <label className="text-xs text-navy-300">สถานะ</label>
                <select value={edit.status} onChange={e => setEdit({...edit, status: e.target.value})}
                  className="w-full bg-navy-900 border border-navy-600 rounded-lg px-3 py-2 mt-1">
                  <option value="active">active</option><option value="locked">locked</option><option value="disabled">disabled</option>
                </select>
              </div>
              <div className="flex items-start gap-2 bg-navy-900/60 border border-navy-700 rounded-lg p-3">
                <input type="checkbox" id="wd-unlock" checked={!!edit.withdrawUnlocked}
                  onChange={e => setEdit({ ...edit, withdrawUnlocked: e.target.checked })}
                  className="mt-0.5 accent-gold-500" />
                <label htmlFor="wd-unlock" className="text-xs text-navy-200 leading-relaxed">
                  💸 <b>อนุญาตให้ถอนเครดิต</b> — ถอนได้เต็มยอดคงเหลือ แต่ระบบจะ<b>หักเครดิตแถม 50 บาท ออก</b> และต้องเหลืออย่างน้อย 50 บาท จึงจะถอนได้
                </label>
              </div>
              {(edit.selfExcludedUntil || edit.dailyLimitSatang || edit.monthlyLimitSatang || !edit.ageConfirmed) && (
                <div className="bg-navy-900/60 border border-navy-700 rounded-lg p-3 text-xs space-y-1">
                  <div className="text-navy-300 font-semibold mb-1">สถานะ Responsible Gambling</div>
                  {!edit.ageConfirmed && <div className="text-red-300">❗ ยังไม่ยืนยันอายุ 18+</div>}
                  {edit.selfExcludedUntil && <div className="text-red-300">⛔ ระงับการแทง{edit.selfExcludedUntil === 'permanent' ? 'ถาวร' : `ถึง ${edit.selfExcludedUntil}`}</div>}
                  {(edit.dailyLimitSatang || edit.monthlyLimitSatang) && (
                    <div className="text-amber-300">⚠️ วงเงิน: วัน {satang(edit.dailyLimitSatang || 0)} บาท • เดือน {satang(edit.monthlyLimitSatang || 0)} บาท</div>
                  )}
                </div>
              )}
              <div>
                <label className="text-xs text-navy-300">รีเซ็ตรหัสผ่านใหม่ (เว้นว่างถ้าไม่เปลี่ยน)</label>
                <input type="password" value={edit.password || ''} onChange={e => setEdit({...edit, password: e.target.value})} placeholder="อย่างน้อย 8 ตัว"
                  className="w-full bg-navy-900 border border-navy-600 rounded-lg px-3 py-2 mt-1" />
              </div>
              <div className="flex gap-2 pt-2">
                <button onClick={save} className="flex-1 bg-gold-500 text-navy-950 font-bold py-2.5 rounded-lg">บันทึก</button>
                <button onClick={() => setEdit(null)} className="px-5 py-2.5 border border-navy-600 rounded-lg">ยกเลิก</button>
              </div>
            </div>
          </div>
        </div>
      )}
      {del && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={() => setDel(null)}>
          <div className="bg-navy-800 border border-navy-600 rounded-2xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-white mb-2">ลบสมาชิก?</h2>
            <p className="text-sm text-navy-300 mb-1">ต้องการลบบัญชี <span className="text-white font-semibold">{del.username}</span> ใช่หรือไม่</p>
            <p className="text-xs text-navy-400 mb-4">กระเป๋า เครดิต และเซสชันทั้งหมดจะถูกลบถาวร (ลบไม่ได้ถ้ามีประวัติโพย)</p>
            <div className="flex gap-2">
              <button onClick={remove} className="flex-1 bg-red-500 text-white font-bold py-2.5 rounded-lg">ลบสมาชิก</button>
              <button onClick={() => setDel(null)} className="px-5 py-2.5 border border-navy-600 rounded-lg">ยกเลิก</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
