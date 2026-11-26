import { useEffect, useState } from 'react';
import { api, fmtDateTime, satang } from '../api.js';
import { confirmAction } from './confirm.jsx';
import { toast } from '../components/toast.js';
import { annSummary, annToInput, parseAnnInput } from '../ann.js';
import { Button, Card, CardHeader, CardBody, Input, Select, Modal, Badge } from '../components/ui/index.js';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/shadcn/table.jsx';
import { Badge as SBadge } from '../components/shadcn/badge.jsx';
import { cn } from '../lib/utils.js';
import { useUrlFilters, TablePager } from './useUrlFilters.jsx';
import { AdminLoading, AdminError } from '../components/AdminStates.jsx';

const STATUS_BADGE = {
  open: 'luxury-badge-success',
  settled: 'luxury-badge-gold',
  closed: 'luxury-badge',
  scheduled: 'luxury-badge-info',
  cancelled: 'luxury-badge-danger',
};

const STATUS_TH = { scheduled: 'กำหนดการ', open: 'เปิดรับ', closed: 'ปิดรับ', settled: 'ออกผลแล้ว', cancelled: 'ยกเลิก' };

// DB เก็บเวลาเป็น UTC — แปลงเป็นค่า datetime-local (เวลา local ของ admin)
const utcToLocalInput = (s) => {
  if (!s) return '';
  const d = new Date(String(s).replace(' ', 'T') + 'Z');
  if (isNaN(d)) return '';
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

export default function AdminDraws() {
  const [filtered, setFiltered] = useState([]);
  const [page, setPage] = useState(1);
  const [types, setTypes] = useState([]);
  const [cats, setCats] = useState([]);
  const [form, setForm] = useState({ lottery_type_id: '', category_id: '', draw_code: '', draw_at: '', close_at: '' });
  const [showForm, setShowForm] = useState(false);
  const [editDraw, setEditDraw] = useState(null);
  const [schedule, setSchedule] = useState(null);
  const [seedMsg, setSeedMsg] = useState('');
  const [seedBusy, setSeedBusy] = useState(false);
  const [drawsLoading, setDrawsLoading] = useState(true);
  const [drawsErr, setDrawsErr] = useState('');
  // filter sync กับ URL query (?status=&type=&category=) — refresh/share link แล้ว filter ยังอยู่
  const [filter, setFilter] = useUrlFilters({ status: '', type: '', category: '' });

  const loadSchedule = () => api('/admin/draws/schedule').then(r => setSchedule(r.schedule || [])).catch(() => {});
  const FETCH_LIMIT = 500;   // server cap ต่อ request
  const MAX_DRAW_ROWS = 2000; // safety cap — กัน dataset ใหญ่เกิน
  const PAGE_SIZE = 50;
  const drawsQs = (offset) => {
    const qs = new URLSearchParams({ limit: String(FETCH_LIMIT), offset: String(offset) });
    if (filter.status) qs.set('status', filter.status);
    if (filter.type) qs.set('type', filter.type);
    if (filter.category) qs.set('category', filter.category);
    return qs.toString();
  };
  // ดึงทุกรอบที่ตรง filter (วน offset ทีละ FETCH_LIMIT) แล้ว paginate ฝั่ง client
  const loadDraws = async () => {
    setDrawsLoading(true); setDrawsErr('');
    try {
      const all = [];
      let offset = 0;
      for (;;) {
        const r = await api(`/admin/draws?${drawsQs(offset)}`);
        const list = Array.isArray(r?.draws) ? r.draws : [];
        const total = Number(r?.total) || 0;
        all.push(...list);
        offset += list.length;
        if (!list.length || list.length < FETCH_LIMIT || all.length >= total || all.length >= MAX_DRAW_ROWS) break;
      }
      setFiltered(all);
    } catch (e) { setDrawsErr(e.message); }
    finally { setDrawsLoading(false); }
  };
  const load = () => {
    loadDraws();
    api('/admin/lottery/types').then(r => setTypes(r.types)).catch(() => {});
    api('/admin/lottery/categories').then(r => setCats(r.categories)).catch(() => {});
    loadSchedule();
  };
  useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setPage(1); loadDraws(); }, [filter]); // eslint-disable-line react-hooks/exhaustive-deps

  // client-side pagination — filtered = ข้อมูลทั้งหมดที่ตรง filter (สำหรับ export), paged = เฉพาะหน้าที่แสดง
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const curPage = Math.min(page, pageCount);
  const paged = filtered.slice((curPage - 1) * PAGE_SIZE, curPage * PAGE_SIZE);

  // บังคับเติมรอบหวยล่วงหน้าทันที (ระบบทำอัตโนมัติทุก 1 นาทีอยู่แล้ว)
  const runSeed = async () => {
    setSeedBusy(true); setSeedMsg('');
    try {
      const r = await api('/admin/draws/seed', { method: 'POST', body: {} });
      setSeedMsg(`สร้างรอบใหม่ ${r.created} รอบ`);
      toast(`สร้างรอบใหม่ ${r.created} รอบ`, 'success');
      load();
    } catch (e) { setSeedMsg('ERROR: ' + e.message); toast(e.message, 'error'); }
    finally { setSeedBusy(false); }
  };

  const create = async (e) => {
    e.preventDefault();
    if (!(await confirmAction({ title: 'ยืนยันสร้างรอบหวย', message: `สร้างรอบใหม่ "${form.draw_code}" ใช่หรือไม่?` }))) return;
    try {
      await api('/admin/draws', { method: 'POST', body: {
        ...form, lottery_type_id: Number(form.lottery_type_id),
        category_id: form.category_id ? Number(form.category_id) : null,
        draw_at: form.draw_at.replace('T', ' '), close_at: form.close_at.replace('T', ' '),
      }});
      setShowForm(false); setForm({ lottery_type_id: '', category_id: '', draw_code: '', draw_at: '', close_at: '' }); load();
      toast('สร้างรอบหวยแล้ว', 'success');
    } catch (e2) { toast(e2.message, 'error'); }
  };

  const setStatus = async (id, status) => {
    const d = filtered.find(x => x.id === id);
    const warn = status === 'cancelled'
      ? { title: '⚠️ ยืนยันยกเลิกรอบ', message: `ยกเลิกรอบ "${d?.draw_code}" ถาวร?\nรอบที่ยกเลิกจะไม่สามารถแก้ไขได้`, danger: true, confirmLabel: 'ยกเลิกรอบ' }
      : { title: 'ยืนยันเปลี่ยนสถานะ', message: `เปลี่ยนสถานะรอบ "${d?.draw_code}" เป็น "${STATUS_TH[status]}" ใช่หรือไม่?` };
    if (!(await confirmAction(warn))) return;
    try {
      const r = await api(`/admin/draws/${id}/status`, { method: 'PATCH', body: { status } });
      if (status === 'cancelled' && r?.refundedSlips) {
        toast(`คืนเครดิตอัตโนมัติ ${r.refundedSlips} โพย รวม ${satang(r.refundedAmount)} บาท + แจ้งเตือนสมาชิกแล้ว`, 'success');
      } else {
        toast(`เปลี่ยนสถานะเป็น "${STATUS_TH[status]}" แล้ว`, 'success');
      }
      load();
    }
    catch (e) { toast(e.message, 'error'); }
  };

  const openEdit = (d) => {
    setEditDraw({
      id: d.id, draw_code: d.draw_code,
      draw_at: utcToLocalInput(d.draw_at), close_at: utcToLocalInput(d.close_at),
      announce_top: annToInput(d.announce, 'top'), announce_bottom: annToInput(d.announce, 'bottom'),
    });
  };

  const saveEdit = async () => {
    if (!(await confirmAction({ title: 'ยืนยันแก้ไขรอบหวย', message: `บันทึกการแก้ไขรอบ "${editDraw.draw_code}" ใช่หรือไม่?` }))) return;
    // รูปแบบ: "123:400, 456" — :ตัวคูณ = อัตราจ่ายเฉพาะรายเลข (เว้นว่าง = default ครึ่งรางวัลหลัก)
    const top = parseAnnInput(editDraw.announce_top, 3);
    const bottom = parseAnnInput(editDraw.announce_bottom, 2);
    const badTop = (editDraw.announce_top || '').trim() && top.length === 0;
    const badBottom = (editDraw.announce_bottom || '').trim() && bottom.length === 0;
    if (badTop || badBottom) {
      toast(badTop ? 'เลขอั้นบนต้องเป็นตัวเลข 3 หลัก (เช่น 123:400, 456)' : 'เลขอั้นล่างต้องเป็นตัวเลข 2 หลัก', 'error');
      return;
    }
    try {
      await api(`/admin/draws/${editDraw.id}`, { method: 'PATCH', body: {
        draw_code: editDraw.draw_code,
        draw_at: editDraw.draw_at.replace('T', ' '),
        close_at: editDraw.close_at.replace('T', ' '),
        announce: top.length || bottom.length ? { top, bottom } : null,
      }});
      setEditDraw(null); load();
      toast('บันทึกการแก้ไขรอบหวยแล้ว', 'success');
    } catch (e) { toast(e.message, 'error'); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold luxury-gradient-text">จัดการรอบหวย</h1>
        <button onClick={() => setShowForm(!showForm)} className="luxury-btn">+ สร้างรอบใหม่</button>
      </div>

      {showForm && (
        <div className="luxury-card p-6">
        <form onSubmit={create} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <select required value={form.lottery_type_id} onChange={e => setForm({...form, lottery_type_id: e.target.value, category_id: ''})} className="luxury-input sm:col-span-2">
            <option value="">— เลือกประเภทหวย —</option>
            {types.filter(t => t.is_active && !['SC', 'HL', 'KI'].includes(t.code)).map(t => <option key={t.id} value={t.id}>{t.name_th}</option>)}
          </select>
          <select value={form.category_id} onChange={e => setForm({...form, category_id: e.target.value})} className="luxury-input">
            <option value="">— ไม่ระบุหมวด —</option>
            {cats.filter(c => String(c.lottery_type_id) === String(form.lottery_type_id)).map(c => (
              <option key={c.id} value={c.id}>{c.name_th}</option>
            ))}
          </select>
          <input required placeholder="รหัสรอบ (เช่น TH-2026-1101)" value={form.draw_code} onChange={e => setForm({...form, draw_code: e.target.value})} className="luxury-input" />
          <div><label className="[color:var(--muted-gray)] [font-size:12px]">เวลาออกรางวัล</label>
            <input required type="datetime-local" value={form.draw_at} onChange={e => setForm({...form, draw_at: e.target.value})} className="luxury-input w-full mt-1" /></div>
          <div><label className="[color:var(--muted-gray)] [font-size:12px]">เวลาปิดรับโพย</label>
            <input required type="datetime-local" value={form.close_at} onChange={e => setForm({...form, close_at: e.target.value})} className="luxury-input w-full mt-1" /></div>
          <button type="submit" className="luxury-btn sm:col-span-2">สร้างรอบ</button>
        </form>
        </div>
      )}

      {/* ตารางออกรางวัลตามตารางเวลาที่กำหนด — read-only preview + ปุ่มเติมรอบล่วงหน้า */}
      <div className="luxury-card p-5">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <div>
            <h2 className="font-bold text-sm luxury-gradient-text">ตารางออกรางวัล (5 รอบถัดไปต่อตลาด)</h2>
            <p className="[color:var(--muted-gray)] [font-size:11px]">ระบบสร้างรอบอัตโนมัติทุก 1 นาที — กดปุ่มเพื่อบังคับเติมทันที</p>
          </div>
          <div className="flex items-center gap-2">
            {seedMsg && <span className={`text-xs ${seedMsg.startsWith('ERROR') ? 'text-red-400' : 'text-green-300'}`}>{seedMsg}</span>}
            <button onClick={runSeed} disabled={seedBusy} className="luxury-btn-outline text-xs px-4 py-2">
              {seedBusy ? 'กำลังสร้าง…' : '⚡ เติมรอบล่วงหน้า'}
            </button>
          </div>
        </div>
        {schedule && (() => {
          // จัดกลุ่มตามตลาด — แสดงเวลาปิดรับ/ออกรางวัลของแต่ละรอบ
          const groups = {};
          for (const s of schedule) {
            const k = `${s.type_code}:${s.category_code || ''}`;
            (groups[k] = groups[k] || { label: `${s.type_name_th}${s.category_name_th ? ' — ' + s.category_name_th : ''}`, type_code: s.type_code, items: [] }).items.push(s);
          }
          return (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {Object.values(groups).map(g => (
                <div key={g.label} className="rounded-lg p-4 [background:var(--bg-dark-surface)] [border:1px_solid_var(--border-light)]">
                  <div className="text-xs font-bold mb-2 truncate [color:var(--white)]">{g.label}</div>
                  <div className="space-y-2">
                    {g.items.slice(0, 5).map(s => (
                      <div key={s.drawCode} className="flex justify-between text-[11px] [color:var(--muted-gray)]">
                        <span className="font-mono">{s.drawCode}</span>
                        <span>ออก {fmtDateTime(s.drawAt)} • ปิด {fmtDateTime(s.closeAt)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          );
        })()}
      </div>

      {/* ตั้งเลขอั้นหลายรอบพร้อมกัน — เลขอั้นไม่มี API ฟรี ต้องกรอกเองครั้งเดียวครอบคลุมทุก rond ที่ยังไม่ปิด */}
      <BulkAnnounce types={types} cats={cats} onDone={loadDraws} />

      {/* ตัวกรองรอบหวย — สถานะ / ประเภท / หมวด */}
      <div className="flex items-center gap-3 flex-wrap">
        <select value={filter.status} onChange={e => setFilter({ status: e.target.value })} className="luxury-input text-sm [padding:0.5rem_0.75rem]">
          <option value="">ทุกสถานะ</option>
          {Object.entries(STATUS_TH).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={filter.type} onChange={e => setFilter({ type: e.target.value, category: '' })} className="luxury-input text-sm [padding:0.5rem_0.75rem]">
          <option value="">ทุกประเภท</option>
          {types.map(t => <option key={t.id} value={t.id}>{t.name_th}</option>)}
        </select>
        <select value={filter.category} onChange={e => setFilter({ category: e.target.value })} className="luxury-input text-sm [padding:0.5rem_0.75rem]">
          <option value="">ทุกหมวด</option>
          <option value="null">ไม่มีหมวด</option>
          {cats.filter(c => !filter.type || String(c.lottery_type_id) === String(filter.type)).map(c => (
            <option key={c.id} value={c.id}>{c.name_th}</option>
          ))}
        </select>
      </div>

      <div className="luxury-card">
        {drawsErr && filtered.length > 0 && <div className="p-4 pb-0"><AdminError message={drawsErr} onRetry={loadDraws} /></div>}
        {drawsLoading && !filtered.length ? (
          <div className="p-4"><AdminLoading label="กำลังโหลดรอบหวย..." /></div>
        ) : drawsErr && !filtered.length ? (
          <div className="p-4"><AdminError message={drawsErr} onRetry={loadDraws} /></div>
        ) : (
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent [border-bottom:1px_solid_var(--border-light)]">
              <TableHead className="[color:var(--muted-gray)]">รอบ</TableHead>
              <TableHead className="[color:var(--muted-gray)]">ประเภท</TableHead>
              <TableHead className="[color:var(--muted-gray)]">ออกรางวัล</TableHead>
              <TableHead className="[color:var(--muted-gray)]">ปิดรับ</TableHead>
              <TableHead className="[color:var(--muted-gray)]">สถานะ</TableHead>
              <TableHead className="[color:var(--muted-gray)]">จัดการ</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paged.map(d => (
              <TableRow key={d.id} className="[border-bottom:1px_solid_var(--border-light)]">
                <TableCell className="font-mono [color:var(--gold-primary)]">
                  {d.draw_code}
                  {(() => { const s = annSummary(d.announce); return s ? (
                    <div className="text-[10px] font-sans mt-0.5 [color:var(--warning-amber)]">เลขอั้น: {s}</div>
                  ) : null; })()}
                </TableCell>
                <TableCell className="[color:var(--white)]">{d.type_name_th}{d.category_name_th ? <span className="[color:var(--muted-gray)] [font-size:12px]"> — {d.category_name_th}</span> : null}</TableCell>
                <TableCell className="[color:var(--muted-gray)] [font-size:12px]">{fmtDateTime(d.draw_at)}</TableCell>
                <TableCell className="[color:var(--muted-gray)] [font-size:12px]">{fmtDateTime(d.close_at)}</TableCell>
                <TableCell>
                  <span className={cn('text-[10px] font-semibold', STATUS_BADGE[d.status] || 'luxury-badge')}>
                    {STATUS_TH[d.status]}
                  </span>
                </TableCell>
                <TableCell>
                  {d.status !== 'settled' && d.status !== 'cancelled' && (
                    <div className="flex gap-2">
                      {d.status !== 'open' && <button onClick={() => setStatus(d.id, 'open')} className="text-xs font-semibold hover:underline [color:var(--success-green)]">เปิด</button>}
                      {d.status === 'open' && <button onClick={() => setStatus(d.id, 'closed')} className="text-xs font-semibold hover:underline [color:var(--muted-gray)]">ปิด</button>}
                      <button onClick={() => setStatus(d.id, 'cancelled')} className="text-xs font-semibold hover:underline [color:var(--danger-red)]">ยกเลิก</button>
                      <button onClick={() => openEdit(d)} className="text-xs font-semibold hover:underline [color:var(--gold-primary)]">แก้ไข</button>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        )}
      </div>
      <TablePager page={curPage} pageCount={pageCount} total={filtered.length} pageSize={PAGE_SIZE} onPage={setPage} />

      {editDraw && (
        <Modal open onClose={() => setEditDraw(null)} title={`แก้ไขรอบหวย: ${editDraw.draw_code}`}>
          <div className="space-y-4 text-sm">
            <div><label className="[color:var(--muted-gray)] [font-size:12px]">รหัสรอบ</label>
              <input value={editDraw.draw_code} onChange={e => setEditDraw({...editDraw, draw_code: e.target.value})} className="luxury-input w-full mt-1 font-mono" /></div>
            <div><label className="[color:var(--muted-gray)] [font-size:12px]">เวลาออกรางวัล</label>
              <input type="datetime-local" value={editDraw.draw_at} onChange={e => setEditDraw({...editDraw, draw_at: e.target.value})} className="luxury-input w-full mt-1" /></div>
            <div><label className="[color:var(--muted-gray)] [font-size:12px]">เวลาปิดรับโพย (ต้องก่อนเวลาออกรางวัล)</label>
              <input type="datetime-local" value={editDraw.close_at} onChange={e => setEditDraw({...editDraw, close_at: e.target.value})} className="luxury-input w-full mt-1" /></div>
            <div className="[border-top:1px_solid_var(--border-light)] [padding-top:1rem]">
              <label className="text-xs font-semibold [color:var(--warning-amber)]">เลขอั้น (ประกาศล่วงหน้าให้ผู้แทงเห็น)</label>
              <div className="grid grid-cols-2 gap-3 mt-2">
                <input placeholder="เลขบน เช่น 123:400, 456" value={editDraw.announce_top || ''} onChange={e => setEditDraw({...editDraw, announce_top: e.target.value})} className="luxury-input font-mono" />
                <input placeholder="เลขล่าง เช่น 45:50, 67" value={editDraw.announce_bottom || ''} onChange={e => setEditDraw({...editDraw, announce_bottom: e.target.value})} className="luxury-input font-mono" />
              </div>
              <p className="[color:var(--dark-gray)] [font-size:10px] [margin-top:4px]">
                หลายเลขคั่นด้วย , • <code>เลข:ตัวคูณ</code> = อัตราจ่ายเฉพาะรายเลข (เช่น 123:400 จ่าย x400) • เว้นว่างตัวคูณ = ใช้ค่าเริ่มต้น (ครึ่งรางวัลหลัก)
                • ผู้แทงจะเห็นในหน้ารอบหวยและหน้แทง และ<strong>แทงได้เฉพาะเลขที่ประกาศ</strong>
              </p>
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={saveEdit} className="luxury-btn flex-1">บันทึก</button>
              <button onClick={() => setEditDraw(null)} className="luxury-btn-ghost">ยกเลิก</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ตั้งเลขอั้นครั้งเดียวครอบคลุมทุกรอบที่ยังไม่ปิดของตลาดนั้น (open/scheduled)
function BulkAnnounce({ types, cats, onDone }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ type_id: '', category_id: '', top: '', bottom: '' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const parseSide = (s) => s.trim() ? s.split(',').map(x => x.trim()).filter(Boolean) : undefined;
  const submit = async () => {
    if (!f.type_id) { setMsg('เลือกประเภทก่อน'); return; }
    const announce = {};
    const t = parseSide(f.top), b = parseSide(f.bottom);
    if (t) announce.top = t;
    if (b) announce.bottom = b;
    if (!Object.keys(announce).length) { setMsg('กรอกเลขอั้นอย่างน้อย 1 ฝั่ง'); return; }
    if (!(await confirmAction({ title: 'ยืนยันตั้งเลขอั้น', message: `ใช้เลขอั้นนี้กับทุกรอบที่ยังไม่ปิดของตลาดที่เลือก ใช่หรือไม่?` }))) return;
    setBusy(true); setMsg('');
    try {
      const r = await api('/admin/draws/announce-bulk', { method: 'POST', body: {
        type_id: Number(f.type_id),
        category_id: f.category_id === '' ? null : Number(f.category_id),
        announce,
      }});
      setMsg(`ตั้งเลขอั้นให้ ${r.updated} รอบแล้ว`);
      toast(`ตั้งเลขอั้น ${r.updated} รอบ`, 'success');
      onDone?.();
    } catch (e) { setMsg('ERROR: ' + e.message); toast(e.message, 'error'); }
    finally { setBusy(false); }
  };
  if (!open) return (
    <button onClick={() => setOpen(true)} className="text-xs px-3 py-1.5 rounded-lg luxury-badge [background:color-mix(in_srgb,var(--warning-amber)_15%,transparent)] [color:var(--warning-amber)] [border:1px_solid_var(--warning-amber)]">
      ⚠ ตั้งเลขอั้นหลายรอบ
    </button>
  );
  return (
    <div className="rounded-xl p-4 space-y-3 [background:color-mix(in_srgb,var(--warning-amber)_5%,transparent)] [border:1px_solid_var(--warning-amber)]">
      <div className="flex items-center justify-between">
        <div className="text-sm font-bold [color:var(--warning-amber)]">ตั้งเลขอั้นครอบคลุมหลายรอบ</div>
        <button onClick={() => setOpen(false)} className="text-xs hover:text-white [color:var(--muted-gray)]">✕</button>
      </div>
      <p className="[color:var(--muted-gray)] [font-size:11px]">ใช้กับทุกรอบ status=open/scheduled ที่ยังไม่ถึงเวลาออกรางวัลของตลาดที่เลือก — ใช้เมื่อต้องการประกาศเลขอั้นชุดเดียวกันหลายงวด</p>
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <select value={f.type_id} onChange={e => setF({...f, type_id: e.target.value, category_id: ''})}
          className="luxury-input text-xs [padding:0.5rem_0.75rem]">
          <option value="">ประเภทหวย *</option>
          {types.map(t => <option key={t.id} value={t.id}>{t.name_th}</option>)}
        </select>
        <select value={f.category_id} onChange={e => setF({...f, category_id: e.target.value})}
          className="luxury-input text-xs [padding:0.5rem_0.75rem]">
          <option value="">ทุกหมวด</option>
          <option value="null">ไม่มีหมวด</option>
          {cats.filter(c => !f.type_id || String(c.lottery_type_id) === String(f.type_id)).map(c => <option key={c.id} value={c.id}>{c.name_th}</option>)}
        </select>
        <input placeholder="เลขบน เช่น 123,456:400" value={f.top} onChange={e => setF({...f, top: e.target.value})}
          className="luxury-input text-xs font-mono [padding:0.5rem_0.75rem]" />
        <input placeholder="เลขล่าง เช่น 45,67" value={f.bottom} onChange={e => setF({...f, bottom: e.target.value})}
          className="luxury-input text-xs font-mono [padding:0.5rem_0.75rem]" />
      </div>
      <div className="flex items-center gap-2">
        <button onClick={submit} disabled={busy} className="luxury-btn text-xs px-4 py-2 [background:linear-gradient(135deg,_var(--warning-amber),_var(--warning-amber))] [color:var(--bg-deep-black)]">
          {busy ? 'กำลังตั้ง…' : 'ยืนยันตั้งเลขอั้น'}
        </button>
        {msg && <span className={`text-xs ${msg.startsWith('ERROR') ? 'text-red-400' : 'text-green-300'}`}>{msg}</span>}
      </div>
    </div>
  );
}
