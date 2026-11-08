import { useEffect, useState } from 'react';
import { api, satang, fmtDateTime } from '../api.js';

const fmt = (satangVal) => `฿${satang(satangVal)}`;

function StatCard({ icon, label, value, sub, tone = 'gold' }) {
  const tones = {
    gold: 'from-gold-500/20 to-gold-600/5 border-gold-500/40 text-gold-300',
    green: 'from-green-500/20 to-green-600/5 border-green-500/40 text-green-300',
    red: 'from-red-500/20 to-red-600/5 border-red-500/40 text-red-300',
    blue: 'from-blue-500/20 to-blue-600/5 border-blue-500/40 text-blue-300',
    purple: 'from-purple-500/20 to-purple-600/5 border-purple-500/40 text-purple-300',
  };
  return (
    <div className={`bg-gradient-to-br ${tones[tone]} border rounded-2xl p-4`}>
      <div className="flex items-center justify-between">
        <span className="text-xl">{icon}</span>
        {sub && <span className="text-[10px] text-navy-300">{sub}</span>}
      </div>
      <div className="text-xl font-bold text-white mt-2">{value}</div>
      <div className="text-xs text-navy-300 mt-0.5">{label}</div>
    </div>
  );
}

export default function AdminOverview() {
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    api('/admin/overview').then(setD).catch(e => setErr(e.message));
  }, []);
  if (err) return <div className="text-red-400">เกิดข้อผิดพลาด: {err}</div>;
  if (!d) return <div className="text-navy-300">กำลังโหลด...</div>;

  const m = d.money || {};
  const daily = d.daily || [];
  const maxDaily = Math.max(1, ...daily.map(x => Math.max(x.inn, x.out)));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-white">📊 Dashboard ภาพรวม</h1>
          <p className="text-sm text-navy-300">ภาพรวมระบบ • เครดิตจำลอง (demo)</p>
        </div>
        <div className="text-xs text-navy-400 bg-navy-800 border border-navy-700 rounded-lg px-3 py-1.5">
          อัปเดต {new Date().toLocaleString('th-TH')}
        </div>
      </div>

      {/* รายรับ / รายจ่าย หลัก */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-gradient-to-br from-green-500/25 to-emerald-700/10 border border-green-500/50 rounded-2xl p-6 relative overflow-hidden">
          <div className="absolute -right-6 -top-6 text-7xl opacity-15">💰</div>
          <div className="text-sm text-green-300 font-semibold">รายรับรวม (เครดิตเข้า)</div>
          <div className="text-3xl font-black text-green-300 mt-1">{fmt(m.totalIn || 0)}</div>
          <div className="text-[11px] text-navy-300 mt-2">
            เติมเครดิต {fmt(m.deposit || 0)} • admin จ่าย {fmt(m.adminCredit || 0)} • เริ่มต้น {fmt(m.initialCredit || 0)}
          </div>
        </div>
        <div className="bg-gradient-to-br from-red-500/25 to-rose-700/10 border border-red-500/50 rounded-2xl p-6 relative overflow-hidden">
          <div className="absolute -right-6 -top-6 text-7xl opacity-15">💸</div>
          <div className="text-sm text-red-300 font-semibold">รายจ่ายรวม (เครดิตออก)</div>
          <div className="text-3xl font-black text-red-300 mt-1">{fmt(m.totalOut || 0)}</div>
          <div className="text-[11px] text-navy-300 mt-2">
            ถอน {fmt(m.withdraw || 0)} • admin หัก {fmt(m.adminDebit || 0)} • รางวัล {fmt(m.winnings || 0)} • คืนเงิน {fmt(m.refunds || 0)}
          </div>
        </div>
        <div className={`bg-gradient-to-br rounded-2xl p-6 relative overflow-hidden border ${m.houseNet >= 0 ? 'from-gold-500/25 to-amber-700/10 border-gold-500/50' : 'from-blue-500/25 to-indigo-700/10 border-blue-500/50'}`}>
          <div className="absolute -right-6 -top-6 text-7xl opacity-15">{m.houseNet >= 0 ? '🏆' : '📉'}</div>
          <div className={`text-sm font-semibold ${m.houseNet >= 0 ? 'text-gold-300' : 'text-blue-300'}`}>ส่วนต่างระบบ ( Stakes − รางวัล )</div>
          <div className={`text-3xl font-black mt-1 ${m.houseNet >= 0 ? 'text-gold-300' : 'text-blue-300'}`}>{fmt(m.houseNet || 0)}</div>
          <div className="text-[11px] text-navy-300 mt-2">เดิมพัน {fmt(m.staked || 0)} − จ่ายรางวัล {fmt(m.winnings || 0)} − คืนเงิน {fmt(m.refunds || 0)}</div>
        </div>
      </div>

      {/* สถิติระบบ */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <StatCard icon="👥" label="สมาชิกทั้งหมด" value={d.members} tone="blue" />
        <StatCard icon="🎟️" label="รอบที่เปิดรับ" value={d.activeDraws} tone="green" />
        <StatCard icon="⏳" label="โพยรอผล" value={d.pendingBets} tone="purple" />
        <StatCard icon="💵" label="ยอดเดิมพันรอผล" value={fmt(d.totalStaked)} tone="gold" />
        <StatCard icon="🎉" label="ยอดจ่ายรางวัลแล้ว" value={fmt(d.totalPaid)} tone="red" />
        <StatCard icon="🏦" label="เครดิตในระบบ" value={fmt(d.walletLiability)} tone="green" />
      </div>

      {/* กราฟเข้า-ออก 7 วัน */}
      <div className="bg-navy-800 border border-navy-700 rounded-2xl p-5">
        <h2 className="font-bold text-white mb-1">📈 กระแสเครดิตเข้า-ออก (7 วันล่าสุด)</h2>
        <p className="text-[11px] text-navy-400 mb-4">เขียว = เครดิตเข้า • แดง = เครดิตออก (ทุกประเภทธุรกรรม)</p>
        <div className="flex items-end gap-2 h-40">
          {daily.map(x => (
            <div key={x.day} className="flex-1 flex flex-col items-center gap-1 min-w-0">
              <div className="w-full flex gap-0.5 items-end justify-center" style={{ height: '120px' }}>
                <div className="w-1/2 bg-green-500/70 rounded-t" style={{ height: `${Math.max(2, (x.inn / maxDaily) * 100)}%` }} title={`เข้า ฿${satang(x.inn)}`} />
                <div className="w-1/2 bg-red-500/70 rounded-t" style={{ height: `${Math.max(2, (x.out / maxDaily) * 100)}%` }} title={`ออก ฿${satang(x.out)}`} />
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
      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-navy-800 border border-navy-700 rounded-2xl p-4">
          <h2 className="font-bold text-white mb-3">🧾 Audit ล่าสุด</h2>
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
        <div className="bg-navy-800 border border-navy-700 rounded-2xl p-4">
          <h2 className="font-bold text-white mb-3">🛡️ Security Events ล่าสุด</h2>
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
