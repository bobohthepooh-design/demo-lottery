import { useEffect, useState } from 'react';
import { api, fmtDateTime, thaiDate } from '../api.js';
import { FlagIcon } from '../components/ResultLine.jsx';
import { sourceBadge } from '../resultSource.js';
import { typeAccent } from '../typeAccent.js';

const STATUS_TH = {
  scheduled: 'กำหนดการ', open: 'เปิดรับแทง', closed: 'ปิดรับแล้ว รอผล',
  settled: 'ออกผลแล้ว', cancelled: 'ยกเลิก',
};

// สรุปผลสั้นๆ ต่อประเภท — แสดง field หลักที่มี
function resultSummary(w) {
  if (!w) return null;
  const parts = [];
  if (w.first) parts.push(`รางวัลที่ 1: ${w.first}`);
  if (w.main) parts.push(`เลขหลัก: ${w.main}`);
  if (w.num4) parts.push(`4 ตัว: ${w.num4}`);
  if (w.top3?.length) parts.push(`บน 3: ${w.top3.join(' ')}`);
  if (w.front3?.length) parts.push(`หน้า 3: ${w.front3.join(' ')}`);
  if (w.last3?.length || w.last3) parts.push(`ท้าย 3: ${Array.isArray(w.last3) ? w.last3.join(' ') : w.last3}`);
  if (w.bottom2) parts.push(`ล่าง 2: ${w.bottom2}`);
  else if (w.last2) parts.push(`ท้าย 2: ${w.last2}`);
  if (w.zodiac) parts.push(`ราศี: ${w.zodiac}`);
  if (w.seq?.length) parts.push(`ลำดับ: ${w.seq.join('-')}`);
  return parts;
}

export default function Results() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');

  const load = () => api('/lottery/today').then(setData).catch(e => setErr(e.message));
  useEffect(() => { load(); const t = setInterval(load, 60000); return () => clearInterval(t); }, []);

  const draws = data?.draws || [];
  const settled = draws.filter(d => d.status === 'settled');
  const pending = draws.filter(d => d.status !== 'settled' && d.status !== 'cancelled');

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-black text-white">ผลรางวัลและตารางออกรางวัล</h1>
        <p className="text-sm text-navy-400 mt-1">{data ? thaiDate(data.date) : '…'} — อัปเดตอัตโนมัติทุก 60 วินาที</p>
      </div>

      {err && <div className="bg-red-500/10 border border-red-500/40 text-red-300 rounded-xl px-4 py-3 text-sm">{err}</div>}

      {/* ตารางวันนี้ — เรียงตามเวลาออก */}
      <section className="bg-navy-800/70 border border-navy-700 rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-navy-700 font-bold text-navy-950">📅 ตารางออกรางวัลวันนี้ ({draws.length} รอบ)</div>
        {!data && <div className="p-4 text-sm text-navy-400">กำลังโหลด…</div>}
        {data && !draws.length && <div className="p-4 text-sm text-navy-400">วันนี้ยังไม่มีรอบออกรางวัล</div>}
        <div className="divide-y divide-navy-700/60">
          {draws.map(d => {
            const ac = typeAccent(d.type_code);
            const badge = sourceBadge(d.result_source);
            const sum = resultSummary(d.winning);
            return (
              <div key={d.id} className="px-4 py-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <FlagIcon code={d.type_code} className="w-5 h-5 text-[9px]" />
                  <span className={`text-sm font-bold ${ac.text}`}>{d.category_name_th || d.type_name_th}</span>
                  <span className="text-[11px] text-navy-400">{d.draw_code}</span>
                  {badge && <span className={`text-[9px] px-1.5 py-0.5 rounded ${badge.cls}`}>{badge.short}</span>}
                  <span className="ml-auto text-[11px] text-navy-400">ออก {fmtDateTime(d.draw_at)}</span>
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                    d.status === 'settled' ? 'bg-emerald-500/20 text-emerald-300'
                    : d.status === 'open' ? 'bg-blue-500/20 text-blue-300'
                    : d.status === 'closed' ? 'bg-amber-500/20 text-amber-300'
                    : 'bg-navy-700 text-navy-300'}`}>
                    {STATUS_TH[d.status] || d.status}
                  </span>
                </div>
                {sum && (
                  <div className="mt-1.5 text-xs text-navy-200 bg-navy-900/60 rounded-lg px-3 py-2 font-mono">
                    {sum.map((p, i) => <div key={i}>{p}</div>)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* สรุปผลที่ออกแล้ว */}
      {settled.length > 0 && (
        <section>
          <h2 className="font-bold text-white mb-3">✅ ออกผลแล้ววันนี้ ({settled.length})</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {settled.map(d => (
              <div key={d.id} className="bg-navy-800/70 border border-emerald-500/30 rounded-xl p-3">
                <div className="flex items-center gap-2">
                  <FlagIcon code={d.type_code} className="w-4 h-4 text-[8px]" />
                  <span className="text-sm font-bold text-navy-950">{d.category_name_th || d.type_name_th}</span>
                </div>
                <div className="mt-1.5 text-[11px] text-navy-300 space-y-0.5">
                  {resultSummary(d.winning)?.map((p, i) => <div key={i} className="font-mono">{p}</div>)}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {pending.length > 0 && (
        <section>
          <h2 className="font-bold text-white mb-3">⏳ รอผล ({pending.length})</h2>
          <div className="flex flex-wrap gap-2">
            {pending.map(d => (
              <span key={d.id} className="text-xs bg-navy-800 border border-navy-700 rounded-full px-3 py-1.5 text-navy-200">
                {d.category_name_th || d.type_name_th} · {fmtDateTime(d.draw_at)}
              </span>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
