import { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function AdminSettings() {
  const [settings, setSettings] = useState([]);
  const [edits, setEdits] = useState({});
  const [msg, setMsg] = useState('');

  const load = () => api('/admin/settings').then(r => {
    setSettings(r.settings);
    const m = {};
    r.settings.forEach(s => { m[s.key] = typeof s.value === 'object' ? JSON.stringify(s.value) : String(s.value); });
    setEdits(m);
  }).catch(e => alert(e.message));
  useEffect(load, []);

  const save = async (key) => {
    let value = edits[key];
    try { value = JSON.parse(value); } catch {}
    try {
      await api(`/admin/settings/${key}`, { method: 'PUT', body: { value } });
      setMsg(`บันทึก ${key} แล้ว`); load();
    } catch (e) { setMsg('ERROR: ' + e.message); }
  };

  return (
    <div className="max-w-3xl space-y-4">
      <h1 className="text-2xl font-bold text-white">ตั้งค่าระบบ (System Configuration)</h1>
      {msg && <div className="text-sm text-gold-300 bg-navy-800 border border-navy-700 rounded-lg p-3">{msg}</div>}
      <div className="bg-navy-800 border border-navy-700 rounded-xl divide-y divide-navy-700">
        {settings.map(s => (
          <div key={s.key} className="p-4 flex items-center gap-4">
            <div className="w-56 shrink-0">
              <code className="text-gold-300 text-sm">{s.key}</code>
              <div className="text-[10px] text-navy-400">updated {s.updatedAt}</div>
            </div>
            <input value={edits[s.key] ?? ''} onChange={e => setEdits({...edits, [s.key]: e.target.value})}
              className="flex-1 bg-navy-900 border border-navy-600 rounded-lg px-3 py-2 text-sm font-mono" />
            <button onClick={() => save(s.key)} className="text-sm bg-navy-700 hover:bg-navy-600 text-gold-300 px-4 py-2 rounded-lg">บันทึก</button>
          </div>
        ))}
        {!settings.length && <div className="p-6 text-center text-navy-400">ไม่มีการตั้งค่า</div>}
      </div>
      <div className="text-xs text-navy-400">หมายเหตุ: การตั้งค่าเช่น initial_credit มีผลกับสมาชิกใหม่เท่านั้น</div>
    </div>
  );
}
