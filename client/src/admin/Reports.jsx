import { useEffect, useState } from 'react';
import { api, satang, fmtDateTime } from '../api.js';
import { thaiDate } from '../time.js';
import { FlagIcon } from '../components/ResultLine.jsx';
import { StatCard } from '../components/ui/index.js';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/shadcn/table.jsx';
import { Badge } from '../components/shadcn/badge.jsx';
import { cn } from '../lib/utils.js';

const DRAW_STATUS_TH = {
  scheduled: 'กำหนดการ', open: 'เปิดรับ', closed: 'ปิดรับ',
  settled: 'ออกผลแล้ว', cancelled: 'ยกเลิก',
};
const DRAW_STATUS_CLS = {
  scheduled: 'border-[var(--border-light)] text-[var(--muted-gray)]', open: 'border-[rgba(34,197,94,0.3)] text-[var(--success-green)]',
  closed: 'border-[rgba(245,158,11,0.3)] text-[var(--warning-amber)]', settled: 'border-[rgba(59,130,246,0.3)] text-[var(--info-blue)]',
  cancelled: 'border-[rgba(239,68,68,0.3)] text-[var(--danger-red)]',
};
function DrawStatusBadge({ status }) {
  return <Badge variant="outline" className={cn('text-[10px] font-semibold', DRAW_STATUS_CLS[status] || 'border-navy-500 text-navy-300')}>{DRAW_STATUS_TH[status] || status}</Badge>;
}

function Kpi({ label, value, sub, tone = 'text-white' }) {
  return <StatCard label={label} value={value} sub={sub} accent={tone} />;
}

export default function AdminReports() {
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    api('/admin/reports/summary').then(setD).catch(e => setErr(e.message));
  }, []);
  if (err) return <div className="text-sm text-[var(--danger-red)] bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.3)] rounded-lg p-3">เกิดข้อผิดพลาด: {err}</div>;
  if (!d) return <div className="text-[var(--muted-gray)]">กำลังโหลด...</div>;

  const t = d.totals || {};
  const houseNet = (t.stake || 0) - (t.payout || 0);
  const winRate = t.items?.c ? Math.round((t.items.w / t.items.c) * 1000) / 10 : 0;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-[var(--white)]">รายงาน (Reports)</h1>

      {/* KPI รวมทั้งระบบ */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <Kpi label="โพยทั้งหมด" value={t.slips ?? 0} sub="ไม่รวมที่ยกเลิก/คืนเงิน" />
        <Kpi label="ยอดแทงรวม" value={`${satang(t.stake || 0)} บาท`} tone="text-gold-300" />
        <Kpi label="จ่ายรางวัลรวม" value={`${satang(t.payout || 0)} บาท`} tone="text-green-400" />
        <Kpi label="กำไรระบบ (Net)" value={`${satang(houseNet)} บาท`} tone={houseNet >= 0 ? 'text-green-400' : 'text-red-400'}
          sub="ยอดแทง − เงินรางวัล" />
        <Kpi label="อัตราถูกรางวัล" value={`${winRate}%`} sub={`จาก ${t.items?.c ?? 0} รายการที่ออกผล`} />
        <Kpi label="ยอดค้างรอผล" value={`${satang(t.pendingExposure || 0)} บาท`} tone="text-yellow-300"
          sub={t.unplayedInstant ? `รอผลรอบ ${satang(t.unplayedInstant)} บาท = เกมด่วนซื้อแล้วยังไม่เล่น` : 'ความเสี่ยงที่ยังไม่ settle'} />
      </div>

      {/* ยอดแทงตามประเภทการแทง */}
        <div className="bg-[var(--bg-card)] border border-[var(--border-light)] rounded-xl p-5">
          <h2 className="font-bold text-[var(--white)] mb-3">ยอดแทงตามประเภทการแทง</h2>
          <Table>
            <TableHeader>
              <TableRow className="border-[var(--border-light)] hover:bg-transparent">
                <TableHead className="text-[var(--muted-gray)]">ประเทศ/ประเภทหวย</TableHead>
                <TableHead className="text-[var(--muted-gray)]">หมวด</TableHead>
                <TableHead className="text-[var(--muted-gray)]">ประเภทการแทง</TableHead>
                <TableHead className="text-[var(--muted-gray)] text-right">รายการ</TableHead>
                <TableHead className="text-[var(--muted-gray)] text-right">ถูก</TableHead>
                <TableHead className="text-[var(--muted-gray)] text-right">เรทถูก</TableHead>
                <TableHead className="text-[var(--muted-gray)] text-right">ยอดแทง</TableHead>
                <TableHead className="text-[var(--muted-gray)] text-right">จ่ายออก</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {d.betsByType.map((b, i) => {
                const settled = (b.won || 0) + (b.lost || 0);
                const rate = settled ? Math.round((b.won / settled) * 1000) / 10 : 0;
                return (
                  <TableRow key={`${b.rule_name}-${b.type_code}-${b.category_name_th}-${i}`} className="border-[var(--border-light)]">
                    <TableCell className="text-[var(--white)] whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5">
                        <FlagIcon code={b.type_code} className="w-5 h-3.5" />
                        {b.type_name_th}
                      </span>
                    </TableCell>
                    <TableCell className="text-[var(--muted-gray)] text-xs">{b.category_name_th || '—'}</TableCell>
                    <TableCell className="text-[var(--light-gray)]">{b.rule_name}</TableCell>
                    <TableCell className="text-right text-[var(--muted-gray)]">{b.c}</TableCell>
                    <TableCell className="text-right text-[var(--muted-gray)]">{b.won}</TableCell>
                    <TableCell className="text-right text-[var(--muted-gray)]">{rate}%</TableCell>
                    <TableCell className="text-right text-[var(--gold-primary)]">{satang(b.stake)} บาท</TableCell>
                    <TableCell className="text-right text-[var(--success-green)]">{satang(b.payout)} บาท</TableCell>
                  </TableRow>
                );
              })}
              {!d.betsByType.length && <TableRow><TableCell colSpan="8" className="text-center text-[var(--muted-gray)] py-4">ไม่มีข้อมูล</TableCell></TableRow>}
            </TableBody>
          </Table>
        </div>

        {/* โพยรายวัน */}
        <div className="bg-[var(--bg-card)] border border-[var(--border-light)] rounded-xl p-5">
          <h2 className="font-bold text-[var(--white)] mb-3">โพยรายวัน (30 วันล่าสุด)</h2>
          <Table>
            <TableHeader>
              <TableRow className="border-[var(--border-light)] hover:bg-transparent">
                <TableHead className="text-[var(--muted-gray)]">วันที่</TableHead>
                <TableHead className="text-[var(--muted-gray)] text-right">โพย</TableHead>
                <TableHead className="text-[var(--muted-gray)] text-right">ยอดแทง</TableHead>
                <TableHead className="text-[var(--muted-gray)] text-right">จ่ายรางวัล</TableHead>
                <TableHead className="text-[var(--muted-gray)] text-right">กำไรวัน</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {d.betsByDay.map(b => {
                const net = b.stake - b.payout;
                return (
                  <TableRow key={b.day} className="border-[var(--border-light)]">
                    <TableCell className="text-[var(--white)]">{thaiDate(b.day + ' 00:00:00')}</TableCell>
                    <TableCell className="text-right text-[var(--muted-gray)]">{b.slips}</TableCell>
                    <TableCell className="text-right text-[var(--gold-primary)]">{satang(b.stake)} บาท</TableCell>
                    <TableCell className="text-right text-[var(--success-green)]">{satang(b.payout)} บาท</TableCell>
                    <TableCell className={cn('text-right font-semibold', net >= 0 ? 'text-[var(--success-green)]' : 'text-[var(--danger-red)]')}>
                      {net >= 0 ? '+' : ''}{satang(net)} บาท
                    </TableCell>
                  </TableRow>
                );
              })}
              {!d.betsByDay.length && <TableRow><TableCell colSpan="5" className="text-center text-[var(--muted-gray)] py-4">ไม่มีข้อมูล</TableCell></TableRow>}
            </TableBody>
          </Table>
        </div>

      {/* ผู้ชนะรางวัลสูงสุด */}
      <div className="bg-[var(--bg-card)] border border-[var(--border-light)] rounded-xl p-5">
        <h2 className="font-bold text-[var(--white)] mb-3">🏆 ผู้ชนะรางวัลสูงสุด</h2>
        <Table>
          <TableHeader>
            <TableRow className="border-[var(--border-light)] hover:bg-transparent">
              <TableHead className="text-[var(--muted-gray)]">สมาชิก</TableHead>
              <TableHead className="text-[var(--muted-gray)]">เลขโพย</TableHead>
              <TableHead className="text-[var(--muted-gray)]">รอบหวย</TableHead>
              <TableHead className="text-[var(--muted-gray)] text-right">รายการถูก</TableHead>
              <TableHead className="text-[var(--muted-gray)] text-right">เงินรางวัลรวม</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {d.topWinners.map(w => (
              <TableRow key={w.slip_ref} className="border-[var(--border-light)]">
                <TableCell className="text-[var(--white)]">{w.username}</TableCell>
                <TableCell className="font-mono text-[var(--gold-primary)] text-xs">{w.slip_ref}</TableCell>
                <TableCell className="text-[var(--muted-gray)] text-xs">
                  {w.type_name_th}{w.draw_code && !w.draw_code.endsWith('-STANDING') ? ` • ${w.draw_code}` : ''}
                </TableCell>
                <TableCell className="text-right text-[var(--muted-gray)]">{w.items} รายการ</TableCell>
                <TableCell className="text-right text-[var(--success-green)] font-bold">{satang(w.payout)} บาท</TableCell>
              </TableRow>
            ))}
            {!d.topWinners.length && <TableRow><TableCell colSpan="5" className="text-center text-[var(--muted-gray)] py-4">ยังไม่มีผู้ชนะ</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>

      {/* สถานะรอบหวยล่าสุด */}
      <div className="bg-[var(--bg-card)] border border-[var(--border-light)] rounded-xl p-5">
        <h2 className="font-bold text-[var(--white)] mb-3">สถานะรอบหวยล่าสุด</h2>
        <Table>
          <TableHeader>
            <TableRow className="border-[var(--border-light)] hover:bg-transparent">
              <TableHead className="text-[var(--muted-gray)]">รอบ</TableHead>
              <TableHead className="text-[var(--muted-gray)]">ประเภท</TableHead>
              <TableHead className="text-[var(--muted-gray)]">เวลาออกรางวัล</TableHead>
              <TableHead className="text-[var(--muted-gray)] text-center">สถานะ</TableHead>
              <TableHead className="text-[var(--muted-gray)] text-right">รายการ</TableHead>
              <TableHead className="text-[var(--muted-gray)] text-right">ยอดแทง</TableHead>
              <TableHead className="text-[var(--muted-gray)] text-right">จ่ายรวม</TableHead>
              <TableHead className="text-[var(--muted-gray)] text-right">กำไร</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {d.drawsSummary.map(x => {
              const net = x.stake - x.payout;
              const settled = ['settled', 'cancelled'].includes(x.status);
              return (
                <TableRow key={x.draw_code} className="border-[var(--border-light)]">
                  <TableCell className="font-mono text-[var(--gold-primary)] text-xs">{x.draw_code}</TableCell>
                  <TableCell className="text-[var(--white)]">{x.name_th}</TableCell>
                  <TableCell className="text-[var(--muted-gray)] text-xs">{fmtDateTime(x.draw_at)}</TableCell>
                  <TableCell className="text-center"><DrawStatusBadge status={x.status} /></TableCell>
                  <TableCell className="text-right text-[var(--muted-gray)]">{x.items}</TableCell>
                  <TableCell className="text-right text-[var(--gold-primary)]">{satang(x.stake)} บาท</TableCell>
                  <TableCell className="text-right text-[var(--success-green)]">{satang(x.payout)} บาท</TableCell>
                  <TableCell className={cn('text-right font-semibold', settled ? (net >= 0 ? 'text-[var(--success-green)]' : 'text-[var(--danger-red)]') : 'text-[var(--dark-gray)]')}>
                    {settled ? `${net >= 0 ? '+' : ''}${satang(net)} บาท` : '—'}
                  </TableCell>
                </TableRow>
              );
            })}
            {!d.drawsSummary.length && <TableRow><TableCell colSpan="8" className="text-center text-[var(--muted-gray)] py-4">ไม่มีข้อมูล</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>

      {/* กำไรต่อรอบ — settled 30 วันล่าสุด */}
      {d.profitByDraw?.length > 0 && (
        <div className="bg-[var(--bg-card)] border border-[var(--border-light)] rounded-xl p-5">
          <h2 className="font-bold text-[var(--white)] mb-1">กำไรต่อรอบ (30 วันล่าสุด)</h2>
          <p className="text-xs text-[var(--muted-gray)] mb-3">vip = ยอดแทง − เงินรางวัล · ติดลบ = ระบบขาดทุนรอบนั้น</p>
          <Table>
            <TableHeader>
              <TableRow className="border-[var(--border-light)] hover:bg-transparent">
                <TableHead className="text-[var(--muted-gray)]">รอบ</TableHead>
                <TableHead className="text-[var(--muted-gray)]">ตลาด</TableHead>
                <TableHead className="text-[var(--muted-gray)]">เวลาออกรางวัล</TableHead>
                <TableHead className="text-[var(--muted-gray)] text-center">สถานะ</TableHead>
                <TableHead className="text-[var(--muted-gray)] text-right">รายการ</TableHead>
                <TableHead className="text-[var(--muted-gray)] text-right">ยอดแทง</TableHead>
                <TableHead className="text-[var(--muted-gray)] text-right">จ่ายรางวัล</TableHead>
                <TableHead className="text-[var(--muted-gray)] text-right">Vip</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {d.profitByDraw.map(x => {
                const net = x.stake - x.payout;
                const settled = ['settled', 'cancelled'].includes(x.status);
                return (
                  <TableRow key={x.draw_code} className="border-[var(--border-light)]">
                    <TableCell className="font-mono text-[var(--gold-primary)] text-xs">{x.draw_code}</TableCell>
                    <TableCell className="text-[var(--white)] text-xs">{x.type_name_th}{x.cat_name_th ? ` — ${x.cat_name_th}` : ''}</TableCell>
                    <TableCell className="text-[var(--muted-gray)] text-xs">{fmtDateTime(x.draw_at)}</TableCell>
                    <TableCell className="text-center"><DrawStatusBadge status={x.status} /></TableCell>
                    <TableCell className="text-right text-[var(--muted-gray)]">{x.items}</TableCell>
                    <TableCell className="text-right text-[var(--gold-primary)]">{satang(x.stake)} บาท</TableCell>
                    <TableCell className="text-right text-[var(--success-green)]">{satang(x.payout)} บาท</TableCell>
                    <TableCell className={cn('text-right font-semibold', settled ? (net >= 0 ? 'text-[var(--success-green)]' : 'text-[var(--danger-red)]') : 'text-[var(--dark-gray)]')}>
                      {settled ? `${net >= 0 ? '+' : ''}${satang(net)} บาท` : '—'}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
