import { useEffect, useState } from 'react';
import { api, fmtDateTime, satang } from '../api.js';
import { confirmAction } from './confirm.jsx';
import { toast } from '../components/toast.js';
import { annSummary, annToInput, parseAnnInput } from '../ann.js';

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
  const [draws, setDraws] = useState([]);
  const [types, setTypes] = useState([]);
  const [cats, setCats] = useState([]);
  const [form, setForm] = useState({ lottery_type_id: '', category_id: '', draw_code: '', draw_at: '', close_at: '' });
  const [showForm, setShowForm] = useState(false);
  const [editDraw, setEditDraw] = useState(null);
  const [schedule, setSchedule] = useState(null);
  const [seedMsg, setSeedMsg] = useState('');
  const [seedBusy, setSeedBusy] = useState(false);

  const loadSchedule = () => api('/admin/draws/schedule').then(r => setSchedule(r.schedule || [])).catch(() => {});
  const load = () => {
    api('/admin/draws').then(r => setDraws(r.draws)).catch(e => toast(e.message, 'error'));
    api('/admin/lottery/types').then(r => setTypes(r.types)).catch(() => {});
    api('/admin/lottery/categories').then(r => setCats(r.categories)).catch(() => {});
    loadSchedule();
  };
  useEffect(load, []);

  // บังคับเติมรอบหวยล่วงหน้าทันที (ระบบทำอัตโนมัติทุก 1 นาทีอยู่แล้ว)
  const runSeed = async () => {
    setSeedBusy(true); setSeedMsg('');
    try {
      const r = await api('/admin/draws/seed', { method: 'POST', body: {} });
      setSeedMsg(`สร้างรอบใหม่ ${r.created} รอบ`);
      load();
    } catch (e) { setSeedMsg('ERROR: ' + e.message); }
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
    } catch (e2) { toast(e2.message, 'error'); }
  };

  const setStatus = async (id, status) => {
    const d = draws.find(x => x.id === id);
    const warn = status === 'cancelled'
      ? { title: '⚠️ ยืนยันยกเลิกรอบ', message: `ยกเลิกรอบ "${d?.draw_code}" ถาวร?\nรอบที่ยกเลิกจะไม่สามารถแก้ไขได้`, danger: true, confirmLabel: 'ยกเลิกรอบ' }
      : { title: 'ยืนยันเปลี่ยนสถานะ', message: `เปลี่ยนสถานะรอบ "${d?.draw_code}" เป็น "${STATUS_TH[status]}" ใช่หรือไม่?` };
    if (!(await confirmAction(warn))) return;
    try {
      const r = await api(`/admin/draws/${id}/status`, { method: 'PATCH', body: { status } });
      if (status === 'cancelled' && r?.refundedSlips) {
        toast(`คืนเครดิตอัตโนมัติ ${r.refundedSlips} โพย รวม ${satang(r.refundedAmount)} บาท + แจ้งเตือนสมาชิกแล้ว`, 'success');
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
    } catch (e) { toast(e.message, 'error'); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">จัดการรอบหวย</h1>
        <button onClick={() => setShowForm(!showForm)} className="bg-gold-500 text-navy-950 font-bold px-4 py-2 rounded-lg text-sm">+ สร้างรอบใหม่</button>
      </div>

      {showForm && (
        <form onSubmit={create} className="bg-navy-800 border border-navy-700 rounded-xl p-5 grid sm:grid-cols-2 gap-3">
          <select required value={form.lottery_type_id} onChange={e => setForm({...form, lottery_type_id: e.target.value, category_id: ''})} className="bg-navy-900 border border-navy-600 rounded-lg px-3 py-2">
            <option value="">— เลือกประเภทหวย —</option>
            {types.filter(t => t.is_active && !['SC', 'HL', 'KI'].includes(t.code)).map(t => <option key={t.id} value={t.id}>{t.name_th}</option>)}
          </select>
          <select value={form.category_id} onChange={e => setForm({...form, category_id: e.target.value})} className="bg-navy-900 border border-navy-600 rounded-lg px-3 py-2">
            <option value="">— ไม่ระบุหมวด —</option>
            {cats.filter(c => String(c.lottery_type_id) === String(form.lottery_type_id)).map(c => (
              <option key={c.id} value={c.id}>{c.name_th}</option>
            ))}
          </select>
          <input required placeholder="รหัสรอบ (เช่น TH-2026-1101)" value={form.draw_code} onChange={e => setForm({...form, draw_code: e.target.value})} className="bg-navy-900 border border-navy-600 rounded-lg px-3 py-2" />
          <div><label className="text-xs text-navy-300">เวลาออกรางวัล</label>
            <input required type="datetime-local" value={form.draw_at} onChange={e => setForm({...form, draw_at: e.target.value})} className="w-full bg-navy-900 border border-navy-600 rounded-lg px-3 py-2 mt-1" /></div>
          <div><label className="text-xs text-navy-300">เวลาปิดรับโพย</label>
            <input required type="datetime-local" value={form.close_at} onChange={e => setForm({...form, close_at: e.target.value})} className="w-full bg-navy-900 border border-navy-600 rounded-lg px-3 py-2 mt-1" /></div>
          <button className="bg-gold-500 text-navy-950 font-bold py-2 rounded-lg sm:col-span-2">สร้างรอบ</button>
        </form>
      )}

      {/* ตารางออกรางวัลตามตารางเวลาที่กำหนด — read-only preview + ปุ่มเติมรอบล่วงหน้า */}
      <div className="bg-navy-800 border border-navy-700 rounded-xl p-4">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
          <div>
            <h2 className="font-bold text-white text-sm">ตารางออกรางวัล (5 รอบถัดไปต่อตลาด)</h2>
            <p className="text-[11px] text-navy-400">ระบบสร้างรอบอัตโนมัติทุก 1 นาที — กดปุ่มเพื่อบังคับเติมทันที</p>
          </div>
          <div className="flex items-center gap-2">
            {seedMsg && <span className={`text-xs ${seedMsg.startsWith('ERROR') ? 'text-red-400' : 'text-green-300'}`}>{seedMsg}</span>}
            <button onClick={runSeed} disabled={seedBusy}
              className="bg-emerald-600 text-white text-xs font-bold px-3 py-1.5 rounded-lg hover:bg-emerald-500 disabled:opacity-40">
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
            <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {Object.values(groups).map(g => (
                <div key={g.label} className="bg-navy-900/60 border border-navy-700/60 rounded-lg p-3">
                  <div className="text-xs font-bold text-white mb-1.5 truncate">{g.label}</div>
                  <div className="space-y-1">
                    {g.items.slice(0, 5).map(s => (
                      <div key={s.drawCode} className="flex justify-between text-[11px] text-navy-300">
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

      <div className="bg-navy-800 border border-navy-700 rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-navy-900 text-navy-300 text-xs">
            <tr><th className="text-left px-4 py-3">รอบ</th><th className="text-left px-4 py-3">ประเภท</th><th className="text-left px-4 py-3">ออกรางวัล</th><th className="text-left px-4 py-3">ปิดรับ</th><th className="text-left px-4 py-3">สถานะ</th><th className="px-4 py-3">จัดการ</th></tr>
          </thead>
          <tbody className="divide-y divide-navy-700">
            {draws.map(d => (
              <tr key={d.id} className="hover:bg-navy-700/40">
                <td className="px-4 py-3 font-mono text-gold-300">
                  {d.draw_code}
                  {(() => { const s = annSummary(d.announce); return s ? (
                    <div className="text-[10px] text-amber-300 font-sans mt-0.5">เลขอั้น: {s}</div>
                  ) : null; })()}
                </td>
                <td className="px-4 py-3 text-white">{d.type_name_th}{d.category_name_th ? <span className="text-navy-300 text-xs"> — {d.category_name_th}</span> : null}</td>
                <td className="px-4 py-3 text-navy-300 text-xs">{fmtDateTime(d.draw_at)}</td>
                <td className="px-4 py-3 text-navy-300 text-xs">{fmtDateTime(d.close_at)}</td>
                <td className="px-4 py-3"><span className={`text-xs px-2 py-1 rounded ${d.status === 'open' ? 'bg-green-500/20 text-green-300' : d.status === 'settled' ? 'bg-gold-500/20 text-gold-300' : 'bg-navy-700 text-navy-300'}`}>{STATUS_TH[d.status]}</span></td>
                <td className="px-4 py-3">
                  {d.status !== 'settled' && d.status !== 'cancelled' && (
                    <div className="flex gap-1">
                      {d.status !== 'open' && <button onClick={() => setStatus(d.id, 'open')} className="text-xs text-green-400 hover:underline">เปิด</button>}
                      {d.status === 'open' && <button onClick={() => setStatus(d.id, 'closed')} className="text-xs text-navy-300 hover:underline">ปิด</button>}
                      <button onClick={() => setStatus(d.id, 'cancelled')} className="text-xs text-red-400 hover:underline">ยกเลิก</button>
                      <button onClick={() => openEdit(d)} className="text-xs text-gold-400 hover:underline">แก้ไข</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editDraw && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={() => setEditDraw(null)}>
          <div className="bg-navy-800 border border-navy-600 rounded-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-white mb-4">แก้ไขรอบหวย: {editDraw.draw_code}</h2>
            <div className="space-y-3 text-sm">
              <div>
                <label className="text-xs text-navy-300">รหัสรอบ</label>
                <input value={editDraw.draw_code} onChange={e => setEditDraw({...editDraw, draw_code: e.target.value})}
                  className="w-full bg-navy-900 border border-navy-600 rounded-lg px-3 py-2 mt-1 font-mono" />
              </div>
              <div>
                <label className="text-xs text-navy-300">เวลาออกรางวัล</label>
                <input type="datetime-local" value={editDraw.draw_at} onChange={e => setEditDraw({...editDraw, draw_at: e.target.value})}
                  className="w-full bg-navy-900 border border-navy-600 rounded-lg px-3 py-2 mt-1" />
              </div>
              <div>
                <label className="text-xs text-navy-300">เวลาปิดรับโพย (ต้องก่อนเวลาออกรางวัล)</label>
                <input type="datetime-local" value={editDraw.close_at} onChange={e => setEditDraw({...editDraw, close_at: e.target.value})}
                  className="w-full bg-navy-900 border border-navy-600 rounded-lg px-3 py-2 mt-1" />
              </div>
              <div className="border-t border-navy-700 pt-3">
                <label className="text-xs text-amber-300 font-semibold">เลขอั้น (ประกาศล่วงหน้าให้ผู้แทงเห็น)</label>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  <input placeholder="เลขบน เช่น 123:400, 456" value={editDraw.announce_top || ''} onChange={e => setEditDraw({...editDraw, announce_top: e.target.value})}
                    className="bg-navy-900 border border-navy-600 rounded-lg px-3 py-2 font-mono" />
                  <input placeholder="เลขล่าง เช่น 45:50, 67" value={editDraw.announce_bottom || ''} onChange={e => setEditDraw({...editDraw, announce_bottom: e.target.value})}
                    className="bg-navy-900 border border-navy-600 rounded-lg px-3 py-2 font-mono" />
                </div>
                <p className="text-[10px] text-navy-500 mt-1">
                  หลายเลขคั่นด้วย , • <code>เลข:ตัวคูณ</code> = อัตราจ่ายเฉพาะรายเลข (เช่น 123:400 จ่าย x400) • เว้นว่างตัวคูณ = ใช้ค่าเริ่มต้น (ครึ่งรางวัลหลัก)
                  • ผู้แทงจะเห็นในหน้ารอบหวยและหน้แทง และ<strong>แทงได้เฉพาะเลขที่ประกาศ</strong>
                </p>
              </div>
              <div className="flex gap-2 pt-2">
                <button onClick={saveEdit} className="flex-1 bg-gold-500 text-navy-950 font-bold py-2.5 rounded-lg">บันทึก</button>
                <button onClick={() => setEditDraw(null)} className="px-5 py-2.5 border border-navy-600 rounded-lg">ยกเลิก</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
