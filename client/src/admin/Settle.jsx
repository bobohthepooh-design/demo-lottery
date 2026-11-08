import { useEffect, useState } from 'react';
import { api, satang } from '../api.js';

const SOURCE_LABELS = {
  top3: '3 ตัวบน (top3)',
  bottom2: '2 ตัวล่าง (bottom2)',
  front3: '3 ตัวหน้า (front3)',
  back3: '3 ตัวหลัง (back3)',
  main: 'เลขหลัก (main)',
  first: 'รางวัลที่ 1 (first)',
};

export default function AdminSettle() {
  const [draws, setDraws] = useState([]);
  const [sel, setSel] = useState(null);
  const [selDraw, setSelDraw] = useState(null);
  const [sources, setSources] = useState([]);
  const [fields, setFields] = useState({});
  const [result, setResult] = useState(null);
  const [err, setErr] = useState('');

  const load = () => api('/admin/draws').then(r =>
    setDraws(r.draws.filter(d => d.status !== 'settled' && d.status !== 'cancelled'))).catch(e => alert(e.message));
  useEffect(load, []);

  // when draw selected → load rules of its type → derive result fields from match_config sources
  useEffect(() => {
    setFields({}); setSources([]); setResult(null); setErr('');
    if (!sel) { setSelDraw(null); return; }
    const d = draws.find(x => x.id === sel);
    setSelDraw(d);
    api(`/lottery/types/${d.lottery_type_id}`).then(t => {
      const srcs = [...new Set(t.rules.map(r => { try { return JSON.parse(r.match_config).source; } catch { return null; } }).filter(Boolean))];
      setSources(srcs);
      setFields(Object.fromEntries(srcs.map(s => [s, ''])));
    }).catch(() => {});
  }, [sel, draws]);

  const settle = async () => {
    setErr(''); setResult(null);
    const winning = {};
    for (const [k, v] of Object.entries(fields)) if (v.trim()) winning[k] = v.trim();
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
        ระบบจะ settle โพยทั้งหมดของรอบนั้นอัตโนมัติ และจ่ายเครดิตรางวัลตามกติกาใน lottery_rules (แหล่งข้อมูล field มาจาก match_config ของกติกาแต่ละประเภท)
      </div>
      <div className="bg-navy-800 border border-navy-700 rounded-xl p-5 space-y-4">
        <div>
          <label className="text-sm text-navy-300">เลือกรอบหวย</label>
          <select value={sel || ''} onChange={e => setSel(e.target.value ? Number(e.target.value) : null)}
            className="w-full bg-navy-900 border border-navy-600 rounded-lg px-3 py-2.5 mt-1">
            <option value="">— เลือกรอบ —</option>
            {draws.map(d => <option key={d.id} value={d.id}>{d.draw_code} ({d.type_name_th}) — {d.status}</option>)}
          </select>
        </div>
        {sel && selDraw && (
          <>
            <div className="text-xs text-navy-400">field ผลรางวัลที่ต้องกรอก (อ้างอิงจากกติกาของ {selDraw.type_name_th}):</div>
            <div className="grid sm:grid-cols-2 gap-3">
              {sources.map(src => (
                <div key={src}>
                  <label className="text-sm text-navy-300">{SOURCE_LABELS[src] || src}</label>
                  <input value={fields[src] || ''} onChange={e => setFields({...fields, [src]: e.target.value.replace(/\D/g, '').slice(0, 10)})}
                    className="w-full bg-navy-900 border border-navy-600 rounded-lg px-4 py-3 text-xl font-mono text-center text-gold-300 mt-1" placeholder="000" />
                </div>
              ))}
            </div>
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
