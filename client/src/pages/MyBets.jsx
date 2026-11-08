import { useEffect, useState } from 'react';
import { api, satang } from '../api.js';
import { BET_TYPE_LABELS } from '../lotterySchema.js';

const STATUS_TH = { pending: 'รอผล', won: 'ถูกรางวัล', lost: 'ไม่ถูกรางวัล', partial: 'ถูกรางวัลบางรายการ', cancelled: 'ยกเลิก', refunded: 'คืนเงิน' };

export default function MyBets() {
  const [slips, setSlips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(null);

  useEffect(() => {
    api('/bets/mine?limit=100').then(r => setSlips(r.slips)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <h1 className="text-2xl font-bold text-white">ประวัติโพยของฉัน</h1>
      {slips.map(s => (
        <div key={s.id} className="bg-navy-800 border border-navy-700 rounded-xl overflow-hidden">
          <button onClick={() => setOpen(open === s.id ? null : s.id)} className="w-full px-5 py-4 flex items-center justify-between hover:bg-navy-700/40">
            <div className="text-left">
              <div className="font-mono text-gold-300">{s.slip_ref}</div>
              <div className="text-sm text-navy-300">{s.type_name_th} • {s.draw_code} • {s.created_at}</div>
            </div>
            <div className="text-right">
              <div className="font-bold text-white">฿{satang(s.total_stake)}</div>
              <span className={`text-xs px-2 py-0.5 rounded ${s.status === 'won' ? 'bg-green-500/20 text-green-300' : s.status === 'lost' ? 'bg-navy-700 text-navy-300' : s.status === 'partial' ? 'bg-gold-500/20 text-gold-300' : 'bg-blue-500/20 text-blue-300'}`}>
                {STATUS_TH[s.status]}
              </span>
            </div>
          </button>
          {open === s.id && (
            <div className="border-t border-navy-700 px-5 py-3 space-y-2">
              {s.items.map(i => (
                <div key={i.id} className="flex items-center justify-between text-sm bg-navy-900 rounded-lg px-3 py-2">
                  <span><code className="text-gold-300 font-mono text-base">{i.number}</code> <span className="text-navy-300">{BET_TYPE_LABELS[i.bet_type] || i.bet_type}</span></span>
                  <span className="text-navy-300">฿{satang(i.amount)} {i.payout > 0 && <span className="text-green-400 font-bold ml-2">+฿{satang(i.payout)}</span>}</span>
                </div>
              ))}
              {s.total_payout > 0 && <div className="text-right text-green-400 font-bold">รวมเงินรางวัล ฿{satang(s.total_payout)}</div>}
            </div>
          )}
        </div>
      ))}
      {!loading && !slips.length && <div className="text-center text-navy-400 py-10">ยังไม่มีโพย — <a href="/lotteries" className="text-gold-400">ไปแทงเลย</a></div>}
      {loading && <div className="text-center text-navy-400 py-10">กำลังโหลด...</div>}
    </div>
  );
}
