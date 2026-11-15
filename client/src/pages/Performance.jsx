import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, satang, fmtDateTime } from '../api.js';
import { FlagIcon } from '../components/ResultLine.jsx';
import { SkeletonCard, SkeletonTable } from '../components/Skeleton.jsx';
import EmptyState from '../components/EmptyState.jsx';
import { typeAccent } from '../typeAccent.js';

function Kpi({ label, value, sub, tone = 'text-white' }) {
  return (
    <div className="bg-navy-800 border border-navy-700 rounded-xl p-4">
      <div className="text-xs text-navy-300">{label}</div>
      <div className={`text-xl font-bold mt-1 ${tone}`}>{value}</div>
      {sub && <div className="text-[11px] text-navy-400 mt-0.5">{sub}</div>}
    </div>
  );
}

export default function Performance() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api('/bets/stats').then(r => setStats(r.stats)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="max-w-4xl mx-auto space-y-6">
      <SkeletonCard className="h-9 w-56" />
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {Array.from({ length: 6 }, (_, i) => <SkeletonCard key={i} className="h-24" />)}
      </div>
      <SkeletonTable rows={4} />
    </div>
  );
  if (!stats) return <div className="text-center text-navy-300 py-10">โหลดข้อมูลไม่สำเร็จ</div>;

  const { totals, items, byType, best } = stats;
  const net = totals.net;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-white">ผลงานของฉัน</h1>
          <p className="text-sm text-navy-300">สรุปยอดเดิมพันและผลรางวัลทั้งหมด — เครดิตจำลอง</p>
        </div>
        <Link to="/my-bets" className="text-sm text-gold-400 hover:underline">ดูประวัติโพยทั้งหมด →</Link>
      </div>

      {/* KPI รวม */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <Kpi label="โพยทั้งหมด" value={totals.slips} sub={`ถูก ${totals.wonSlips} • แพ้ ${totals.lostSlips}${totals.partialSlips ? ` • บางส่วน ${totals.partialSlips}` : ''}`} />
        <Kpi label="ยอดแทงรวม" value={`${satang(totals.stake)} บาท`} />
        <Kpi label="เงินรางวัลรวม" value={`${satang(totals.payout)} บาท`} tone="text-green-400" />
        <Kpi label="กำไร/ขาดทุนสุทธิ" value={`${net >= 0 ? '+' : '−'}${satang(Math.abs(net))} บาท`}
          tone={net >= 0 ? 'text-gold-300' : 'text-red-400'} />
        <Kpi label="อัตราถูกรางวัล" value={`${items.winRate}%`} sub={`ถูก ${items.won}/${items.won + items.lost} รายการ`} />
        <Kpi label="โพยรอผล" value={`${satang(totals.pendingStake)} บาท`} sub="ยอดค้างอยู่" tone="text-blue-300" />
      </div>

      {/* ถูกรางวัลสูงสุด */}
      {best && (
        <div className="bg-gradient-to-r from-green-500/15 to-gold-500/10 border border-green-500/40 rounded-xl p-4 flex items-center gap-4 flex-wrap">
          <span className="text-3xl">🏆</span>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold text-green-300">รางวัลสูงสุดของคุณ</div>
            <div className="text-xs text-navy-300">
              {best.type_name_th} • {best.draw_code}
              {best.settled_at ? ` • ${fmtDateTime(best.settled_at)}` : ''}
            </div>
          </div>
          <div className="text-xl font-black text-green-400">+{satang(best.total_payout)} บาท</div>
        </div>
      )}

      {/* สถิติรายประเภทหวย */}
      <section className="bg-navy-800 border border-navy-700 rounded-xl overflow-hidden">
        <h2 className="px-4 py-3 text-sm font-bold text-white border-b border-navy-700">สถิติตามประเภทหวย</h2>
        {byType.length ? (
          <div className="divide-y divide-navy-700/60">
            {byType.map(t => {
              const tNet = t.payout - t.stake;
              return (
                <div key={t.type_code} className="px-4 py-3 flex items-center gap-3">
                  <FlagIcon code={t.type_code} className="w-8 h-8 text-[10px]" />
                  <div className="flex-1 min-w-0">
                    <div className={`text-sm font-semibold truncate ${typeAccent(t.type_code).text}`}>{t.type_name_th}</div>
                    <div className="text-[11px] text-navy-400">
                      {t.slips} โพย • ถูก {t.won_items} รายการ
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm text-navy-200">แทง {satang(t.stake)} บาท</div>
                    <div className={`text-xs font-bold ${tNet >= 0 ? 'text-gold-300' : 'text-red-400'}`}>
                      สุทธิ {tNet >= 0 ? '+' : '−'}{satang(Math.abs(tNet))} บาท
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState emoji="📊" title="ยังไม่มีข้อมูลการเล่น"
            hint="เริ่มแทงหวยเพื่อดูสถิติและผลการเล่นของคุณที่นี่"
            to="/lotteries" cta="ไปแทงหวยเลย" />
        )}
      </section>

      <p className="text-[11px] text-navy-500 text-center">
        * นับเฉพาะโพยที่ไม่ถูกยกเลิก/คืนเงิน • เป็นเครดิตจำลองเพื่อการศึกษา ไม่ใช่เงินจริง
      </p>
    </div>
  );
}
