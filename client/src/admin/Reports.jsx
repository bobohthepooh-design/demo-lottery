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
  scheduled: 'border-navy-500 text-navy-200', open: 'border-emerald-500/40 text-emerald-300',
  closed: 'border-amber-500/40 text-amber-300', settled: 'border-sky-500/40 text-sky-300',
  cancelled: 'border-red-500/40 text-red-300',
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
  if (err) return <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg p-3">เกิดข้อผิดพลาด: {err}</div>;
  if (!d) return <div className="text-navy-300">กำลังโหลด...</div>;

  const t = d.totals || {};
  const houseNet = (t.stake || 0) - (t.payout || 0);
  const winRate = t.items?.c ? Math.round((t.items.w / t.items.c) * 1000) / 10 : 0;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-white">รายงาน (Reports)</h1>

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
        <div className="bg-navy-800 border border-navy-700 rounded-xl p-5">
          <h2 className="font-bold text-white mb-3">ยอดแทงตามประเภทการแทง</h2>
          <Table>
            <TableHeader>
              <TableRow className="border-navy-700 hover:bg-transparent">
                <TableHead className="text-navy-400">ประเทศ/ประเภทหวย</TableHead>
                <TableHead className="text-navy-400">หมวด</TableHead>
                <TableHead className="text-navy-400">ประเภทการแทง</TableHead>
                <TableHead className="text-navy-400 text-right">รายการ</TableHead>
                <TableHead className="text-navy-400 text-right">ถูก</TableHead>
                <TableHead className="text-navy-400 text-right">เรทถูก</TableHead>
                <TableHead className="text-navy-400 text-right">ยอดแทง</TableHead>
                <TableHead className="text-navy-400 text-right">จ่ายออก</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {d.betsByType.map((b, i) => {
                const settled = (b.won || 0) + (b.lost || 0);
                const rate = settled ? Math.round((b.won / settled) * 1000) / 10 : 0;
                return (
                  <TableRow key={`${b.rule_name}-${b.type_code}-${b.category_name_th}-${i}`} className="border-navy-700/50">
                    <TableCell className="text-white whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5">
                        <FlagIcon code={b.type_code} className="w-5 h-3.5" />
                        {b.type_name_th}
                      </span>
                    </TableCell>
                    <TableCell className="text-navy-300 text-xs">{b.category_name_th || '—'}</TableCell>
                    <TableCell className="text-navy-200">{b.rule_name}</TableCell>
                    <TableCell className="text-right text-navy-300">{b.c}</TableCell>
                    <TableCell className="text-right text-navy-300">{b.won}</TableCell>
                    <TableCell className="text-right text-navy-300">{rate}%</TableCell>
                    <TableCell className="text-right text-gold-300">{satang(b.stake)} บาท</TableCell>
                    <TableCell className="text-right text-green-400">{satang(b.payout)} บาท</TableCell>
                  </TableRow>
                );
              })}
              {!d.betsByType.length && <TableRow><TableCell colSpan="8" className="text-center text-navy-400 py-4">ไม่มีข้อมูล</TableCell></TableRow>}
            </TableBody>
          </Table>
        </div>

        {/* โพยรายวัน */}
        <div className="bg-navy-800 border border-navy-700 rounded-xl p-5">
          <h2 className="font-bold text-white mb-3">โพยรายวัน (30 วันล่าสุด)</h2>
          <Table>
            <TableHeader>
              <TableRow className="border-navy-700 hover:bg-transparent">
                <TableHead className="text-navy-400">วันที่</TableHead>
                <TableHead className="text-navy-400 text-right">โพย</TableHead>
                <TableHead className="text-navy-400 text-right">ยอดแทง</TableHead>
                <TableHead className="text-navy-400 text-right">จ่ายรางวัล</TableHead>
                <TableHead className="text-navy-400 text-right">กำไรวัน</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {d.betsByDay.map(b => {
                const net = b.stake - b.payout;
                return (
                  <TableRow key={b.day} className="border-navy-700/50">
                    <TableCell className="text-white">{thaiDate(b.day + ' 00:00:00')}</TableCell>
                    <TableCell className="text-right text-navy-300">{b.slips}</TableCell>
                    <TableCell className="text-right text-gold-300">{satang(b.stake)} บาท</TableCell>
                    <TableCell className="text-right text-green-400">{satang(b.payout)} บาท</TableCell>
                    <TableCell className={cn('text-right font-semibold', net >= 0 ? 'text-green-400' : 'text-red-400')}>
                      {net >= 0 ? '+' : ''}{satang(net)} บาท
                    </TableCell>
                  </TableRow>
                );
              })}
              {!d.betsByDay.length && <TableRow><TableCell colSpan="5" className="text-center text-navy-400 py-4">ไม่มีข้อมูล</TableCell></TableRow>}
            </TableBody>
          </Table>
        </div>

      {/* ผู้ชนะรางวัลสูงสุด */}
      <div className="bg-navy-800 border border-navy-700 rounded-xl p-5">
        <h2 className="font-bold text-white mb-3">🏆 ผู้ชนะรางวัลสูงสุด</h2>
        <Table>
          <TableHeader>
            <TableRow className="border-navy-700 hover:bg-transparent">
              <TableHead className="text-navy-400">สมาชิก</TableHead>
              <TableHead className="text-navy-400">เลขโพย</TableHead>
              <TableHead className="text-navy-400">รอบหวย</TableHead>
              <TableHead className="text-navy-400 text-right">รายการถูก</TableHead>
              <TableHead className="text-navy-400 text-right">เงินรางวัลรวม</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {d.topWinners.map(w => (
              <TableRow key={w.slip_ref} className="border-navy-700/50">
                <TableCell className="text-white">{w.username}</TableCell>
                <TableCell className="font-mono text-gold-300 text-xs">{w.slip_ref}</TableCell>
                <TableCell className="text-navy-300 text-xs">
                  {w.type_name_th}{w.draw_code && !w.draw_code.endsWith('-STANDING') ? ` • ${w.draw_code}` : ''}
                </TableCell>
                <TableCell className="text-right text-navy-300">{w.items} รายการ</TableCell>
                <TableCell className="text-right text-green-400 font-bold">{satang(w.payout)} บาท</TableCell>
              </TableRow>
            ))}
            {!d.topWinners.length && <TableRow><TableCell colSpan="5" className="text-center text-navy-400 py-4">ยังไม่มีผู้ชนะ</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>

      {/* สถานะรอบหวยล่าสุด */}
      <div className="bg-navy-800 border border-navy-700 rounded-xl p-5">
        <h2 className="font-bold text-white mb-3">สถานะรอบหวยล่าสุด</h2>
        <Table>
          <TableHeader>
            <TableRow className="border-navy-700 hover:bg-transparent">
              <TableHead className="text-navy-400">รอบ</TableHead>
              <TableHead className="text-navy-400">ประเภท</TableHead>
              <TableHead className="text-navy-400">เวลาออกรางวัล</TableHead>
              <TableHead className="text-navy-400 text-center">สถานะ</TableHead>
              <TableHead className="text-navy-400 text-right">รายการ</TableHead>
              <TableHead className="text-navy-400 text-right">ยอดแทง</TableHead>
              <TableHead className="text-navy-400 text-right">จ่ายรวม</TableHead>
              <TableHead className="text-navy-400 text-right">กำไร</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {d.drawsSummary.map(x => {
              const net = x.stake - x.payout;
              const settled = ['settled', 'cancelled'].includes(x.status);
              return (
                <TableRow key={x.draw_code} className="border-navy-700/50">
                  <TableCell className="font-mono text-gold-300 text-xs">{x.draw_code}</TableCell>
                  <TableCell className="text-white">{x.name_th}</TableCell>
                  <TableCell className="text-navy-300 text-xs">{fmtDateTime(x.draw_at)}</TableCell>
                  <TableCell className="text-center"><DrawStatusBadge status={x.status} /></TableCell>
                  <TableCell className="text-right text-navy-300">{x.items}</TableCell>
                  <TableCell className="text-right text-gold-300">{satang(x.stake)} บาท</TableCell>
                  <TableCell className="text-right text-green-400">{satang(x.payout)} บาท</TableCell>
                  <TableCell className={cn('text-right font-semibold', settled ? (net >= 0 ? 'text-green-400' : 'text-red-400') : 'text-navy-500')}>
                    {settled ? `${net >= 0 ? '+' : ''}${satang(net)} บาท` : '—'}
                  </TableCell>
                </TableRow>
              );
            })}
            {!d.drawsSummary.length && <TableRow><TableCell colSpan="8" className="text-center text-navy-400 py-4">ไม่มีข้อมูล</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>

      {/* กำไรต่อรอบ — settled 30 วันล่าสุด */}
      {d.profitByDraw?.length > 0 && (
        <div className="bg-navy-800 border border-navy-700 rounded-xl p-5">
          <h2 className="font-bold text-white mb-1">กำไรต่อรอบ (30 วันล่าสุด)</h2>
          <p className="text-xs text-navy-400 mb-3">vip = ยอดแทง − เงินรางวัล · ติดลบ = ระบบขาดทุนรอบนั้น</p>
          <Table>
            <TableHeader>
              <TableRow className="border-navy-700 hover:bg-transparent">
                <TableHead className="text-navy-400">รอบ</TableHead>
                <TableHead className="text-navy-400">ตลาด</TableHead>
                <TableHead className="text-navy-400">เวลาออกรางวัล</TableHead>
                <TableHead className="text-navy-400 text-center">สถานะ</TableHead>
                <TableHead className="text-navy-400 text-right">รายการ</TableHead>
                <TableHead className="text-navy-400 text-right">ยอดแทง</TableHead>
                <TableHead className="text-navy-400 text-right">จ่ายรางวัล</TableHead>
                <TableHead className="text-navy-400 text-right">Vip</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {d.profitByDraw.map(x => {
                const net = x.stake - x.payout;
                const settled = ['settled', 'cancelled'].includes(x.status);
                return (
                  <TableRow key={x.draw_code} className="border-navy-700/50">
                    <TableCell className="font-mono text-gold-300 text-xs">{x.draw_code}</TableCell>
                    <TableCell className="text-white text-xs">{x.type_name_th}{x.cat_name_th ? ` — ${x.cat_name_th}` : ''}</TableCell>
                    <TableCell className="text-navy-300 text-xs">{fmtDateTime(x.draw_at)}</TableCell>
                    <TableCell className="text-center"><DrawStatusBadge status={x.status} /></TableCell>
                    <TableCell className="text-right text-navy-300">{x.items}</TableCell>
                    <TableCell className="text-right text-gold-300">{satang(x.stake)} บาท</TableCell>
                    <TableCell className="text-right text-green-400">{satang(x.payout)} บาท</TableCell>
                    <TableCell className={cn('text-right font-semibold', settled ? (net >= 0 ? 'text-green-400' : 'text-red-400') : 'text-navy-500')}>
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
