import { useEffect, useState } from 'react';
import { api, satang, fmtDateTime } from '../api.js';
import { Icon } from '../components/icons.jsx';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/shadcn/table.jsx';

const fmt = (satangVal) => `${satang(satangVal)} บาท`;

function StatCard({ icon, label, value, sub, tone = 'gold' }) {
  const tones = {
    gold: 'border-[var(--border-gold)] bg-[rgba(212,175,55,0.1)] text-[var(--gold-primary)]',
    green: 'border-[rgba(34,197,94,0.3)] bg-[rgba(34,197,94,0.1)] text-[var(--success-green)]',
    red: 'border-[rgba(239,68,68,0.3)] bg-[rgba(239,68,68,0.1)] text-[var(--danger-red)]',
    blue: 'border-[rgba(59,130,246,0.3)] bg-[rgba(59,130,246,0.1)] text-[var(--info-blue)]',
    purple: 'border-[rgba(168,85,247,0.3)] bg-[rgba(168,85,247,0.1)] text-[var(--info-blue)]',
  };
  return (
    <div className={`border rounded-xl p-4 ${tones[tone]}`}>
      <div className="flex items-center justify-between">
        <span className="w-8 h-8 rounded-lg bg-[var(--bg-dark-surface)] border border-[var(--border-light)] flex items-center justify-center">
          <Icon name={icon} className="w-4 h-4" />
        </span>
        {sub && <span className="text-[10px] text-[var(--muted-gray)]">{sub}</span>}
      </div>
      <div className="text-xl font-bold text-[var(--white)] mt-2">{value}</div>
      <div className="text-xs text-[var(--muted-gray)] mt-0.5">{label}</div>
    </div>
  );
}

export default function AdminOverview() {
  const [d, setD] = useState(null);
  const [health, setHealth] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    api('/admin/overview').then(setD).catch(e => setErr(e.message));
    api('/admin/health').then(setHealth).catch(() => {});
  }, []);
  if (err) return <div className="text-[var(--danger-red)]">เกิดข้อผิดพลาด: {err}</div>;
  if (!d) return <div className="text-[var(--muted-gray)]">กำลังโหลด...</div>;

  const m = d.money || {};
  const daily = d.daily || [];
  const maxDaily = Math.max(1, ...daily.map(x => Math.max(x.inn, x.out)));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-[var(--white)]">Dashboard ภาพรวม</h1>
          <p className="text-sm text-[var(--muted-gray)]">ภาพรวมระบบ • เครดิตจำลอง (demo)</p>
        </div>
        <div className="text-xs text-[var(--muted-gray)] bg-[var(--bg-card)] border border-[var(--border-light)] rounded-lg px-3 py-1.5">
          อัปเดต {new Date().toLocaleString('th-TH')}
        </div>
      </div>

      {/* สิ่งที่ต้องทำวันนี้ — action items รวมจาก health (overdue/stale source/โพยรอผล) */}
      {(() => {
        const items = [];
        const od = health?.overdue || [];
        if (od.length) items.push({ tone: 'red', icon: 'security', text: `${od.length} รอบค้างออกผลเกินเวลา`, sub: od.slice(0, 3).map(x => x.draw_code).join(', ') + (od.length > 3 ? ' …' : ''), to: '/admin/lotteries?tab=settle' });
        const stale = (health?.fetchHealth || []).filter(h => h.ok === false);
        if (stale.length) items.push({ tone: 'amber', icon: 'reports', text: `แหล่งผลมีปัญหา ${stale.length} แห่ง`, sub: stale.map(h => h.label).join(', '), to: '/admin/health' });
        const srcStale = (health?.sources || []).filter(s => s.last_at && (Date.now() - new Date(String(s.last_at).replace(' ', 'T') + 'Z').getTime()) > 36 * 3600e3);
        if (srcStale.length && !stale.length) items.push({ tone: 'amber', icon: 'reports', text: `แหล่งผลเงียบ >36 ชม. ${srcStale.length} แห่ง`, sub: srcStale.map(s => s.source).join(', '), to: '/admin/health' });
        if (!items.length) return null;
        const toneCls = { red: 'border-[rgba(239,68,68,0.4)] bg-[rgba(239,68,68,0.1)]', amber: 'border-[rgba(245,158,11,0.4)] bg-[rgba(245,158,11,0.1)]' };
        const txtCls = { red: 'text-[var(--danger-red)]', amber: 'text-[var(--warning-amber)]' };
        return (
          <div className="bg-[var(--bg-card)] border border-[var(--border-light)] rounded-xl p-4">
            <h2 className="font-bold text-[var(--white)] mb-3">📋 สิ่งที่ต้องทำ ({items.length})</h2>
            <div className="space-y-2">
              {items.map((it, i) => (
                <a key={i} href={it.to} className={`flex items-center gap-3 border rounded-lg px-4 py-3 hover:brightness-110 transition ${toneCls[it.tone]}`}>
                  <Icon name={it.icon} className={`w-5 h-5 shrink-0 ${txtCls[it.tone]}`} />
                  <div className="min-w-0">
                    <div className={`text-sm font-bold ${txtCls[it.tone]}`}>{it.text}</div>
                    {it.sub && <div className="text-[11px] text-[var(--muted-gray)] truncate">{it.sub}</div>}
                  </div>
                  <span className="ml-auto text-xs text-[var(--muted-gray)] shrink-0">จัดการ →</span>
                </a>
              ))}
            </div>
          </div>
        );
      })()}

      {/* รายรับ / รายจ่าย หลัก */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="border border-[rgba(34,197,94,0.3)] bg-[rgba(34,197,94,0.08)] rounded-xl p-6 relative overflow-hidden">
          <Icon name="wallet" className="absolute -right-6 -top-6 w-36 h-36 opacity-10 text-[var(--success-green)]" />
          <div className="text-sm text-[var(--success-green)] font-semibold">รายรับรวม (เครดิตเข้า)</div>
          <div className="text-3xl font-black text-[var(--success-green)] mt-1">{fmt(m.totalIn || 0)}</div>
          <div className="text-[11px] text-[var(--muted-gray)] mt-2">
            เติมเครดิต {fmt(m.deposit || 0)} • admin จ่าย {fmt(m.adminCredit || 0)} • เริ่มต้น {fmt(m.initialCredit || 0)}
          </div>
        </div>
        <div className="border border-[rgba(239,68,68,0.3)] bg-[rgba(239,68,68,0.08)] rounded-xl p-6 relative overflow-hidden">
          <Icon name="reports" className="absolute -right-6 -top-6 w-36 h-36 opacity-10 text-[var(--gold-primary)]" />
          <div className="text-sm text-[var(--gold-primary)] font-semibold">รายจ่ายรวม (เครดิตออก)</div>
          <div className="text-3xl font-black text-[var(--gold-primary)] mt-1">{fmt(m.totalOut || 0)}</div>
          <div className="text-[11px] text-[var(--muted-gray)] mt-2">
            ถอน {fmt(m.withdraw || 0)} • admin หัก {fmt(m.adminDebit || 0)} • รางวัล {fmt(m.winnings || 0)} • คืนเงิน {fmt(m.refunds || 0)}
          </div>
        </div>
        <div className={`rounded-xl p-6 relative overflow-hidden border ${m.houseNet >= 0 ? 'border-[var(--border-gold)] bg-[rgba(212,175,55,0.08)]' : 'border-[rgba(59,130,246,0.3)] bg-[rgba(59,130,246,0.08)]'}`}>
          <Icon name={m.houseNet >= 0 ? 'dashboard' : 'reports'} className={`absolute -right-6 -top-6 w-36 h-36 opacity-10 ${m.houseNet >= 0 ? 'text-[var(--gold-primary)]' : 'text-[var(--info-blue)]'}`} />
          <div className={`text-sm font-semibold ${m.houseNet >= 0 ? 'text-[var(--gold-primary)]' : 'text-[var(--info-blue)]'}`}>ส่วนต่างระบบ ( Stakes − รางวัล )</div>
          <div className={`text-3xl font-black mt-1 ${m.houseNet >= 0 ? 'text-[var(--gold-primary)]' : 'text-[var(--info-blue)]'}`}>{fmt(m.houseNet || 0)}</div>
          <div className="text-[11px] text-[var(--muted-gray)] mt-2">เดิมพัน {fmt(m.staked || 0)} − จ่ายรางวัล {fmt(m.winnings || 0)} − คืนเงิน {fmt(m.refunds || 0)}</div>
        </div>
      </div>

      {/* เตือนรอบค้างออกผล */}
      {(d.overdueDraws || 0) > 0 && (
        <div className="bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.4)] rounded-xl px-5 py-4 flex items-center gap-3">
          <Icon name="security" className="w-6 h-6 text-[var(--danger-red)] shrink-0" />
          <div>
            <div className="font-bold text-[var(--gold-primary)]">มี {d.overdueDraws} รอบที่เลยเวลาออกรางวัลแล้วยังไม่ออกผล</div>
            <div className="text-xs text-[var(--muted-gray)]">ไปที่ "ประเภทหวย/กติกา → ออกผลรางวัล" เพื่อตรวจผลอัตโนมัติหรือกรอกผลเอง</div>
          </div>
        </div>
      )}

      {/* สุขภาพระบบ — ผลล่าสุดแต่ละแหล่ง + รอบค้างออกผล */}
      {health && (
        <div className="bg-[var(--bg-card)] border border-[var(--border-light)] rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-[var(--white)]">สุขภาพระบบ</h2>
            <span className="text-[11px] text-[var(--muted-gray)]">
              รอบเปิด {health.counts?.open ?? 0} • กำหนดการ {health.counts?.scheduled ?? 0} • ออกผลวันนี้ {health.counts?.settledToday ?? 0} • โพยรอผล {health.counts?.pendingBets ?? 0}
            </span>
          </div>
          <Table>
            <TableHeader>
              <TableRow className="border-[var(--border-light)] hover:bg-transparent">
                <TableHead className="text-[var(--muted-gray)]">แหล่งผล</TableHead>
                <TableHead className="text-[var(--muted-gray)]">ผลล่าสุด</TableHead>
                <TableHead className="text-[var(--muted-gray)]">รอบ</TableHead>
                <TableHead className="text-[var(--muted-gray)]">ตลาด</TableHead>
                <TableHead className="text-[var(--muted-gray)] text-right">รวม</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {health.sources.map(s => {
                const stale = s.last_at && (Date.now() - new Date(String(s.last_at).replace(' ', 'T') + 'Z').getTime()) > 36 * 3600e3;
                return (
                  <TableRow key={s.source} className="border-[var(--border-light)]">
                    <TableCell className="font-mono text-xs text-[var(--light-gray)]">{s.source}</TableCell>
                    <TableCell className={`text-xs ${stale ? 'text-[var(--warning-amber)]' : 'text-[var(--success-green)]'}`}>
                      {s.last_at ? fmtDateTime(s.last_at) : '—'}{stale ? ' ⚠️' : ''}
                    </TableCell>
                    <TableCell className="text-xs text-[var(--muted-gray)]">{s.last?.draw_code || '—'}</TableCell>
                    <TableCell className="text-xs text-[var(--muted-gray)]">{s.last ? `${s.last.type_name_th}${s.last.cat_name_th ? ' — ' + s.last.cat_name_th : ''}` : '—'}</TableCell>
                    <TableCell className="text-right text-xs text-[var(--muted-gray)]">{s.total}</TableCell>
                  </TableRow>
                );
              })}
              {!health.sources.length && <TableRow><TableCell colSpan={5} className="text-[var(--muted-gray)] text-xs py-3">ยังไม่มีผลรางวัลในระบบ</TableCell></TableRow>}
            </TableBody>
          </Table>
          {health.overdue?.length > 0 && (
            <div className="mt-3 border-t border-[var(--border-light)] pt-3">
              <div className="text-xs font-bold text-[var(--danger-red)] mb-1.5">⚠️ รอบค้างออกผล ({health.overdue.length})</div>
              <div className="flex flex-wrap gap-1.5">
                {health.overdue.slice(0, 20).map(d => (
                  <span key={d.id} className="text-[11px] bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.3)] text-[var(--danger-red)] rounded px-2 py-1">
                    {d.type_name_th}{d.cat_name_th ? ` — ${d.cat_name_th}` : ''} • {fmtDateTime(d.draw_at)}
                  </span>
                ))}
                {health.overdue.length > 20 && <span className="text-[11px] text-[var(--muted-gray)]">+อีก {health.overdue.length - 20} รอบ</span>}
              </div>
            </div>
          )}
        </div>
      )}

      {/* สถิติระบบ */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <StatCard icon="members" label="สมาชิกทั้งหมด" value={d.members} tone="blue" />
        <StatCard icon="draws" label="รอบที่เปิดรับ" value={d.activeDraws} tone="green" />
        <StatCard icon="bets" label="โพยรอผล" value={d.pendingBets} tone="purple" />
        <StatCard icon="wallet" label="ยอดเดิมพันรอผล" value={fmt(d.totalStaked)} tone="gold" />
        <StatCard icon="reports" label="ยอดจ่ายรางวัลแล้ว" value={fmt(d.totalPaid)} tone="red" />
        <StatCard icon="wallet" label="เครดิตในระบบ" value={fmt(d.walletLiability)} tone="green" />
      </div>

      {/* กราฟเข้า-ออก 7 วัน */}
      <div className="bg-[var(--bg-card)] border border-[var(--border-light)] rounded-xl p-5">
        <h2 className="font-bold text-[var(--white)] mb-1">กระแสเครดิตเข้า-ออก (7 วันล่าสุด)</h2>
        <p className="text-[11px] text-[var(--muted-gray)] mb-4">เขียว = เครดิตเข้า • แดง = เครดิตออก (ทุกประเภทธุรกรรม)</p>
        <div className="flex items-end gap-2 h-40">
          {daily.map(x => (
            <div key={x.day} className="flex-1 flex flex-col items-center gap-1 min-w-0">
              <div className="w-full flex gap-0.5 items-end justify-center" style={{ height: '120px' }}>
                <div className="w-1/2 bg-[rgba(34,197,94,0.7)] rounded-t" style={{ height: `${Math.max(2, (x.inn / maxDaily) * 100)}%` }} title={`เข้า ${satang(x.inn)} บาท`} />
                <div className="w-1/2 bg-[rgba(239,68,68,0.7)] rounded-t" style={{ height: `${Math.max(2, (x.out / maxDaily) * 100)}%` }} title={`ออก ${satang(x.out)} บาท`} />
              </div>
              <div className="text-[9px] text-[var(--muted-gray)] truncate w-full text-center">{x.day.slice(5)}</div>
            </div>
          ))}
          {!daily.length && <div className="text-[var(--muted-gray)] text-sm w-full text-center py-10">ยังไม่มีธุรกรรมใน 7 วัน</div>}
        </div>
        <div className="flex gap-4 mt-3 text-[11px] text-[var(--muted-gray)]">
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-[rgba(34,197,94,0.7)] inline-block" /> เครดิตเข้า</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-[rgba(239,68,68,0.7)] inline-block" /> เครดิตออก</span>
        </div>
      </div>

      {/* Audit + Security */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-[var(--bg-card)] border border-[var(--border-light)] rounded-xl p-4">
          <h2 className="font-bold text-[var(--white)] mb-3">Audit ล่าสุด</h2>
          <div className="space-y-1 text-xs max-h-64 overflow-y-auto">
            {d.recentAudit.map(a => (
              <div key={a.id} className="flex justify-between gap-2 text-[var(--muted-gray)] border-b border-[var(--border-light)] pb-1">
                <span><span className="text-[var(--gold-primary)]">{a.action}</span> โดย {a.username || a.user_id || 'system'}</span>
                <span className="text-[var(--dark-gray)] shrink-0">{fmtDateTime(a.created_at)}</span>
              </div>
            ))}
            {!d.recentAudit.length && <div className="text-[var(--muted-gray)]">ไม่มีรายการ</div>}
          </div>
        </div>
        <div className="bg-[var(--bg-card)] border border-[var(--border-light)] rounded-xl p-4">
          <h2 className="font-bold text-[var(--white)] mb-3">Security Events ล่าสุด</h2>
          <div className="space-y-1 text-xs max-h-64 overflow-y-auto">
            {d.recentSecurity.map(s => (
              <div key={s.id} className={`flex justify-between gap-2 border-b border-[var(--border-light)] pb-1 ${s.severity === 'critical' ? 'text-[var(--danger-red)]' : 'text-[var(--muted-gray)]'}`}>
                <span>{s.event_type} • {s.username || s.ip || ''}</span>
                <span className="text-[var(--dark-gray)] shrink-0">{fmtDateTime(s.created_at)}</span>
              </div>
            ))}
            {!d.recentSecurity.length && <div className="text-[var(--muted-gray)]">ไม่มีเหตุการณ์</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
