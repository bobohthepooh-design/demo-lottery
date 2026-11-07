import { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function AdminLotteries() {
  const [types, setTypes] = useState([]);
  const [rules, setRules] = useState([]);
  const [editRule, setEditRule] = useState(null);
  const [showTypeForm, setShowTypeForm] = useState(false);
  const [typeForm, setTypeForm] = useState({ code: '', name_th: '', name_en: '', description: '' });

  const load = () => {
    api('/admin/lottery/types').then(r => setTypes(r.types)).catch(e => alert(e.message));
    api('/admin/lottery/rules').then(r => setRules(r.rules)).catch(() => {});
  };
  useEffect(load, []);

  const createType = async (e) => {
    e.preventDefault();
    try { await api('/admin/lottery/types', { method: 'POST', body: typeForm }); setShowTypeForm(false); setTypeForm({ code:'', name_th:'', name_en:'', description:'' }); load(); }
    catch (e2) { alert(e2.message); }
  };

  const toggleType = async (t) => {
    await api(`/admin/lottery/types/${t.id}`, { method: 'PATCH', body: { is_active: t.is_active ? 0 : 1 } });
    load();
  };

  const saveRule = async () => {
    try {
      if (editRule.id) await api(`/admin/lottery/rules/${editRule.id}`, { method: 'PATCH', body: editRule });
      else await api('/admin/lottery/rules', { method: 'POST', body: editRule });
      setEditRule(null); load();
    } catch (e) { alert(e.message); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">ประเภทหวย & กติกา</h1>
        <button onClick={() => setShowTypeForm(!showTypeForm)} className="bg-gold-500 text-navy-950 font-bold px-4 py-2 rounded-lg text-sm">+ เพิ่มประเภทหวย</button>
      </div>

      {showTypeForm && (
        <form onSubmit={createType} className="bg-navy-800 border border-navy-700 rounded-xl p-5 grid sm:grid-cols-2 gap-3">
          <input required placeholder="code (เช่น TH)" value={typeForm.code} onChange={e => setTypeForm({...typeForm, code: e.target.value})} className="bg-navy-900 border border-navy-600 rounded-lg px-3 py-2" />
          <input required placeholder="ชื่อภาษาไทย" value={typeForm.name_th} onChange={e => setTypeForm({...typeForm, name_th: e.target.value})} className="bg-navy-900 border border-navy-600 rounded-lg px-3 py-2" />
          <input placeholder="ชื่อภาษาอังกฤษ" value={typeForm.name_en} onChange={e => setTypeForm({...typeForm, name_en: e.target.value})} className="bg-navy-900 border border-navy-600 rounded-lg px-3 py-2" />
          <input placeholder="คำอธิบาย" value={typeForm.description} onChange={e => setTypeForm({...typeForm, description: e.target.value})} className="bg-navy-900 border border-navy-600 rounded-lg px-3 py-2" />
          <button className="bg-gold-500 text-navy-950 font-bold py-2 rounded-lg sm:col-span-2">บันทึก</button>
        </form>
      )}

      <div className="grid md:grid-cols-3 gap-4">
        {types.map(t => (
          <div key={t.id} className="bg-navy-800 border border-navy-700 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div className="font-bold text-white">{t.name_th} <span className="text-xs text-navy-400">({t.code})</span></div>
              <button onClick={() => toggleType(t)} className={`text-xs px-2 py-1 rounded ${t.is_active ? 'bg-green-500/20 text-green-300' : 'bg-navy-700 text-navy-400'}`}>
                {t.is_active ? 'เปิด' : 'ปิด'}
              </button>
            </div>
            <div className="text-xs text-navy-300 mt-1">{t.description}</div>
            <div className="text-xs text-navy-400 mt-2">{rules.filter(r => r.lottery_type_id === t.id).length} ประเภทการแทง</div>
          </div>
        ))}
      </div>

      <div className="bg-navy-800 border border-navy-700 rounded-xl overflow-x-auto">
        <div className="px-5 py-4 border-b border-navy-700 flex items-center justify-between">
          <h2 className="font-bold text-white">ตารางกติกา (Lottery Rules)</h2>
          <button onClick={() => setEditRule({ lottery_type_id: types[0]?.id, bet_type: '', name_th: '', digits: 2, match_config: '{"source":"top3","mode":"tail"}', payout_multiplier: 100, stake_unit: 100, min_amount: 100, is_active: 1 })}
            className="text-sm text-gold-400 hover:underline">+ เพิ่มกติกา</button>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-navy-900 text-navy-300 text-xs">
            <tr><th className="text-left px-4 py-3">หวย</th><th className="text-left px-4 py-3">ประเภท</th><th className="text-left px-4 py-3">ชื่อ</th><th className="text-center px-4 py-3">หลัก</th><th className="text-left px-4 py-3">Match Config</th><th className="text-right px-4 py-3">จ่าย x</th><th className="text-right px-4 py-3">ขั้นต่ำ</th><th className="text-center px-4 py-3">เปิด</th><th className="px-4 py-3"></th></tr>
          </thead>
          <tbody className="divide-y divide-navy-700">
            {rules.map(r => (
              <tr key={r.id} className="hover:bg-navy-700/40">
                <td className="px-4 py-2 text-navy-300">#{r.lottery_type_id}</td>
                <td className="px-4 py-2"><code className="text-gold-300 text-xs">{r.bet_type}</code></td>
                <td className="px-4 py-2 text-white">{r.name_th}</td>
                <td className="px-4 py-2 text-center">{r.digits}</td>
                <td className="px-4 py-2"><code className="text-xs text-navy-300">{r.match_config}</code></td>
                <td className="px-4 py-2 text-right text-gold-300">{r.payout_multiplier}</td>
                <td className="px-4 py-2 text-right text-navy-300">{r.min_amount}</td>
                <td className="px-4 py-2 text-center">{r.is_active ? '✅' : '—'}</td>
                <td className="px-4 py-2"><button onClick={() => setEditRule({ ...r })} className="text-gold-400 text-xs hover:underline">แก้ไข</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editRule && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={() => setEditRule(null)}>
          <div className="bg-navy-800 border border-navy-600 rounded-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-white mb-4">{editRule.id ? 'แก้ไข' : 'เพิ่ม'}กติกา</h2>
            <div className="grid sm:grid-cols-2 gap-3 text-sm">
              <div><label className="text-navy-300 text-xs">ประเภทหวย ID</label>
                <input type="number" value={editRule.lottery_type_id} disabled={!!editRule.id} onChange={e => setEditRule({...editRule, lottery_type_id: +e.target.value})} className="w-full bg-navy-900 border border-navy-600 rounded-lg px-3 py-2 mt-1" /></div>
              <div><label className="text-navy-300 text-xs">bet_type</label>
                <input value={editRule.bet_type} onChange={e => setEditRule({...editRule, bet_type: e.target.value})} className="w-full bg-navy-900 border border-navy-600 rounded-lg px-3 py-2 mt-1" /></div>
              <div><label className="text-navy-300 text-xs">ชื่อไทย</label>
                <input value={editRule.name_th} onChange={e => setEditRule({...editRule, name_th: e.target.value})} className="w-full bg-navy-900 border border-navy-600 rounded-lg px-3 py-2 mt-1" /></div>
              <div><label className="text-navy-300 text-xs">ชื่ออังกฤษ</label>
                <input value={editRule.name_en || ''} onChange={e => setEditRule({...editRule, name_en: e.target.value})} className="w-full bg-navy-900 border border-navy-600 rounded-lg px-3 py-2 mt-1" /></div>
              <div><label className="text-navy-300 text-xs">จำนวนหลัก</label>
                <input type="number" min="1" max="10" value={editRule.digits} onChange={e => setEditRule({...editRule, digits: +e.target.value})} className="w-full bg-navy-900 border border-navy-600 rounded-lg px-3 py-2 mt-1" /></div>
              <div><label className="text-navy-300 text-xs">match_config (JSON)</label>
                <input value={editRule.match_config} onChange={e => setEditRule({...editRule, match_config: e.target.value})} className="w-full bg-navy-900 border border-navy-600 rounded-lg px-3 py-2 mt-1 font-mono" /></div>
              <div><label className="text-navy-300 text-xs">payout_multiplier</label>
                <input type="number" step="0.1" value={editRule.payout_multiplier} onChange={e => setEditRule({...editRule, payout_multiplier: +e.target.value})} className="w-full bg-navy-900 border border-navy-600 rounded-lg px-3 py-2 mt-1" /></div>
              <div><label className="text-navy-300 text-xs">stake_unit (สตางค์)</label>
                <input type="number" value={editRule.stake_unit} onChange={e => setEditRule({...editRule, stake_unit: +e.target.value})} className="w-full bg-navy-900 border border-navy-600 rounded-lg px-3 py-2 mt-1" /></div>
              <div><label className="text-navy-300 text-xs">ขั้นต่ำ (สตางค์)</label>
                <input type="number" value={editRule.min_amount} onChange={e => setEditRule({...editRule, min_amount: +e.target.value})} className="w-full bg-navy-900 border border-navy-600 rounded-lg px-3 py-2 mt-1" /></div>
              <div><label className="text-navy-300 text-xs">สูงสุด (สตางค์, เว้นว่าง = ไม่จำกัด)</label>
                <input type="number" value={editRule.max_amount ?? ''} onChange={e => setEditRule({...editRule, max_amount: e.target.value === '' ? null : +e.target.value})} className="w-full bg-navy-900 border border-navy-600 rounded-lg px-3 py-2 mt-1" /></div>
              <div className="sm:col-span-2 flex items-center gap-2">
                <input type="checkbox" checked={!!editRule.is_active} onChange={e => setEditRule({...editRule, is_active: e.target.checked ? 1 : 0})} className="accent-gold-500" />
                <label className="text-navy-200">เปิดใช้งาน</label>
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={saveRule} className="flex-1 bg-gold-500 text-navy-950 font-bold py-2.5 rounded-lg">บันทึก</button>
              <button onClick={() => setEditRule(null)} className="px-5 py-2.5 border border-navy-600 rounded-lg">ยกเลิก</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
