import { useEffect, useState } from 'react';
import { api, satang } from '../api.js';

export default function AdminReports() {
  const [d, setD] = useState(null);
  useEffect(() => { api('/admin/reports/summary').then(setD).catch(e => alert(e.message)); }, []);
  if (!d) return <div className="text-navy-300">กำลังโหลด...</div>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">รายงาน (Reports)</h1>
      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-navy-800 border border-navy-700 rounded-xl p-5">
          <h2 className="font-bold text-white mb-3">ยอดแทงตามประเภท</h2>
          <table className="w-full text-sm">
            <thead className="text-navy-300 text-xs"><tr><th className="text-left py-1">ประเภท</th><th className="text-right">จำนวน</th><th className="text-right">ยอดแทง</th><th className="text-right">จ่ายออก</th></tr></thead>
            <tbody className="divide-y divide-navy-700">
              {d.betsByType.map(b => (
                <tr key={b.bet_type}><td className="py-2 text-white">{b.bet_type}</td>
                  <td className="text-right text-navy-300">{b.c}</td>
                  <td className="text-right text-gold-300">฿{satang(b.stake)}</td>
                  <td className="text-right text-green-400">฿{satang(b.payout)}</td></tr>
              ))}
              {!d.betsByType.length && <tr><td colSpan="4" className="py-4 text-center text-navy-400">ไม่มีข้อมูล</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="bg-navy-800 border border-navy-700 rounded-xl p-5">
          <h2 className="font-bold text-white mb-3">โพยรายวัน (30 วันล่าสุด)</h2>
          <table className="w-full text-sm">
            <thead className="text-navy-300 text-xs"><tr><th className="text-left py-1">วันที่</th><th className="text-right">โพย</th><th className="text-right">ยอดแทง</th></tr></thead>
            <tbody className="divide-y divide-navy-700">
              {d.betsByDay.map(b => (
                <tr key={b.day}><td className="py-2 text-white">{b.day}</td>
                  <td className="text-right text-navy-300">{b.slips}</td>
                  <td className="text-right text-gold-300">฿{satang(b.stake)}</td></tr>
              ))}
              {!d.betsByDay.length && <tr><td colSpan="3" className="py-4 text-center text-navy-400">ไม่มีข้อมูล</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      <div className="bg-navy-800 border border-navy-700 rounded-xl p-5">
        <h2 className="font-bold text-white mb-3">ผู้ชนะรางวัลสูงสุด</h2>
        <table className="w-full text-sm">
          <thead className="text-navy-300 text-xs"><tr><th className="text-left py-1">สมาชิก</th><th className="text-left">เลขโพย</th><th className="text-right">เงินรางวัล</th></tr></thead>
          <tbody className="divide-y divide-navy-700">
            {d.topWinners.map(w => (
              <tr key={w.slip_ref}><td className="py-2 text-white">{w.username}</td>
                <td className="font-mono text-gold-300 text-xs">{w.slip_ref}</td>
                <td className="text-right text-green-400 font-bold">฿{satang(w.payout)}</td></tr>
            ))}
            {!d.topWinners.length && <tr><td colSpan="3" className="py-4 text-center text-navy-400">ยังไม่มีผู้ชนะ</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="bg-navy-800 border border-navy-700 rounded-xl p-5">
        <h2 className="font-bold text-white mb-3">สถานะรอบหวยล่าสุด</h2>
        <table className="w-full text-sm">
          <thead className="text-navy-300 text-xs"><tr><th className="text-left py-1">รอบ</th><th className="text-left">ประเภท</th><th className="text-center">สถานะ</th><th className="text-right">รายการ</th><th className="text-right">จ่ายรวม</th></tr></thead>
          <tbody className="divide-y divide-navy-700">
            {d.drawsSummary.map(x => (
              <tr key={x.draw_code}><td className="py-2 font-mono text-gold-300 text-xs">{x.draw_code}</td>
                <td className="text-white">{x.name_th}</td><td className="text-center text-navy-300">{x.status}</td>
                <td className="text-right text-navy-300">{x.items}</td>
                <td className="text-right text-green-400">฿{satang(x.payout)}</td></tr>
            ))}
            {!d.drawsSummary.length && <tr><td colSpan="5" className="py-4 text-center text-navy-400">ไม่มีข้อมูล</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
