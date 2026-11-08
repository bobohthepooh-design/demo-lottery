import { useEffect, useState } from 'react';
import { api, fmtDateTime } from '../api.js';
import WinningBoard from '../components/WinningBoard.jsx';

const STATUS_TH = { scheduled: 'กำหนดการ', open: 'เปิดรับ', closed: 'ปิดรับ', settled: 'ออกผลแล้ว', cancelled: 'ยกเลิก' };

export default function AdminDraws() {
  const [draws, setDraws] = useState([]);
  const [types, setTypes] = useState([]);
  const [cats, setCats] = useState([]);
  const [form, setForm] = useState({ lottery_type_id: '', category_id: '', draw_code: '', draw_at: '', close_at: '' });
  const [showForm, setShowForm] = useState(false);

  const load = () => {
    api('/admin/draws').then(r => setDraws(r.draws)).catch(e => alert(e.message));
    api('/admin/lottery/types').then(r => setTypes(r.types)).catch(() => {});
    api('/admin/lottery/categories').then(r => setCats(r.categories)).catch(() => {});
  };
  useEffect(load, []);

  const create = async (e) => {
    e.preventDefault();
    try {
      await api('/admin/draws', { method: 'POST', body: {
        ...form, lottery_type_id: Number(form.lottery_type_id),
        category_id: form.category_id ? Number(form.category_id) : null,
        draw_at: form.draw_at.replace('T', ' '), close_at: form.close_at.replace('T', ' '),
      }});
      setShowForm(false); setForm({ lottery_type_id: '', category_id: '', draw_code: '', draw_at: '', close_at: '' }); load();
    } catch (e2) { alert(e2.message); }
  };

  const setStatus = async (id, status) => {
    try { await api(`/admin/draws/${id}/status`, { method: 'PATCH', body: { status } }); load(); }
    catch (e) { alert(e.message); }
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
            {types.map(t => <option key={t.id} value={t.id}>{t.name_th}</option>)}
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

      <div className="bg-navy-800 border border-navy-700 rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-navy-900 text-navy-300 text-xs">
            <tr><th className="text-left px-4 py-3">รอบ</th><th className="text-left px-4 py-3">ประเภท</th><th className="text-left px-4 py-3">ออกรางวัล</th><th className="text-left px-4 py-3">ปิดรับ</th><th className="text-left px-4 py-3">สถานะ</th><th className="text-left px-4 py-3">ผล</th><th className="px-4 py-3">จัดการ</th></tr>
          </thead>
          <tbody className="divide-y divide-navy-700">
            {draws.map(d => (
              <tr key={d.id} className="hover:bg-navy-700/40">
                <td className="px-4 py-3 font-mono text-gold-300">{d.draw_code}</td>
                <td className="px-4 py-3 text-white">{d.type_name_th}{d.category_name_th ? <span className="text-navy-300 text-xs"> — {d.category_name_th}</span> : null}</td>
                <td className="px-4 py-3 text-navy-300 text-xs">{fmtDateTime(d.draw_at)}</td>
                <td className="px-4 py-3 text-navy-300 text-xs">{fmtDateTime(d.close_at)}</td>
                <td className="px-4 py-3"><span className={`text-xs px-2 py-1 rounded ${d.status === 'open' ? 'bg-green-500/20 text-green-300' : d.status === 'settled' ? 'bg-gold-500/20 text-gold-300' : 'bg-navy-700 text-navy-300'}`}>{STATUS_TH[d.status]}</span></td>
                <td className="px-4 py-3">{d.result_numbers ? <WinningBoard winningNumbers={d.result_numbers} typeCode={d.type_code} categoryCode={d.category_code} compact /> : '—'}</td>
                <td className="px-4 py-3">
                  {d.status !== 'settled' && d.status !== 'cancelled' && (
                    <div className="flex gap-1">
                      {d.status !== 'open' && <button onClick={() => setStatus(d.id, 'open')} className="text-xs text-green-400 hover:underline">เปิด</button>}
                      {d.status === 'open' && <button onClick={() => setStatus(d.id, 'closed')} className="text-xs text-navy-300 hover:underline">ปิด</button>}
                      <button onClick={() => setStatus(d.id, 'cancelled')} className="text-xs text-red-400 hover:underline">ยกเลิก</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
