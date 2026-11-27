import { useEffect, useRef, useState } from 'react';
import { api, satang, fmtDateTime } from '../api.js';
import { confirmAction } from './confirm.jsx';
import { toast } from '../components/toast.js';
import { Modal } from '../components/ui/index.js';
import { cn } from '../lib/utils.js';
import '../styles/luxury-theme.css';
import { useUrlFilters, TablePager } from './useUrlFilters.jsx';

export default function AdminMembers() {
  const [filtered, setFiltered] = useState([]);
  const [totalRows, setTotalRows] = useState(0); // total จาก API — ใช้แจ้งเตือนเมื่อโดน cap
  const [page, setPage] = useState(1);
  // filter sync กับ URL query (?q=) — URL เก็บเฉพาะคำค้นที่ apply แล้ว (debounce/Enter) ไม่ใช่ตัวอักษรที่กำลังพิมพ์
  const [filters, setFilters] = useUrlFilters({ q: '' });
  const appliedQ = filters.q;
  const [q, setQ] = useState(appliedQ); // draft ขณะพิมพ์ — commit ลง URL หลัง debounce
  const debounceRef = useRef(null);
  const [edit, setEdit] = useState(null);
  const [del, setDel] = useState(null);
  const [act, setAct] = useState(null);
  const [rgList, setRgList] = useState(null);

  const FETCH_LIMIT = 500;    // server cap ต่อ request
  const MAX_MEMBER_ROWS = 5000; // safety cap — กัน dataset ใหญ่เกิน
  const PAGE_SIZE = 50;

  // ดึงสมาชิกทั้งหมดที่ตรง q (วน offset ทีละ FETCH_LIMIT) แล้ว paginate ฝั่ง client
  // query = คำค้นที่จะใช้ (default = appliedQ จาก URL) — ส่งตรงๆ ได้เพื่อเลี่ยง stale closure ตอน apply
  const load = async (resetPage = false, query = appliedQ) => {
    try {
      const all = [];
      let offset = 0, total = 0;
      for (;;) {
        const r = await api(`/admin/members?q=${encodeURIComponent(query)}&limit=${FETCH_LIMIT}&offset=${offset}`);
        const list = Array.isArray(r?.members) ? r.members : [];
        total = Number(r?.total) || 0;
        all.push(...list);
        offset += list.length;
        if (!list.length || list.length < FETCH_LIMIT || all.length >= total || all.length >= MAX_MEMBER_ROWS) break;
      }
      setFiltered(all);
      setTotalRows(total);
      if (resetPage) setPage(1);
    } catch (e) { toast(e.message, 'error'); }
  };
  const loadRg = () => api('/admin/rg/restricted').then(r => setRgList(r.restricted || [])).catch(() => {});
  useEffect(() => { load(); loadRg(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // apply คำค้น — commit draft ลง URL + โหลดใหม่ (ใช้ทั้ง debounce และ Enter)
  // force=true (Enter) → reload เสมอเหมือนเดิม; debounce → ข้ามถ้าค่าไม่เปลี่ยน (กัน refetch ตอน mount)
  const applySearch = (value, force = false) => {
    clearTimeout(debounceRef.current);
    const v = String(value ?? q).trim();
    if (v === appliedQ && !force) return;
    setFilters({ q: v });
    load(true, v);
  };

  // sync draft กลับมาเมื่อ URL เปลี่ยนจากที่อื่น (back/forward/share link)
  useEffect(() => { setQ(appliedQ); }, [appliedQ]);

  // ค้นหาแบบ debounce 400ms — commit ลง URL + apply ผลลัพธ์ (pattern เดียวกับ Bets.jsx)
  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => applySearch(), 400);
    return () => clearTimeout(debounceRef.current);
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    if (!(await confirmAction({ title: 'ยืนยันการแก้ไขสมาชิก', message: `บันทึกการเปลี่ยนแปลงของ ${edit.username} ใช่หรือไม่?` }))) return;
    const body = { status: edit.status, displayName: edit.displayName, withdrawUnlocked: !!edit.withdrawUnlocked };
    if (edit.password) body.password = edit.password;
    try {
      await api(`/admin/members/${edit.id}`, { method: 'PATCH', body });
      setEdit(null); load();
      toast('บันทึกข้อมูลสมาชิกแล้ว', 'success');
    } catch (e) { toast(e.message, 'error'); }
  };

  const remove = async () => {
    try {
      const r = await api(`/admin/members/${del.id}`, { method: 'DELETE' });
      if (r.pendingApproval) toast(`📨 ส่งคำขอลบบัญชี ${del.username} เข้าศูนย์อนุมัติแล้ว`, 'info');
      else toast('ลบบัญชีสมาชิกแล้ว', 'success');
      setDel(null); load();
    } catch (e) { toast(e.message, 'error'); setDel(null); }
  };

  // client-side pagination — filtered = ข้อมูลทั้งหมดที่ตรง filter (สำหรับ export), paged = เฉพาะหน้าที่แสดง
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const curPage = Math.min(page, pageCount);
  const paged = filtered.slice((curPage - 1) * PAGE_SIZE, curPage * PAGE_SIZE);

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
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold luxury-gradient-text">จัดการสมาชิก</h1>
          <p className="text-sm text-[var(--muted-gray)] mt-1">จัดการข้อมูลและสิทธิ์ของสมาชิกทั้งหมด</p>
        </div>
        <input 
          value={q} 
          onChange={e => setQ(e.target.value)} 
          onKeyDown={e => e.key === 'Enter' && applySearch(undefined, true)}
          placeholder="ค้นหา username/email..." 
          className="luxury-input w-64 py-2.5 text-sm" 
        />
      </div>

      {rgList?.length > 0 && (
        <div className="luxury-card p-4">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold text-[var(--warning-amber)]">⛔ Responsible Gaming — สมาชิกที่มีข้อจำกัด ({rgList.length})</span>
            {rgList.slice(0, 12).map(m => (
              <button key={m.id} onClick={() => loadActivity(m)}
                className="text-[10px] px-2 py-0.5 rounded border border-[var(--warning-amber)]/40 bg-[var(--warning-amber)]/10 text-[var(--warning-amber)] hover:bg-[var(--warning-amber)]/20 transition"
                title={m.self_excluded_until ? `ระงับ${m.self_excluded_until === 'permanent' ? 'ถาวร' : `ถึง ${m.self_excluded_until}`} • stake 24h: ${satang(m.staked_24h)}฿` : `จำกัดวงเงิน`}>
                {m.username}{m.self_excluded_until ? ' ⛔' : ''}
              </button>
            ))}
            {rgList.length > 12 && <span className="text-[10px] text-[var(--muted-gray)]">+{rgList.length - 12} คน</span>}
          </div>
        </div>
      )}

      <div className="luxury-card overflow-hidden">
        {/* mobile cards (< lg) — แสดงเฉพาะฟิลด์สำคัญ + actions ครบเหมือนตาราง */}
        <div className="lg:hidden divide-y divide-[var(--border-light)]">
          {paged.map(m => (
            <div key={m.id} className="p-4 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-[var(--white)] font-semibold">{m.username}</div>
                  <div className="text-xs text-[var(--muted-gray)]">{m.displayName || '—'} • ID {m.id}</div>
                </div>
                <span className={cn('luxury-badge text-[10px] font-semibold',
                  m.status === 'active' ? 'luxury-badge-success' : 'luxury-badge-danger')}>
                  {m.status}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                <div className="text-[var(--muted-gray)]">เครดิต: <span className="text-[var(--gold-primary)] font-bold">{satang(m.balance)} บาท</span></div>
                <div className="text-[var(--muted-gray)]">บทบาท: <span className="text-[var(--gold-primary)]">{m.roles.join(', ')}</span></div>
                <div className="text-[var(--muted-gray)]">อีเมล: <span className="text-[var(--white)]">{m.email || '—'}</span></div>
                <div className="text-[var(--muted-gray)]">MFA: {m.mfaEnabled ? '✅' : '—'}{m.withdrawUnlocked ? ' 💸' : ''}</div>
                <div className="text-[var(--muted-gray)]">18+/RG: {m.selfExcludedUntil
                  ? <span className="text-[var(--danger-red)] font-bold">{m.selfExcludedUntil === 'permanent' ? '⛔ถาวร' : `⛔ถึง ${m.selfExcludedUntil}`}</span>
                  : (m.dailyLimitSatang || m.monthlyLimitSatang)
                    ? <span className="text-[var(--warning-amber)]">⚠️จำกัด</span>
                    : '—'}{!m.ageConfirmed && <span className="text-[var(--danger-red)] ml-1" title="ยังไม่ยืนยันอายุ 18+">❗</span>}</div>
              </div>
              <div className="flex gap-4 pt-1">
                <button onClick={() => loadActivity(m)} className="text-[var(--info-blue)] text-xs hover:underline transition">กิจกรรม</button>
                <button onClick={() => setEdit({ ...m })} className="text-[var(--gold-primary)] text-xs hover:underline transition">แก้ไข</button>
                <button onClick={() => setDel(m)} className="text-[var(--danger-red)] text-xs hover:underline transition">ลบ</button>
              </div>
            </div>
          ))}
          {paged.length === 0 && (
            <div className="px-4 py-6 text-center text-xs text-[var(--muted-gray)]">ไม่มีข้อมูลสมาชิก</div>
          )}
        </div>
        <div className="hidden lg:block overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[var(--border-light)]">
                <th className="text-left text-xs font-semibold text-[var(--muted-gray)] px-4 py-3">ID</th>
                <th className="text-left text-xs font-semibold text-[var(--muted-gray)] px-4 py-3">ผู้ใช้</th>
                <th className="text-left text-xs font-semibold text-[var(--muted-gray)] px-4 py-3">อีเมล</th>
                <th className="text-left text-xs font-semibold text-[var(--muted-gray)] px-4 py-3">บทบาท</th>
                <th className="text-right text-xs font-semibold text-[var(--muted-gray)] px-4 py-3">เครดิต</th>
                <th className="text-left text-xs font-semibold text-[var(--muted-gray)] px-4 py-3">สถานะ</th>
                <th className="text-left text-xs font-semibold text-[var(--muted-gray)] px-4 py-3">MFA</th>
                <th className="text-left text-xs font-semibold text-[var(--muted-gray)] px-4 py-3">18+/RG</th>
                <th className="text-right text-xs font-semibold text-[var(--muted-gray)] px-4 py-3 sticky right-0 bg-[var(--bg-card)] z-10"></th>
              </tr>
            </thead>
            <tbody>
              {paged.map(m => (
                <tr key={m.id} className="border-b border-[var(--border-light)] hover:bg-[var(--bg-card-hover)] transition">
                  <td className="text-[var(--muted-gray)] px-4 py-3 text-sm">{m.id}</td>
                  <td className="px-4 py-3">
                    <div className="text-[var(--white)] font-semibold">{m.username}</div>
                    <div className="text-xs text-[var(--muted-gray)]">{m.displayName}</div>
                  </td>
                  <td className="text-[var(--muted-gray)] px-4 py-3 text-sm">{m.email}</td>
                  <td className="text-xs text-[var(--gold-primary)] px-4 py-3">{m.roles.join(', ')}</td>
                  <td className="text-right text-[var(--gold-primary)] font-bold px-4 py-3">{satang(m.balance)} บาท</td>
                  <td className="px-4 py-3">
                    <span className={cn('luxury-badge text-[10px] font-semibold',
                      m.status === 'active' ? 'luxury-badge-success' : 'luxury-badge-danger')}>
                      {m.status}
                    </span>
                  </td>
                  <td className="text-xs px-4 py-3">{m.mfaEnabled ? '✅' : '—'}{m.withdrawUnlocked ? ' 💸' : ''}</td>
                  <td className="text-xs whitespace-nowrap px-4 py-3">
                    {m.selfExcludedUntil ? <span className="text-[var(--danger-red)] font-bold" title={m.selfExcludedUntil === 'permanent' ? 'ระงับถาวร' : `ระงับถึง ${m.selfExcludedUntil}`}>⛔{m.selfExcludedUntil === 'permanent' ? 'ถาวร' : ''}</span>
                      : m.dailyLimitSatang || m.monthlyLimitSatang
                        ? <span className="text-[var(--warning-amber)]" title={`วัน ${satang(m.dailyLimitSatang || 0)} บาท / เดือน ${satang(m.monthlyLimitSatang || 0)} บาท`}>⚠️จำกัด</span>
                        : <span className="text-[var(--muted-gray)]">—</span>}
                    {!m.ageConfirmed && <span className="text-[var(--danger-red)] ml-1" title="ยังไม่ยืนยันอายุ 18+">❗</span>}
                  </td>
                  <td className="whitespace-nowrap sticky right-0 bg-[var(--bg-card)] hover:bg-[var(--bg-card-hover)] z-10 px-4 py-3">
                    <button onClick={() => loadActivity(m)} className="text-[var(--info-blue)] text-xs hover:underline mr-3 transition">กิจกรรม</button>
                    <button onClick={() => setEdit({ ...m })} className="text-[var(--gold-primary)] text-xs hover:underline mr-3 transition">แก้ไข</button>
                    <button onClick={() => setDel(m)} className="text-[var(--danger-red)] text-xs hover:underline transition">ลบ</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length > 0 && filtered.length < totalRows && (
          <div className="px-4 pb-2 [color:var(--muted-gray)] [font-size:12px]">
            ทั้งหมด {totalRows.toLocaleString()} สมาชิก — โหลด {filtered.length.toLocaleString()} รายการแรก (ค้นหาเพิ่มเพื่อลดผลลัพธ์)
          </div>
        )}
        <TablePager page={curPage} pageCount={pageCount} total={filtered.length} pageSize={PAGE_SIZE} onPage={setPage} className="px-4 py-3 [border-top:1px_solid_var(--border-light)]" />
      </div>

      {/* modal แก้ไขสมาชิก */}
      <Modal open={!!edit} onClose={() => setEdit(null)} title={`แก้ไขสมาชิก: ${edit?.username || ''}`}>
        <div className="space-y-4">
          <div>
            <label className="text-xs text-[var(--muted-gray)] mb-1 block">ชื่อที่แสดง</label>
            <input 
              value={edit?.displayName || ''} 
              onChange={e => setEdit({ ...edit, displayName: e.target.value })}
              className="luxury-input w-full py-2.5" 
            />
          </div>
          <div>
            <label className="text-xs text-[var(--muted-gray)] mb-1 block">สถานะ</label>
            <select 
              value={edit?.status} 
              onChange={e => setEdit({ ...edit, status: e.target.value })}
              className="luxury-input w-full py-2.5"
            >
              <option value="active">active</option>
              <option value="locked">locked</option>
              <option value="disabled">disabled</option>
            </select>
          </div>
          <div className="flex items-start gap-3 bg-[var(--bg-dark-surface)] border border-[var(--border-light)] rounded-lg p-3">
            <input type="checkbox" id="wd-unlock" checked={!!edit?.withdrawUnlocked}
              onChange={e => setEdit({ ...edit, withdrawUnlocked: e.target.checked })}
              className="mt-0.5 accent-[var(--gold-primary)]" />
            <label htmlFor="wd-unlock" className="text-xs text-[var(--muted-gray)] leading-relaxed">
              💸 <b className="text-[var(--white)]">อนุญาตให้ถอนเครดิต</b> — ถอนได้เต็มยอดคงเหลือ แต่ระบบจะ<b>หักเครดิตแถม 50 บาท ออก</b> และต้องเหลืออย่างน้อย 50 บาท จึงจะถอนได้
            </label>
          </div>
          {edit && (edit.selfExcludedUntil || edit.dailyLimitSatang || edit.monthlyLimitSatang || !edit.ageConfirmed) && (
            <div className="bg-[var(--bg-dark-surface)] border border-[var(--border-light)] rounded-lg p-3 text-xs space-y-1">
              <div className="text-[var(--muted-gray)] font-semibold mb-1">สถานะ Responsible Gambling</div>
              {!edit.ageConfirmed && <div className="text-[var(--danger-red)]">❗ ยังไม่ยืนยันอายุ 18+</div>}
              {edit.selfExcludedUntil && <div className="text-[var(--danger-red)]">⛔ ระงับการแทง{edit.selfExcludedUntil === 'permanent' ? 'ถาวร' : `ถึง ${edit.selfExcludedUntil}`}</div>}
              {(edit.dailyLimitSatang || edit.monthlyLimitSatang) && (
                <div className="text-[var(--warning-amber)]">⚠️ วงเงิน: วัน {satang(edit.dailyLimitSatang || 0)} บาท • เดือน {satang(edit.monthlyLimitSatang || 0)} บาท</div>
              )}
            </div>
          )}
          <div>
            <label className="text-xs text-[var(--muted-gray)] mb-1 block">รีเซ็ตรหัสผ่านใหม่ (เว้นว่างถ้าไม่เปลี่ยน)</label>
            <input 
              type="password" 
              value={edit?.password || ''}
              onChange={e => setEdit({ ...edit, password: e.target.value })} 
              placeholder="อย่างน้อย 10 ตัว" 
              className="luxury-input w-full py-2.5" 
            />
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={save} className="luxury-btn flex-1">บันทึก</button>
            <button onClick={() => setEdit(null)} className="luxury-btn-ghost flex-1">ยกเลิก</button>
          </div>
        </div>
      </Modal>

      {/* modal ยืนยันลบสมาชิก */}
      <Modal open={!!del} onClose={() => setDel(null)} title="ลบสมาชิก?">
        <p className="text-sm text-[var(--muted-gray)] mb-1">ต้องการลบบัญชี <span className="text-[var(--white)] font-semibold">{del?.username}</span> ใช่หรือไม่</p>
        <p className="text-xs text-[var(--muted-gray)] mb-4">กระเป๋า เครดิต และเซสชันทั้งหมดจะถูกลบถาวร (ลบไม่ได้ถ้ามีประวัติโพย)</p>
        <div className="flex gap-3">
          <button onClick={remove} className="luxury-badge-danger px-4 py-2 rounded-lg border flex-1">ลบสมาชิก</button>
          <button onClick={() => setDel(null)} className="luxury-btn-ghost flex-1">ยกเลิก</button>
        </div>
      </Modal>

      {/* modal member 360 */}
      <Modal open={!!act} onClose={() => setAct(null)} title={`กิจกรรม: ${act?.user?.username || ''}`}>
        {act && (
          <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <div className="luxury-card p-3">
                <div className="text-[var(--muted-gray)]">เครดิต</div>
                <div className="text-[var(--gold-primary)] font-bold text-lg">{satang(act.user.balance)} ฿</div>
              </div>
              <div className="luxury-card p-3">
                <div className="text-[var(--muted-gray)]">สถานะ</div>
                <div className="text-[var(--white)]">{act.user.status}</div>
              </div>
              <div className="luxury-card p-3">
                <div className="text-[var(--muted-gray)]">โพยทั้งหมด</div>
                <div className="text-[var(--white)]">{act.betStats.count} ({satang(act.betStats.totalStaked)} ฿)</div>
              </div>
              <div className="luxury-card p-3">
                <div className="text-[var(--muted-gray)]">ฝาก/ถอน</div>
                <div className="text-[var(--white)]">{satang(act.financials?.deposit || 0)} / {satang(act.financials?.withdraw || 0)} ฿</div>
              </div>
            </div>

            {act.riskFlags?.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {act.riskFlags.map(f => (
                  <span key={f.code} className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                    f.severity === 'high' ? 'bg-[var(--danger-red)]/15 text-[var(--danger-red)] border-[var(--danger-red)]/40' :
                    f.severity === 'medium' ? 'bg-[var(--warning-amber)]/15 text-[var(--warning-amber)] border-[var(--warning-amber)]/40' :
                    'bg-[var(--info-blue)]/15 text-[var(--info-blue)] border-[var(--info-blue)]/40'}`}>{f.label}</span>
                ))}
              </div>
            )}

            {/* KYC review */}
            <div className="luxury-card p-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="text-xs">
                  <span className="font-bold text-[var(--muted-gray)]">KYC:</span>{' '}
                  <span className={act.user.kyc_status === 'verified' ? 'text-[var(--success-green)]' : act.user.kyc_status === 'rejected' ? 'text-[var(--danger-red)]' : act.user.kyc_status === 'pending' ? 'text-[var(--warning-amber)]' : 'text-[var(--muted-gray)]'}>
                    {{ none: 'ยังไม่สมัคร', pending: 'รอตรวจ', verified: 'ยืนยันแล้ว', rejected: 'ถูกปฏิเสธ' }[act.user.kyc_status || 'none']}
                  </span>
                  {act.user.kyc_requested_at && <span className="text-[var(--muted-gray)]"> • ส่ง {act.user.kyc_requested_at}</span>}
                  {act.user.kyc_note && <div className="text-[10px] text-[var(--muted-gray)] mt-0.5">note: {act.user.kyc_note}</div>}
                </div>
                {act.user.kyc_status === 'pending' && (
                  <div className="flex gap-1.5">
                    <button onClick={() => kycReview(act.user.id, 'verify')} className="luxury-badge-success px-3 py-1.5 rounded text-[10px]">✓ ยืนยัน</button>
                    <button onClick={() => kycReview(act.user.id, 'reject')} className="luxury-badge-danger px-3 py-1.5 rounded text-[10px]">✗ ปฏิเสธ</button>
                  </div>
                )}
              </div>
            </div>

            <Section title={`ประวัติการเข้าสู่ระบบ (${act.authEvents.length})`}>
              {act.authEvents.length === 0 && <Empty />}
              {act.authEvents.slice(0, 10).map((e, i) => (
                <Row key={i} left={`${e.event} • ${e.ip || '—'}`} right={fmtDateTime(e.created_at)} sub={e.user_agent?.slice(0, 60)} />
              ))}
            </Section>

            <Section title={`Session ที่ใช้งานอยู่ (${act.sessions.length})`}>
              {act.sessions.length === 0 && <Empty />}
              {act.sessions.slice(0, 10).map(s => (
                <Row key={s.id} left={`${s.ip || '—'} • MFA ${s.mfa_verified ? '✓' : '✗'}`} right={`หมด ${fmtDateTime(s.expires_at)}`} sub={s.user_agent?.slice(0, 60)} />
              ))}
            </Section>

            <Section title="การชำระเงินล่าสุด" cols={[['ref', 'reference'], ['ประเภท', 'kind'], ['ยอด', 'amount'], ['สถานะ', 'status'], ['เวลา', 'created_at']]} rows={act.payments.slice(0, 10).map(p => ({ ...p, amount: satang(p.amount) + ' ฿' }))} />
            <Section title="กระเป๋าเครดิตล่าสุด" cols={[['ref', 'reference'], ['ประเภท', 'type'], ['ทิศ', 'direction'], ['ยอด', 'amount'], ['หลังทำ', 'balance_after'], ['เวลา', 'created_at']]} rows={act.walletTx.slice(0, 10).map(t => ({ ...t, amount: satang(t.amount), balance_after: satang(t.balance_after) }))} />
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
      <div className="text-xs font-bold text-[var(--muted-gray)] mb-2">{title}</div>
      <div className="luxury-card overflow-hidden">
        {cols ? (
          <table className="w-full text-[10px]">
            <thead><tr className="text-[var(--muted-gray)] text-left">
              {cols.map(c => <th key={c[1]} className="px-3 py-2 font-semibold">{c[0]}</th>)}
            </tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={cols.length} className="px-3 py-3 text-[var(--muted-gray)] text-center">ไม่มีข้อมูล</td></tr>}
              {rows.map((r, i) => (
                <tr key={i} className="border-t border-[var(--border-light)]">
                  {cols.map(c => <td key={c[1]} className="px-3 py-2 text-[var(--white)] whitespace-nowrap">{c[1] === 'created_at' || c[1] === 'reviewed_at' ? fmtDateTime(r[c[1]]) : (r[c[1]] ?? '—')}</td>)}
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
    <div className="px-3 py-2 border-t border-[var(--border-light)] first:border-0">
      <div className="flex justify-between gap-2 text-[11px] text-[var(--white)]"><span>{left}</span><span className="text-[var(--muted-gray)] whitespace-nowrap">{right}</span></div>
      {sub && <div className="text-[9px] text-[var(--muted-gray)] truncate">{sub}</div>}
    </div>
  );
}

function Empty() { return <div className="px-3 py-3 text-[var(--muted-gray)] text-[11px] text-center">ไม่มีข้อมูล</div>; }
