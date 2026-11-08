import { useEffect, useState } from 'react';
import { api, satang, drawLabel } from '../api.js';

const STATUS_TH = { pending: 'รอผล', won: 'ถูกรางวัล', lost: 'ไม่ถูก', partial: 'บางส่วน', cancelled: 'ยกเลิก' };

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
        {(Array.isArray(slips) ? slips : []).map(s => (
          <div key={s.id} className="bg-navy-800 border border-navy-700 rounded-xl">
            <button onClick={() => setOpen(open === s.id ? null : s.id)} className="w-full px-5 py-3 flex items-center justify-between text-left hover:bg-navy-700/40">
              <div>
                <span className="font-mono text-gold-300">{s.slip_ref}</span>
                <span className="text-navy-300 text-sm ml-3">{s.username} • {drawLabel(s) || `${s.type_name_th} • ${s.draw_code}`}</span>
              </div>
              <div className="text-right">
                <span className="text-white font-bold">฿{satang(s.total_stake)}</span>
                {s.total_payout > 0 && <span className="text-green-400 text-sm ml-2">+฿{satang(s.total_payout)}</span>}
                <div className="text-xs text-navy-400">{STATUS_TH[s.status]} • {s.created_at}</div>
              </div>
            </button>
            {open === s.id && (
              <div className="border-t border-navy-700 px-5 py-3 grid sm:grid-cols-2 gap-2">
                {(Array.isArray(s.items) ? s.items : []).map(i => (
                  <div key={i.id} className="flex justify-between bg-navy-900 rounded-lg px-3 py-2 text-sm">
                    <span><code className="text-gold-300">{i.number}</code> <span className="text-navy-300">{i.bet_name_th}</span></span>
                    <span className="text-navy-300">฿{satang(i.amount)} {i.payout > 0 && <b className="text-green-400"> +฿{satang(i.payout)}</b>}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
        {!slips.length && <div className="text-center text-navy-400 py-10">ไม่มีโพย</div>}
      </div>
    </div>
  );
}
