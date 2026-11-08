import { useEffect, useState } from 'react';
import { api, satang } from '../api.js';

const SOURCE_LABELS = {
  first: 'รางวัลที่ 1 (first)', num4: 'เลข 4 ตัว (num4)', last4: 'เลขท้าย 4 ตัว (last4)',
  front3: 'เลขหน้า 3 ตัว (front3)', top3: 'เลขท้าย/3 ตัวบน (top3)', last3: 'เลขท้าย 3 ตัว (last3)',
  top2: 'เลข 2 ตัวบน (top2)', bottom2: 'เลขท้าย/2 ตัวล่าง (bottom2)', last2: 'เลขท้าย 2 ตัว (last2)',
  main: 'เลขหลัก (main)',
};

export default function AdminSettle() {
  const [draws, setDraws] = useState([]);
  const [sel, setSel] = useState(null);
  const [selDraw, setSelDraw] = useState(null);
  const [sources, setSources] = useState([]);
  const [fields, setFields] = useState({});   // key -> string
  const [multi, setMulti] = useState({});     // key -> bool (หลายรางวัล)
  const [result, setResult] = useState(null);
  const [err, setErr] = useState('');

  const load = () => api('/admin/draws').then(r =>
    setDraws(r.draws.filter(d => d.status !== 'settled' && d.status !== 'cancelled'))).catch(e => alert(e.message));
  useEffect(load, []);

  useEffect(() => {
    setFields({}); setSources([]); setMulti({}); setResult(null); setErr('');
    if (!sel) { setSelDraw(null); return; }
    const d = draws.find(x => x.id === sel);
    setSelDraw(d);
    api(`/lottery/draws/${sel}/rules`).then(r => {
      const srcs = [...new Set(r.rules.map(x => { try { return JSON.parse(x.match_config).source; } catch { return null; } }).filter(Boolean))];
      setSources(srcs);
      setFields(Object.fromEntries(srcs.map(s => [s, ''])));
    }).catch(e => setErr(e.message));
  }, [sel, draws]);

  const settle = async () => {
    setErr(''); setResult(null);
    const winning = {};
    for (const [k, v] of Object.entries(fields)) {
      const t = v.trim();
      if (!t) continue;
      if (multi[k]) {
        const arr = t.split(/[,\s]+/).map(x => x.trim()).filter(x => /^\d{1,10}$/.test(x));
        if (arr.length) winning[k] = arr;
      } else {
        if (!/^\d{1,10}$/.test(t)) return setErr(`field "${k}" ต้องเป็นตัวเลข`);
        winning[k] = t;
      }
    }
    if (!Object.keys(winning).length) return setErr('กรอกผลรางวัลอย่างน้อย 1 field');
    try {
      const r = await api(`/admin/draws/${sel}/settle`, { method: 'POST', body: { winning_numbers: winning } });
      setResult(r); load();
    } catch (e) { setErr(e.message); }
  };

  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-2xl font-bold text-white">ออกผลรางวัล & คำนวณโพย</h1>
      <div className="bg-yellow-500/10 border border-yellow-500/40 text-yellow-300 text-sm rounded-lg p-3">
        ระบบจะ settle โพยทั้งหมดของรอบนั้นอัตโนมัติ และจ่ายเครดิตรางวัลตามกติกาใน lottery_rules — ช่องกรอก field มาจาก match_config ของกติกาประเภทนั้นโดยตรง
      </div>
      <div className="bg-navy-800 border border-navy-700 rounded-xl p-5 space-y-4">
        <div>
          <label className="text-sm text-navy-300">เลือกรอบหวย</label>
          <select value={sel || ''} onChange={e => setSel(e.target.value ? Number(e.target.value) : null)}
            className="w-full bg-navy-900 border border-navy-600 rounded-lg px-3 py-2.5 mt-1">
            <option value="">— เลือกรอบ —</option>
            {draws.map(d => <option key={d.id} value={d.id}>{d.draw_code} ({d.type_name_th}{d.category_name_th ? ' — ' + d.category_name_th : ''}) — {d.status}</option>)}
          </select>
        </div>
        {sel && selDraw && (
          <>
            <div className="grid sm:grid-cols-2 gap-3">
              {sources.map(src => (
                <div key={src}>
                  <div className="flex items-center justify-between">
                    <label className="text-sm text-navy-300">{SOURCE_LABELS[src] || src}</label>
                    <label className="text-[10px] text-navy-400 flex items-center gap-1">
                      <input type="checkbox" checked={!!multi[src]} onChange={e => setMulti({...multi, [src]: e.target.checked})} className="accent-gold-500" />
                      หลายรางวัล
                    </label>
                  </div>
                  <input value={fields[src] || ''}
                    onChange={e => setFields({...fields, [src]: e.target.value.replace(multi[src] ? /[^\d,\s]/g : /\D/g, '').slice(0, multi[src] ? 120 : 10)})}
                    className="w-full bg-navy-900 border border-navy-600 rounded-lg px-4 py-3 text-xl font-mono text-center text-gold-300 mt-1"
                    placeholder={multi[src] ? 'เช่น 12,34,56' : '000'} />
                </div>
              ))}
            </div>
            <p className="text-xs text-navy-400">"หลายรางวัล" ใช้กับหวยที่มีหลายเลข เช่น หวยลาวพัฒนา (เลขท้าย 2 ตัว 5 รางวัล) — คั่นด้วย comma</p>
            {err && <div className="text-red-400 text-sm">{err}</div>}
            {result && (
              <div className="bg-green-500/10 border border-green-500/40 rounded-lg p-4 text-sm text-green-300">
                ออกผลสำเร็จ: ตรวจ {result.settledItems} รายการ • ถูกรางวัล {result.winningItems} รายการ • จ่ายรวม ฿{satang(result.totalPayout)}
              </div>
            )}
            <button onClick={settle} className="w-full bg-gold-500 text-navy-950 font-bold py-3 rounded-lg hover:bg-gold-400">
              ยืนยันออกผลและ settle โพยทั้งหมด
            </button>
          </>
        )}
      </div>
    </div>
  );
}
