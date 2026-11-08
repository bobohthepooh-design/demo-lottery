import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { DEFAULT_BANNER } from '../bannerConfig.js';

const FIELDS = [
  { key: 'enabled', label: 'แสดงแบนเนอร์', type: 'checkbox' },
  { key: 'emoji', label: 'อีโมจิหัวแบนเนอร์' },
  { key: 'title', label: 'หัวข้อหลัก' },
  { key: 'markets', label: 'บรรทัดรายชื่อหวย (คั่นด้วย •)' },
  { key: 'promo', label: 'ข้อความโปรโมชัน' },
  { key: 'cta_bet', label: 'ข้อความปุ่มแทงหวย' },
  { key: 'cta_register', label: 'ข้อความปุ่มสมัครสมาชิก' },
  { key: 'show_stats', label: 'แสดงแถบสถิติ (รอบเปิดรับ/ตลาด/อัตราจ่าย)', type: 'checkbox' },
];

export default function AdminBanner() {
  const [form, setForm] = useState(DEFAULT_BANNER);
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api('/admin/settings').then(r => {
      const s = r.settings.find(x => x.key === 'homepage_banner');
      if (s?.value && typeof s.value === 'object') setForm({ ...DEFAULT_BANNER, ...s.value });
    }).catch(e => setMsg('ERROR: ' + e.message))
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setMsg('');
    try {
      await api('/admin/settings/homepage_banner', { method: 'PUT', body: { value: form } });
      setMsg('บันทึกแบนเนอร์แล้ว — หน้าแรกจะอัปเดตทันที');
    } catch (e) { setMsg('ERROR: ' + e.message); }
  };

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  if (loading) return <div className="text-navy-300">กำลังโหลด...</div>;

  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-white">จัดการแบนเนอร์หน้าแรก</h1>
        <p className="text-sm text-navy-300 mt-1">แก้ไขข้อความและปุ่มบนแบนเนอร์ด้านบนของหน้าแรก — บันทแล้วมีผลทันที</p>
      </div>
      {msg && <div className={`text-sm rounded-lg p-3 border ${msg.startsWith('ERROR') ? 'text-red-400 bg-red-500/10 border-red-500/30' : 'text-green-400 bg-green-500/10 border-green-500/30'}`}>{msg}</div>}

      {/* Preview */}
      <div className="bg-navy-800/60 border border-navy-700 rounded-xl p-4">
        <div className="text-xs text-navy-400 mb-2">ตัวอย่าง (ใกล้เคียงของจริง)</div>
        <div className="rounded-xl border border-gold-500/40 bg-gradient-to-br from-navy-800 to-navy-950 px-4 py-5 text-center">
          <div className="text-2xl mb-1">{form.emoji}</div>
          <div className="text-lg font-black text-gold-400">{form.title}</div>
          <div className="text-xs text-navy-300 mt-1">{form.markets}</div>
          <div className="text-xs text-gold-300/90 mt-1">{form.promo}</div>
          <div className="flex justify-center gap-2 mt-3">
            <span className="text-xs bg-gold-500 text-navy-950 font-bold px-4 py-1.5 rounded-lg">{form.cta_bet}</span>
            <span className="text-xs border border-gold-500/50 text-gold-300 px-4 py-1.5 rounded-lg">{form.cta_register}</span>
          </div>
        </div>
      </div>

      <div className="bg-navy-800 border border-navy-700 rounded-xl divide-y divide-navy-700">
        {FIELDS.map(f => (
          <div key={f.key} className="p-4 flex items-center gap-4">
            <label className="w-64 shrink-0 text-sm text-navy-200">{f.label}</label>
            {f.type === 'checkbox' ? (
              <input type="checkbox" checked={!!form[f.key]} onChange={e => set(f.key, e.target.checked)}
                className="w-5 h-5 accent-gold-500" />
            ) : (
              <input value={form[f.key] ?? ''} onChange={e => set(f.key, e.target.value)}
                className="flex-1 bg-navy-900 border border-navy-600 rounded-lg px-3 py-2 text-sm" />
            )}
          </div>
        ))}
      </div>

      <div className="flex gap-3">
        <button onClick={save} className="bg-gold-500 text-navy-950 font-bold px-6 py-2.5 rounded-lg hover:bg-gold-400">บันทึกแบนเนอร์</button>
        <button onClick={() => setForm(DEFAULT_BANNER)} className="border border-navy-600 text-navy-200 px-5 py-2.5 rounded-lg hover:bg-navy-700">คืนค่าเริ่มต้น</button>
      </div>
    </div>
  );
}
