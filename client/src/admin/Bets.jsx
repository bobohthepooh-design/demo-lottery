import { useEffect, useState } from 'react';
import { api, satang, drawLabel, fmtDateTime } from '../api.js';

const STATUS_TH = {
  pending: 'รอผล', won: 'ถูกรางวัล', lost: 'ไม่ถูก',
  partial: 'ถูกรางวัลบางส่วน', cancelled: 'ยกเลิก', refunded: 'คืนเงิน',
};
const STATUS_EMOJI = {
  pending: '⏳', won: '😢', lost: '🤑', partial: '😐', cancelled: '🚫', refunded: '💸',
};
const ITEM_EMOJI = { won: '😢', lost: '😄', pending: '⏳', cancelled: '🚫' };

const SLIP_STYLE = {
  won: 'border-red-500/40',
  lost: 'border-green-500/40',
  partial: 'border-gold-500/40',
  pending: 'border-blue-500/30',
  cancelled: 'border-navy-700 opacity-60',
  refunded: 'border-navy-700 opacity-60',
};

const potential = (i) => Math.floor(i.amount * Number(i.payout_multiplier || 0));

function ItemRow({ i }) {
  const emoji = ITEM_EMOJI[i.status] || '⏳';
  const anim = i.status === 'lost' ? 'animate-win' : i.status === 'won' ? 'animate-lose' : '';
  return (
    <div className={`flex items-center justify-between gap-2 text-sm rounded-lg px-3 py-2 ${i.status === 'won' ? 'bg-red-500/10 border border-red-500/30' : 'bg-navy-900'}`}>
      <div className="flex items-center gap-2 min-w-0">
        <span className={`text-lg ${anim}`}>{emoji}</span>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <code className="text-gold-300 font-mono">{i.number}</code>
            <span className="text-navy-300 text-xs truncate">{i.bet_name_th || i.bet_type}</span>
          </div>
          <div className="text-[11px] text-navy-400">เดิมพัน ฿{satang(i.amount)}</div>
        </div>
      </div>
      <div className="text-right shrink-0">
        {i.status === 'won' && (
          <div className={`font-bold text-red-400 ${anim}`}>จ่าย ฿{satang(i.payout)}</div>
        )}
        {i.status === 'lost' && <div className={`text-green-400 text-xs font-medium ${anim}`}>ผู้เล่นเสีย ฿{satang(i.amount)} — ระบบได้กำไร 😄</div>}
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

export default function AdminBets() {
  const [slips, setSlips] = useState([]);
  const [status, setStatus] = useState('');
  const [open, setOpen] = useState(null);
  const [err, setErr] = useState('');

  const load = () => api(`/admin/bets?limit=200${status ? `&status=${status}` : ''}`)
    .then(r => { setSlips(Array.isArray(r?.slips) ? r.slips : []); setErr(''); })
    .catch(e => { setSlips([]); setErr(e?.message || 'โหลดข้อมูลไม่สำเร็จ'); });
  useEffect(() => { load(); }, [status]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">ตรวจสอบโพย (Bet Monitoring)</h1>
        <select value={status} onChange={e => setStatus(e.target.value)} className="bg-navy-900 border border-navy-600 rounded-lg px-3 py-2 text-sm">
          <option value="">ทุกสถานะ</option>
          {Object.entries(STATUS_TH).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      {err && <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg p-3">เกิดข้อผิดพลาด: {err}</div>}
      <div className="space-y-2">
        {(Array.isArray(slips) ? slips : []).map(s => {
          const houseNet = (s.total_stake || 0) - (s.total_payout || 0); // มุมเจ้ามือ: บวก = ได้กำไร
          const settled = ['won', 'lost', 'partial'].includes(s.status);
          return (
            <div key={s.id} className={`bg-navy-800 border rounded-xl overflow-hidden ${SLIP_STYLE[s.status] || 'border-navy-700'}`}>
              <button onClick={() => setOpen(open === s.id ? null : s.id)} className="w-full px-5 py-3 flex items-center justify-between text-left hover:bg-navy-700/40">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-lg">{STATUS_EMOJI[s.status] || '📄'}</span>
                  <div className="min-w-0">
                    <span className="font-mono text-gold-300">{s.slip_ref}</span>
                    <span className="text-navy-300 text-sm ml-3 truncate inline-block align-middle max-w-[40vw]">
                      {s.username} • {drawLabel(s) || `${s.type_name_th} • ${s.draw_code}`}
                    </span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <span className="text-white font-bold">฿{satang(s.total_stake)}</span>
                  {s.total_payout > 0 && <span className="text-green-400 text-sm ml-2">จ่าย ฿{satang(s.total_payout)}</span>}
                  {settled && (
                    <span className={`text-sm ml-2 font-semibold ${houseNet >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      ระบบ {houseNet >= 0 ? '+' : ''}฿{satang(houseNet)}
                    </span>
                  )}
                  <div className="text-xs text-navy-400">{STATUS_TH[s.status] || s.status} • {fmtDateTime(s.created_at)}</div>
                </div>
              </button>
              {open === s.id && (
                <div className="border-t border-navy-700 px-5 py-3 space-y-2">
                  {(Array.isArray(s.items) ? s.items : []).map(i => <ItemRow key={i.id} i={i} />)}
                </div>
              )}
            </div>
          );
        })}
        {!slips.length && <div className="text-center text-navy-400 py-10">ไม่มีโพย</div>}
      </div>
    </div>
  );
}
