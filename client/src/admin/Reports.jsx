import { useEffect, useState } from 'react';
import { api, satang, fmtDateTime } from '../api.js';
import { thaiDate } from '../time.js';

const DRAW_STATUS_TH = {
  scheduled: 'กำหนดการ', open: 'เปิดรับ', closed: 'ปิดรับ',
  settled: 'ออกผลแล้ว', cancelled: 'ยกเลิก',
};
const DRAW_STATUS_CLS = {
  scheduled: 'bg-navy-700 text-navy-200', open: 'bg-green-500/20 text-green-300',
  closed: 'bg-yellow-500/20 text-yellow-300', settled: 'bg-blue-500/20 text-blue-300',
  cancelled: 'bg-red-500/20 text-red-300',
};

function Kpi({ label, value, sub, tone = 'text-white' }) {
  return (
    <div className="bg-navy-800 border border-navy-700 rounded-xl p-4">
      <div className="text-xs text-navy-400">{label}</div>
      <div className={`text-xl font-bold mt-1 ${tone}`}>{value}</div>
      {sub && <div className="text-[11px] text-navy-500 mt-0.5">{sub}</div>}
    </div>
  );
}

function Th({ children, right, center }) {
  const align = right ? 'text-right' : center ? 'text-center' : 'text-left';
  return <th className={`text-xs text-navy-300 font-medium py-2 ${align}`}>{children}</th>;
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
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">รายงาน (Reports)</h1>

      {/* KPI รวมทั้งระบบ */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <Kpi label="โพยทั้งหมด" value={t.slips ?? 0} sub="ไม่รวมที่ยกเลิก/คืนเงิน" />
        <Kpi label="ยอดแทงรวม" value={`฿${satang(t.stake || 0)}`} tone="text-gold-300" />
        <Kpi label="จ่ายรางวัลรวม" value={`฿${satang(t.payout || 0)}`} tone="text-green-400" />
        <Kpi label="กำไรระบบ (Net)" value={`฿${satang(houseNet)}`} tone={houseNet >= 0 ? 'text-green-400' : 'text-red-400'}
          sub="ยอดแทง − เงินรางวัล" />
        <Kpi label="อัตราถูกรางวัล" value={`${winRate}%`} sub={`จาก ${t.items?.c ?? 0} รายการที่ออกผล`} />
        <Kpi label="ยอดค้างรอผล" value={`฿${satang(t.pendingExposure || 0)}`} tone="text-yellow-300"
          sub="ความเสี่ยงที่ยังไม่ settle" />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {/* ยอดแทงตามประเภทการแทง */}
        <div className="bg-navy-800 border border-navy-700 rounded-xl p-5">
          <h2 className="font-bold text-white mb-3">ยอดแทงตามประเภทการแทง</h2>
          <div className="overflow-x-auto"><table className="w-full text-sm whitespace-nowrap">
            <thead><tr className="border-b border-navy-700">
              <Th>ประเภท</Th><Th right>รายการ</Th><Th right>ถูก</Th><Th right>เรทถูก</Th><Th right>ยอดแทง</Th><Th right>จ่ายออก</Th>
            </tr></thead>
            <tbody className="divide-y divide-navy-700/60">
              {d.betsByType.map(b => {
                const rate = b.c ? Math.round((b.won / b.c) * 1000) / 10 : 0;
                return (
                  <tr key={b.rule_name + b.bet_type}>
                    <td className="py-2 text-white">{b.rule_name}</td>
                    <td className="text-right text-navy-300">{b.c}</td>
                    <td className="text-right text-navy-300">{b.won}</td>
                    <td className="text-right text-navy-300">{rate}%</td>
                    <td className="text-right text-gold-300">฿{satang(b.stake)}</td>
                    <td className="text-right text-green-400">฿{satang(b.payout)}</td>
                  </tr>
                );
              })}
              {!d.betsByType.length && <tr><td colSpan="6" className="py-4 text-center text-navy-400">ไม่มีข้อมูล</td></tr>}
            </tbody>
          </table></div>
        </div>

        {/* โพยรายวัน */}
        <div className="bg-navy-800 border border-navy-700 rounded-xl p-5">
          <h2 className="font-bold text-white mb-3">โพยรายวัน (30 วันล่าสุด)</h2>
          <div className="overflow-x-auto"><table className="w-full text-sm whitespace-nowrap">
            <thead><tr className="border-b border-navy-700">
              <Th>วันที่</Th><Th right>โพย</Th><Th right>ยอดแทง</Th><Th right>จ่ายรางวัล</Th><Th right>กำไรวัน</Th>
            </tr></thead>
            <tbody className="divide-y divide-navy-700/60">
              {d.betsByDay.map(b => {
                const net = b.stake - b.payout;
                return (
                  <tr key={b.day}>
                    <td className="py-2 text-white">{thaiDate(b.day + ' 00:00:00')}</td>
                    <td className="text-right text-navy-300">{b.slips}</td>
                    <td className="text-right text-gold-300">฿{satang(b.stake)}</td>
                    <td className="text-right text-green-400">฿{satang(b.payout)}</td>
                    <td className={`text-right font-semibold ${net >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {net >= 0 ? '+' : ''}฿{satang(net)}
                    </td>
                  </tr>
                );
              })}
              {!d.betsByDay.length && <tr><td colSpan="5" className="py-4 text-center text-navy-400">ไม่มีข้อมูล</td></tr>}
            </tbody>
          </table></div>
        </div>
      </div>

      {/* ผู้ชนะรางวัลสูงสุด */}
      <div className="bg-navy-800 border border-navy-700 rounded-xl p-5">
        <h2 className="font-bold text-white mb-3">🏆 ผู้ชนะรางวัลสูงสุด</h2>
        <div className="overflow-x-auto"><table className="w-full text-sm whitespace-nowrap">
          <thead><tr className="border-b border-navy-700">
            <Th>สมาชิก</Th><Th>เลขโพย</Th><Th>รอบหวย</Th><Th right>รายการถูก</Th><Th right>เงินรางวัลรวม</Th>
          </tr></thead>
          <tbody className="divide-y divide-navy-700/60">
            {d.topWinners.map(w => (
              <tr key={w.slip_ref}>
                <td className="py-2 text-white">{w.username}</td>
                <td className="font-mono text-gold-300 text-xs">{w.slip_ref}</td>
                <td className="text-navy-300 text-xs">{w.type_name_th} • {w.draw_code}</td>
                <td className="text-right text-navy-300">{w.items} รายการ</td>
                <td className="text-right text-green-400 font-bold">฿{satang(w.payout)}</td>
              </tr>
            ))}
            {!d.topWinners.length && <tr><td colSpan="5" className="py-4 text-center text-navy-400">ยังไม่มีผู้ชนะ</td></tr>}
          </tbody>
        </table></div>
      </div>

      {/* สถานะรอบหวยล่าสุด */}
      <div className="bg-navy-800 border border-navy-700 rounded-xl p-5">
        <h2 className="font-bold text-white mb-3">สถานะรอบหวยล่าสุด</h2>
        <div className="overflow-x-auto"><table className="w-full text-sm whitespace-nowrap">
          <thead><tr className="border-b border-navy-700">
            <Th>รอบ</Th><Th>ประเภท</Th><Th>เวลาออกรางวัล</Th><Th center>สถานะ</Th><Th right>รายการ</Th><Th right>ยอดแทง</Th><Th right>จ่ายรวม</Th><Th right>กำไร</Th>
          </tr></thead>
          <tbody className="divide-y divide-navy-700/60">
            {d.drawsSummary.map(x => {
              const net = x.stake - x.payout;
              const settled = ['settled', 'cancelled'].includes(x.status);
              return (
                <tr key={x.draw_code}>
                  <td className="py-2 font-mono text-gold-300 text-xs">{x.draw_code}</td>
                  <td className="text-white">{x.name_th}</td>
                  <td className="text-navy-300 text-xs">{fmtDateTime(x.draw_at)}</td>
                  <td className="text-center">
                    <span className={`text-xs px-2 py-0.5 rounded ${DRAW_STATUS_CLS[x.status] || 'bg-navy-700 text-navy-300'}`}>
                      {DRAW_STATUS_TH[x.status] || x.status}
                    </span>
                  </td>
                  <td className="text-right text-navy-300">{x.items}</td>
                  <td className="text-right text-gold-300">฿{satang(x.stake)}</td>
                  <td className="text-right text-green-400">฿{satang(x.payout)}</td>
                  <td className={`text-right font-semibold ${settled ? (net >= 0 ? 'text-green-400' : 'text-red-400') : 'text-navy-500'}`}>
                    {settled ? `${net >= 0 ? '+' : ''}฿${satang(net)}` : '—'}
                  </td>
                </tr>
              );
            })}
            {!d.drawsSummary.length && <tr><td colSpan="8" className="py-4 text-center text-navy-400">ไม่มีข้อมูล</td></tr>}
          </tbody>
        </table></div>
      </div>
    </div>
  );
}
