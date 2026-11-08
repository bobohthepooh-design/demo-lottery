import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, satang, drawLabel, fmtDateTime } from '../api.js';
import { BET_TYPE_LABELS } from '../lotterySchema.js';

const STATUS_TH = {
  pending: 'รอผล',
  won: 'ถูกรางวัล',
  lost: 'ไม่ถูกรางวัล',
  partial: 'ถูกรางวัลบางรายการ',
  cancelled: 'ยกเลิก',
  refunded: 'คืนเงิน',
};
const STATUS_EMOJI = {
  pending: '⏳',
  won: '🎉',
  lost: '😢',
  partial: '🏆',
  cancelled: '🚫',
  refunded: '💸',
};
const ITEM_EMOJI = { won: '🎉', lost: '😢', pending: '⏳', cancelled: '🚫' };

// เงินรางวัลที่จะได้ถ้าถูก = เงินเดิมพัน × อัตราจ่าย (สูตรเดียวกับตอน settle)
const potential = (i) => Math.floor(i.amount * Number(i.payout_multiplier || 0));

// แสดงปุ่มแชร์เมื่อชนะรางวัลตั้งแต่ ฿500 ขึ้นไป
const SHARE_THRESHOLD = 50000; // สตางค์

function shareText(s) {
  return `🎉 ฉันถูกรางวัล ฿${satang(s.total_payout)} จาก ${s.type_name_th || ''} ${s.draw_code || ''} บน Demo Lottery! (เครดิตจำลอง เพื่อการศึกษา)`;
}

function ShareButtons({ s }) {
  const [copied, setCopied] = useState(false);
  const text = shareText(s);
  const url = encodeURIComponent(window.location.origin);
  const lineUrl = `https://social-plugins.line.me/lineit/share?url=${url}&text=${encodeURIComponent(text)}`;
  const fbUrl = `https://www.facebook.com/sharer/sharer.php?u=${url}&quote=${encodeURIComponent(text)}`;
  const copy = async () => {
    try { await navigator.clipboard.writeText(`${text} ${window.location.origin}`); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { alert('คัดลอกไม่สำเร็จ — ลองคัดลอกเอง'); }
  };
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs text-navy-300">แชร์ความสำเร็จ:</span>
      <a href={lineUrl} target="_blank" rel="noreferrer"
        className="text-xs bg-green-600 hover:bg-green-500 text-white font-bold px-3 py-1.5 rounded-lg">
        LINE
      </a>
      <a href={fbUrl} target="_blank" rel="noreferrer"
        className="text-xs bg-blue-600 hover:bg-blue-500 text-white font-bold px-3 py-1.5 rounded-lg">
        Facebook
      </a>
      <button onClick={copy}
        className="text-xs border border-navy-500 text-navy-200 hover:bg-navy-700 px-3 py-1.5 rounded-lg">
        {copied ? '✓ คัดลอกแล้ว' : '📋 คัดลอกข้อความ'}
      </button>
    </div>
  );
}

function ItemRow({ i }) {
  const emoji = ITEM_EMOJI[i.status] || '⏳';
  const anim = i.status === 'won' ? 'animate-win' : i.status === 'lost' ? 'animate-lose' : '';
  return (
    <div className={`flex items-center justify-between gap-2 text-sm rounded-lg px-3 py-2 ${i.status === 'won' ? 'bg-green-500/10 border border-green-500/30' : 'bg-navy-900'}`}>
      <div className="flex items-center gap-2 min-w-0">
        <span className={`text-lg ${anim}`}>{emoji}</span>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <code className="text-gold-300 font-mono text-base">{i.number}</code>
            <span className="text-navy-300 text-xs truncate">{i.rule_name_th || BET_TYPE_LABELS[i.bet_type] || i.bet_type}</span>
          </div>
          <div className="text-[11px] text-navy-400">เดิมพัน ฿{satang(i.amount)}</div>
        </div>
      </div>
      <div className="text-right shrink-0">
        {i.status === 'won' && (
          <div className={`font-bold text-green-400 ${anim}`}>
            <span className="text-base">💰</span> +฿{satang(i.payout)}
          </div>
        )}
        {i.status === 'lost' && <div className={`text-navy-400 text-xs ${anim}`}>เสีย ฿{satang(i.amount)}</div>}
        {i.status === 'pending' && (
          <div className="text-[11px]">
            <div className="text-blue-300">รอผล</div>
            <div className="text-gold-300/80">ถ้าถูก ได้ ฿{satang(potential(i))}</div>
          </div>
        )}
        {i.status === 'cancelled' && <div className="text-navy-400 text-xs">ยกเลิก</div>}
      </div>
    </div>
  );
}

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
      {slips.map(s => {
        const won = s.items?.some(i => i.status === 'won') || s.status === 'won';
        const lost = !won && s.items?.every(i => i.status === 'lost');
        const cardAnim = s.status === 'won' ? 'animate-win' : lost && s.status === 'lost' ? 'animate-lose' : '';
        const net = (s.total_payout || 0) - (s.total_stake || 0);
        return (
          <div key={s.id} className={`bg-navy-800 border rounded-xl overflow-hidden ${s.status === 'won' ? 'border-green-500/40' : 'border-navy-700'} ${cardAnim}`}>
            <button onClick={() => setOpen(open === s.id ? null : s.id)} className="w-full px-5 py-4 flex items-center justify-between hover:bg-navy-700/40">
              <div className="text-left">
                <div className="font-mono text-gold-300">{s.slip_ref}</div>
                <div className="text-sm text-navy-300">{drawLabel(s) || `${s.type_name_th} • ${s.draw_code}`}</div>
                <div className="text-[11px] text-navy-500">แทงเมื่อ {fmtDateTime(s.created_at)}</div>
              </div>
              <div className="text-right">
                <div className="font-bold text-white">฿{satang(s.total_stake)}</div>
                <span className={`text-xs px-2 py-0.5 rounded inline-flex items-center gap-1 ${s.status === 'won' ? 'bg-green-500/20 text-green-300' : s.status === 'lost' ? 'bg-navy-700 text-navy-300' : s.status === 'partial' ? 'bg-gold-500/20 text-gold-300' : 'bg-blue-500/20 text-blue-300'}`}>
                  <span>{STATUS_EMOJI[s.status]}</span> {STATUS_TH[s.status]}
                </span>
              </div>
            </button>
            {open === s.id && (
              <div className="border-t border-navy-700 px-5 py-3 space-y-2">
                {s.items.map(i => <ItemRow key={i.id} i={i} />)}
                {s.total_payout > 0 && (
                  <div className="text-right space-y-0.5 pt-1">
                    <div className="text-green-400 font-bold animate-coin">
                      🎉 รวมเงินรางวัล ฿{satang(s.total_payout)}
                    </div>
                    <div className={`text-xs font-semibold ${net >= 0 ? 'text-gold-300' : 'text-navy-400'}`}>
                      {net >= 0 ? `กำไรสุทธิ ฿${satang(net)}` : `ขาดทุนสุทธิ ฿${satang(-net)}`}
                    </div>
                  </div>
                )}
                {s.total_payout >= SHARE_THRESHOLD && (
                  <div className="pt-1 border-t border-navy-700/60">
                    <ShareButtons s={s} />
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
      {!loading && !slips.length && <div className="text-center text-navy-400 py-10">ยังไม่มีโพย — <Link to="/lotteries" className="text-gold-400">ไปแทงเลย</Link></div>}
      {loading && <div className="text-center text-navy-400 py-10">กำลังโหลด...</div>}
    </div>
  );
}
