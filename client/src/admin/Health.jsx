import { useEffect, useState, useCallback } from 'react';
import { api, fmtDateTime } from '../api.js';
import { sourceBadge, marketInfo, MODE_BADGE, isOfficial } from '../resultSource.js';
import { Card, CardBody } from '../components/ui/index.js';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/shadcn/table.jsx';
import { AdminLoading, AdminError } from '../components/AdminStates.jsx';
import { toast } from '../components/toast.js';

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
  const cls = { green: 'text-[var(--success-green)]', red: 'text-[var(--danger-red)]', gold: 'text-[var(--gold-primary)]', blue: 'text-[var(--info-blue)]' }[tone] || 'text-[var(--white)]';
  return (
    <Card><CardBody className="text-center py-4">
      <div className={`text-2xl font-black ${cls}`}>{value ?? '—'}</div>
      <div className="text-xs text-[var(--muted-gray)] mt-1">{label}</div>
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
      toast(`สร้าง backup แล้ว: ${r.file} (${(r.sizeBytes / 1024).toFixed(0)} KB)`, 'success');
      load();
    } catch (e) { toast(e.message, 'error'); }
  };

  const createIncident = async () => {
    if (incForm.title.trim().length < 3) return;
    try {
      await api('/admin/incidents', { method: 'POST', body: incForm });
      setIncForm({ title: '', severity: 'medium', detail: '' });
      toast('บันทึก incident แล้ว', 'success');
      load();
    } catch (e) { toast(e.message, 'error'); }
  };

  const setIncidentStatus = async (inc, status) => {
    try { await api(`/admin/incidents/${inc.id}`, { method: 'PATCH', body: { status } }); toast('อัปเดตสถานะ incident แล้ว', 'success'); load(); }
    catch (e) { toast(e.message, 'error'); }
  };
  useEffect(() => {
    load();
    const t = setInterval(() => { if (!document.hidden) load(); }, 30000);
    const onVis = () => { if (!document.hidden) load(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVis); };
  }, [load]);

  const counts = d?.counts || {};
  const overdue = d?.overdue || [];
  const sources = d?.sources || [];
  // ภาพรวม: แดงถ้ามีรอบค้าง, เหลืองถ้ามี source เงียบ >36ชม., เขียวปกติ
  const staleSources = sources.filter(s => s.last_at && (Date.now() - new Date(String(s.last_at).replace(' ', 'T') + 'Z').getTime()) > 36 * 3600e3);
  const overall = overdue.length ? 'bad' : staleSources.length ? 'warn' : 'ok';
  const banner = {
    ok: { cls: 'border-[color-mix(in_srgb,var(--success-green)_30%,transparent)] bg-[color-mix(in_srgb,var(--success-green)_10%,transparent)] text-[var(--success-green)]', txt: '🟢 ระบบปกติ — ไม่มีรอบค้าง ผลทุกแหล่งอัปเดตอยู่' },
    warn: { cls: 'border-[color-mix(in_srgb,var(--warning-amber)_30%,transparent)] bg-[color-mix(in_srgb,var(--warning-amber)_10%,transparent)] text-[var(--warning-amber)]', txt: `🟡 ระบบทำงาน แต่มีแหล่งผลเงียบ >36 ชม. ${staleSources.length} แหล่ง` },
    bad: { cls: 'border-[color-mix(in_srgb,var(--danger-red)_40%,transparent)] bg-[color-mix(in_srgb,var(--danger-red)_10%,transparent)] text-[var(--danger-red)]', txt: `🔴 มีรอบค้างออกผล ${overdue.length} รอบ — ตรวจแหล่งผล/ตั้งผลเอง` },
  }[overall];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-[var(--white)]">สุขภาพระบบ</h1>
          <p className="text-sm text-[var(--muted-gray)]">แหล่งผลรางวัล • รอบค้าง • สถิติรวม — refresh อัตโนมัติทุก 30 วิ</p>
        </div>
        <div className="text-xs text-[var(--muted-gray)]">อัปเดต {updated ? updated.toLocaleTimeString('th-TH') : '—'}</div>
      </div>

      {err && <AdminError message={err} onRetry={load} />}

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
              <h2 className="font-bold text-[var(--white)] mb-3">📡 แหล่งผลรางวัล ({sources.length})</h2>
              <div className="hidden lg:block">
              <Table>
                <TableHeader>
                  <TableRow className="border-[var(--border-light)] hover:bg-transparent">
                    <TableHead className="text-[var(--muted-gray)]">Source</TableHead>
                    <TableHead className="text-[var(--muted-gray)]">Badge</TableHead>
                    <TableHead className="text-[var(--muted-gray)]">ผลล่าสุด</TableHead>
                    <TableHead className="text-[var(--muted-gray)]">อายุผล</TableHead>
                    <TableHead className="text-[var(--muted-gray)]">รอบล่าสุด</TableHead>
                    <TableHead className="text-[var(--muted-gray)]">ตลาด</TableHead>
                    <TableHead className="text-[var(--muted-gray)] text-right">จำนวนผล</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sources.map(s => {
                    const badge = sourceBadge(s.source);
                    const a = age(s.last_at);
                    const stale = a && /วัน|ชม/.test(a) && !a.startsWith('0') && (s.last_at && (Date.now() - new Date(String(s.last_at).replace(' ', 'T') + 'Z').getTime()) > 36 * 3600e3);
                    const mi = s.last ? marketInfo(s.last.type_code || '', s.last.cat_code || '') : null;
                    return (
                      <TableRow key={s.source} className="border-[var(--border-light)]">
                        <TableCell className="font-mono text-xs text-[var(--light-gray)]">{s.source}</TableCell>
                        <TableCell><span className={`text-[10px] font-bold px-2 py-0.5 rounded ${badge?.cls || 'bg-[var(--bg-dark-surface)] text-[var(--muted-gray)]'}`}>{badge?.short || s.source}</span></TableCell>
                        <TableCell className={`text-xs ${stale ? 'text-[var(--warning-amber)]' : 'text-[var(--success-green)]'}`}>{s.last_at ? fmtDateTime(s.last_at) : '—'}</TableCell>
                        <TableCell className={`text-xs ${stale ? 'text-[var(--warning-amber)] font-bold' : 'text-[var(--muted-gray)]'}`}>{a || '—'}{stale ? ' ⚠️' : ''}</TableCell>
                        <TableCell className="text-xs text-[var(--muted-gray)]">{s.last?.draw_code || '—'}</TableCell>
                        <TableCell className="text-xs text-[var(--muted-gray)]">
                          {s.last ? `${s.last.type_name_th || ''}${s.last.cat_name_th ? ' — ' + s.last.cat_name_th : ''}` : '—'}
                          {mi && <span className={`ml-1 text-[9px] px-1 py-0.5 rounded border ${MODE_BADGE[mi.mode]?.cls || ''}`}>{MODE_BADGE[mi.mode]?.label || mi.mode}</span>}
                          {mi && isOfficial(mi) && <span className="ml-1 text-[9px] text-[var(--success-green)]">✓ทางการ</span>}
                        </TableCell>
                        <TableCell className="text-right text-xs text-[var(--muted-gray)]">{s.total}</TableCell>
                      </TableRow>
                    );
                  })}
                  {!sources.length && <TableRow><TableCell colSpan={7} className="text-center text-[var(--muted-gray)] text-xs py-4">ยังไม่มีผลรางวัลในระบบ</TableCell></TableRow>}
                </TableBody>
              </Table>
              </div>
              <div className="lg:hidden space-y-3">
                {sources.map(s => {
                  const badge = sourceBadge(s.source);
                  const a = age(s.last_at);
                  const stale = a && /วัน|ชม/.test(a) && !a.startsWith('0') && (s.last_at && (Date.now() - new Date(String(s.last_at).replace(' ', 'T') + 'Z').getTime()) > 36 * 3600e3);
                  const mi = s.last ? marketInfo(s.last.type_code || '', s.last.cat_code || '') : null;
                  return (
                    <div key={s.source} className="border border-[var(--border-light)] rounded-xl p-4 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-bold font-mono [color:var(--light-gray)]">{s.source}</div>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${badge?.cls || 'bg-[var(--bg-dark-surface)] text-[var(--muted-gray)]'}`}>{badge?.short || s.source}</span>
                      </div>
                      <div className={`text-xs flex justify-between gap-2 ${stale ? 'text-[var(--warning-amber)]' : 'text-[var(--success-green)]'}`}><span className="[color:var(--muted-gray)]">ผลล่าสุด</span><span>{s.last_at ? fmtDateTime(s.last_at) : '—'}</span></div>
                      <div className={`text-xs flex justify-between gap-2 ${stale ? 'text-[var(--warning-amber)] font-bold' : 'text-[var(--muted-gray)]'}`}><span className="[color:var(--muted-gray)]">อายุผล</span><span>{a || '—'}{stale ? ' ⚠️' : ''}</span></div>
                      <div className="text-xs flex justify-between gap-2"><span className="[color:var(--muted-gray)]">รอบล่าสุด</span><span className="[color:var(--muted-gray)]">{s.last?.draw_code || '—'}</span></div>
                      <div className="text-xs flex justify-between gap-2"><span className="[color:var(--muted-gray)]">ตลาด</span><span className="[color:var(--muted-gray)] text-right">
                        {s.last ? `${s.last.type_name_th || ''}${s.last.cat_name_th ? ' — ' + s.last.cat_name_th : ''}` : '—'}
                        {mi && <span className={`ml-1 text-[9px] px-1 py-0.5 rounded border ${MODE_BADGE[mi.mode]?.cls || ''}`}>{MODE_BADGE[mi.mode]?.label || mi.mode}</span>}
                        {mi && isOfficial(mi) && <span className="ml-1 text-[9px] text-[var(--success-green)]">✓ทางการ</span>}
                      </span></div>
                      <div className="text-xs flex justify-between gap-2"><span className="[color:var(--muted-gray)]">จำนวนผล</span><span className="[color:var(--muted-gray)]">{s.total}</span></div>
                    </div>
                  );
                })}
                {!sources.length && <div className="text-center text-[var(--muted-gray)] text-xs py-4">ยังไม่มีผลรางวัลในระบบ</div>}
              </div>
              <div className="text-[11px] text-[var(--dark-gray)] mt-3">
                ⚠️ = ผลเก่าเกิน 36 ชม. — แหล่งอาจหยุดอัปเดต • ✓ทางการ = ผลจากแหล่ง government เท่านั้น
              </div>
            </CardBody>
          </Card>

          {/* สถานะการดึงผลล่าสุดของแต่ละ source (รวม fallback) */}
          {(d?.fetchHealth || []).length > 0 && (
            <Card>
              <CardBody>
                <h2 className="font-bold text-[var(--white)] mb-3">🔄 การดึงผลอัตโนมัติ (source chain + fallback)</h2>
                <div className="flex flex-wrap gap-2">
                  {d.fetchHealth.map(h => (
                    <div key={h.label} className={`text-[11px] px-2.5 py-1.5 rounded-lg border ${h.ok === false ? 'border-[color-mix(in_srgb,var(--danger-red)_30%,transparent)] bg-[color-mix(in_srgb,var(--danger-red)_10%,transparent)] text-[var(--danger-red)]' : 'border-[color-mix(in_srgb,var(--success-green)_30%,transparent)] bg-[color-mix(in_srgb,var(--success-green)_5%,transparent)] text-[var(--success-green)]'}`}>
                      <span className="font-bold">{h.label}</span>
                      <span className="text-[var(--muted-gray)] ml-1">{h.ok === false ? `✕ ${h.lastError || 'error'}` : `✓ ${age(h.lastOkAt) || '—'}`}</span>
                    </div>
                  ))}
                </div>
                <div className="text-[11px] text-[var(--dark-gray)] mt-2">✓ = ดึงสำเร็จล่าสุด • ✕ = ดึงล้มเหลวล่าสุด (ระบบจะลอง source ถัดไปใน chain อัตโนมัติ)</div>
              </CardBody>
            </Card>
          )}

          {/* โครงสร้างระบบ — uptime/memory/db size/table counts/migration */}
          {infra && (
            <Card>
              <CardBody>
                <h2 className="font-bold text-[var(--white)] mb-3">🖥️ โครงสร้างระบบ</h2>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div className="bg-[var(--bg-dark-surface)] rounded-lg p-3"><div className="text-[var(--muted-gray)]">Uptime</div><div className="text-[var(--white)] font-bold mt-1">{Math.floor(infra.uptimeSec / 3600)} ชม. {Math.floor(infra.uptimeSec % 3600 / 60)} นาที</div></div>
                  <div className="bg-[var(--bg-dark-surface)] rounded-lg p-3"><div className="text-[var(--muted-gray)]">Node / env</div><div className="text-[var(--white)] font-bold mt-1">{infra.node} • {infra.env}</div></div>
                  <div className="bg-[var(--bg-dark-surface)] rounded-lg p-3"><div className="text-[var(--muted-gray)]">หน่วยความจำ (heap)</div><div className="text-[var(--white)] font-bold mt-1">{(infra.memory.heapUsed / 1048576).toFixed(0)} / {(infra.memory.heapTotal / 1048576).toFixed(0)} MB</div></div>
                  <div className="bg-[var(--bg-dark-surface)] rounded-lg p-3"><div className="text-[var(--muted-gray)]">ขนาดฐานข้อมูล</div><div className="text-[var(--white)] font-bold mt-1">{infra.dbSizeBytes ? `${(infra.dbSizeBytes / 1048576).toFixed(1)} MB` : '—'}</div></div>
                  <div className="bg-[var(--bg-dark-surface)] rounded-lg p-3"><div className="text-[var(--muted-gray)]">Migration ล่าสุด</div><div className="text-[var(--white)] font-bold mt-1 font-mono text-[11px]">{infra.latestMigration?.version || '—'}</div></div>
                  <div className="bg-[var(--bg-dark-surface)] rounded-lg p-3"><div className="text-[var(--muted-gray)]">สมาชิก / โพย</div><div className="text-[var(--white)] font-bold mt-1">{infra.tableCounts?.users ?? '—'} / {infra.tableCounts?.bet_slips ?? '—'}</div></div>
                  <div className="bg-[var(--bg-dark-surface)] rounded-lg p-3"><div className="text-[var(--muted-gray)]">Audit / Security logs</div><div className="text-[var(--white)] font-bold mt-1">{infra.tableCounts?.audit_logs ?? '—'} / {infra.tableCounts?.security_events ?? '—'}</div></div>
                  <div className="bg-[var(--bg-dark-surface)] rounded-lg p-3"><div className="text-[var(--muted-gray)]">คำขอรออนุมัติ</div><div className={`font-bold mt-1 ${infra.pendingApprovals ? 'text-[var(--warning-amber)]' : 'text-[var(--success-green)]'}`}>{infra.pendingApprovals ?? 0}</div></div>
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
                    <h2 className="font-bold text-[var(--white)]">💾 Backups ({backups.length})</h2>
                    <button onClick={createBackup} className="text-xs px-3 py-1.5 rounded-lg bg-[color-mix(in_srgb,var(--gold-primary)_20%,transparent)] text-[var(--gold-primary)] border border-[var(--border-gold)] hover:bg-[color-mix(in_srgb,var(--gold-primary)_30%,transparent)]">+ สร้าง backup</button>
                  </div>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {backups.map(b => (
                      <div key={b.file} className="flex justify-between text-xs bg-[var(--bg-dark-surface)] rounded px-2.5 py-1.5">
                        <span className="font-mono text-[var(--light-gray)]">{b.file}</span>
                        <span className="text-[var(--muted-gray)]">{(b.sizeBytes / 1024).toFixed(0)} KB • {b.createdAt?.slice(0, 16).replace('T', ' ')}</span>
                      </div>
                    ))}
                    {!backups.length && <div className="text-xs text-[var(--dark-gray)] py-2">ยังไม่มี backup — กดสร้าง (logical dump ทั้ง DB เป็นไฟล์ .json.gz)</div>}
                  </div>
                </CardBody>
              </Card>
            )}
            <Card>
              <CardBody>
                <h2 className="font-bold text-[var(--white)] mb-3">🚨 Incidents ({incidents.filter(i => i.status !== 'resolved').length} active)</h2>
                <div className="flex gap-2 mb-3 flex-wrap">
                  <input value={incForm.title} onChange={e => setIncForm({ ...incForm, title: e.target.value })}
                    placeholder="หัวข้อ incident" className="flex-1 min-w-40 bg-[var(--bg-dark-surface)] border border-[var(--border-light)] rounded-lg px-3 py-1.5 text-sm" />
                  <select value={incForm.severity} onChange={e => setIncForm({ ...incForm, severity: e.target.value })}
                    className="bg-[var(--bg-dark-surface)] border border-[var(--border-light)] rounded-lg px-2 py-1.5 text-sm">
                    <option value="low">low</option><option value="medium">medium</option>
                    <option value="high">high</option><option value="critical">critical</option>
                  </select>
                  <button onClick={createIncident} className="text-xs px-3 py-1.5 rounded-lg bg-[color-mix(in_srgb,var(--danger-red)_20%,transparent)] text-[var(--danger-red)] border border-[color-mix(in_srgb,var(--danger-red)_30%,transparent)]">บันทึก</button>
                </div>
                <div className="space-y-1.5 max-h-56 overflow-y-auto">
                  {incidents.map(inc => (
                    <div key={inc.id} className="flex items-center gap-2 bg-[var(--bg-dark-surface)] rounded px-2.5 py-1.5 text-xs">
                      <span className={`px-1.5 py-0.5 rounded font-bold ${inc.severity === 'critical' ? 'bg-[color-mix(in_srgb,var(--danger-red)_20%,transparent)] text-[var(--danger-red)]' : inc.severity === 'high' ? 'bg-[rgba(249,115,22,0.2)] text-[rgba(249,115,22,1)]' : 'bg-[var(--bg-card)] text-[var(--muted-gray)]'}`}>{inc.severity}</span>
                      <span className={`flex-1 ${inc.status === 'resolved' ? 'line-through text-[var(--dark-gray)]' : 'text-[var(--white)]'}`}>{inc.title}</span>
                      <span className="text-[var(--dark-gray)]">{inc.created_by_name || ''}</span>
                      {inc.status !== 'resolved' && (
                        <>
                          {inc.status === 'open' && <button onClick={() => setIncidentStatus(inc, 'mitigated')} className="text-[var(--warning-amber)] hover:underline">mitigate</button>}
                          <button onClick={() => setIncidentStatus(inc, 'resolved')} className="text-[var(--success-green)] hover:underline">resolve</button>
                        </>
                      )}
                      {inc.status === 'resolved' && <span className="text-[var(--success-green)]">✓</span>}
                    </div>
                  ))}
                  {!incidents.length && <div className="text-xs text-[var(--dark-gray)] py-2">ไม่มี incident</div>}
                </div>
              </CardBody>
            </Card>
          </div>

          {/* รอบค้างออกผล */}
          {overdue.length > 0 && (
            <Card variant="danger">
              <CardBody>
                <h2 className="font-bold text-[var(--danger-red)] mb-3">⚠️ รอบค้างออกผล ({overdue.length})</h2>
                <div className="hidden lg:block">
                <Table>
                  <TableHeader>
                    <TableRow className="border-[var(--border-light)] hover:bg-transparent">
                      <TableHead className="text-[var(--muted-gray)]">รอบ</TableHead>
                      <TableHead className="text-[var(--muted-gray)]">ตลาด</TableHead>
                      <TableHead className="text-[var(--muted-gray)]">เวลาที่ควรออก</TableHead>
                      <TableHead className="text-[var(--muted-gray)]">สถานะ</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {overdue.map(drow => {
                      const late = Date.now() - new Date(String(drow.draw_at).replace(' ', 'T') + 'Z').getTime();
                      const lateH = Math.floor(late / 3600e3);
                      return (
                        <TableRow key={drow.id} className="border-[var(--border-light)]">
                          <TableCell className="font-mono text-xs text-[var(--light-gray)]">{drow.draw_code}</TableCell>
                          <TableCell className="text-xs text-[var(--light-gray)]">{drow.type_name_th}{drow.cat_name_th ? ` — ${drow.cat_name_th}` : ''}</TableCell>
                          <TableCell className="text-xs text-[var(--muted-gray)]">{fmtDateTime(drow.draw_at)}</TableCell>
                          <TableCell className="text-xs">
                            <span className="text-[var(--danger-red)] font-bold">ค้างมา {lateH >= 24 ? `${Math.floor(lateH / 24)} วัน ` : ''}{lateH % 24} ชม.</span>
                            <span className="text-[var(--dark-gray)] ml-1">({drow.status})</span>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
                </div>
                <div className="lg:hidden space-y-3">
                  {overdue.map(drow => {
                    const late = Date.now() - new Date(String(drow.draw_at).replace(' ', 'T') + 'Z').getTime();
                    const lateH = Math.floor(late / 3600e3);
                    return (
                      <div key={drow.id} className="border border-[var(--border-light)] rounded-xl p-4 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-sm font-bold font-mono [color:var(--light-gray)]">{drow.draw_code}</div>
                          <span className="text-xs text-[var(--danger-red)] font-bold">ค้างมา {lateH >= 24 ? `${Math.floor(lateH / 24)} วัน ` : ''}{lateH % 24} ชม.</span>
                        </div>
                        <div className="text-xs [color:var(--light-gray)]">{drow.type_name_th}{drow.cat_name_th ? ` — ${drow.cat_name_th}` : ''}</div>
                        <div className="text-xs flex justify-between gap-2"><span className="[color:var(--muted-gray)]">เวลาที่ควรออก</span><span className="[color:var(--muted-gray)]">{fmtDateTime(drow.draw_at)}</span></div>
                        <div className="text-xs [color:var(--dark-gray)]">สถานะ: {drow.status}</div>
                      </div>
                    );
                  })}
                </div>
                <div className="text-[11px] text-[var(--muted-gray)] mt-3">
                  วิธีแก้: รอตัวดึงผลรอบถัดไป • ถ้าแหล่งภายนอกไม่มีผลจริง → admin กรอกผลเองที่ หน้ารอบหวย → ออกผล
                </div>
              </CardBody>
            </Card>
          )}
        </>
      )}
      {!d && !err && <AdminLoading label="กำลังโหลดสุขภาพระบบ..." />}
    </div>
  );
}
