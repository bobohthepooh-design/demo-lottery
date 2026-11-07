import { useEffect, useState } from 'react';
import { api, satang } from '../api.js';

export default function AdminOverview() {
  const [d, setD] = useState(null);
  useEffect(() => { api('/admin/overview').then(setD).catch(e => alert(e.message)); }, []);
  if (!d) return <div className="text-navy-300">กำลังโหลด...</div>;

  const cards = [
    ['สมาชิกทั้งหมด', d.members], ['รอบที่เปิดรับ', d.activeDraws], ['โพยรอผล', d.pendingBets],
    ['เครดิตในระบบ (สตางค์)', satang(d.walletLiability)], ['ยอดแทงรอผล', satang(d.totalStaked)], ['ยอดจ่ายรางวัลแล้ว', satang(d.totalPaid)],
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Dashboard ภาพรวม</h1>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {cards.map(([label, val]) => (
          <div key={label} className="bg-navy-800 border border-navy-700 rounded-xl p-5">
            <div className="text-xs text-navy-300">{label}</div>
            <div className="text-2xl font-bold text-gold-400 mt-1">{typeof val === 'number' && label.includes('เครดิต') || label.includes('ยอด') ? '฿' + val : val}</div>
          </div>
        ))}
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-navy-800 border border-navy-700 rounded-xl p-4">
          <h2 className="font-bold text-white mb-3">Audit ล่าสุด</h2>
          <div className="space-y-1 text-xs max-h-64 overflow-y-auto">
            {d.recentAudit.map(a => <div key={a.id} className="text-navy-300"><span className="text-gold-300">{a.action}</span> โดย {a.user_id} • {a.created_at}</div>)}
          </div>
        </div>
        <div className="bg-navy-800 border border-navy-700 rounded-xl p-4">
          <h2 className="font-bold text-white mb-3">Security Events ล่าสุด</h2>
          <div className="space-y-1 text-xs max-h-64 overflow-y-auto">
            {d.recentSecurity.map(s => <div key={s.id} className={s.severity === 'critical' ? 'text-red-400' : 'text-navy-300'}>{s.event_type} • {s.ip} • {s.created_at}</div>)}
            {!d.recentSecurity.length && <div className="text-navy-400">ไม่มีเหตุการณ์</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
