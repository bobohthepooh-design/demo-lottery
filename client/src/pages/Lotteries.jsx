import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, fmtDateTime, drawLabel } from '../api.js';
import Countdown from '../components/Countdown.jsx';

const STATUS_TH = { scheduled: 'กำหนดการ', open: 'เปิดรับ', closed: 'ปิดรับ', settled: 'ออกผลแล้ว', cancelled: 'ยกเลิก' };

export default function Lotteries() {
  const [allDraws, setAllDraws] = useState([]);   // รอบ upcoming ทั้งหมด
  const [params] = useSearchParams();
  const selType = params.get('type');

  useEffect(() => {
    api('/lottery/draws?upcoming=1').then(r => setAllDraws(r.draws)).catch(() => {});
  }, []);

  // กรองรอบตามประเภทประเทศที่เลือก (client-side — allDraws มีทุกประเภทอยู่แล้ว)
  const draws = selType ? allDraws.filter(d => String(d.lottery_type_id) === String(selType)) : allDraws;

  const nowSql = new Date().toISOString().slice(0, 19).replace('T', ' ');
  const isLive = d => d.status === 'open' && d.close_at > nowSql;
  // รอบปัจจุบัน = รอบที่เปิดรับและใกล้วันออกรางวัลที่สุด ของแต่ละประเภท/หมวด
  const liveMap = new Map();
  for (const d of draws.filter(isLive)) {
    const key = `${d.lottery_type_id}:${d.category_id || 0}`;
    if (!liveMap.has(key) || d.draw_at < liveMap.get(key).draw_at) liveMap.set(key, d);
  }
  const liveDraws = [...liveMap.values()].sort((a, b) => a.draw_at.localeCompare(b.draw_at));
  const liveIds = new Set(liveDraws.map(d => d.id));
  const otherDraws = draws.filter(d => !liveIds.has(d.id))
    .sort((a, b) => a.draw_at.localeCompare(b.draw_at));

  const DrawCard = ({ d, featured }) => {
    const live = isLive(d);
    return (
    <div className={`bg-navy-800 border rounded-xl p-5 ${featured ? 'border-green-500/60 animate-online-border' : 'border-navy-700'}`}>
      <div className="flex items-start justify-between">
        <div>
          <div className="font-bold text-white text-lg leading-snug">{drawLabel(d)}</div>
          <div className="text-xs text-navy-400 mt-0.5">{d.draw_code}</div>
        </div>
        {featured ? (
          <span className="animate-online inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full bg-green-500/20 text-green-300 border border-green-500/50">
            <span className="online-dot inline-block w-2 h-2 rounded-full bg-green-400" />
            ONLINE
          </span>
        ) : (
          <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${d.status === 'open' ? 'bg-green-500/20 text-green-300' : d.status === 'settled' ? 'bg-gold-500/20 text-gold-300' : 'bg-navy-700 text-navy-300'}`}>
            {STATUS_TH[d.status] || d.status}
          </span>
        )}
      </div>
      <div className="mt-3 text-sm text-navy-300 space-y-1">
        <div>🕐 ออกรางวัล: <span className="text-white">{fmtDateTime(d.draw_at)}</span></div>
        <div>⏱️ ปิดรับโพย: <Countdown closeAt={d.close_at} /></div>
      </div>
      {live && (
        <Link to={`/bet/${d.id}`} className="mt-4 block text-center bg-gold-500 text-navy-950 font-bold py-2.5 rounded-lg hover:bg-gold-400">
          แทงหวยรอบนี้
        </Link>
      )}
    </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* รอบที่เปิดรับตอนนี้ — แสดงก่อนเสมอพร้อม badge ONLINE */}
      {liveDraws.length > 0 && (
        <section>
          <h2 className="text-sm font-bold text-green-400 mb-2 flex items-center gap-2">
            <span className="online-dot inline-block w-2.5 h-2.5 rounded-full bg-green-400" />
            รอบที่เปิดรับตอนนี้ ({liveDraws.length})
          </h2>
          <div className="grid md:grid-cols-2 gap-4">
            {liveDraws.map(d => <DrawCard key={d.id} d={d} featured />)}
          </div>
        </section>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        {otherDraws.map(d => <DrawCard key={d.id} d={d} />)}
        {!draws.length && <div className="text-navy-300 col-span-2 text-center py-10">ไม่พบรอบหวย</div>}
      </div>
    </div>
  );
}
