import { useEffect, useState } from 'react';
import { api, satang } from '../api.js';
import { resultSchema } from '../lotterySchema.js';

export default function AdminSettle() {
  const [draws, setDraws] = useState([]);
  const [sel, setSel] = useState(null);
  const [selDraw, setSelDraw] = useState(null);
  const [schema, setSchema] = useState(null);
  const [fields, setFields] = useState({});   // key -> string (หลายรางวัลคั่นด้วย comma)
  const [result, setResult] = useState(null);
  const [err, setErr] = useState('');

  const load = () => api('/admin/draws').then(r =>
    setDraws(r.draws.filter(d => d.status !== 'settled' && d.status !== 'cancelled'))).catch(e => alert(e.message));
  useEffect(load, []);

  useEffect(() => {
    setFields({}); setSchema(null); setResult(null); setErr('');
    if (!sel) { setSelDraw(null); return; }
    const d = draws.find(x => x.id === sel);
    setSelDraw(d);
    setSchema(resultSchema(d?.type_code, d?.category_code));
  }, [sel, draws]);

  const settle = async () => {
    setErr(''); setResult(null);
    const winning = {};
    for (const f of schema?.fields || []) {
      const t = (fields[f.key] || '').trim();
      if (!t) continue;
      const parts = t.split(/[\s,]+/).map(x => x.trim()).filter(Boolean);
      const expected = f.prizes && f.prizes > 1 ? f.prizes : 1;
      // field ที่มีหลายรางวัล → เก็บเป็น array; ถ้ากรอกเลขเดียวก็เก็บ string
      const toVal = (x) => {
        if (!new RegExp(`^\\d{${f.digits}}$`).test(x)) throw new Error(`${f.label} ต้องเป็นตัวเลข ${f.digits} หลัก`);
        return x;
      };
      try {
        if (expected > 1) {
          const arr = parts.map(toVal);
          if (arr.length !== expected) throw new Error(`${f.label} ต้องกรอก ${expected} รางวัล (คั่นด้วย comma) — ตอนนี้ได้ ${arr.length} เลข`);
          winning[f.key] = arr;
        } else {
          if (parts.length !== 1) throw new Error(`${f.label} ต้องเป็นตัวเลข ${f.digits} หลักตัวเดียว`);
          winning[f.key] = toVal(parts[0]);
        }
      } catch (e) { return setErr(e.message); }
    }
    // field เสริมที่ไม่อยู่ใน schema (ถ้ามี) — รับตัวเลขอะไรก็ได้
    for (const [k, v] of Object.entries(fields)) {
      if (winning[k] !== undefined || schema?.fields?.some(f => f.key === k)) continue;
      const t = v.trim();
      if (!t) continue;
      if (!/^\d{1,10}$/.test(t)) return setErr(`field "${k}" ต้องเป็นตัวเลข`);
      winning[k] = t;
    }
    if (!Object.keys(winning).length) return setErr('กรุณากรอกผลรางวัลอย่างน้อย 1 รายการ');
    try {
      const r = await api(`/admin/draws/${sel}/settle`, { method: 'POST', body: { winning_numbers: winning } });
      setResult(r); load();
    } catch (e) { setErr(e.message); }
  };

  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-2xl font-bold text-white">ออกผลรางวัล & คำนวณโพย</h1>
      <div className="bg-yellow-500/10 border border-yellow-500/40 text-yellow-300 text-sm rounded-lg p-3">
        ระบบจะ settle โพยทั้งหมดของรอบนั้นอัตโนมัติและจ่ายเครดิตรางวัลตามกติกา — ช่องกรอกผลอ้างอิงตามโครงสร้างรางวัลจริงของประเทศนั้น ๆ
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
        {sel && selDraw && schema && (
          <>
            <div className="grid sm:grid-cols-2 gap-3">
              {schema.fields.map(f => (
                <div key={f.key}>
                  <label className="text-sm text-navy-300">
                    {f.label}
                    {f.prizes > 1 && <span className="text-gold-400"> ({f.prizes} รางวัล)</span>}
                    {f.optional && <span className="text-navy-500 text-xs"> (ไม่บังคับ)</span>}
                  </label>
                  <input value={fields[f.key] || ''}
                    onChange={e => setFields({...fields, [f.key]: e.target.value.replace(/[^\d,\s]/g, '').slice(0, f.prizes > 1 ? 60 : f.digits)})}
                    className="w-full bg-navy-900 border border-navy-600 rounded-lg px-4 py-3 text-xl font-mono text-center text-gold-300 mt-1"
                    placeholder={f.prizes > 1 ? Array(f.prizes).fill('0'.repeat(f.digits)).join(', ') : '0'.repeat(f.digits)} />
                </div>
              ))}
            </div>
            <p className="text-xs text-navy-400">
              {schema.fields.some(f => f.prizes > 1) && 'รางวัลที่มีหลายเลข ให้คั่นด้วย comma เช่น 12, 34, 56 • '}
              ผลจะถูกบันทึกและหัก/จ่ายเครดิตโพยทั้งหมดในรอบนี้ทันที
            </p>
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
        {sel && !schema && <div className="text-navy-400 text-sm">ไม่พบโครงสร้างผลรางวัลสำหรับประเภทนี้</div>}
      </div>
    </div>
  );
}
