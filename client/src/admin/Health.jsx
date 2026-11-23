import { useEffect, useState, useCallback } from 'react';
import { api, fmtDateTime } from '../api.js';
import { sourceBadge, marketInfo, MODE_BADGE, isOfficial } from '../resultSource.js';
import { Card, CardBody } from '../components/ui/index.js';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/shadcn/table.jsx';

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
  const [infra, setInfra] = useState(null);
  const [backups, setBackups] = useState([]);
  const [canBackup, setCanBackup] = useState(false);
  const [incidents, setIncidents] = useState([]);
  const [incForm, setIncForm] = useState({ title: '', severity: 'medium', detail: '' });
  const [err, setErr] = useState('');
  const [updated, setUpdated] = useState(null);

  const load = useCallback(() => {
    api('/admin/health').then(r => { setD(r); setErr(''); setUpdated(new Date()); })
      .catch(e => setErr(e.message));
    api('/admin/infra').then(setInfra).catch(() => {});
    api('/admin/backups').then(r => { setBackups(r.backups || []); setCanBackup(true); }).catch(() => setCanBackup(false));
    api('/admin/incidents').then(r => setIncidents(r.incidents || [])).catch(() => {});
  }, []);

  const createBackup = async () => {
    try {
      const r = await api('/admin/backups', { method: 'POST', body: {} });
      alert(`สร้าง backup แล้ว: ${r.file} (${(r.sizeBytes / 1024).toFixed(0)} KB, ${r.rows} rows)`);
      load();
    } catch (e) { alert(e.message); }
  };

  const createIncident = async () => {
    if (incForm.title.trim().length < 3) return;
    try {
      await api('/admin/incidents', { method: 'POST', body: incForm });
      setIncForm({ title: '', severity: 'medium', detail: '' });
      load();
    } catch (e) { alert(e.message); }
  };

  const setIncidentStatus = async (inc, status) => {
    try { await api(`/admin/incidents/${inc.id}`, { method: 'PATCH', body: { status } }); load(); }
    catch (e) { alert(e.message); }
  };
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
              <Table>
                <TableHeader>
                  <TableRow className="border-navy-700/60 hover:bg-transparent">
                    <TableHead className="text-navy-400">Source</TableHead>
                    <TableHead className="text-navy-400">Badge</TableHead>
                    <TableHead className="text-navy-400">ผลล่าสุด</TableHead>
                    <TableHead className="text-navy-400">อายุผล</TableHead>
                    <TableHead className="text-navy-400">รอบล่าสุด</TableHead>
                    <TableHead className="text-navy-400">ตลาด</TableHead>
                    <TableHead className="text-navy-400 text-right">จำนวนผล</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sources.map(s => {
                    const badge = sourceBadge(s.source);
                    const a = age(s.last_at);
                    const stale = a && /วัน|ชม/.test(a) && !a.startsWith('0') && (s.last_at && (Date.now() - new Date(String(s.last_at).replace(' ', 'T') + 'Z').getTime()) > 36 * 3600e3);
                    const mi = s.last ? marketInfo(s.last.type_code || '', s.last.cat_code || '') : null;
                    return (
                      <TableRow key={s.source} className="border-navy-700/50">
                        <TableCell className="font-mono text-xs text-navy-200">{s.source}</TableCell>
                        <TableCell><span className={`text-[10px] font-bold px-2 py-0.5 rounded ${badge?.cls || 'bg-navy-700 text-navy-300'}`}>{badge?.short || s.source}</span></TableCell>
                        <TableCell className={`text-xs ${stale ? 'text-amber-300' : 'text-green-300'}`}>{s.last_at ? fmtDateTime(s.last_at) : '—'}</TableCell>
                        <TableCell className={`text-xs ${stale ? 'text-amber-300 font-bold' : 'text-navy-400'}`}>{a || '—'}{stale ? ' ⚠️' : ''}</TableCell>
                        <TableCell className="text-xs text-navy-300">{s.last?.draw_code || '—'}</TableCell>
                        <TableCell className="text-xs text-navy-300">
                          {s.last ? `${s.last.type_name_th || ''}${s.last.cat_name_th ? ' — ' + s.last.cat_name_th : ''}` : '—'}
                          {mi && <span className={`ml-1 text-[9px] px-1 py-0.5 rounded border ${MODE_BADGE[mi.mode]?.cls || ''}`}>{MODE_BADGE[mi.mode]?.label || mi.mode}</span>}
                          {mi && isOfficial(mi) && <span className="ml-1 text-[9px] text-emerald-300">✓ทางการ</span>}
                        </TableCell>
                        <TableCell className="text-right text-xs text-navy-300">{s.total}</TableCell>
                      </TableRow>
                    );
                  })}
                  {!sources.length && <TableRow><TableCell colSpan={7} className="text-center text-navy-400 text-xs py-4">ยังไม่มีผลรางวัลในระบบ</TableCell></TableRow>}
                </TableBody>
              </Table>
              <div className="text-[11px] text-navy-500 mt-3">
                ⚠️ = ผลเก่าเกิน 36 ชม. — แหล่งอาจหยุดอัปเดต • ✓ทางการ = ผลจากแหล่ง government เท่านั้น
              </div>
            </CardBody>
          </Card>

          {/* สถานะการดึงผลล่าสุดของแต่ละ source (รวม fallback) */}
          {(d?.fetchHealth || []).length > 0 && (
            <Card>
              <CardBody>
                <h2 className="font-bold text-white mb-3">🔄 การดึงผลอัตโนมัติ (source chain + fallback)</h2>
                <div className="flex flex-wrap gap-2">
                  {d.fetchHealth.map(h => (
                    <div key={h.label} className={`text-[11px] px-2.5 py-1.5 rounded-lg border ${h.ok === false ? 'border-red-500/40 bg-red-500/10 text-red-300' : 'border-green-500/30 bg-green-500/5 text-green-300'}`}>
                      <span className="font-bold">{h.label}</span>
                      <span className="text-navy-400 ml-1">{h.ok === false ? `✕ ${h.lastError || 'error'}` : `✓ ${age(h.lastOkAt) || '—'}`}</span>
                    </div>
                  ))}
                </div>
                <div className="text-[11px] text-navy-500 mt-2">✓ = ดึงสำเร็จล่าสุด • ✕ = ดึงล้มเหลวล่าสุด (ระบบจะลอง source ถัดไปใน chain อัตโนมัติ)</div>
              </CardBody>
            </Card>
          )}

          {/* โครงสร้างระบบ — uptime/memory/db size/table counts/migration */}
          {infra && (
            <Card>
              <CardBody>
                <h2 className="font-bold text-white mb-3">🖥️ โครงสร้างระบบ</h2>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div className="bg-navy-800/60 rounded-lg p-3"><div className="text-navy-400">Uptime</div><div className="text-white font-bold mt-1">{Math.floor(infra.uptimeSec / 3600)} ชม. {Math.floor(infra.uptimeSec % 3600 / 60)} นาที</div></div>
                  <div className="bg-navy-800/60 rounded-lg p-3"><div className="text-navy-400">Node / env</div><div className="text-white font-bold mt-1">{infra.node} • {infra.env}</div></div>
                  <div className="bg-navy-800/60 rounded-lg p-3"><div className="text-navy-400">หน่วยความจำ (heap)</div><div className="text-white font-bold mt-1">{(infra.memory.heapUsed / 1048576).toFixed(0)} / {(infra.memory.heapTotal / 1048576).toFixed(0)} MB</div></div>
                  <div className="bg-navy-800/60 rounded-lg p-3"><div className="text-navy-400">ขนาดฐานข้อมูล</div><div className="text-white font-bold mt-1">{infra.dbSizeBytes ? `${(infra.dbSizeBytes / 1048576).toFixed(1)} MB` : '—'}</div></div>
                  <div className="bg-navy-800/60 rounded-lg p-3"><div className="text-navy-400">Migration ล่าสุด</div><div className="text-white font-bold mt-1 font-mono text-[11px]">{infra.latestMigration?.version || '—'}</div></div>
                  <div className="bg-navy-800/60 rounded-lg p-3"><div className="text-navy-400">สมาชิก / โพย</div><div className="text-white font-bold mt-1">{infra.tableCounts?.users ?? '—'} / {infra.tableCounts?.bet_slips ?? '—'}</div></div>
                  <div className="bg-navy-800/60 rounded-lg p-3"><div className="text-navy-400">Audit / Security logs</div><div className="text-white font-bold mt-1">{infra.tableCounts?.audit_logs ?? '—'} / {infra.tableCounts?.security_events ?? '—'}</div></div>
                  <div className="bg-navy-800/60 rounded-lg p-3"><div className="text-navy-400">คำขอรออนุมัติ</div><div className={`font-bold mt-1 ${infra.pendingApprovals ? 'text-amber-300' : 'text-green-300'}`}>{infra.pendingApprovals ?? 0}</div></div>
                </div>
              </CardBody>
            </Card>
          )}

          {/* Backups + Incidents — ops */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {canBackup && (
              <Card>
                <CardBody>
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="font-bold text-white">💾 Backups ({backups.length})</h2>
                    <button onClick={createBackup} className="text-xs px-3 py-1.5 rounded-lg bg-gold-500/20 text-gold-300 border border-gold-500/40 hover:bg-gold-500/30">+ สร้าง backup</button>
                  </div>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {backups.map(b => (
                      <div key={b.file} className="flex justify-between text-xs bg-navy-800/60 rounded px-2.5 py-1.5">
                        <span className="font-mono text-navy-200">{b.file}</span>
                        <span className="text-navy-400">{(b.sizeBytes / 1024).toFixed(0)} KB • {b.createdAt?.slice(0, 16).replace('T', ' ')}</span>
                      </div>
                    ))}
                    {!backups.length && <div className="text-xs text-navy-500 py-2">ยังไม่มี backup — กดสร้าง (logical dump ทั้ง DB เป็นไฟล์ .json.gz)</div>}
                  </div>
                </CardBody>
              </Card>
            )}
            <Card>
              <CardBody>
                <h2 className="font-bold text-white mb-3">🚨 Incidents ({incidents.filter(i => i.status !== 'resolved').length} active)</h2>
                <div className="flex gap-2 mb-3 flex-wrap">
                  <input value={incForm.title} onChange={e => setIncForm({ ...incForm, title: e.target.value })}
                    placeholder="หัวข้อ incident" className="flex-1 min-w-40 bg-navy-900 border border-navy-600 rounded-lg px-3 py-1.5 text-sm" />
                  <select value={incForm.severity} onChange={e => setIncForm({ ...incForm, severity: e.target.value })}
                    className="bg-navy-900 border border-navy-600 rounded-lg px-2 py-1.5 text-sm">
                    <option value="low">low</option><option value="medium">medium</option>
                    <option value="high">high</option><option value="critical">critical</option>
                  </select>
                  <button onClick={createIncident} className="text-xs px-3 py-1.5 rounded-lg bg-red-500/20 text-red-300 border border-red-500/40">บันทึก</button>
                </div>
                <div className="space-y-1.5 max-h-56 overflow-y-auto">
                  {incidents.map(inc => (
                    <div key={inc.id} className="flex items-center gap-2 bg-navy-800/60 rounded px-2.5 py-1.5 text-xs">
                      <span className={`px-1.5 py-0.5 rounded font-bold ${inc.severity === 'critical' ? 'bg-red-500/20 text-red-300' : inc.severity === 'high' ? 'bg-orange-500/20 text-orange-300' : 'bg-navy-600 text-navy-200'}`}>{inc.severity}</span>
                      <span className={`flex-1 ${inc.status === 'resolved' ? 'line-through text-navy-500' : 'text-white'}`}>{inc.title}</span>
                      <span className="text-navy-500">{inc.created_by_name || ''}</span>
                      {inc.status !== 'resolved' && (
                        <>
                          {inc.status === 'open' && <button onClick={() => setIncidentStatus(inc, 'mitigated')} className="text-amber-300 hover:underline">mitigate</button>}
                          <button onClick={() => setIncidentStatus(inc, 'resolved')} className="text-green-300 hover:underline">resolve</button>
                        </>
                      )}
                      {inc.status === 'resolved' && <span className="text-green-400">✓</span>}
                    </div>
                  ))}
                  {!incidents.length && <div className="text-xs text-navy-500 py-2">ไม่มี incident</div>}
                </div>
              </CardBody>
            </Card>
          </div>

          {/* รอบค้างออกผล */}
          {overdue.length > 0 && (
            <Card variant="danger">
              <CardBody>
                <h2 className="font-bold text-red-300 mb-3">⚠️ รอบค้างออกผล ({overdue.length})</h2>
                <Table>
                  <TableHeader>
                    <TableRow className="border-navy-700/60 hover:bg-transparent">
                      <TableHead className="text-navy-400">รอบ</TableHead>
                      <TableHead className="text-navy-400">ตลาด</TableHead>
                      <TableHead className="text-navy-400">เวลาที่ควรออก</TableHead>
                      <TableHead className="text-navy-400">สถานะ</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {overdue.map(drow => {
                      const late = Date.now() - new Date(String(drow.draw_at).replace(' ', 'T') + 'Z').getTime();
                      const lateH = Math.floor(late / 3600e3);
                      return (
                        <TableRow key={drow.id} className="border-navy-700/50">
                          <TableCell className="font-mono text-xs text-navy-200">{drow.draw_code}</TableCell>
                          <TableCell className="text-xs text-navy-200">{drow.type_name_th}{drow.cat_name_th ? ` — ${drow.cat_name_th}` : ''}</TableCell>
                          <TableCell className="text-xs text-navy-300">{fmtDateTime(drow.draw_at)}</TableCell>
                          <TableCell className="text-xs">
                            <span className="text-red-300 font-bold">ค้างมา {lateH >= 24 ? `${Math.floor(lateH / 24)} วัน ` : ''}{lateH % 24} ชม.</span>
                            <span className="text-navy-500 ml-1">({drow.status})</span>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
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
