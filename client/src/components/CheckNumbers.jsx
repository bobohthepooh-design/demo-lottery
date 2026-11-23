import { useEffect, useState } from 'react';
import { api, fmtDateTime, drawLabel } from '../api.js';
import { FlagIcon } from './ResultLine.jsx';

// ตรวจเลข — ใส่เลข + เลือกรอบที่ออกผลแล้ว → บอกว่าถูกรางวัลอะไร (ไม่ต้อง login)
export default function CheckNumbers() {
  const [draws, setDraws] = useState([]);
  const [drawId, setDrawId] = useState('');
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    api('/lottery/draws?status=settled').then(r => {
      // เฉพาะหวยจริง — ตัดเกมด่วน/ราศี (SC,HL,KI,CF,HR) ออก ไม่ให้ตรวจ
      const INSTANT = new Set(['SC', 'HL', 'KI', 'CF', 'HR']);
      const settled = (r.draws || []).filter(d => d.status === 'settled' && !INSTANT.has(d.type_code));
      setDraws(settled.slice(0, 60));
      if (settled[0]) setDrawId(String(settled[0].id));
    }).catch(() => {});
  }, []);

  const check = async () => {
    if (!drawId || !input.trim()) return;
    setLoading(true); setErr(''); setResult(null);
    try {
      const r = await api(`/lottery/check?draw_id=${drawId}&numbers=${encodeURIComponent(input.trim())}`);
      setResult(r);
    } catch (e) { setErr(e.message || 'ตรวจเลขไม่สำเร็จ'); }
    finally { setLoading(false); }
  };

  const sel = draws.find(d => String(d.id) === drawId);

  return (
    <section className="bg-navy-800/70 border border-navy-700 rounded-2xl p-4 sm:p-5">
      <h2 className="font-bold text-navy-950 text-base mb-1">🔍 ตรวจเลข</h2>
      <p className="text-xs text-navy-400 mb-3">ใส่เลขที่ต้องการตรวจ (คั่นด้วยช่องว่างหรือ ,) — ระบบจะบอกว่าถูกรางวัลอะไรบ้างของงวดที่เลือก</p>

      <div className="flex flex-col sm:flex-row gap-2 mb-3">
        <select value={drawId} onChange={e => { setDrawId(e.target.value); setResult(null); }}
          className="flex-1 bg-navy-900 border border-navy-700 rounded-lg px-3 py-2.5 text-sm text-white">
          {draws.map(d => (
            <option key={d.id} value={d.id}>
              {drawLabel(d)} — {d.category_name_th || d.type_name_th} ({fmtDateTime(d.draw_at)})
            </option>
          ))}
          {!draws.length && <option value="">— ยังไม่มีงวดที่ออกผล —</option>}
        </select>
      </div>

      <div className="flex gap-2">
        <input value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && check()}
          placeholder="เช่น 123 45 7"
          className="flex-1 bg-navy-900 border border-navy-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-navy-500"
          maxLength={200} />
        <button onClick={check} disabled={loading || !drawId || !input.trim()}
          className="bg-gold-500 hover:bg-gold-400 disabled:opacity-50 text-navy-950 font-bold px-5 py-2.5 rounded-lg text-sm">
          {loading ? 'กำลังตรวจ…' : 'ตรวจ'}
        </button>
      </div>

      {err && <div className="mt-3 text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">{err}</div>}

      {result && (
        <div className="mt-4 space-y-2">
          <div className="text-xs text-navy-400 flex items-center gap-1.5">
            {sel && <FlagIcon code={sel.type_code} className="w-4 h-4 text-[8px]" />}
            ผลงวด {drawLabel(result.draw)} — {result.draw.category_name_th || result.draw.type_name_th}
          </div>
          {result.numbers.map(n => (
            <div key={n.number} className="bg-navy-900/70 border border-navy-700 rounded-lg px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-gold-300 text-sm">{n.number}</span>
                {n.hits.length === 0
                  ? <span className="text-xs text-navy-500">ไม่ถูกรางวัล</span>
                  : n.hits.map((h, i) => (
                    <span key={i} className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                      ✅ {h.name} ({h.kind} x{h.mult})
                    </span>
                  ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
