import { useEffect, useState } from 'react';
import { api, satang, fmtDateTime } from '../api.js';
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
  const [act, setAct] = useState(null); // member 360 activity
  const [rgList, setRgList] = useState(null); // responsible-gaming restricted members

  const load = () => api(`/admin/members?q=${encodeURIComponent(q)}`).then(r => setMembers(r.members)).catch(e => toast(e.message, 'error'));
  const loadRg = () => api('/admin/rg/restricted').then(r => setRgList(r.restricted || [])).catch(() => {});
  useEffect(() => { load(); loadRg(); }, []);

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
      const r = await api(`/admin/members/${del.id}`, { method: 'DELETE' });
      if (r.pendingApproval) toast(`📨 ส่งคำขอลบบัญชี ${del.username} เข้าศูนย์อนุมัติแล้ว`, 'info');
      setDel(null); load();
    } catch (e) { toast(e.message, 'error'); setDel(null); }
  };

  const loadActivity = (m) => api(`/admin/members/${m.id}/activity`)
    .then(setAct).catch(e => toast(e.message, 'error'));

  const kycReview = async (userId, action) => {
    const note = action === 'reject' ? prompt('เหตุผลการปฏิเสธ KYC (จำเป็น):') : '';
    if (action === 'reject' && (!note || note.trim().length < 3)) { if (note !== null) toast('ต้องระบุเหตุผล', 'error'); return; }
    if (note === null) return;
    try {
      await api(`/admin/kyc/${userId}/review`, { method: 'POST', body: { action, note: note || undefined } });
      toast(action === 'verify' ? 'ยืนยัน KYC แล้ว' : 'ปฏิเสธ KYC แล้ว', 'success');
      loadActivity({ id: userId }); load();
    } catch (e) { toast(e.message, 'error'); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold text-white">จัดการสมาชิก</h1>
        <Input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && load()}
          placeholder="ค้นหา username/email..." inputClassName="w-64 py-2 text-sm" />
      </div>
      {rgList?.length > 0 && (
        <Card>
          <div className="p-3 flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold text-amber-300">⛔ Responsible Gaming — สมาชิกที่มีข้อจำกัด ({rgList.length})</span>
            {rgList.slice(0, 12).map(m => (
              <button key={m.id} onClick={() => loadActivity(m)}
                className="text-[10px] px-2 py-0.5 rounded border border-amber-500/40 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20"
                title={m.self_excluded_until ? `ระงับ${m.self_excluded_until === 'permanent' ? 'ถาวร' : `ถึง ${m.self_excluded_until}`} • stake 24h: ${satang(m.staked_24h)}฿` : `จำกัดวงเงิน`}>
                {m.username}{m.self_excluded_until ? ' ⛔' : ''}
              </button>
            ))}
            {rgList.length > 12 && <span className="text-[10px] text-navy-400">+{rgList.length - 12} คน</span>}
          </div>
        </Card>
      )}

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
                  <button onClick={() => loadActivity(m)} className="text-sky-300 text-xs hover:underline mr-3">กิจกรรม</button>
                  <button onClick={() => setEdit({ ...m })} className="text-gold-300 text-xs hover:underline mr-3">แก้ไข</button>
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
            onChange={e => setEdit({ ...edit, password: e.target.value })} placeholder="อย่างน้อย 10 ตัว" inputClassName="py-2" />
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

      {/* modal member 360 — login history / sessions / payments / bets / wallet / audit */}
      <Modal open={!!act} onClose={() => setAct(null)} title={`กิจกรรม: ${act?.user?.username || ''}`}>
        {act && (
          <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
              <div className="bg-navy-900/60 rounded p-2"><div className="text-navy-400">เครดิต</div><div className="text-gold-300 font-bold">{satang(act.user.balance)} ฿</div></div>
              <div className="bg-navy-900/60 rounded p-2"><div className="text-navy-400">สถานะ</div><div className="text-white">{act.user.status}</div></div>
              <div className="bg-navy-900/60 rounded p-2"><div className="text-navy-400">โพยทั้งหมด</div><div className="text-white">{act.betStats.count} ({satang(act.betStats.totalStaked)} ฿)</div></div>
              <div className="bg-navy-900/60 rounded p-2"><div className="text-navy-400">ฝาก/ถอน</div><div className="text-white">{satang(act.financials?.deposit || 0)} / {satang(act.financials?.withdraw || 0)} ฿</div></div>
            </div>

            {act.riskFlags?.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {act.riskFlags.map(f => (
                  <span key={f.code} className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                    f.severity === 'high' ? 'bg-red-500/15 text-red-300 border-red-500/40' :
                    f.severity === 'medium' ? 'bg-amber-500/15 text-amber-300 border-amber-500/40' :
                    'bg-sky-500/15 text-sky-300 border-sky-500/40'}`}>{f.label}</span>
                ))}
              </div>
            )}

            {/* KYC review */}
            <div className="bg-navy-900/60 border border-navy-700/60 rounded-lg p-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="text-xs">
                  <span className="font-bold text-navy-300">KYC:</span>{' '}
                  <span className={act.user.kyc_status === 'verified' ? 'text-emerald-300' : act.user.kyc_status === 'rejected' ? 'text-red-300' : act.user.kyc_status === 'pending' ? 'text-amber-300' : 'text-navy-300'}>
                    {{ none: 'ยังไม่สมัคร', pending: 'รอตรวจ', verified: 'ยืนยันแล้ว', rejected: 'ถูกปฏิเสธ' }[act.user.kyc_status || 'none']}
                  </span>
                  {act.user.kyc_requested_at && <span className="text-navy-400"> • ส่ง {act.user.kyc_requested_at}</span>}
                  {act.user.kyc_note && <div className="text-[10px] text-navy-400 mt-0.5">note: {act.user.kyc_note}</div>}
                </div>
                {act.user.kyc_status === 'pending' && (
                  <div className="flex gap-1.5">
                    <Button size="sm" className="text-[10px] bg-emerald-600 hover:bg-emerald-500" onClick={() => kycReview(act.user.id, 'verify')}>✓ ยืนยัน</Button>
                    <Button size="sm" variant="ghost" className="text-[10px] text-red-300" onClick={() => kycReview(act.user.id, 'reject')}>✗ ปฏิเสธ</Button>
                  </div>
                )}
              </div>
            </div>

            <Section title={`ประวัติการเข้าสู่ระบบ (${act.authEvents.length})`}>
              {act.authEvents.length === 0 && <Empty />}
              {act.authEvents.map((e, i) => (
                <Row key={i} left={`${e.event} • ${e.ip || '—'}`} right={fmtDateTime(e.created_at)} sub={e.user_agent?.slice(0, 60)} />
              ))}
            </Section>

            <Section title={`Session ที่ใช้งานอยู่ (${act.sessions.length})`}>
              {act.sessions.length === 0 && <Empty />}
              {act.sessions.map(s => (
                <Row key={s.id} left={`${s.ip || '—'} • MFA ${s.mfa_verified ? '✓' : '✗'}`} right={`หมด ${fmtDateTime(s.expires_at)}`} sub={s.user_agent?.slice(0, 60)} />
              ))}
            </Section>

            <Section title="การชำระเงินล่าสุด" cols={[['ref', 'reference'], ['ประเภท', 'kind'], ['ยอด', 'amount'], ['สถานะ', 'status'], ['เวลา', 'created_at']]} rows={act.payments.map(p => ({ ...p, amount: satang(p.amount) + ' ฿' }))} />
            <Section title="กระเป๋าเครดิตล่าสุด" cols={[['ref', 'reference'], ['ประเภท', 'type'], ['ทิศ', 'direction'], ['ยอด', 'amount'], ['หลังทำ', 'balance_after'], ['เวลา', 'created_at']]} rows={act.walletTx.map(t => ({ ...t, amount: satang(t.amount), balance_after: satang(t.balance_after) }))} />
            <Section title="โพยล่าสุด" cols={[['id', 'id'], ['draw', 'draw_id'], ['สถานะ', 'status'], ['ยอดรวม', 'total_stake'], ['รางวัล', 'total_payout'], ['เวลา', 'created_at']]} rows={act.recentBets.map(b => ({ ...b, total_stake: satang(b.total_stake), total_payout: satang(b.total_payout || 0) }))} />
            <Section title="Audit ที่เกี่ยวข้อง" cols={[['action', 'action'], ['entity', 'entity_type'], ['id', 'entity_id'], ['เวลา', 'created_at']]} rows={act.auditRows} />
          </div>
        )}
      </Modal>
    </div>
  );
}

function Section({ title, children, cols, rows }) {
  return (
    <div>
      <div className="text-xs font-bold text-navy-300 mb-1">{title}</div>
      <div className="bg-navy-900/50 border border-navy-700/60 rounded-lg overflow-hidden">
        {cols ? (
          <table className="w-full text-[10px]">
            <thead><tr className="text-navy-400 text-left">
              {cols.map(c => <th key={c[1]} className="px-2 py-1">{c[0]}</th>)}
            </tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={cols.length} className="px-2 py-2 text-navy-500 text-center">ไม่มีข้อมูล</td></tr>}
              {rows.map((r, i) => (
                <tr key={i} className="border-t border-navy-800/60">
                  {cols.map(c => <td key={c[1]} className="px-2 py-1 text-navy-200 whitespace-nowrap">{c[1] === 'created_at' || c[1] === 'reviewed_at' ? fmtDateTime(r[c[1]]) : (r[c[1]] ?? '—')}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        ) : children}
      </div>
    </div>
  );
}

function Row({ left, right, sub }) {
  return (
    <div className="px-2 py-1.5 border-t border-navy-800/60 first:border-0">
      <div className="flex justify-between gap-2 text-[11px] text-navy-200"><span>{left}</span><span className="text-navy-400 whitespace-nowrap">{right}</span></div>
      {sub && <div className="text-[9px] text-navy-500 truncate">{sub}</div>}
    </div>
  );
}

function Empty() { return <div className="px-2 py-2 text-navy-500 text-[11px] text-center">ไม่มีข้อมูล</div>; }
