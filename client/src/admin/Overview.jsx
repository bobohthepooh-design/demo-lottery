import { useEffect, useState } from 'react';
import { api, satang, fmtDateTime } from '../api.js';
import { Icon } from '../components/icons.jsx';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/shadcn/table.jsx';

const fmt = (satangVal) => `${satang(satangVal)} บาท`;

function StatCard({ icon, label, value, sub, tone = 'gold' }) {
  const tones = {
    gold: 'from-gold-500/20 to-gold-600/5 border-gold-500/40 text-gold-300',
    green: 'from-green-500/20 to-green-600/5 border-green-500/40 text-green-300',
    red: 'from-red-500/20 to-red-600/5 border-red-500/40 text-red-300',
    blue: 'from-blue-500/20 to-blue-600/5 border-blue-500/40 text-blue-300',
    purple: 'from-purple-500/20 to-purple-600/5 border-purple-500/40 text-purple-300',
  };
  return (
    <div className={`bg-gradient-to-br ${tones[tone]} border rounded-xl p-4`}>
      <div className="flex items-center justify-between">
        <span className="w-8 h-8 rounded-lg bg-navy-950/40 border border-white/10 flex items-center justify-center">
          <Icon name={icon} className="w-4 h-4" />
        </span>
        {sub && <span className="text-[10px] text-navy-300">{sub}</span>}
      </div>
      <div className="text-xl font-bold text-white mt-2">{value}</div>
      <div className="text-xs text-navy-300 mt-0.5">{label}</div>
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
  if (err) return <div className="text-red-400">เกิดข้อผิดพลาด: {err}</div>;
  if (!d) return <div className="text-navy-300">กำลังโหลด...</div>;

  const m = d.money || {};
  const daily = d.daily || [];
  const maxDaily = Math.max(1, ...daily.map(x => Math.max(x.inn, x.out)));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard ภาพรวม</h1>
          <p className="text-sm text-navy-300">ภาพรวมระบบ • เครดิตจำลอง (demo)</p>
        </div>
        <div className="text-xs text-navy-400 bg-navy-800 border border-navy-700 rounded-lg px-3 py-1.5">
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
        const toneCls = { red: 'border-red-500/50 bg-red-500/10', amber: 'border-amber-500/40 bg-amber-500/10' };
        const txtCls = { red: 'text-red-300', amber: 'text-amber-300' };
        return (
          <div className="bg-navy-800/70 border border-navy-700 rounded-xl p-4">
            <h2 className="font-bold text-white mb-3">📋 สิ่งที่ต้องทำ ({items.length})</h2>
            <div className="space-y-2">
              {items.map((it, i) => (
                <a key={i} href={it.to} className={`flex items-center gap-3 border rounded-lg px-4 py-3 hover:brightness-110 transition ${toneCls[it.tone]}`}>
                  <Icon name={it.icon} className={`w-5 h-5 shrink-0 ${txtCls[it.tone]}`} />
                  <div className="min-w-0">
                    <div className={`text-sm font-bold ${txtCls[it.tone]}`}>{it.text}</div>
                    {it.sub && <div className="text-[11px] text-navy-400 truncate">{it.sub}</div>}
                  </div>
                  <span className="ml-auto text-xs text-navy-300 shrink-0">จัดการ →</span>
                </a>
              ))}
            </div>
          </div>
        );
      })()}

      {/* รายรับ / รายจ่าย หลัก */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-gradient-to-br from-green-500/25 to-emerald-700/10 border border-green-500/50 rounded-xl p-6 relative overflow-hidden">
          <Icon name="wallet" className="absolute -right-6 -top-6 w-36 h-36 opacity-10 text-green-300" />
          <div className="text-sm text-green-300 font-semibold">รายรับรวม (เครดิตเข้า)</div>
          <div className="text-3xl font-black text-green-300 mt-1">{fmt(m.totalIn || 0)}</div>
          <div className="text-[11px] text-navy-300 mt-2">
            เติมเครดิต {fmt(m.deposit || 0)} • admin จ่าย {fmt(m.adminCredit || 0)} • เริ่มต้น {fmt(m.initialCredit || 0)}
          </div>
        </div>
        <div className="bg-gradient-to-br from-red-500/25 to-rose-700/10 border border-red-500/50 rounded-xl p-6 relative overflow-hidden">
          <Icon name="reports" className="absolute -right-6 -top-6 w-36 h-36 opacity-10 text-gold-300" />
          <div className="text-sm text-gold-300 font-semibold">รายจ่ายรวม (เครดิตออก)</div>
          <div className="text-3xl font-black text-gold-300 mt-1">{fmt(m.totalOut || 0)}</div>
          <div className="text-[11px] text-navy-300 mt-2">
            ถอน {fmt(m.withdraw || 0)} • admin หัก {fmt(m.adminDebit || 0)} • รางวัล {fmt(m.winnings || 0)} • คืนเงิน {fmt(m.refunds || 0)}
          </div>
        </div>
        <div className={`bg-gradient-to-br rounded-xl p-6 relative overflow-hidden border ${m.houseNet >= 0 ? 'from-gold-500/25 to-amber-700/10 border-gold-500/50' : 'from-blue-500/25 to-indigo-700/10 border-blue-500/50'}`}>
          <Icon name={m.houseNet >= 0 ? 'dashboard' : 'reports'} className={`absolute -right-6 -top-6 w-36 h-36 opacity-10 ${m.houseNet >= 0 ? 'text-gold-300' : 'text-blue-300'}`} />
          <div className={`text-sm font-semibold ${m.houseNet >= 0 ? 'text-gold-300' : 'text-blue-300'}`}>ส่วนต่างระบบ ( Stakes − รางวัล )</div>
          <div className={`text-3xl font-black mt-1 ${m.houseNet >= 0 ? 'text-gold-300' : 'text-blue-300'}`}>{fmt(m.houseNet || 0)}</div>
          <div className="text-[11px] text-navy-300 mt-2">เดิมพัน {fmt(m.staked || 0)} − จ่ายรางวัล {fmt(m.winnings || 0)} − คืนเงิน {fmt(m.refunds || 0)}</div>
        </div>
      </div>

      {/* เตือนรอบค้างออกผล */}
      {(d.overdueDraws || 0) > 0 && (
        <div className="bg-red-500/10 border border-red-500/50 rounded-xl px-5 py-4 flex items-center gap-3">
          <Icon name="security" className="w-6 h-6 text-red-400 shrink-0" />
          <div>
            <div className="font-bold text-gold-300">มี {d.overdueDraws} รอบที่เลยเวลาออกรางวัลแล้วยังไม่ออกผล</div>
            <div className="text-xs text-navy-300">ไปที่ "ประเภทหวย/กติกา → ออกผลรางวัล" เพื่อตรวจผลอัตโนมัติหรือกรอกผลเอง</div>
          </div>
        </div>
      )}

      {/* สุขภาพระบบ — ผลล่าสุดแต่ละแหล่ง + รอบค้างออกผล */}
      {health && (
        <div className="bg-navy-800 border border-navy-700 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-white">สุขภาพระบบ</h2>
            <span className="text-[11px] text-navy-400">
              รอบเปิด {health.counts?.open ?? 0} • กำหนดการ {health.counts?.scheduled ?? 0} • ออกผลวันนี้ {health.counts?.settledToday ?? 0} • โพยรอผล {health.counts?.pendingBets ?? 0}
            </span>
          </div>
          <Table>
            <TableHeader>
              <TableRow className="border-navy-700/60 hover:bg-transparent">
                <TableHead className="text-navy-400">แหล่งผล</TableHead>
                <TableHead className="text-navy-400">ผลล่าสุด</TableHead>
                <TableHead className="text-navy-400">รอบ</TableHead>
                <TableHead className="text-navy-400">ตลาด</TableHead>
                <TableHead className="text-navy-400 text-right">รวม</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {health.sources.map(s => {
                const stale = s.last_at && (Date.now() - new Date(String(s.last_at).replace(' ', 'T') + 'Z').getTime()) > 36 * 3600e3;
                return (
                  <TableRow key={s.source} className="border-navy-700/50">
                    <TableCell className="font-mono text-xs text-navy-200">{s.source}</TableCell>
                    <TableCell className={`text-xs ${stale ? 'text-amber-300' : 'text-green-300'}`}>
                      {s.last_at ? fmtDateTime(s.last_at) : '—'}{stale ? ' ⚠️' : ''}
                    </TableCell>
                    <TableCell className="text-xs text-navy-300">{s.last?.draw_code || '—'}</TableCell>
                    <TableCell className="text-xs text-navy-300">{s.last ? `${s.last.type_name_th}${s.last.cat_name_th ? ' — ' + s.last.cat_name_th : ''}` : '—'}</TableCell>
                    <TableCell className="text-right text-xs text-navy-300">{s.total}</TableCell>
                  </TableRow>
                );
              })}
              {!health.sources.length && <TableRow><TableCell colSpan={5} className="text-navy-400 text-xs py-3">ยังไม่มีผลรางวัลในระบบ</TableCell></TableRow>}
            </TableBody>
          </Table>
          {health.overdue?.length > 0 && (
            <div className="mt-3 border-t border-navy-700/60 pt-3">
              <div className="text-xs font-bold text-red-300 mb-1.5">⚠️ รอบค้างออกผล ({health.overdue.length})</div>
              <div className="flex flex-wrap gap-1.5">
                {health.overdue.slice(0, 20).map(d => (
                  <span key={d.id} className="text-[11px] bg-red-500/10 border border-red-500/30 text-red-300 rounded px-2 py-1">
                    {d.type_name_th}{d.cat_name_th ? ` — ${d.cat_name_th}` : ''} • {fmtDateTime(d.draw_at)}
                  </span>
                ))}
                {health.overdue.length > 20 && <span className="text-[11px] text-navy-400">+อีก {health.overdue.length - 20} รอบ</span>}
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
      <div className="bg-navy-800 border border-navy-700 rounded-xl p-5">
        <h2 className="font-bold text-white mb-1">กระแสเครดิตเข้า-ออก (7 วันล่าสุด)</h2>
        <p className="text-[11px] text-navy-400 mb-4">เขียว = เครดิตเข้า • แดง = เครดิตออก (ทุกประเภทธุรกรรม)</p>
        <div className="flex items-end gap-2 h-40">
          {daily.map(x => (
            <div key={x.day} className="flex-1 flex flex-col items-center gap-1 min-w-0">
              <div className="w-full flex gap-0.5 items-end justify-center" style={{ height: '120px' }}>
                <div className="w-1/2 bg-green-500/70 rounded-t" style={{ height: `${Math.max(2, (x.inn / maxDaily) * 100)}%` }} title={`เข้า ${satang(x.inn)} บาท`} />
                <div className="w-1/2 bg-red-500/70 rounded-t" style={{ height: `${Math.max(2, (x.out / maxDaily) * 100)}%` }} title={`ออก ${satang(x.out)} บาท`} />
              </div>
              <div className="text-[9px] text-navy-400 truncate w-full text-center">{x.day.slice(5)}</div>
            </div>
          ))}
          {!daily.length && <div className="text-navy-400 text-sm w-full text-center py-10">ยังไม่มีธุรกรรมใน 7 วัน</div>}
        </div>
        <div className="flex gap-4 mt-3 text-[11px] text-navy-300">
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-green-500/70 inline-block" /> เครดิตเข้า</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-red-500/70 inline-block" /> เครดิตออก</span>
        </div>
      </div>

      {/* Audit + Security */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-navy-800 border border-navy-700 rounded-xl p-4">
          <h2 className="font-bold text-white mb-3">Audit ล่าสุด</h2>
          <div className="space-y-1 text-xs max-h-64 overflow-y-auto">
            {d.recentAudit.map(a => (
              <div key={a.id} className="flex justify-between gap-2 text-navy-300 border-b border-navy-700/50 pb-1">
                <span><span className="text-gold-300">{a.action}</span> โดย {a.username || a.user_id || 'system'}</span>
                <span className="text-navy-500 shrink-0">{fmtDateTime(a.created_at)}</span>
              </div>
            ))}
            {!d.recentAudit.length && <div className="text-navy-400">ไม่มีรายการ</div>}
          </div>
        </div>
        <div className="bg-navy-800 border border-navy-700 rounded-xl p-4">
          <h2 className="font-bold text-white mb-3">Security Events ล่าสุด</h2>
          <div className="space-y-1 text-xs max-h-64 overflow-y-auto">
            {d.recentSecurity.map(s => (
              <div key={s.id} className={`flex justify-between gap-2 border-b border-navy-700/50 pb-1 ${s.severity === 'critical' ? 'text-red-400' : 'text-navy-300'}`}>
                <span>{s.event_type} • {s.username || s.ip || ''}</span>
                <span className="text-navy-500 shrink-0">{fmtDateTime(s.created_at)}</span>
              </div>
            ))}
            {!d.recentSecurity.length && <div className="text-navy-400">ไม่มีเหตุการณ์</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
