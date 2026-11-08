import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api, satang, bahtToSatang, fmtDateTime } from '../api.js';
import { useAuth } from '../auth.jsx';

const BET_TYPE_STYLE = {
  '2top': '2 ตัวบน', '2bottom': '2 ตัวล่าง', '3top': '3 ตัวบน',
  '3tod': '3 ตัวโต๊ด', 'run_top': 'วิ่งบน', 'run_bottom': 'วิ่งล่าง',
};

export default function PlaceBet() {
  const { drawId } = useParams();
  const navigate = useNavigate();
  const { balance, setBalance, user } = useAuth();
  const [draw, setDraw] = useState(null);
  const [rules, setRules] = useState([]);
  const [slip, setSlip] = useState([]); // {ruleId, betType, name, number, amount(bet), stakeSatang}
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);

  // current entry
  const [selRule, setSelRule] = useState('');
  const [number, setNumber] = useState('');
  const [amount, setAmount] = useState('');

  useEffect(() => {
    api(`/lottery/draws/${drawId}`).then(async r => {
      setDraw(r.draw);
      const t = await api(`/lottery/types/${r.draw.lottery_type_id}`);
      setRules(t.rules);
      if (t.rules[0]) setSelRule(String(t.rules[0].id));
    }).catch(e => setErr(e.message));
  }, [drawId]);

  const rule = rules.find(r => String(r.id) === selRule);

  const totalSatang = useMemo(() => slip.reduce((s, i) => s + i.stakeSatang, 0), [slip]);
  const totalBaht = totalSatang / 100;

  const addItem = () => {
    setErr('');
    if (!rule) return setErr('เลือกประเภทการแทง');
    const num = number.trim();
    if (!new RegExp(`^\\d{${rule.digits}}$`).test(num)) return setErr(`${rule.name_th} ต้องเป็นตัวเลข ${rule.digits} หลัก`);
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) return setErr('กรอกจำนวนเงิน');
    const stake = bahtToSatang(amt);
    if (stake % rule.stake_unit !== 0) return setErr(`จำนวนเงินต้องเป็นหน่วย ${rule.stake_unit / 100} บาท`);
    if (stake < rule.min_amount) return setErr(`ขั้นต่ำ ฿${satang(rule.min_amount)}`);
    if (rule.max_amount && stake > rule.max_amount) return setErr(`สูงสุด ฿${satang(rule.max_amount)}`);
    if (stake > balance) return setErr('เครดิตไม่เพียงพอ');
    setSlip([...slip, { ruleId: rule.id, betType: rule.bet_type, name: rule.name_th, number: num, stakeSatang: stake }]);
    setNumber(''); setAmount('');
  };

  const submit = async () => {
    setErr(''); setBusy(true);
    try {
      const r = await api('/bets', { method: 'POST', body: {
        drawId: Number(drawId),
        items: slip.map(i => ({ ruleId: i.ruleId, number: i.number, amount: i.stakeSatang })),
      }});
      setBalance(r.balance);
      setDone(r);
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  if (done) return (
    <div className="max-w-md mx-auto bg-navy-800 border border-green-500/40 rounded-2xl p-8 text-center">
      <div className="text-5xl mb-3">🎉</div>
      <h1 className="text-xl font-bold text-green-400">ส่งโพยสำเร็จ!</h1>
      <p className="text-navy-200 mt-2">เลขที่โพย: <code className="text-gold-300">{done.slipRef}</code></p>
      <p className="text-navy-200">ยอดแทงรวม ฿{satang(done.totalStake)} • ยอดเครดิตคงเหลือ ฿{satang(done.balance)}</p>
      <div className="mt-6 flex gap-3 justify-center">
        <Link to="/my-bets" className="bg-gold-500 text-navy-950 font-bold px-5 py-2.5 rounded-lg">ดูโพยของฉัน</Link>
        <Link to="/lotteries" className="border border-navy-600 px-5 py-2.5 rounded-lg">แทงรอบอื่น</Link>
      </div>
    </div>
  );

  if (err && !draw) return <div className="text-red-400 text-center py-10">{err}</div>;
  if (!draw) return <div className="text-navy-300 text-center py-10">กำลังโหลด...</div>;

  const closed = draw.status !== 'open' || draw.close_at <= new Date().toISOString().slice(0,19).replace('T',' ');

  return (
    <div className="grid lg:grid-cols-5 gap-6">
      {/* left: entry form */}
      <div className="lg:col-span-3 space-y-4">
        <div className="bg-navy-800 border border-navy-700 rounded-xl p-5">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-white">{draw.type_name_th}</h1>
              <div className="text-sm text-navy-300">{draw.draw_code} • ออก {fmtDateTime(draw.draw_at)} • ปิด {fmtDateTime(draw.close_at)}</div>
            </div>
            <span className={`text-xs font-bold px-3 py-1 rounded-full ${closed ? 'bg-navy-700 text-navy-300' : 'bg-green-500/20 text-green-300'}`}>
              {closed ? 'ปิดรับแล้ว' : 'เปิดรับ'}
            </span>
          </div>
        </div>

        {!closed && (
          <div className="bg-navy-800 border border-navy-700 rounded-xl p-5 space-y-4">
            <h2 className="font-bold text-white">เลือกประเภทการแทง</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {rules.map(r => (
                <button key={r.id} onClick={() => setSelRule(String(r.id))}
                  className={`px-3 py-3 rounded-lg text-sm border transition ${selRule === String(r.id) ? 'border-gold-500 bg-navy-700 text-gold-300' : 'border-navy-600 text-navy-200 hover:border-navy-500'}`}>
                  <div className="font-semibold">{r.name_th}</div>
                  <div className="text-xs text-navy-300">{r.digits} หลัก • จ่าย x{r.payout_multiplier}</div>
                </button>
              ))}
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="text-sm text-navy-300">หมายเลข ({rule?.digits || '?'} หลัก)</label>
                <input value={number} onChange={e => setNumber(e.target.value.replace(/\D/g,'').slice(0, rule?.digits || 3))}
                  inputMode="numeric" placeholder={rule ? '0'.repeat(rule.digits) : ''}
                  className="mt-1 w-full bg-navy-900 border border-navy-600 rounded-lg px-4 py-3 text-2xl tracking-[0.4em] text-center text-gold-300 font-mono focus:outline-none focus:border-gold-500" />
              </div>
              <div>
                <label className="text-sm text-navy-300">จำนวนเงิน (บาท)</label>
                <input value={amount} onChange={e => setAmount(e.target.value.replace(/[^\d.]/g,''))}
                  inputMode="decimal" placeholder="0.00"
                  className="mt-1 w-full bg-navy-900 border border-navy-600 rounded-lg px-4 py-3 text-2xl text-center text-gold-300 focus:outline-none focus:border-gold-500" />
              </div>
            </div>
            {err && <div className="text-red-400 text-sm">{err}</div>}
            <button onClick={addItem} className="w-full border border-gold-500/60 text-gold-300 font-semibold py-3 rounded-lg hover:bg-navy-700">
              + เพิ่มลงโพย
            </button>
          </div>
        )}
      </div>

      {/* right: bet slip */}
      <div className="lg:col-span-2">
        <div className="bg-navy-800 border border-gold-500/30 rounded-xl p-5 sticky top-24">
          <h2 className="font-bold text-gold-400 mb-3">โพยของฉัน ({slip.length})</h2>
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {slip.map((i, idx) => (
              <div key={idx} className="flex items-center justify-between bg-navy-900 rounded-lg px-3 py-2 text-sm">
                <div>
                  <span className="text-white font-mono text-lg">{i.number}</span>
                  <span className="text-navy-300 ml-2">{i.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-gold-300">฿{satang(i.stakeSatang)}</span>
                  <button onClick={() => setSlip(slip.filter((_, j) => j !== idx))} className="text-red-400 hover:text-red-300">✕</button>
                </div>
              </div>
            ))}
            {!slip.length && <div className="text-navy-400 text-sm text-center py-6">ยังไม่มีรายการ — เลือกประเภทและกรอกตัวเลขทางซ้าย</div>}
          </div>
          <div className="border-t border-navy-700 mt-4 pt-4 space-y-1 text-sm">
            <div className="flex justify-between text-navy-300"><span>ยอดแทงรวม</span><span className="text-white font-bold text-lg">฿{satang(totalSatang)}</span></div>
            <div className="flex justify-between text-navy-300"><span>เครดิตคงเหลือ (หลังแทง)</span><span className="text-gold-300">฿{satang(balance - totalSatang)}</span></div>
          </div>
          <button onClick={submit} disabled={!slip.length || busy || closed || totalSatang > balance}
            className="mt-4 w-full bg-gold-500 text-navy-950 font-bold py-3 rounded-lg hover:bg-gold-400 disabled:opacity-40">
            {busy ? 'กำลังส่ง...' : 'ยืนยันส่งโพย'}
          </button>
          {!user && <div className="text-center text-sm text-navy-300 mt-2"><Link to="/login" className="text-gold-400">เข้าสู่ระบบ</Link> เพื่อแทง</div>}
        </div>
      </div>
    </div>
  );
}
