import { useEffect, useState, useCallback } from 'react';
import { api, fmtDateTime } from '../api.js';
import { sourceBadge, marketInfo, MODE_BADGE, isOfficial } from '../resultSource.js';
import { Card, CardBody } from '../components/ui/index.js';

// หน้าสุขภาพระบบ — /api/admin/health (sources ผลล่าสุด, รอบค้าง, สถิติรวม)
// refresh อัตโนมัติทุก 30 วิ

const age = (ts) => {
  if (!ts) return null;
  const t = new Date(String(ts).replace(' ', 'T') + 'Z').getTime();
  if (!Number.isFinite(t)) return null;
  const m = Math.floor((Date.now() - t) / 60000);
  if (m < 60) return `${m} นาที`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h} ชม.`;
  return `${Math.floor(h / 24)} วัน`;
};

function Stat({ label, value, tone }) {
  const cls = { green: 'text-green-300', red: 'text-red-300', gold: 'text-gold-300', blue: 'text-sky-300' }[tone] || 'text-white';
  return (
    <Card><CardBody className="text-center py-4">
      <div className={`text-2xl font-black ${cls}`}>{value ?? '—'}</div>
      <div className="text-xs text-navy-400 mt-1">{label}</div>
    </CardBody></Card>
  );
}

export default function AdminHealth() {
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  const [updated, setUpdated] = useState(null);

  const load = useCallback(() => {
    api('/admin/health').then(r => { setD(r); setErr(''); setUpdated(new Date()); })
      .catch(e => setErr(e.message));
  }, []);
  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  const counts = d?.counts || {};
  const overdue = d?.overdue || [];
  const sources = d?.sources || [];
  // ภาพรวม: แดงถ้ามีรอบค้าง, เหลืองถ้ามี source เงียบ >36ชม., เขียวปกติ
  const staleSources = sources.filter(s => s.last_at && (Date.now() - new Date(String(s.last_at).replace(' ', 'T') + 'Z').getTime()) > 36 * 3600e3);
  const overall = overdue.length ? 'bad' : staleSources.length ? 'warn' : 'ok';
  const banner = {
    ok: { cls: 'border-green-500/40 bg-green-500/10 text-green-300', txt: '🟢 ระบบปกติ — ไม่มีรอบค้าง ผลทุกแหล่งอัปเดตอยู่' },
    warn: { cls: 'border-amber-500/40 bg-amber-500/10 text-amber-300', txt: `🟡 ระบบทำงาน แต่มีแหล่งผลเงียบ >36 ชม. ${staleSources.length} แหล่ง` },
    bad: { cls: 'border-red-500/50 bg-red-500/10 text-red-300', txt: `🔴 มีรอบค้างออกผล ${overdue.length} รอบ — ตรวจแหล่งผล/ตั้งผลเอง` },
  }[overall];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-white">สุขภาพระบบ</h1>
          <p className="text-sm text-navy-300">แหล่งผลรางวัล • รอบค้าง • สถิติรวม — refresh อัตโนมัติทุก 30 วิ</p>
        </div>
        <div className="text-xs text-navy-400">อัปเดต {updated ? updated.toLocaleTimeString('th-TH') : '—'}</div>
      </div>

      {err && <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg p-3">โหลดไม่สำเร็จ: {err}</div>}

      {d && (
        <>
          <div className={`border rounded-2xl px-4 py-3 text-sm font-semibold ${banner.cls}`}>{banner.txt}</div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat label="รอบเปิดรับ" value={counts.open} tone="green" />
            <Stat label="รอบกำหนดการ" value={counts.scheduled} tone="blue" />
            <Stat label="ออกผลวันนี้" value={counts.settledToday} tone="gold" />
            <Stat label="โพยรอผล" value={counts.pendingBets} tone="red" />
          </div>

          {/* แหล่งผลรางวัล */}
          <Card>
            <CardBody>
              <h2 className="font-bold text-white mb-3">📡 แหล่งผลรางวัล ({sources.length})</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[640px]">
                  <thead className="text-navy-400 text-xs">
                    <tr>
                      <th className="text-left py-1.5 pr-4">Source</th>
                      <th className="text-left py-1.5 pr-4">Badge</th>
                      <th className="text-left py-1.5 pr-4">ผลล่าสุด</th>
                      <th className="text-left py-1.5 pr-4">อายุผล</th>
                      <th className="text-left py-1.5 pr-4">รอบล่าสุด</th>
                      <th className="text-left py-1.5 pr-4">ตลาด</th>
                      <th className="text-right py-1.5">จำนวนผล</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-navy-700/60">
                    {sources.map(s => {
                      const badge = sourceBadge(s.source);
                      const a = age(s.last_at);
                      const stale = a && /วัน|ชม/.test(a) && !a.startsWith('0') && (s.last_at && (Date.now() - new Date(String(s.last_at).replace(' ', 'T') + 'Z').getTime()) > 36 * 3600e3);
                      const mi = s.last ? marketInfo(s.last.type_code || '', s.last.cat_code || '') : null;
                      return (
                        <tr key={s.source}>
                          <td className="py-2 pr-4 font-mono text-xs text-navy-200">{s.source}</td>
                          <td className="py-2 pr-4"><span className={`text-[10px] font-bold px-2 py-0.5 rounded ${badge?.cls || 'bg-navy-700 text-navy-300'}`}>{badge?.short || s.source}</span></td>
                          <td className={`py-2 pr-4 text-xs ${stale ? 'text-amber-300' : 'text-green-300'}`}>{s.last_at ? fmtDateTime(s.last_at) : '—'}</td>
                          <td className={`py-2 pr-4 text-xs ${stale ? 'text-amber-300 font-bold' : 'text-navy-400'}`}>{a || '—'}{stale ? ' ⚠️' : ''}</td>
                          <td className="py-2 pr-4 text-xs text-navy-300">{s.last?.draw_code || '—'}</td>
                          <td className="py-2 pr-4 text-xs text-navy-300">
                            {s.last ? `${s.last.type_name_th || ''}${s.last.cat_name_th ? ' — ' + s.last.cat_name_th : ''}` : '—'}
                            {mi && <span className={`ml-1 text-[9px] px-1 py-0.5 rounded border ${MODE_BADGE[mi.mode]?.cls || ''}`}>{MODE_BADGE[mi.mode]?.label || mi.mode}</span>}
                            {mi && isOfficial(mi) && <span className="ml-1 text-[9px] text-emerald-300">✓ทางการ</span>}
                          </td>
                          <td className="py-2 text-right text-xs text-navy-300">{s.total}</td>
                        </tr>
                      );
                    })}
                    {!sources.length && <tr><td colSpan={7} className="py-4 text-center text-navy-400 text-xs">ยังไม่มีผลรางวัลในระบบ</td></tr>}
                  </tbody>
                </table>
              </div>
              <div className="text-[11px] text-navy-500 mt-3">
                ⚠️ = ผลเก่าเกิน 36 ชม. — แหล่งอาจหยุดอัปเดต • ✓ทางการ = ผลจากแหล่ง government เท่านั้น
              </div>
            </CardBody>
          </Card>

          {/* รอบค้างออกผล */}
          {overdue.length > 0 && (
            <Card variant="danger">
              <CardBody>
                <h2 className="font-bold text-red-300 mb-3">⚠️ รอบค้างออกผล ({overdue.length})</h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[560px]">
                    <thead className="text-navy-400 text-xs">
                      <tr><th className="text-left py-1.5 pr-4">รอบ</th><th className="text-left py-1.5 pr-4">ตลาด</th><th className="text-left py-1.5 pr-4">เวลาที่ควรออก</th><th className="text-left py-1.5">สถานะ</th></tr>
                    </thead>
                    <tbody className="divide-y divide-navy-700/60">
                      {overdue.map(drow => {
                        const late = Date.now() - new Date(String(drow.draw_at).replace(' ', 'T') + 'Z').getTime();
                        const lateH = Math.floor(late / 3600e3);
                        return (
                          <tr key={drow.id}>
                            <td className="py-2 pr-4 font-mono text-xs text-navy-200">{drow.draw_code}</td>
                            <td className="py-2 pr-4 text-xs text-navy-200">{drow.type_name_th}{drow.cat_name_th ? ` — ${drow.cat_name_th}` : ''}</td>
                            <td className="py-2 pr-4 text-xs text-navy-300">{fmtDateTime(drow.draw_at)}</td>
                            <td className="py-2 text-xs">
                              <span className="text-red-300 font-bold">ค้างมา {lateH >= 24 ? `${Math.floor(lateH / 24)} วัน ` : ''}{lateH % 24} ชม.</span>
                              <span className="text-navy-500 ml-1">({drow.status})</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="text-[11px] text-navy-400 mt-3">
                  วิธีแก้: รอตัวดึงผลรอบถัดไป • ถ้าแหล่งภายนอกไม่มีผลจริง → admin กรอกผลเองที่ หน้ารอบหวย → ออกผล
                </div>
              </CardBody>
            </Card>
          )}
        </>
      )}
      {!d && !err && <div className="text-navy-300">กำลังโหลด...</div>}
    </div>
  );
}
